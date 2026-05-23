/* Import dziennej zbiorczej klientów do customer_manifest — wersja paczkowana, odporna na duże CSV. */
(function(){
  const CHUNK_SIZE = 400;

  function el(id){ return document.getElementById(id); }

  function setStatus(text, type){
    const box = el('customerManifestStatus');
    if (!box) return;
    box.innerText = text;
    box.className = 'statusBox ' + (type || 'info');
  }

  function normalizeHeader(v){ return String(v || '').trim().replace(/^\uFEFF/, ''); }
  function detectDelimiter(line){ const s=String(line||''); return (s.match(/;/g)||[]).length >= (s.match(/,/g)||[]).length ? ';' : ','; }

  function parseCsvLine(line, delimiter){
    const out=[]; let cur=''; let inQuotes=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i], next=line[i+1];
      if(ch==='"' && inQuotes && next==='"'){ cur+='"'; i++; continue; }
      if(ch==='"'){ inQuotes=!inQuotes; continue; }
      if(ch===delimiter && !inQuotes){ out.push(cur); cur=''; continue; }
      cur+=ch;
    }
    out.push(cur); return out;
  }

  function parseCsv(text){
    const clean=String(text||'').replace(/^\uFEFF/,'');
    const lines=clean.split(/\r?\n/).filter(x=>x.trim()!=='');
    if(!lines.length) return [];
    const delimiter=detectDelimiter(lines[0]);
    const headers=parseCsvLine(lines[0], delimiter).map(normalizeHeader);
    const rows=[];
    for(let i=1;i<lines.length;i++){
      const cells=parseCsvLine(lines[i], delimiter);
      const obj={};
      headers.forEach((h,idx)=>{ obj[h]=String(cells[idx]??'').trim(); });
      obj.source_row=String(i+1);
      rows.push(obj);
    }
    return rows;
  }

  function rowsPreview(rows){
    return {
      total: rows.length,
      withBag: rows.filter(r=>String(r.bag_qr||'').trim()!=='').length,
      dates: [...new Set(rows.map(r=>r.Data||r.meal_date||'').filter(Boolean))]
    };
  }

  function toIsoDate(value){
    const v=String(value||'').trim();
    if(!v) return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m=v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return v;
  }

  function sleep(ms){ return new Promise(resolve=>setTimeout(resolve, ms)); }

  async function importCustomerManifest(){
    const input=el('customerManifestFile');
    const replace=el('customerManifestReplace')?.checked!==false;
    const manualMealDate=String(el('customerManifestMealDate')?.value||'').trim();
    const file=input?.files?.[0];
    const button=el('customerManifestImportButton');

    if(!file){ setStatus('❌ Wybierz CSV z arkusza WYNIK - klienci.', 'bad'); return; }
    if(!manualMealDate){ setStatus('❌ Wybierz dzień jedzony meal_date tak jak przy imporcie tacek.', 'bad'); el('customerManifestMealDate')?.focus(); return; }

    if(button){ button.disabled=true; button.innerText='Importuję...'; }
    setStatus('⏳ Czytam plik manifestu klientów...', 'info');

    try{
      const text=await file.text();
      const rows=parseCsv(text);
      const p=rowsPreview(rows);
      const mealDate=toIsoDate(manualMealDate);

      if(!rows.length){ setStatus('❌ Plik nie zawiera danych.', 'bad'); return; }
      if(!p.withBag){ setStatus('❌ Nie widzę kolumny bag_qr albo wszystkie wartości są puste.', 'bad'); return; }

      if(p.dates.length > 1){
        setStatus('⚠️ Plik zawiera kilka dat, ale użyję ręcznie wybranego meal_date: ' + mealDate, 'warn');
        await sleep(700);
      }

      if(replace){
        setStatus(`⏳ Czyszczę poprzednią zbiorczą dla dnia ${mealDate}...`, 'info');
        const clearResult=await supabaseClient.rpc('customer_manifest_clear_day', { p_meal_date: mealDate });
        if(clearResult.error){ setStatus('❌ Nie udało się wyczyścić poprzedniej zbiorczej: ' + clearResult.error.message, 'bad'); return; }
      }

      let imported=0, skipped=0;
      const totalChunks=Math.ceil(rows.length/CHUNK_SIZE);

      for(let start=0, chunkNo=1; start<rows.length; start+=CHUNK_SIZE, chunkNo++){
        const chunk=rows.slice(start, start+CHUNK_SIZE);
        setStatus(`⏳ Importuję paczkę ${chunkNo}/${totalChunks}. Wiersze ${start+1}-${Math.min(start+CHUNK_SIZE, rows.length)} z ${rows.length}...`, 'info');

        const { data, error } = await supabaseClient.rpc('customer_manifest_import', {
          rows: chunk,
          replace_existing: false,
          p_meal_date: mealDate
        });

        if(error){ setStatus(`❌ Import manifestu przerwany na paczce ${chunkNo}/${totalChunks}: ${error.message}`, 'bad'); return; }
        const row=Array.isArray(data)?data[0]:data;
        if(!row || row.status!=='OK'){ setStatus(`❌ Import paczki ${chunkNo}/${totalChunks} zwrócił nieoczekiwany wynik.`, 'bad'); return; }

        imported += Number(row.imported_count || 0);
        skipped += Number(row.skipped_count || 0);
        await sleep(30);
      }

      setStatus(`✅ Zaimportowano manifest klientów. Dzień: ${mealDate}. Wiersze: ${imported}. Pominięte: ${skipped}. Paczki: ${totalChunks}.`, 'ok');
      if(typeof refreshAdminData==='function') refreshAdminData();
    } catch(e){
      setStatus('❌ Błąd importu manifestu: ' + (e.message || e), 'bad');
    } finally {
      if(button){ button.disabled=false; button.innerText='⬆️ Wgraj zbiorczą klientów'; }
    }
  }

  function injectPanel(){
    if(el('customerManifestSection')) return;
    const firstFull=document.querySelector('.adminGrid .adminSection.fullWidth');
    const section=document.createElement('section');
    section.id='customerManifestSection';
    section.className='adminSection fullWidth';
    section.innerHTML=`
      <div class="sectionHeader"><div><h2>👤 Import zbiorczej klientów</h2><div class="sectionHint">Wgraj CSV z arkusza WYNIK - klienci. Dane służą tylko do raportu i wyszukiwania paczek po ID klienta.</div></div></div>
      <div class="sectionBody"><div class="actionStack">
        <div class="formGroup"><label>Dzień jedzony / meal_date</label><input type="date" id="customerManifestMealDate" class="textInput"></div>
        <div class="formGroup"><label>CSV z WYNIK - klienci</label><input type="file" id="customerManifestFile" class="fileInput" accept=".csv,text/csv"></div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:800;"><input type="checkbox" id="customerManifestReplace" checked> Zastąp wcześniejszą zbiorczą dla tego samego dnia jedzonego</label>
        <button id="customerManifestImportButton" class="darkBtn">⬆️ Wgraj zbiorczą klientów</button>
        <div class="adminTip">Najpierw wybierz meal_date ręcznie. Duże pliki są importowane w paczkach po ${CHUNK_SIZE} wierszy, więc nie zamykaj strony do komunikatu końcowego.</div>
        <p id="customerManifestStatus" class="statusBox info">Status: wybierz dzień jedzony i CSV z arkusza WYNIK - klienci.</p>
      </div></div>`;
    if(firstFull) firstFull.insertAdjacentElement('beforebegin', section);
    else document.querySelector('.adminGrid')?.appendChild(section);
    el('customerManifestImportButton')?.addEventListener('click', importCustomerManifest);
  }

  if(document.readyState==='loading') window.addEventListener('DOMContentLoaded', injectPanel);
  else injectPanel();
})();
