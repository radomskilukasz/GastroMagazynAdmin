function qrNice(row){return String(row?.display_name||row?.full_name||row?.user_display_name||row?.user_full_name||'').trim()||displayLogin(row?.user_email||row?.email||row||'');}
function qrNiceByEmail(email){const r=(window.qrUsersCache||[]).find(x=>String(x.user_email||'').toLowerCase()===String(email||'').toLowerCase());return qrNice(r||email);}

window.renderQrUsers=function(rows){
 if(!rows.length){el('qrTokensTable').innerHTML='<div style="padding:18px;color:#6b7280;">Brak workerów i managerów.</div>';return;}
 el('qrTokensTable').innerHTML=`<table><thead><tr><th>Użytkownik</th><th>Login</th><th>Rola</th><th>Status QR</th><th>Hint</th><th>Utworzono / wymieniono</th><th>Ostatnie użycie</th><th>Użycia</th><th>Akcje</th></tr></thead><tbody>${rows.map((row,index)=>{const hasQr=!!row.has_qr;const active=!!row.qr_active;const statusLabel=!hasQr?'BRAK QR':active?'AKTYWNY':'WYŁĄCZONY';const badgeClass=!hasQr?'badgeMuted':active?'badgeOk':'badgeBad';return `<tr><td><b>${escapeHtml(qrNice(row))}</b></td><td>${escapeHtml(displayLogin(row.user_email||'-'))}</td><td>${escapeHtml(row.user_role||'-')}</td><td><span class="badge ${badgeClass}">${statusLabel}</span></td><td>${escapeHtml(row.token_hint||'-')}</td><td>${formatDateTimePL(row.qr_regenerated_at||row.qr_created_at)}</td><td>${formatDateTimePL(row.qr_last_used_at)}</td><td>${Number(row.qr_use_count||0)}</td><td><div style="display:flex;gap:8px;min-width:310px;"><button class="smallBtn lightBtn" onclick="selectQrUser(${index})">Wybierz</button><button class="smallBtn btnAnother" onclick="generateQrForIndex(${index})">Generuj</button><button class="smallBtn danger" onclick="disableQrForIndex(${index})">Wyłącz</button></div></td></tr>`;}).join('')}</tbody></table>`;
};

window.selectQrUser=function(index){const row=qrUsersCache[index];if(!row)return;el('qrUserLogin').value=row.user_email||'';setQrStatus('Wybrano użytkownika: '+qrNice(row),'info');};

window.renderQrCode=async function(code,email){
 currentQrToken=code; currentQrEmail=email; const label=qrNiceByEmail(email);
 el('qrPreview').classList.remove('hidden'); el('qrPreviewUser').innerText=label;
 const box=el('qrCanvasBox'); box.innerHTML='';
 try{currentQrSvg=makeQrSvg(code,8,2);box.innerHTML=currentQrSvg;const svg=box.querySelector('svg');if(svg){svg.style.width='280px';svg.style.height='280px';svg.style.display='block';svg.style.margin='0 auto';}el('qrTokenText').innerText='Użytkownik: '+label+'\nLogin: '+displayLogin(email)+'\nToken QR: '+code;}catch(err){currentQrSvg='';box.innerHTML='';el('qrTokenText').innerText='Token QR:\n'+code;setQrStatus('Nie udało się narysować QR: '+err.message,'bad');}
};
