/*
  Import wielu aktywnych dni.
  Ten plik ładuje się po import-append.js i nadpisuje upload().

  Nowa zasada:
  - jeden CSV może zawierać tylko jeden dzień,
  - jeśli dzień nie jest aktywny — importujemy jako nowy aktywny dzień, nawet gdy inne dni są już aktywne,
  - jeśli ten sam dzień jest już aktywny — wymagamy potwierdzenia dogrania,
  - jeśli dzień jest już w archiwum — wymagamy mocnego potwierdzenia wznowienia dnia.
*/

function importMultiDayNormalizeDate(value) {
  return parseImportDateToIso(value || "");
}

async function importMultiDayGetActiveDays() {
  const { data, error } = await supabaseClient.rpc("active_packing_days");
  if (error) throw error;
  return data || [];
}

async function importMultiDayGetArchivedDay(mealDate) {
  const { data, error } = await supabaseClient
    .from("packing_days")
    .select("id, meal_date, status, archived_at, planned_bags_count, planned_trays_count, session_count, cancelled_count")
    .eq("meal_date", mealDate)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function importMultiDayActiveRowHasPacking(row) {
  if (!row) return false;

  return Number(row.sessions_count || 0) > 0 ||
    Number(row.station_lines_count || 0) > 0 ||
    Number(row.station_bags_count || 0) > 0 ||
    Number(row.station_scans_count || 0) > 0 ||
    Number(row.events_count || 0) > 0;
}

async function importMultiDayConfirmAppend(activeRow, selectedMealDate, rowsCount, manifestCount) {
  const packingStarted = importMultiDayActiveRowHasPacking(activeRow);

  const details =
    `Dzień aktywny: <b>${escapeHtml(formatDatePL(selectedMealDate))}</b><br>` +
    `Obecnie w planie: <b>${Number(activeRow?.planned_trays || 0)}</b> tacek / <b>${Number(activeRow?.planned_bags || 0)}</b> toreb<br>` +
    `Nowe rekordy z CSV: <b>${Number(rowsCount || 0)}</b><br>` +
    `Nowe/aktualizowane torby w manifeście: <b>${Number(manifestCount || 0)}</b><br>` +
    `Sesje: <b>${Number(activeRow?.sessions_count || 0)}</b><br>` +
    `Stanowiska/torby/skany: <b>${Number(activeRow?.station_lines_count || 0)} / ${Number(activeRow?.station_bags_count || 0)} / ${Number(activeRow?.station_scans_count || 0)}</b><br><br>` +
    (packingStarted
      ? `<b>Uwaga:</b> ten dzień ma już rozpoczęte pakowanie albo pracę stanowiskową. Dogrywaj tylko brakujące rekordy, bo ponowny import tego samego pliku zdubluje plan.`
      : `Ten dzień ma już aktywny plan. Możesz dograć kolejne rekordy bez czyszczenia dnia.`);

  const choice = await showChoiceModal({
    title: packingStarted ? "⚠️ Dograć CSV do rozpoczętego dnia?" : "➕ Dograć CSV do aktywnego dnia?",
    text: packingStarted
      ? "Ten dzień ma już aktywne dane pakowania. Dogrywaj tylko brakujące rekordy."
      : "Ten dzień jest już aktywny. Import dopisze rekordy do istniejącego planu.",
    details,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Dograj CSV do tego dnia", value:"append", className:"btnAnother" }
    ]
  });

  if (choice !== "append") return false;

  if (!packingStarted) return true;

  const typed = window.prompt("Pakowanie tego dnia już wystartowało. Aby potwierdzić dogranie CSV, wpisz dokładnie: DOGRAJ");

  if (typed !== "DOGRAJ") {
    setUploadStatus("⚠️ Dogranie anulowane. Nie wpisano poprawnie słowa DOGRAJ.", "warn");
    return false;
  }

  return true;
}

async function importMultiDayConfirmArchivedReimport(archivedDay, selectedMealDate, rowsCount, manifestCount) {
  if (!archivedDay) return true;

  const details =
    `Dzień: <b>${escapeHtml(formatDatePL(selectedMealDate))}</b><br>` +
    `Status w archiwum: <b>${escapeHtml(archivedDay.status || "archived")}</b><br>` +
    `Archiwalny plan: <b>${Number(archivedDay.planned_trays_count || 0)}</b> tacek / <b>${Number(archivedDay.planned_bags_count || 0)}</b> toreb<br>` +
    `Nowy CSV: <b>${Number(rowsCount || 0)}</b> rekordów planu / <b>${Number(manifestCount || 0)}</b> toreb manifestu<br><br>` +
    `<b>Uwaga:</b> ten dzień jest już w archiwum. Import utworzy go ponownie jako aktywny dzień roboczy.`;

  const choice = await showChoiceModal({
    title: "⚠️ Ten dzień jest już w archiwum",
    text: "Import tego dnia ponownie otworzy aktywny plan dla daty, która była już zarchiwizowana.",
    details,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Wznów ten dzień", value:"reopen", className:"btnReplace" }
    ]
  });

  if (choice !== "reopen") return false;

  const typed = window.prompt("Aby ponownie wgrać dzień z archiwum, wpisz dokładnie: WZNÓW");

  if (typed !== "WZNÓW") {
    setUploadStatus("⚠️ Import anulowany. Nie wpisano poprawnie słowa WZNÓW.", "warn");
    return false;
  }

  return true;
}

