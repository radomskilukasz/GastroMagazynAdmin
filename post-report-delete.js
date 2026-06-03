let postReportDeleteBags = [];
let postReportDeletePreviewRow = null;
let postReportDeleteCsvInfo = null;

(function loadAdminDarkControlRoomTheme(){
  if (!document.querySelector('link[href*="dark-control-room.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'dark-control-room.css?v=2';
    document.head.appendChild(link);
  }
})();

(function loadAdminQrLoginOnlyFromPostReportDelete(){
  const old = document.querySelector('script[src*="admin-qr-login.js"]');
  if (old && old.src.indexOf('v=3') === -1) old.remove();

  if (!document.querySelector('script[src*="admin-qr-login.js"]')) {
    const script = document.createElement('script');
    script.src = 'admin-qr-login.js?v=3';
    script.async = false;
    document.body.appendChild(script);
  }
})();

function setPostReportDeleteStatus(text, type = "info") {
  setBox("postReportDeleteStatus", text, type);
}

function getPostReportMealDate() {
  return String(el("postReportMealDateInput")?.value || "").trim();
}

function setPostReportMealDate(value) {
  const input = el("postReportMealDateInput");
  if (input && value) input.value = value;
}

function normalizeBagForDelete(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replaceAll("Ś", "S")
    .replaceAll("Ą", "A")
    .replaceAll("Ć", "C")
    .replaceAll("Ę", "E")
    .replaceAll("Ł", "L")
    .replaceAll("Ń", "N")
    .replaceAll("Ó", "O")
    .replaceAll("Ź", "Z")
    .replaceAll("Ż", "Z");
}

function normalizeHeaderForDelete(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[ąćęłńóśźż]/g, ch => ({
      "ą":"a", "ć":"c", "ę":"e", "ł":"l", "ń":"n", "ó":"o", "ś":"s", "ź":"z", "ż":"z"
    }[ch] || ch))
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectCsvDelimiter(line) {
  const semicolons = (String(line || "").match(/;/g) || []).length;
  const commas = (String(line || "").match(/,/g) || []).length;
  const tabs = (String(line || "").match(/\t/g) || []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons >= commas ? ";" : ",";
}

function parseCsvLineForDelete(line, delimiter) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current);
  return out;
}

function normalizeDateForDelete(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const pl = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (pl) {
    return `${pl[3]}-${String(pl[2]).padStart(2, "0")}-${String(pl[1]).padStart(2, "0")}`;
  }

  const shortPl = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})$/);
  if (shortPl) {
    return `20${shortPl[3]}-${String(shortPl[2]).padStart(2, "0")}-${String(shortPl[1]).padStart(2, "0")}`;
  }

  return "";
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex(h => aliases.includes(h));
}

function parsePostReportDeleteCsv(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter(line => line.trim() !== "");

  if (!lines.length) {
    return { bags: [], rowsCount: 0, uniqueClients: 0, dates: [], duplicateCount: 0, format: "empty", examples: [] };
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const firstRow = parseCsvLineForDelete(lines[0], delimiter);
  const normalizedHeaders = firstRow.map(normalizeHeaderForDelete);

  let bagIndex = findHeaderIndex(normalizedHeaders, [
    "bag_qr",
    "qr_torby",
    "qr_torba",
    "kod_torby",
    "torba",
    "paczka",
    "qr_paczki"
  ]);

  let dateIndex = findHeaderIndex(normalizedHeaders, [
    "delivery_date",
    "meal_date",
    "dzien_jedzony",
    "data_dostawy",
    "data",
    "data_pakowania"
  ]);

  let clientIndex = findHeaderIndex(normalizedHeaders, [
    "client_id",
    "id_klienta",
    "klient",
    "order_id",
    "id_zamowienia"
  ]);

  let startIndex = 1;
  let format = "new_csv";

  if (bagIndex < 0) {
    const looksLikeHeader = normalizedHeaders.some(h => ["client_id", "delivery_date", "tray_qr", "meal", "code", "size", "dish_name"].includes(h));

    if (looksLikeHeader) {
      return {
        bags: [],
        rowsCount: Math.max(0, lines.length - 1),
        uniqueClients: 0,
        dates: [],
        duplicateCount: 0,
        format: "missing_bag_qr",
        examples: [],
        headers: normalizedHeaders
      };
    }

    // Awaryjny stary format: pierwsza kolumna = bag_qr bez nagłówka.
    bagIndex = 0;
    dateIndex = -1;
    clientIndex = -1;
    startIndex = 0;
    format = "single_column_bag_qr";
  }

  const bags = [];
  const seenBags = new Set();
  const clients = new Set();
  const dates = new Set();
  const examples = [];
  let duplicateCount = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const row = parseCsvLineForDelete(lines[i], delimiter);
    const bag = normalizeBagForDelete(row[bagIndex]);

    if (!bag) continue;

    const clientId = clientIndex >= 0 ? String(row[clientIndex] || "").trim() : "";
    const mealDate = dateIndex >= 0 ? normalizeDateForDelete(row[dateIndex]) : "";

    if (clientId) clients.add(clientId);
    if (mealDate) dates.add(mealDate);

    if (seenBags.has(bag)) {
      duplicateCount++;
    } else {
      seenBags.add(bag);
      bags.push(bag);

      if (examples.length < 8) {
        examples.push({ bag, clientId, mealDate });
      }
    }
  }

  return {
    bags,
    rowsCount: Math.max(0, lines.length - startIndex),
    uniqueClients: clients.size,
    dates: Array.from(dates).sort(),
    duplicateCount,
    format,
    examples,
    headers: normalizedHeaders
  };
}

