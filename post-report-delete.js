let postReportDeleteBags = [];
let postReportDeletePreviewRow = null;

(function loadAdminExtraScriptsFromPostReportDelete(){
  if (!document.querySelector('script[src*="admin-qr-login.js"]')) {
    const script = document.createElement('script');
    script.src = 'admin-qr-login.js?v=1';
    script.async = false;
    document.body.appendChild(script);
  }
  if (!document.querySelector('script[src*="customer-manifest-admin.js"]')) {
    const script2 = document.createElement('script');
    script2.src = 'customer-manifest-admin.js?v=1';
    script2.async = false;
    document.body.appendChild(script2);
  }
})();

function setPostReportDeleteStatus(text, type = "info") {
  setBox("postReportDeleteStatus", text, type);
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

  postReportDeleteBags = [];
  postReportDeletePreviewRow = null;
  el("postReportDeletePreview").innerHTML = "";

  if (!file) {
    setPostReportDeleteStatus("❌ Wybierz plik CSV ze zmianami poraportowymi do odwołania.", "bad");
    return;
  }

  setPostReportDeleteStatus("⏳ Czytam CSV i sprawdzam aktualny plan...", "info");

  try {
    const text = await file.text();
    const bags = extractBagQrsFromDeleteCsv(text);

    if (!bags.length) {
      setPostReportDeleteStatus("❌ Nie znalazłem żadnych kodów bag_qr w pliku. Sprawdź, czy pierwsza kolumna to QR torby / bag_qr.", "bad");
      return;
    }

    const { data, error } = await supabaseClient.rpc("admin_preview_cancel_bags", {
      target_bag_qrs: bags
    });

    if (error) {
      setPostReportDeleteStatus("❌ Nie udało się wykonać podglądu: " + error.message, "bad");
      return;
    }

    const row = data && data.length ? data[0] : null;

    if (!row) {
      setPostReportDeleteStatus("❌ Funkcja podglądu nie zwróciła danych.", "bad");
      return;
    }

    postReportDeleteBags = bags;
    postReportDeletePreviewRow = row;

    renderPostReportPreview(row, bags);

    setPostReportDeleteStatus(
      `✅ Podgląd gotowy. Torby w pliku: ${bags.length}. Do odwołania znalezione w aktualnym planie: ${Number(row.found_in_plan || 0)}.`,
      Number(row.found_in_plan || 0) > 0 ? "warn" : "ok"
    );

  } catch (err) {
    setPostReportDeleteStatus("❌ Błąd podglądu zmian poraportowych: " + err.message, "bad");
  }
}

async function executePostReportDelete() {
  const confirmText = String(el("postReportDeleteConfirm")?.value || "").trim();

  if (!postReportDeleteBags.length || !postReportDeletePreviewRow) {
    setPostReportDeleteStatus("❌ Najpierw wykonaj podgląd pliku CSV.", "bad");
    return;
  }

  if (confirmText.toUpperCase() !== "ODWOŁAJ" && confirmText.toUpperCase() !== "ODWOLAJ") {
    setPostReportDeleteStatus("❌ Aby odwołać torby, wpisz w pole potwierdzenia: ODWOŁAJ", "bad");
    return;
  }

  const row = postReportDeletePreviewRow;

  const choice = await showChoiceModal({
    title: "🧾 Odwołać zmiany poraportowe?",
    text: "To oznaczy wybrane torby jako ODWOŁANE. Torby zostaną w śladzie systemowym, ale nie będą liczone do normalnego pakowania.",
    details:
      `Dzień jedzony: <b>${escapeHtml(formatDatePL(row.meal_date))}</b><br>` +
      `Torby z pliku: <b>${Number(row.input_bags || postReportDeleteBags.length)}</b><br>` +
      `Znalezione w aktualnym planie: <b>${Number(row.found_in_plan || 0)}</b><br>` +
      `Już odwołane: <b>${Number(row.already_cancelled || 0)}</b><br><br>` +
      `Po skanie pracownik zobaczy komunikat o oddaniu torby do biura kierowników.`,
    buttons: [
      { label: "Anuluj", value: "cancel", className: "btnCancel" },
      { label: "Odwołaj torby", value: "cancel_bags", className: "btnReplace" }
    ]
  });

  if (choice !== "cancel_bags") return;

  setPostReportDeleteStatus("⏳ Oznaczam torby jako ODWOŁANE...", "info");
  el("executePostReportDeleteButton").disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc("admin_cancel_bags", {
      target_bag_qrs: postReportDeleteBags,
      cancel_reason: "Odwołanie po zmianach poraportowych"
    });

    if (error) {
      setPostReportDeleteStatus("❌ Nie udało się odwołać zmian poraportowych: " + error.message, "bad");
      return;
    }

    const result = data && data.length ? data[0] : null;

    if (!result || result.status !== "OK") {
      setPostReportDeleteStatus("❌ Funkcja odwoływania zwróciła nieoczekiwany wynik.", "bad");
      return;
    }

    const missing = result.missing_bags || [];

    setPostReportDeleteStatus(
      `✅ Odwołano torby dla dnia ${formatDatePL(result.meal_date)}.\n` +
      `Torby w pliku: ${Number(result.input_bags || 0)}\n` +
      `Odwołane / zaktualizowane: ${Number(result.cancelled_bags || 0)}\n` +
      `Już odwołane przed operacją: ${Number(result.already_cancelled || 0)}\n` +
      `Niewykryte w aktualnym planie: ${missing.length ? missing.join(" | ") : "-"}`,
      "ok"
    );

    postReportDeleteBags = [];
    postReportDeletePreviewRow = null;
    el("postReportDeleteConfirm").value = "";
    el("postReportDeleteFile").value = "";
    el("postReportDeletePreview").innerHTML = "";

    await refreshAdminData();

  } catch (err) {
    setPostReportDeleteStatus("❌ Błąd odwoływania zmian poraportowych: " + err.message, "bad");
  } finally {
    el("executePostReportDeleteButton").disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  el("previewPostReportDeleteButton")?.addEventListener("click", previewPostReportDelete);
  el("executePostReportDeleteButton")?.addEventListener("click", executePostReportDelete);
});