async function upload() {
  const file = el("fileInput").files[0];

  if (!file) {
    setUploadStatus("❌ Wybierz plik CSV.", "bad");
    return;
  }

  setUploadStatus("⏳ Czytam plik...", "info");
  el("uploadButton").disabled = true;

  try {
    const text = await file.text();
    const parsed = parseCsvDocument(text);

    if (!parsed.rows.length) {
      setUploadStatus("❌ Plik jest pusty albo nie ma danych.", "bad");
      return;
    }

    const csvDates = getCsvMealDates(parsed);
    const formMealDate = el("mealDateInput").value;

    if (csvDates.length > 1) {
      setUploadStatus(
        "❌ CSV zawiera więcej niż jeden dzień jedzony: " + csvDates.map(formatDatePL).join(", ") + ".\nWgraj osobne pliki dla osobnych dni.",
        "bad"
      );
      return;
    }

    const selectedMealDate = formMealDate || csvDates[0] || "";

    if (!selectedMealDate) {
      setUploadStatus("❌ Wpisz dzień jedzony albo wgraj CSV z kolumną delivery_date.", "bad");
      return;
    }

    if (formMealDate && csvDates[0] && formMealDate !== csvDates[0]) {
      setUploadStatus(
        "❌ Data w formularzu nie zgadza się z datą w CSV.\n" +
        "Formularz: " + formatDatePL(formMealDate) + "\n" +
        "CSV: " + formatDatePL(csvDates[0]),
        "bad"
      );
      return;
    }

    if (!formMealDate && csvDates[0]) {
      el("mealDateInput").value = csvDates[0];
      setMealDateStatus("Dzień jedzony z CSV: " + formatDatePL(csvDates[0]), "ok");
    }

    const batchId = crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);

    const planRows = buildPackingPlanRowsFromCsv(parsed, batchId, selectedMealDate);
    const manifestRows = buildCustomerManifestRowsFromCsv(parsed, selectedMealDate);
    const unifiedCsv = isUnifiedCsv(parsed);

    if (!planRows.length) {
      setUploadStatus("❌ Nie znaleziono poprawnych wierszy planu. Sprawdź kolejność i nazwy kolumn.", "bad");
      return;
    }

    const activeDays = await importMultiDayGetActiveDays();
    const activeRow = activeDays.find(row => row.meal_date === selectedMealDate) || null;
    let importMode = activeRow ? "append" : "new_day";

    if (activeRow) {
      const allowedAppend = await importMultiDayConfirmAppend(
        activeRow,
        selectedMealDate,
        planRows.length,
        manifestRows.length
      );

      if (!allowedAppend) return;
    } else {
      const archivedDay = await importMultiDayGetArchivedDay(selectedMealDate);
      const allowedArchivedReimport = await importMultiDayConfirmArchivedReimport(
        archivedDay,
        selectedMealDate,
        planRows.length,
        manifestRows.length
      );

      if (!allowedArchivedReimport) return;
    }

    if (el("mealDateInput")) el("mealDateInput").value = selectedMealDate;
    const dateSaved = await saveMealDate();
    if (!dateSaved) return;

    const modeLabel = importMode === "append" ? "Dogrywanie CSV" : "Import nowego aktywnego dnia";

    setUploadStatus(
      "⏳ " + modeLabel + ": wysyłam " + planRows.length + " rekordów planu" +
      (unifiedCsv ? " i " + manifestRows.length + " toreb manifestu" : "") + "...",
      "info"
    );

    const planResult = await insertPackingPlanRows(planRows, modeLabel);
    if (!planResult.ok) return;

    const manifestResult = await importCustomerManifestRows(
      manifestRows,
      selectedMealDate,
      importMode !== "append",
      modeLabel
    );

    if (!manifestResult.ok) return;

    reportExportedThisSession = false;

    setUploadStatus(
      (importMode === "append"
        ? "✅ Dograno CSV do aktywnego dnia."
        : "✅ Import nowego aktywnego dnia zakończony.") +
      "\nDzień jedzony: " + formatDatePL(selectedMealDate) +
      "\nPlan pakowania: " + planResult.inserted + " rekordów." +
      (unifiedCsv
        ? "\nManifest klienta: " + manifestResult.imported + " toreb" +
          (manifestResult.skipped ? " / pominięto: " + manifestResult.skipped : "") + "."
        : "\nManifest klienta: pominięty, bo CSV jest w starym formacie 6 kolumn.") +
      "\nImport batch: " + batchId +
      (importMode === "append" ? "\nTryb: dogranie do istniejącego dnia." : "\nTryb: nowy aktywny dzień."),
      "ok"
    );

    await refreshAdminData();

    if (typeof loadActivePackingDays === "function") {
      await loadActivePackingDays();
    }

  } catch (err) {
    setUploadStatus("❌ Błąd importu: " + err.message, "bad");
  } finally {
    el("uploadButton").disabled = false;
  }
}

window.upload = upload;
window.uploadMultiDay = upload;

function installMultiDayUploadButton() {
  const oldButton = document.getElementById("uploadButton");
  if (!oldButton || oldButton.dataset.multidayBound === "true") return;

  const newButton = oldButton.cloneNode(true);
  newButton.dataset.multidayBound = "true";
  newButton.textContent = "⬆️ Wgraj jeden CSV";
  newButton.addEventListener("click", upload);
  oldButton.parentNode.replaceChild(newButton, oldButton);
}

function installMultiDayUploadButtonRepeated() {
  installMultiDayUploadButton();
  setTimeout(installMultiDayUploadButton, 0);
  setTimeout(installMultiDayUploadButton, 300);
  setTimeout(installMultiDayUploadButton, 800);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installMultiDayUploadButtonRepeated);
} else {
  installMultiDayUploadButtonRepeated();
}
