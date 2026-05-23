/* Import dziennej zbiorczej klientów do customer_manifest. */
(function(){
  function el(id){ return document.getElementById(id); }

  function setStatus(text, type){
    const box = el('customerManifestStatus');
    if (!box) return;
    box.innerText = text;
    box.className = 'statusBox ' + (type || 'info');
  }

  function normalizeHeader(v){
    return String(v || '').trim().replace(/^\uFEFF/, '');
  }

  function detectDelimiter(line){
    const s = String(line || '');
    const semi = (s.match(/;/g) || []).length;
    const comma = (s.match(/,/g) || []).length;
    return semi >= comma ? ';' : ',';
  }

  function parseCsvLine(line, delimiter){
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i=0; i<line.length; i++){
      const ch = line[i];
      const next = line[i+1];
      if (ch === '"' && inQuotes && next === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text){
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const lines = clean.split(/\r?\n/).filter(x => x.trim() !== '');
    if (!lines.length) return [];
    const delimiter = detectDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
    const rows = [];
    for (let i=1; i<lines.length; i++){
      const cells = parseCsvLine(lines[i], delimiter);
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = String(cells[idx] ?? '').trim(); });
      obj.source_row = String(i + 1);
      rows.push(obj);
    }
    return rows;
  }

  function rowsPreview(rows){
    const total = rows.length;
    const ok = rows.filter(r => String(r.match_status || '').toUpperCase() === 'OK').length;
    const withBag = rows.filter(r => String(r.bag_qr || '').trim() !== '').length;
    const dates = [...new Set(rows.map(r => r.Data || r.meal_date || '').filter(Boolean))];
    return { total, ok, withBag, dates };
  }

  async function importCustomerManifest(){
    const input = el('customerManifestFile');
    const replace = el('customerManifestReplace')?.checked !== false;
    const file = input?.files?.[0];
    if (!file) { setStatus('❌ Wybierz CSV z arkusza WYNIK - klienci.', 'bad'); return; }

    setStatus('⏳ Czytam plik manifestu klientów...', 'info');
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const p = rowsPreview(rows);

      if (!rows.length) { setStatus('❌ Plik nie zawiera danych.', 'bad'); return; }
      if (!p.withBag) { setStatus('❌ Nie widzę kolumny bag_qr albo wszystkie wartości są puste.', 'bad'); return; }
      if (p.dates.length !== 1) { setStatus('❌ Plik powinien zawierać dokładnie jeden dzień jedzony. Wykryto: ' + p.dates.join(', '), 'bad'); return; }

      setStatus(`⏳ Importuję ${p.total} wierszy. Dzień: ${p.dates[0]}. Dopasowane QR: ${p.withBag}.`, 'info');

      const { data, error } = await supabaseClient.rpc('customer_manifest_import', {
        rows,
        replace_existing: replace
      });

      if (error) { setStatus('❌ Import manifestu nieudany: ' + error.message, 'bad'); return; }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.status !== 'OK') { setStatus('❌ Import zwrócił nieoczekiwany wynik.', 'bad'); return; }

      setStatus(`✅ Zaimportowano manifest klientów. Dzień: ${row.meal_date}. Wiersze: ${row.imported_count}. Pominięte: ${row.skipped_count}.`, 'ok');
      if (typeof refreshAdminData === 'function') refreshAdminData();
    } catch(e) {
      setStatus('❌ Błąd importu manifestu: ' + e.message, 'bad');
    }
  }

  function injectPanel(){
    if (el('customerManifestSection')) return;
    const firstFull = document.querySelector('.adminGrid .adminSection.fullWidth');
    const section = document.createElement('section');
    section.id = 'customerManifestSection';
    section.className = 'adminSection fullWidth';
    section.innerHTML = `
      <div class="sectionHeader">
        <div>
          <h2>👤 Import zbiorczej klientów</h2>
          <div class="sectionHint">Wgraj CSV wygenerowany z arkusza WYNIK - klienci. Dane służą tylko do raportu i wyszukiwania paczek po ID klienta.</div>
        </div>
      </div>
      <div class="sectionBody">
        <div class="actionStack">
          <div class="formGroup">
            <label>CSV z WYNIK - klienci</label>
            <input type="file" id="customerManifestFile" class="fileInput" accept=".csv,text/csv">
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-weight:800;">
            <input type="checkbox" id="customerManifestReplace" checked>
            Zastąp wcześniejszą zbiorczą dla tego samego dnia jedzonego
          </label>
          <button id="customerManifestImportButton" class="darkBtn">⬆️ Wgraj zbiorczą klientów</button>
          <div class="adminTip">
            System zapisze dzienny snapshot klient → torba. Obecne pakowanie tacek nie jest zmieniane. Po archiwizacji dane trafią do archiwum manifestu.
          </div>
          <p id="customerManifestStatus" class="statusBox info">Status: wybierz CSV z arkusza WYNIK - klienci.</p>
        </div>
      </div>`;
    if (firstFull) firstFull.insertAdjacentElement('beforebegin', section);
    else document.querySelector('.adminGrid')?.appendChild(section);
    el('customerManifestImportButton')?.addEventListener('click', importCustomerManifest);
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', injectPanel);
  else injectPanel();
})();