function renderPostReportPreview(row, bags, csvInfo) {
  const missing = row?.missing_bags || [];
  const previewBox = el("postReportDeletePreview");
  if (!previewBox) return;

  const examples = (csvInfo?.examples || [])
    .map(x => `<tr><td>${escapeHtml(x.bag)}</td><td>${escapeHtml(x.clientId || "-")}</td><td>${escapeHtml(x.mealDate || "-")}</td></tr>`)
    .join("");

  previewBox.innerHTML = `
    <div class="tableWrap">
      <table>
        <tbody>
          <tr><th>Dzień jedzony</th><td><b>${escapeHtml(formatDatePL(row.meal_date))}</b></td></tr>
          <tr><th>Format CSV</th><td>${csvInfo?.format === "new_csv" ? "Nowy CSV z importu" : "Prosty plik z bag_qr"}</td></tr>
          <tr><th>Wiersze w pliku</th><td>${Number(csvInfo?.rowsCount || 0)}</td></tr>
          <tr><th>Unikalne torby w pliku</th><td><b>${Number(row.input_bags || bags.length || 0)}</b></td></tr>
          <tr><th>Unikalni klienci z pliku</th><td>${Number(csvInfo?.uniqueClients || 0) || "-"}</td></tr>
          <tr><th>Daty wykryte w pliku</th><td>${(csvInfo?.dates || []).length ? escapeHtml(csvInfo.dates.map(formatDatePL).join(" | ")) : "-"}</td></tr>
          <tr><th>Duplikaty bag_qr w CSV</th><td>${Number(csvInfo?.duplicateCount || 0)}</td></tr>
          <tr><th>Znalezione w aktualnym planie</th><td><b>${Number(row.found_in_plan || 0)}</b></td></tr>
          <tr><th>Już odwołane</th><td><b>${Number(row.already_cancelled || 0)}</b></td></tr>
          <tr><th>Wiersze packing_plan</th><td>${Number(row.packing_plan_rows || 0)}</td></tr>
          <tr><th>Istniejące sesje pakowania</th><td>${Number(row.packing_sessions_rows || 0)}</td></tr>
          <tr><th>Torby z pliku niewykryte w aktualnym planie</th><td>${missing.length ? escapeHtml(missing.join(" | ")) : "-"}</td></tr>
        </tbody>
      </table>
    </div>

    ${examples ? `
      <div class="tableWrap" style="margin-top:12px;">
        <table>
          <thead><tr><th>Przykładowe torby</th><th>Klient</th><th>Data z CSV</th></tr></thead>
          <tbody>${examples}</tbody>
        </table>
      </div>
    ` : ""}
  `;
}

