function setManualQrStatus(text, type = "info") {
  if (typeof setBox === "function") {
    setBox("manualQrStatus", text, type);
    return;
  }

  const box = document.getElementById("manualQrStatus");
  if (!box) return;
  box.innerText = text;
  box.className = "statusBox " + type;
}

function insertManualQrSection() {
  if (document.getElementById("manualQrSection")) return;

  const testButton = document.getElementById("testBagPdfButton");
  const anchor = testButton ? testButton.closest(".adminSection") : null;
  const grid = document.querySelector("#adminPanel .adminGrid");

  if (!anchor && !grid) return;

  const html = `
    <section class="adminSection fullWidth" id="manualQrSection">
      <div class="sectionHeader">
        <div>
          <h2>🔳 Generator dowolnego kodu QR</h2>
          <div class="sectionHint">Wpisz własny tekst do zakodowania oraz podpis widoczny nad kodem QR.</div>
        </div>
      </div>

      <div class="sectionBody">
        <div class="actionStack">
          <div class="roleBox">
            <input id="manualQrLabelInput" placeholder="Podpis na górze, np. Shot Malina" autocomplete="off">
            <input id="manualQrCodeInput" placeholder="Co ma zawierać QR, np. SHOT/MALINA" autocomplete="off">
            <button id="manualQrPdfButton" class="darkBtn">🔳 Drukuj QR</button>
          </div>

          <div class="adminTip">
            Wydruk ma dokładnie ten sam układ, szerokość, ramkę, logo i rozmiar QR jak karta kodu QR logowania.
          </div>

          <p id="manualQrStatus" class="statusBox info">Status: wpisz podpis i zawartość QR, a następnie wydrukuj kod.</p>
        </div>
      </div>
    </section>
  `;

  if (anchor) anchor.insertAdjacentHTML("afterend", html);
  else grid.insertAdjacentHTML("beforeend", html);

  const button = document.getElementById("manualQrPdfButton");
  const labelInput = document.getElementById("manualQrLabelInput");
  const codeInput = document.getElementById("manualQrCodeInput");

  if (button) button.addEventListener("click", generateManualQrPdf);
  [labelInput, codeInput].forEach(input => {
    if (!input) return;
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") generateManualQrPdf();
    });
  });
}

function manualQrSafeHtml(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);

  return String(value ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function manualQrSvg(token) {
  if (typeof makeQrSvg === "function") {
    return makeQrSvg(token, 8, 2);
  }

  if (!window.qrcode) {
    throw new Error("Biblioteka qrcode-generator nie wczytała się.");
  }

  const qr = window.qrcode(0, "M");
  qr.addData(String(token));
  qr.make();
  return qr.createSvgTag(8, 2);
}

async function generateManualQrPdf() {
  const labelInput = document.getElementById("manualQrLabelInput");
  const codeInput = document.getElementById("manualQrCodeInput");
  const button = document.getElementById("manualQrPdfButton");

  const label = String(labelInput?.value || "").trim();
  const qrContent = String(codeInput?.value || "").trim();

  if (!label) {
    setManualQrStatus("❌ Wpisz podpis, który ma być widoczny nad kodem QR.", "bad");
    labelInput?.focus();
    return;
  }

  if (!qrContent) {
    setManualQrStatus("❌ Wpisz tekst, który ma zawierać kod QR.", "bad");
    codeInput?.focus();
    return;
  }

  let qrSvg = "";

  try {
    qrSvg = manualQrSvg(qrContent);
  } catch (err) {
    setManualQrStatus("❌ Nie udało się przygotować QR do druku: " + err.message, "bad");
    return;
  }

  if (button) {
    button.disabled = true;
    button.innerText = "Otwieram druk...";
  }

  setManualQrStatus("⏳ Otwieram wydruk QR...", "info");

  const safeLabel = manualQrSafeHtml(label);
  const safeContent = manualQrSafeHtml(qrContent);

  const printWindow = window.open("", "_blank", "width=720,height=900");

  if (!printWindow) {
    setManualQrStatus("❌ Przeglądarka zablokowała okno drukowania. Zezwól na wyskakujące okna.", "bad");
    if (button) {
      button.disabled = false;
      button.innerText = "🔳 Drukuj QR";
    }
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="UTF-8">
      <title>QR ręczny</title>
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
          vertical-align: top;
        }

        img.logo {
          width: 80px;
          height: auto;
          margin-bottom: 10px;
        }

        h1 {
          margin: 0 0 10px;
          font-size: 28px;
          line-height: 1.05;
        }

        .login {
          font-size: 32px;
          font-weight: 900;
          margin: 12px 0 18px;
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

        .tokenTitle {
          margin-top: 14px;
          font-size: 15px;
          color: #111827;
          font-weight: 900;
        }

        .token {
          margin-top: 4px;
          font-size: 16px;
          font-weight: 900;
          color: #111827;
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
        <img src="logo.png" class="logo" onerror="this.style.display='none'">
        <h1>${safeLabel}</h1>

        <div class="qrBox">
          ${qrSvg}
        </div>

        <div class="hint">
          Tymczasowe rozwiązanie kodów QR, które nie istnieją na produktach lub tackach sprzedawanych na naszych stronach.
        </div>

        <div class="tokenTitle">Zawartość kodu QR:</div>
        <div class="token">${safeContent}</div>
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

  setManualQrStatus(
    "✅ Otworzono wydruk QR.\nPodpis: " + label + "\nZawartość QR: " + qrContent,
    "ok"
  );

  if (button) {
    button.disabled = false;
    button.innerText = "🔳 Drukuj QR";
  }
}

window.addEventListener("DOMContentLoaded", insertManualQrSection);
