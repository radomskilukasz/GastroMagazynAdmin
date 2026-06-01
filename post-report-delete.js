let postReportDeleteBags = [];
let postReportDeletePreviewRow = null;

(function loadAdminQrLoginOnlyFromPostReportDelete(){
  if (!document.querySelector('script[src*="admin-qr-login.js"]')) {
    const script = document.createElement('script');
    script.src = 'admin-qr-login.js?v=1';
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

function detectCsvDelimiter(line) {
  const semicolons = (String(line || "").match(/;/g) || []).length;
  const commas = (String(line || "").match(/,/g) || []).length;
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

function extractBagQrsFromDeleteCsv(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter(line => line.trim() !== "");

  if (!lines.length) return [];

  const delimiter = detectCsvDelimiter(lines[0]);
  const firstRow = parseCsvLineForDelete(lines[0], delimiter);
  const normalizedHeaders = firstRow.map(x => String(x || "").trim().toLowerCase().replace(/\s+/g, "_"));

  let bagIndex = normalizedHeaders.findIndex(h => [
    "bag_qr",
    "qr_torby",
    "qr_torba",
    "kod_torby",
    "torba"
  ].includes(h));

  let startIndex = 0;

  if (bagIndex >= 0) {
    startIndex = 1;
  } else {
    bagIndex = 0;
    startIndex = firstRow.some(cell => String(cell || "").toLowerCase().includes("bag") || String(cell || "").toLowerCase().includes("torb")) ? 1 : 0;
  }

  const bags = [];
  const seen = new Set();

  for (let i = startIndex; i < lines.length; i++) {
    const row = parseCsvLineForDelete(lines[i], delimiter);
    const bag = normalizeBagForDelete(row[bagIndex]);

    if (!bag || seen.has(bag)) continue;

    seen.add(bag);
    bags.push(bag);
  }

  return bags;
}

function renderPostReportPreview(row, bags) {
  const missing = row?.missing_bags || [];
  const previewBox = el("postReportDeletePreview");
  if (!previewBox) return;

  previewBox.innerHTML = `
    <div class="tableWrap">
      <table>
        <tbody>
          <tr><th>Dzień jedzony</th><td><b>${escapeHtml(formatDatePL(row.meal_date))}</b></td></tr>
          <tr><th>Unikalne torby w pliku</th><td><b>${Number(row.input_bags || bags.length || 0)}</b></td></tr>
          <tr><th>Znalezione w aktualnym planie</th><td><b>${Number(row.found_in_plan || 0)}</b></td></tr>
          <tr><th>Już odwołane</th><td><b>${Number(row.already_cancelled || 0)}</b></td></tr>
          <tr><th>Wiersze packing_plan</th><td>${Number(row.packing_plan_rows || 0)}</td></tr>
          <tr><th>Istniejące sesje pakowania</th><td>${Number(row.packing_sessions_rows || 0)}</td></tr>
          <tr><th>Torby z pliku niewykryte w aktualnym planie</th><td>${missing.length ? escapeHtml(missing.join(" | ")) : "-"}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

async function previewPostReportDelete() {
  const input = el("postReportDeleteFile");
  const file = input?.files?.[0];
  const selectedMealDate = getPostReportMealDate();

  postReportDeleteBags = [];
  postReportDeletePreviewRow = null;
  el("postReportDeletePreview").innerHTML = "";

  if (!selectedMealDate) {
    setPostReportDeleteStatus("❌ Wybierz dzień jedzony zmian poraportowych.", "bad");
    return;
  }

  if (!file) {
    setPostReportDeleteStatus("❌ Wybierz plik CSV ze zmianami poraportowymi do odwołania.", "bad");
    return;
  }

  setPostReportDeleteStatus("⏳ Czytam CSV i sprawdzam plan dla wybranego dnia...", "info");

  try {
    const text = await file.text();
    const bags = extractBagQrsFromDeleteCsv(text);

    if (!bags.length) {
      setPostReportDeleteStatus("❌ Nie znalazłem żadnych kodów bag_qr w pliku. Sprawdź, czy pierwsza kolumna to QR torby / bag_qr.", "bad");
      return;
    }

    const { data, error } = await supabaseClient.rpc("admin_preview_cancel_bags_for_date", {
      target_meal_date: selectedMealDate,
      target_bag_qrs: bags
    });

    if (error) {
      setPostReportDeleteStatus("❌ Nie udało się sprawdzić zmian poraportowych: " + error.message, "bad");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    postReportDeleteBags = bags;
    postReportDeletePreviewRow = row;

    renderPostReportPreview(row, bags);

    setPostReportDeleteStatus(
      `✅ Podgląd gotowy. Plik: ${bags.length} toreb. Znaleziono w planie: ${Number(row?.found_in_plan || 0)}. Już odwołane: ${Number(row?.already_cancelled || 0)}.`,
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

  if (confirmText !== "ODWOŁAJ") {
    setPostReportDeleteStatus("❌ Aby wykonać odwołanie, wpisz dokładnie: ODWOŁAJ", "bad");
    return;
  }

  const choice = await showChoiceModal({
    title: "⛔ Odwołać torby?",
    text: "Ta operacja oznaczy wskazane torby statusem ODWOŁANA dla wybranego dnia jedzonego.",
    details:
      `Dzień jedzony: <b>${escapeHtml(formatDatePL(selectedMealDate))}</b><br>` +
      `Torby w pliku: <b>${postReportDeleteBags.length}</b><br>` +
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
      reason_text: "Zmiany poraportowe / odwołanie torby z CSV"
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

    if (typeof refreshAdminData === "function") await refreshAdminData();
  } catch (err) {
    setPostReportDeleteStatus("❌ Błąd odwoływania toreb: " + err.message, "bad");
  } finally {
    if (button) button.disabled = false;
  }
}

function bindPostReportDeleteButtons() {
  const previewButton = el("previewPostReportDeleteButton");
  const executeButton = el("executePostReportDeleteButton");

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
