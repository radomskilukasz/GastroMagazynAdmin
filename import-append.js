/*
  Rozszerzenie importu planu CSV.
  Ten plik nadpisuje funkcję upload() z app.js i dodaje dwa tryby pracy:
  1) nowy plan — gdy dane operacyjne są puste,
  2) dogranie CSV — gdy istnieje już plan dla tego samego dnia jedzonego.
*/

function operationalHasOnlyPlanData(row) {
  if (!row) return false;

  return Number(row.packing_plan_count || 0) > 0 &&
    Number(row.packing_sessions_count || 0) === 0 &&
    Number(row.packing_session_items_count || 0) === 0 &&
    Number(row.station_lines_count || 0) === 0 &&
    Number(row.station_bags_count || 0) === 0 &&
    Number(row.station_item_states_count || 0) === 0 &&
    Number(row.station_scans_count || 0) === 0 &&
    Number(row.tray_scans_count || 0) === 0 &&
    Number(row.packing_item_events_count || 0) === 0;
}

function operationalPackingAlreadyStarted(row) {
  if (!row) return false;

  return Number(row.packing_sessions_count || 0) > 0 ||
    Number(row.packing_session_items_count || 0) > 0 ||
    Number(row.station_lines_count || 0) > 0 ||
    Number(row.station_bags_count || 0) > 0 ||
    Number(row.station_item_states_count || 0) > 0 ||
    Number(row.station_scans_count || 0) > 0 ||
    Number(row.tray_scans_count || 0) > 0 ||
    Number(row.packing_item_events_count || 0) > 0;
}

async function getCurrentMealDateValue() {
  const { data, error } = await supabaseClient
    .from("app_settings")
    .select("value")
    .eq("key", "meal_date")
    .maybeSingle();

  if (error) throw error;
  return data?.value || "";
}

function buildPackingPlanRowsFromCsv(rows, batchId) {
  return rows.map(r => ({
    import_batch_id: batchId,
    bag_qr: String(r[0] || "").trim(),
    tray_qr: String(r[1] || "").trim(),
    meal: String(r[2] || "").trim(),
    code: String(r[3] || "").trim(),
    size: String(r[4] || "").trim(),
    dish_name: String(r[5] || "").trim()
  })).filter(x => x.bag_qr && x.tray_qr);
}

async function confirmAppendImport(statusRow, selectedMealDate, currentMealDate, rowsCount) {
  const packingStarted = operationalPackingAlreadyStarted(statusRow);

  const details =
    `Dzień w systemie: <b>${escapeHtml(formatDatePL(currentMealDate))}</b><br>` +
    `Dzień z formularza: <b>${escapeHtml(formatDatePL(selectedMealDate))}</b><br>` +
    `Nowe rekordy z CSV: <b>${Number(rowsCount || 0)}</b><br><br>` +
    operationalDataDetailsHtml(statusRow) +
    (packingStarted
      ? `<br><br><b>Uwaga:</b> pakowanie albo praca stanowiskowa już wystartowała. Dogrywanie dopisze rekordy do planu bez kasowania istniejących danych. Nie wgrywaj drugi raz tego samego pliku, bo zdublujesz plan.`
      : `<br><br>W systemie jest już plan, ale nie ma jeszcze zapisanych sesji/skanów. Dogranie dopisze kolejne rekordy do tego samego dnia.`);

  const choice = await showChoiceModal({
    title: packingStarted ? "⚠️ Dograć CSV do rozpoczętego dnia?" : "➕ Dograć CSV do aktualnego dnia?",
    text: packingStarted
      ? "System ma już aktywne dane pakowania. Dogrywaj tylko brakujące / nowe rekordy do tego samego dnia."
      : "System ma już plan dla tego dnia. Możesz dopisać kolejne rekordy bez czyszczenia dnia.",
    details,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Dograj CSV do tego dnia", value:"append", className:"btnAnother" }
    ]
  });

  if (choice !== "append") return false;

  if (!packingStarted) return true;

  const typed = window.prompt("Pakowanie już wystartowało. Aby potwierdzić dogranie CSV, wpisz dokładnie: DOGRAJ");

  if (typed !== "DOGRAJ") {
    setUploadStatus("⚠️ Dogranie anulowane. Nie wpisano poprawnie słowa DOGRAJ.", "warn");
    return false;
  }

  return true;
}

