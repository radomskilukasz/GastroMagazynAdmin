function qrFixLogin(email) {
  if (typeof displayLogin === 'function') return displayLogin(email || '');
  return String(email || '').toLowerCase().replace('@pakowanie.local', '');
}

function qrNice(row) {
  if (row && typeof row === 'object') {
    return String(
      row.display_name ||
      row.full_name ||
      row.user_display_name ||
      row.user_full_name ||
      row.raw_user_meta_data?.display_name ||
      row.raw_user_meta_data?.full_name ||
      row.raw_user_meta_data?.name ||
      ''
    ).trim() || qrFixLogin(row.user_email || row.email || '');
  }

  return qrFixLogin(row || '');
}

function qrGetCacheRows() {
  try {
    if (Array.isArray(qrUsersCache)) return qrUsersCache;
  } catch(e) {}

  if (Array.isArray(window.qrUsersCache)) return window.qrUsersCache;
  return [];
}

function qrNiceByEmail(email) {
  const rows = qrGetCacheRows();
  const row = rows.find(x => String(x.user_email || '').toLowerCase() === String(email || '').toLowerCase());
  return qrNice(row || email);
}

window.renderQrUsers = function(rows) {
  if (!rows.length) {
    el('qrTokensTable').innerHTML = '<div style="padding:18px;color:#6b7280;">Brak workerów i managerów.</div>';
    return;
  }

  el('qrTokensTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Użytkownik</th>
          <th>Login</th>
          <th>Rola</th>
          <th>Status QR</th>
          <th>Hint</th>
          <th>Utworzono / wymieniono</th>
          <th>Ostatnie użycie</th>
          <th>Użycia</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => {
          const hasQr = !!row.has_qr;
          const active = !!row.qr_active;
          const statusLabel = !hasQr ? 'BRAK QR' : active ? 'AKTYWNY' : 'WYŁĄCZONY';
          const badgeClass = !hasQr ? 'badgeMuted' : active ? 'badgeOk' : 'badgeBad';

          return `
            <tr>
              <td><b>${escapeHtml(qrNice(row))}</b></td>
              <td>${escapeHtml(qrFixLogin(row.user_email || '-'))}</td>
              <td>${escapeHtml(row.user_role || '-')}</td>
              <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
              <td>${escapeHtml(row.token_hint || '-')}</td>
              <td>${formatDateTimePL(row.qr_regenerated_at || row.qr_created_at)}</td>
              <td>${formatDateTimePL(row.qr_last_used_at)}</td>
              <td>${Number(row.qr_use_count || 0)}</td>
              <td>
                <div style="display:flex;gap:8px;min-width:310px;">
                  <button class="smallBtn lightBtn" onclick="selectQrUser(${index})">Wybierz</button>
                  <button class="smallBtn btnAnother" onclick="generateQrForIndex(${index})">Generuj</button>
                  <button class="smallBtn danger" onclick="disableQrForIndex(${index})">Wyłącz</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
};

window.selectQrUser = function(index) {
  const row = qrUsersCache[index];
  if (!row) return;

  el('qrUserLogin').value = row.user_email || '';
  setQrStatus('Wybrano użytkownika: ' + qrNice(row), 'info');
};

window.renderQrCode = async function(code, email) {
  currentQrToken = code;
  currentQrEmail = email;

  const label = qrNiceByEmail(email);

  el('qrPreview').classList.remove('hidden');
  el('qrPreviewUser').innerText = label;

  const box = el('qrCanvasBox');
  box.innerHTML = '';

  try {
    currentQrSvg = makeQrSvg(code, 8, 2);
    box.innerHTML = currentQrSvg;

    const svg = box.querySelector('svg');
    if (svg) {
      svg.style.width = '280px';
      svg.style.height = '280px';
      svg.style.display = 'block';
      svg.style.margin = '0 auto';
    }

    el('qrTokenText').innerText =
      'Użytkownik: ' + label +
      '\nLogin: ' + qrFixLogin(email) +
      '\nToken QR: ' + code;

  } catch (err) {
    currentQrSvg = '';
    box.innerHTML = '';
    el('qrTokenText').innerText = 'Token QR:\n' + code;
    setQrStatus('Nie udało się narysować QR: ' + err.message, 'bad');
  }
};

function printCurrentQrDisplayNameFixed(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  if (!currentQrToken || !currentQrEmail) {
    setQrStatus('❌ Najpierw wygeneruj kod QR.', 'bad');
    return;
  }

  let qrSvg = currentQrSvg;

  try {
    if (!qrSvg) qrSvg = makeQrSvg(currentQrToken, 8, 2);
  } catch (err) {
    setQrStatus('❌ Nie udało się przygotować QR do druku: ' + err.message, 'bad');
    return;
  }

  const safeUser = escapeHtml(qrNiceByEmail(currentQrEmail));
  const safeLogin = escapeHtml(qrFixLogin(currentQrEmail));
  const safeToken = escapeHtml(currentQrToken);
  const logoUrl = new URL('logo.png', window.location.href).href;

  const printWindow = window.open('', '_blank', 'width=720,height=900');

  if (!printWindow) {
    setQrStatus('❌ Przeglądarka zablokowała okno drukowania. Zezwól na wyskakujące okna.', 'bad');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="UTF-8">
      <title>QR logowania</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 30px;
          color: #111827;
        }

        .card {
          border: 3px solid #111827;
          border-radius: 24px;
          padding: 28px;
          display: inline-block;
          width: 420px;
          max-width: 100%;
        }

        img.logo {
          width: 80px;
          height: auto;
          margin-bottom: 10px;
        }

        h1 {
          margin: 0 0 10px;
          font-size: 28px;
        }

        .login {
          font-size: 32px;
          font-weight: 900;
          margin: 12px 0 4px;
          word-break: break-word;
        }

        .technicalLogin {
          font-size: 14px;
          color: #6b7280;
          font-weight: 700;
          margin: 0 0 18px;
          word-break: break-word;
        }

        .qrBox {
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 18px 0;
        }

        .qrBox svg {
          width: 300px !important;
          height: 300px !important;
          display: block;
        }

        .hint {
          margin-top: 18px;
          font-size: 15px;
          color: #374151;
          line-height: 1.45;
        }

        .token {
          margin-top: 14px;
          font-size: 11px;
          color: #6b7280;
          word-break: break-all;
        }

        @media print {
          body { padding: 0; }
          .card { margin: 0; }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'">
        <h1>Kod QR logowania</h1>
        <div class="login">${safeUser}</div>
        <div class="technicalLogin">${safeLogin}</div>

        <div class="qrBox">
          ${qrSvg}
        </div>

        <div class="hint">
          Zeskanuj kod QR na ekranie logowania programu pakowania lub kontroli.
          Login i hasło nadal działają awaryjnie.
        </div>

        <div class="token">${safeToken}</div>
      </div>

      <script>
        setTimeout(function() {
          window.print();
        }, 300);
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

window.printCurrentQr = printCurrentQrDisplayNameFixed;

function installQrPrintDisplayNameFix() {
  const oldButton = document.getElementById('qrPrintButton');
  if (!oldButton || !oldButton.parentNode) return;

  const newButton = oldButton.cloneNode(true);
  newButton.removeAttribute('onclick');
  newButton.addEventListener('click', printCurrentQrDisplayNameFixed, true);
  oldButton.parentNode.replaceChild(newButton, oldButton);
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(installQrPrintDisplayNameFix, 0);
});
