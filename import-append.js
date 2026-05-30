/*
  Rozszerzenie importu planu CSV.
  Ten plik nadpisuje funkcję upload() z app.js i obsługuje:
  1) nowy wspólny CSV 12 kolumn:
     client_id;delivery_date;zone;default_diet;variant;calories;bag_qr;tray_qr;meal;code;size;dish_name
  2) stary awaryjny CSV 6 kolumn:
     bag_qr;tray_qr;meal;code;size;dish_name

  Nowy CSV zasila jednocześnie:
  - packing_plan — plan pakowania tacek,
  - customer_manifest — dane klienta/torby do kontroli i wyszukiwania.
*/

function operationalHasData(row) {
  if (!row) return false;

  return [
    "packing_plan_count",
    "packing_sessions_count",
    "packing_session_items_count",
    "station_lines_count",
    "station_bags_count",
    "station_item_states_count",
    "station_scans_count",
    "tray_scans_count",
    "packing_item_events_count",
    "cancelled_bags_count"
  ].some(key => Number(row[key] || 0) > 0);
}

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
    Number(row.packing_item_events_count || 0) === 0 &&
    Number(row.cancelled_bags_count || 0) === 0;
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

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectCsvDelimiter(headerLine) {
  const line = String(headerLine || "");
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;

  candidates.forEach(delimiter => {
    const escaped = delimiter === "\t" ? "\t" : "\\" + delimiter;
    const count = (line.match(new RegExp(escaped, "g")) || []).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  });

  return best;
}

function parseCsvDocument(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter(line => line.trim() !== "");

  if (lines.length < 2) {
    return { headers: [], normalizedHeaders: [], rows: [], delimiter: ";" };
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(x => String(x || "").trim());
  const normalizedHeaders = headers.map(normalizeImportHeader);

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line, delimiter);
    const obj = {
      __values: values,
      __source_row: index + 2
    };

    normalizedHeaders.forEach((header, i) => {
      if (!header) return;
      obj[header] = String(values[i] ?? "").trim();
    });

    return obj;
  });

  return { headers, normalizedHeaders, rows, delimiter };
}

function rowValue(row, aliases, fallbackIndex = null) {
  for (const alias of aliases) {
    const key = normalizeImportHeader(alias);
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  if (fallbackIndex !== null && row.__values && row.__values[fallbackIndex] !== undefined) {
    return String(row.__values[fallbackIndex] || "").trim();
  }

  return "";
}

function parseImportDateToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }

  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}

function getCsvMealDates(parsed) {
  const dates = new Set();

  (parsed.rows || []).forEach(row => {
    const value = rowValue(row, ["delivery_date", "meal_date", "data", "date"]);
    const iso = parseImportDateToIso(value);
    if (iso) dates.add(iso);
  });

  return [...dates].sort();
}

function isUnifiedCsv(parsed) {
  const h = new Set(parsed.normalizedHeaders || []);
  return h.has("client_id") &&
    h.has("delivery_date") &&
    h.has("bag_qr") &&
    h.has("tray_qr") &&
    h.has("meal") &&
    h.has("code") &&
    h.has("size") &&
    h.has("dish_name");
}

function buildPackingPlanRowsFromCsv(parsed, batchId, selectedMealDate) {
  const unified = isUnifiedCsv(parsed);

  return (parsed.rows || []).map(row => ({
    import_batch_id: batchId,
    meal_date: selectedMealDate || null,
    order_id: unified ? rowValue(row, ["client_id"]) : null,
    bag_qr: rowValue(row, ["bag_qr", "qr_torby", "numer_etykiety"], unified ? null : 0),
    tray_qr: rowValue(row, ["tray_qr", "qr_tacki", "kod_tacki"], unified ? null : 1),
    meal: rowValue(row, ["meal", "posilek", "posiłek"], unified ? null : 2),
    code: rowValue(row, ["code", "kod"], unified ? null : 3),
    size: rowValue(row, ["size", "rozmiar"], unified ? null : 4),
    dish_name: rowValue(row, ["dish_name", "nazwa_dania", "danie"], unified ? null : 5)
  })).filter(x => x.bag_qr && x.tray_qr);
}

function buildCustomerManifestRowsFromCsv(parsed, selectedMealDate) {
  if (!isUnifiedCsv(parsed)) return [];

  const byBag = new Map();

  (parsed.rows || []).forEach(row => {
    const bagQr = rowValue(row, ["bag_qr"]);
    const clientId = rowValue(row, ["client_id"]);

    if (!bagQr || !clientId) return;

    const key = bagQr.trim().toUpperCase();
    const meal = rowValue(row, ["meal"]);
    const trayQr = rowValue(row, ["tray_qr"]);

    if (!byBag.has(key)) {
      byBag.set(key, {
        meal_date: selectedMealDate,
        delivery_date: rowValue(row, ["delivery_date"]),
        client_id: clientId,
        shipment_customer_id: clientId,
        bag_qr: bagQr,
        order_id: clientId,
        zone: rowValue(row, ["zone"]),
        default_diet: rowValue(row, ["default_diet"]),
        variant: rowValue(row, ["variant"]),
        calories: rowValue(row, ["calories"]),
        source_sheet: "unified_csv",
        source_row: Number(row.__source_row || 0),
        match_status: "imported_unified_csv",
        tray_count: 0,
        meals: [],
        tray_qrs_preview: []
      });
    }

    const manifestRow = byBag.get(key);
    manifestRow.tray_count += 1;

    if (meal && !manifestRow.meals.includes(meal)) {
      manifestRow.meals.push(meal);
    }

    if (trayQr && manifestRow.tray_qrs_preview.length < 20) {
      manifestRow.tray_qrs_preview.push(trayQr);
    }
  });

  return [...byBag.values()];
}