async function previewPostReportDelete() {
  const input = el("postReportDeleteFile");
  const file = input?.files?.[0];

  postReportDeleteBags = [];
  postReportDeletePreviewRow = null;
  postReportDeleteCsvInfo = null;
  el("postReportDeletePreview").innerHTML = "";

  if (!file) {
    setPostReportDeleteStatus("❌ Wybierz CSV. Może to być nowy format importu albo prosty plik z kolumną bag_qr.", "bad");
    return;
  }

  setPostReportDeleteStatus("⏳ Czytam CSV, wykrywam datę i sprawdzam torby...", "info");

  try {
    const text = await file.text();
    const csvInfo = parsePostReportDeleteCsv(text);
    let selectedMealDate = getPostReportMealDate();

    if (csvInfo.format === "missing_bag_qr") {
      setPostReportDeleteStatus("❌ Plik wygląda jak nowy CSV, ale nie ma kolumny bag_qr. Nie wiem, które torby odwołać.", "bad");
      return;
    }

    if (!csvInfo.bags.length) {
      setPostReportDeleteStatus("❌ Nie znalazłem żadnych kodów bag_qr w pliku. W nowym CSV wymagana jest kolumna bag_qr.", "bad");
      return;
    }

    if (!selectedMealDate && csvInfo.dates.length === 1) {
      selectedMealDate = csvInfo.dates[0];
      setPostReportMealDate(selectedMealDate);
    }

    if (!selectedMealDate) {
      setPostReportDeleteStatus("❌ Nie wybrano dnia. Wybierz dzień ręcznie albo wgraj nowy CSV z jedną datą w kolumnie delivery_date.", "bad");
      return;
    }

    if (csvInfo.dates.length > 1) {
      setPostReportDeleteStatus(`❌ Plik zawiera kilka dat: ${csvInfo.dates.map(formatDatePL).join(" | ")}. Odwołania wykonuj osobnym plikiem dla jednej daty.`, "bad");
      return;
    }

    if (csvInfo.dates.length === 1 && csvInfo.dates[0] !== selectedMealDate) {
      setPostReportDeleteStatus(`❌ Data z CSV (${formatDatePL(csvInfo.dates[0])}) różni się od wybranej daty (${formatDatePL(selectedMealDate)}).`, "bad");
      return;
    }

    const { data, error } = await supabaseClient.rpc("admin_preview_cancel_bags_for_date", {
      target_meal_date: selectedMealDate,
      target_bag_qrs: csvInfo.bags
    });

    if (error) {
      setPostReportDeleteStatus("❌ Nie udało się sprawdzić zmian poraportowych: " + error.message, "bad");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    postReportDeleteBags = csvInfo.bags;
    postReportDeletePreviewRow = row;
    postReportDeleteCsvInfo = csvInfo;

    renderPostReportPreview(row, csvInfo.bags, csvInfo);

    setPostReportDeleteStatus(
      `✅ Podgląd gotowy. Data: ${formatDatePL(selectedMealDate)}. Unikalne torby: ${csvInfo.bags.length}. Znaleziono w planie: ${Number(row?.found_in_plan || 0)}. Już odwołane: ${Number(row?.already_cancelled || 0)}.`,
      "ok"
    );
  } catch (err) {
    setPostReportDeleteStatus("❌ Błąd podglądu zmian poraportowych: " + err.message, "bad");
  }
}

async function executePostReportDelete() {
  const selectedMealDate = getPostReportMealDate();
  const confirmText = String(el("postReportDeleteConfirm")?.value || "").trim();

  if (!selectedMealDate) {
    setPostReportDeleteStatus("❌ Wybierz dzień jedzony zmian poraportowych.", "bad");
    return;
  }

  if (!postReportDeleteBags.length) {
    setPostReportDeleteStatus("❌ Najpierw wykonaj podgląd CSV.", "bad");
    return;
  }

  if (postReportDeleteCsvInfo?.dates?.length === 1 && postReportDeleteCsvInfo.dates[0] !== selectedMealDate) {
    setPostReportDeleteStatus("❌ Data zmieniła się po podglądzie. Wykonaj podgląd ponownie.", "bad");
    return;
  }

  if (confirmText !== "ODWOŁAJ") {
    setPostReportDeleteStatus("❌ Aby wykonać odwołanie, wpisz dokładnie: ODWOŁAJ", "bad");
    return;
  }

  const choice = await showChoiceModal({
    title: "⛔ Odwołać torby?",
    text: "Ta operacja oznaczy wskazane torby statusem ODWOŁANA dla wybranego dnia jedzonego.",
    details:
      `Dzień jedzony: <b>${escapeHtml(formatDatePL(selectedMealDate))}</b><br>` +
      `Torby do odwołania: <b>${postReportDeleteBags.length}</b><br>` +
      `Klienci z CSV: <b>${Number(postReportDeleteCsvInfo?.uniqueClients || 0) || "-"}</b><br>` +
      `Znalezione w planie: <b>${Number(postReportDeletePreviewRow?.found_in_plan || 0)}</b><br>` +
      `Już odwołane: <b>${Number(postReportDeletePreviewRow?.already_cancelled || 0)}</b>`,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Odwołaj torby", value:"delete", className:"btnReplace" }
    ]
  });

  if (choice !== "delete") return;

  const button = el("executePostReportDeleteButton");
  if (button) button.disabled = true;
  setPostReportDeleteStatus("⏳ Oznaczam torby jako ODWOŁANE...", "info");

  try {
    const { data, error } = await supabaseClient.rpc("admin_cancel_bags_for_date", {
      target_meal_date: selectedMealDate,
      target_bag_qrs: postReportDeleteBags,
      reason_text: "Zmiany poraportowe / odwołanie torby z nowego CSV"
    });

    if (error) {
      setPostReportDeleteStatus("❌ Nie udało się odwołać toreb: " + error.message, "bad");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;

    setPostReportDeleteStatus(
      `✅ Odwołanie zakończone. Nowo odwołane: ${Number(row?.newly_cancelled || 0)}. Już wcześniej odwołane: ${Number(row?.already_cancelled || 0)}. Brakujące w planie: ${Number(row?.missing_count || 0)}.`,
      "ok"
    );

    el("postReportDeleteConfirm").value = "";
    postReportDeleteBags = [];
    postReportDeletePreviewRow = null;
    postReportDeleteCsvInfo = null;

    if (typeof refreshAdminData === "function") await refreshAdminData();
  } catch (err) {
    setPostReportDeleteStatus("❌ Błąd odwoływania toreb: " + err.message, "bad");
  } finally {
    if (button) button.disabled = false;
  }
}

function updatePostReportDeleteTexts() {
  const fileInput = el("postReportDeleteFile");
  const section = fileInput?.closest(".adminSection");
  if (!section) return;

  const hint = section.querySelector(".sectionHint");
  if (hint) {
    hint.textContent = "Wgraj nowy CSV i odwołaj wskazane torby dla konkretnego dnia. System czyta bag_qr oraz delivery_date.";
  }

  const labels = Array.from(section.querySelectorAll("label"));
  labels.forEach(label => {
    if (label.textContent.includes("CSV z torbami")) {
      label.textContent = "CSV z nowego importu albo lista bag_qr";
    }
  });

  const tip = section.querySelector(".adminTip");
  if (tip) {
    tip.innerHTML = "Obsługiwany jest nowy format: <b>client_id;delivery_date;zone;default_diet;variant;calories;bag_qr;tray_qr;meal;code;size;dish_name</b>. Możesz też awaryjnie wgrać prosty CSV z jedną kolumną <b>bag_qr</b>.";
  }

  const status = el("postReportDeleteStatus");
  if (status && status.textContent.includes("wybierz dzień jedzony")) {
    status.textContent = "Status: wybierz CSV. Dzień może zostać wykryty automatycznie z delivery_date albo ustawiony ręcznie.";
  }
}

function bindPostReportDeleteButtons() {
  const previewButton = el("previewPostReportDeleteButton");
  const executeButton = el("executePostReportDeleteButton");

  updatePostReportDeleteTexts();

  if (previewButton && previewButton.dataset.boundPostReportDelete !== "true") {
    previewButton.dataset.boundPostReportDelete = "true";
    previewButton.addEventListener("click", previewPostReportDelete);
  }

  if (executeButton && executeButton.dataset.boundPostReportDelete !== "true") {
    executeButton.dataset.boundPostReportDelete = "true";
    executeButton.addEventListener("click", executePostReportDelete);
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bindPostReportDeleteButtons);
} else {
  bindPostReportDeleteButtons();
}

setTimeout(updatePostReportDeleteTexts, 500);
setTimeout(updatePostReportDeleteTexts, 1200);