async function insertPackingPlanRows(data, modeLabel) {
  const chunkSize = 500;
  let inserted = 0;

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);

    const { error } = await supabaseClient.from("packing_plan").insert(chunk);

    if (error) {
      setUploadStatus("❌ Błąd importu po " + inserted + " rekordach: " + error.message, "bad");
      return { ok:false, inserted };
    }

    inserted += chunk.length;
    setUploadStatus("⏳ " + modeLabel + ": wgrano " + inserted + " / " + data.length + "...", "info");
  }

  return { ok:true, inserted };
}

async function upload() {
  const statusRow = await loadOperationalStatus();
  const selectedMealDate = el("mealDateInput").value;

  if (!selectedMealDate) {
    setUploadStatus("❌ Wpisz dzień jedzony przed wgraniem planu.", "bad");
    return;
  }

  const file = el("fileInput").files[0];

  if (!file) {
    setUploadStatus("❌ Wybierz plik CSV.", "bad");
    return;
  }

  setUploadStatus("⏳ Czytam plik...", "info");
  el("uploadButton").disabled = true;

  try {
    const text = await file.text();
    const rows = parseCsvText(text);

    if (rows.length < 1) {
      setUploadStatus("❌ Plik jest pusty albo nie ma danych.", "bad");
      return;
    }

    const batchId = crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);

    const data = buildPackingPlanRowsFromCsv(rows, batchId);

    if (!data.length) {
      setUploadStatus("❌ Nie znaleziono poprawnych wierszy. Sprawdź kolejność kolumn.", "bad");
      return;
    }

    const hasOperationalData = statusRow && operationalHasData(statusRow);
    let importMode = "new_day";

    if (hasOperationalData) {
      const currentMealDate = await getCurrentMealDateValue();

      if (!currentMealDate) {
        setUploadStatus(
          "❌ W systemie są dane operacyjne, ale nie ma ustawionego dnia jedzonego. Nie dogrywam CSV, żeby nie pomieszać dni.",
          "bad"
        );
        return;
      }

      if (currentMealDate !== selectedMealDate) {
        setUploadStatus(
          "❌ Nie można dograć CSV do innego dnia.\n" +
          "Dzień w systemie: " + formatDatePL(currentMealDate) + "\n" +
          "Dzień z formularza: " + formatDatePL(selectedMealDate) + "\n" +
          "Aby wgrać nowy dzień, najpierw pobierz raport i wykonaj reset dnia.",
          "bad"
        );
        return;
      }

      const allowedAppend = await confirmAppendImport(statusRow, selectedMealDate, currentMealDate, data.length);
      if (!allowedAppend) return;

      importMode = "append";
    } else {
      const dateSaved = await saveMealDate();
      if (!dateSaved) return;
    }

    const modeLabel = importMode === "append" ? "Dogrywanie CSV" : "Import nowego planu";

    setUploadStatus("⏳ " + modeLabel + ": wysyłam " + data.length + " rekordów...", "info");

    const result = await insertPackingPlanRows(data, modeLabel);
    if (!result.ok) return;

    reportExportedThisSession = false;

    setUploadStatus(
      (importMode === "append"
        ? "✅ Dograno CSV do aktualnego dnia: "
        : "✅ Plan załadowany: ") +
      result.inserted +
      " rekordów.\nDzień jedzony: " + formatDatePL(selectedMealDate) +
      "\nImport batch: " + batchId +
      (importMode === "append" ? "\nTryb: dogranie do istniejącego planu." : "\nTryb: nowy plan."),
      "ok"
    );

    await refreshAdminData();

  } catch (err) {
    setUploadStatus("❌ Błąd importu: " + err.message, "bad");
  } finally {
    el("uploadButton").disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const uploadButton = el("uploadButton");
  if (uploadButton) uploadButton.innerText = "⬆️ Wgraj / dograj plan CSV";
});