async function confirmAppendImport(statusRow, selectedMealDate, currentMealDate, rowsCount, manifestCount) {
  const packingStarted = operationalPackingAlreadyStarted(statusRow);

  const details =
    `Dzień w systemie: <b>${escapeHtml(formatDatePL(currentMealDate))}</b><br>` +
    `Dzień z formularza / CSV: <b>${escapeHtml(formatDatePL(selectedMealDate))}</b><br>` +
    `Nowe rekordy planu z CSV: <b>${Number(rowsCount || 0)}</b><br>` +
    `Nowe/aktualizowane torby w manifeście: <b>${Number(manifestCount || 0)}</b><br><br>` +
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
      setUploadStatus("❌ Błąd importu planu po " + inserted + " rekordach: " + error.message, "bad");
      return { ok:false, inserted };
    }

    inserted += chunk.length;
    setUploadStatus("⏳ " + modeLabel + ": wgrano plan " + inserted + " / " + data.length + "...", "info");
  }

  return { ok:true, inserted };
}

async function importCustomerManifestRows(rows, selectedMealDate, replaceExisting, modeLabel) {
  if (!rows.length) return { ok:true, imported:0, skipped:0 };

  const chunkSize = 1000;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const { data, error } = await supabaseClient.rpc("customer_manifest_import", {
      rows: chunk,
      replace_existing: replaceExisting && i === 0,
      p_meal_date: selectedMealDate
    });

    if (error) {
      setUploadStatus("❌ Plan został wgrany, ale nie udało się zapisać manifestu klienta: " + error.message, "bad");
      return { ok:false, imported, skipped };
    }

    const result = data && data.length ? data[0] : null;
    imported += Number(result?.imported_count || chunk.length || 0);
    skipped += Number(result?.skipped_count || 0);

    setUploadStatus(
      "⏳ " + modeLabel + ": zapisano manifest " + Math.min(i + chunk.length, rows.length) + " / " + rows.length + " toreb...",
      "info"
    );
  }

  return { ok:true, imported, skipped };
}

async function upload() {
  const statusRow = await loadOperationalStatus();
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

    let selectedMealDate = formMealDate || csvDates[0] || "";

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
          "Dzień z formularza/CSV: " + formatDatePL(selectedMealDate) + "\n" +
          "Aby wgrać nowy dzień, najpierw pobierz raport i wykonaj reset dnia.",
          "bad"
        );
        return;
      }

      const allowedAppend = await confirmAppendImport(
        statusRow,
        selectedMealDate,
        currentMealDate,
        planRows.length,
        manifestRows.length
      );

      if (!allowedAppend) return;

      importMode = "append";
    } else {
      const dateSaved = await saveMealDate();
      if (!dateSaved) return;
    }

    const modeLabel = importMode === "append" ? "Dogrywanie CSV" : "Import nowego dnia";

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
        ? "✅ Dograno CSV do aktualnego dnia."
        : "✅ Import nowego dnia zakończony.") +
      "\nDzień jedzony: " + formatDatePL(selectedMealDate) +
      "\nPlan pakowania: " + planResult.inserted + " rekordów." +
      (unifiedCsv
        ? "\nManifest klienta: " + manifestResult.imported + " toreb" +
          (manifestResult.skipped ? " / pominięto: " + manifestResult.skipped : "") + "."
        : "\nManifest klienta: pominięty, bo CSV jest w starym formacie 6 kolumn.") +
      "\nImport batch: " + batchId +
      (importMode === "append" ? "\nTryb: dogranie do istniejącego planu." : "\nTryb: nowy dzień."),
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
  if (uploadButton) uploadButton.innerText = "⬆️ Wgraj jeden CSV: plan + dane klienta";

  const tips = [...document.querySelectorAll(".adminTip")];
  const importTip = tips.find(x => String(x.innerText || "").includes("Format kolumn"));
  if (importTip) {
    importTip.innerHTML =
      "Nowy format jednego CSV: <b>client_id; delivery_date; zone; default_diet; variant; calories; bag_qr; tray_qr; meal; code; size; dish_name</b>.<br>" +
      "Ten jeden plik zasila plan pakowania oraz dane klienta/torby. Stary format 6 kolumn dalej działa awaryjnie.";
  }
});
