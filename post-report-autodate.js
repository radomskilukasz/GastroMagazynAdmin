(function(){
  function el(id){ return document.getElementById(id); }
  function group(){ var x = el('postReportMealDateInput'); return x ? (x.closest('.formGroup') || x.parentElement) : null; }
  function section(){ var x = el('postReportDeleteFile'); return x ? x.closest('.adminSection') : null; }
  function fmt(d){ var m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? (m[3]+'.'+m[2]+'.'+m[1]) : (d||'-'); }
  function normDate(v){
    var s=String(v||'').trim();
    var a=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(a) return a[1]+'-'+String(a[2]).padStart(2,'0')+'-'+String(a[3]).padStart(2,'0');
    var b=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/); if(b) return b[3]+'-'+String(b[2]).padStart(2,'0')+'-'+String(b[1]).padStart(2,'0');
    return '';
  }
  function delim(line){ var s=String(line||''), sc=(s.match(/;/g)||[]).length, cm=(s.match(/,/g)||[]).length, tb=(s.match(/\t/g)||[]).length; return tb>sc&&tb>cm?'\t':(sc>=cm?';':','); }
  function csv(line,d){ var out=[], cur='', q=false; for(var i=0;i<line.length;i++){ var c=line[i], n=line[i+1]; if(c==='"'&&q&&n==='"'){cur+='"';i++;continue;} if(c==='"'){q=!q;continue;} if(c===d&&!q){out.push(cur);cur='';continue;} cur+=c;} out.push(cur); return out; }
  function head(v){ return String(v||'').trim().toLowerCase().replace(/^\uFEFF/,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }
  function box(txt,type){
    var s=section(); if(!s) return;
    var b=el('postReportDetectedDateBox');
    if(!b){ b=document.createElement('p'); b.id='postReportDetectedDateBox'; b.className='statusBox info'; var f=el('postReportDeleteFile'); var fg=f?(f.closest('.formGroup')||f.parentElement):null; (fg&&fg.parentElement?fg.parentElement:s.querySelector('.sectionBody')).insertBefore(b, fg?fg.nextSibling:null); }
    b.className='statusBox '+(type||'info'); b.textContent=txt;
  }
  function hideDate(){ var g=group(); if(g) g.style.display='none'; }
  function showDate(txt){ var g=group(); if(g) g.style.display=''; box(txt||'Tryb awaryjny: wybierz dzień ręcznie.','warn'); }
  function datesFromText(text){
    var lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(function(x){return x.trim();}); if(!lines.length) return [];
    var d=delim(lines[0]), h=csv(lines[0],d).map(head), ix=h.findIndex(function(x){return ['delivery_date','meal_date','dzien_jedzony','data_dostawy','data','data_pakowania'].includes(x);}); if(ix<0) return [];
    var set=new Set(); for(var i=1;i<lines.length;i++){ var row=csv(lines[i],d), nd=normDate(row[ix]); if(nd) set.add(nd); } return Array.from(set).sort();
  }
  async function inspect(){
    var file=el('postReportDeleteFile')&&el('postReportDeleteFile').files[0], date=el('postReportMealDateInput');
    if(!file){ if(date) date.value=''; hideDate(); box('Wykryty dzień: wybierz CSV z kolumną delivery_date.','info'); return; }
    try{
      var ds=datesFromText(await file.text());
      if(ds.length===1){ if(date) date.value=ds[0]; hideDate(); box('Wykryty dzień z CSV: '+fmt(ds[0])+'. Ręczny wybór dnia nie jest potrzebny.','ok'); }
      else if(ds.length>1){ if(date) date.value=''; hideDate(); box('Błąd: CSV zawiera kilka dat: '+ds.map(fmt).join(' | ')+'. Rozbij plik na osobne dni.','bad'); }
      else { if(date) date.value=''; showDate('Nie wykryto delivery_date w CSV. Tryb awaryjny: wybierz dzień ręcznie.'); }
    }catch(e){ showDate('Nie udało się odczytać daty z CSV. Tryb awaryjny: wybierz dzień ręcznie.'); }
  }
  function init(){
    hideDate(); box('Wykryty dzień: wybierz CSV z kolumną delivery_date.','info');
    var f=el('postReportDeleteFile'); if(f&&f.dataset.autoDateBound!=='1'){ f.dataset.autoDateBound='1'; f.addEventListener('change',inspect); }
    var g=group(); if(g){ var lab=g.querySelector('label'); if(lab) lab.textContent='Tryb awaryjny — wybierz dzień ręcznie'; }
  }
  if(document.readyState==='loading') window.addEventListener('DOMContentLoaded',init); else init();
  setTimeout(init,500); setTimeout(init,1500);
})();