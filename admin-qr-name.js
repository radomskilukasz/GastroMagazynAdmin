/* Ladna nazwa przy generowaniu QR logowania w panelu admina. */

let currentQrDisplayName = "";

function adminQrNameEmail(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text.includes("@") ? text : text + "@pakowanie.local";
}

function adminQrNameValue(email) {
  const manual = String(document.getElementById("qrDisplayNameInput")?.value || "").trim();
  if (manual) return manual;

  const normalizedEmail = adminQrNameEmail(email);
  const userRows = Array.isArray(window.qrUsersCache) ? window.qrUsersCache : [];
  const row = userRows.find(x => adminQrNameEmail(x.user_email) === normalizedEmail);

  const fromRow = String(row?.display_name || row?.full_name || row?.user_name || row?.name || "").trim();
  if (fromRow) return fromRow;

  if (typeof displayLogin === "function") return displayLogin(email);
  return String(email || "");
}

function adminQrNameEscape(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);
  return String(value ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function installAdminQrNameInput() {
  const qrBox = document.querySelector(".qrBox");
  const loginInput = document.getElementById("qrUserLogin");
  if (!qrBox || !loginInput || document.getElementById("qrDisplayNameInput")) return;

  const input = document.createElement("input");
  input.id = "qrDisplayNameInput";
  input.placeholder = "ładna nazwa na wydruku, np. Daria Malczewska";
  input.autocomplete = "off";
  loginInput.insertAdjacentElement("afterend", input);
}

function installAdminQrNameOverrides() {
  installAdminQrNameInput();

  if (typeof renderQrCode === "function") {
    const oldRenderQrCode = renderQrCode;
    window.renderQrCode = async function(token, email) {
      currentQrDisplayName = adminQrNameValue(email);
      await oldRenderQrCode(token, email);

      const previewUser = document.getElementById("qrPreviewUser");
      if (previewUser) previewUser.innerText = currentQrDisplayName;

      const tokenText = document.getElementById("qrTokenText");
      if (tokenText) {
        tokenText.innerText = "Użytkownik: " + currentQrDisplayName + "\nLogin: " + email + "\nToken QR: " + token;
      }
    };
  }

  if (typeof printCurrentQr === "function") {
    window.printCurrentQr = function() {
      if (!currentQrToken || !currentQrEmail) {
        if (typeof setQrStatus === "function") setQrStatus("❌ Najpierw wygeneruj kod QR.", "bad");
        return;
      }

      let qrSvg = currentQrSvg;
      try {
        if (!qrSvg && typeof makeQrSvg === "function") qrSvg = makeQrSvg(currentQrToken, 8, 2);
      } catch (err) {
        if (typeof setQrStatus === "function") setQrStatus("❌ Nie udało się przygotować QR do druku: " + err.message, "bad");
        return;
      }

      const safeName = adminQrNameEscape(currentQrDisplayName || adminQrNameValue(currentQrEmail));
      const safeEmail = adminQrNameEscape(currentQrEmail);
      const safeToken = adminQrNameEscape(currentQrToken);
      const logoUrl = new URL("logo.png", window.location.href).href;

      const printWindow = window.open("", "_blank", "width=720,height=900");
      if (!printWindow) {
        if (typeof setQrStatus === "function") setQrStatus("❌ Przeglądarka zablokowała okno drukowania. Zezwól na wyskakujące okna.", "bad");
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pl">
        <head>
          <meta charset="UTF-8">
          <title>QR logowania</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 30px; color: #111827; }
            .card { border: 3px solid #111827; border-radius: 24px; padding: 28px; display: inline-block; width: 420px; max-width: 100%; }
            img.logo { width: 80px; height: auto; margin-bottom: 10px; }
            h1 { margin: 0 0 10px; font-size: 28px; }
            .login { font-size: 32px; font-weight: 900; margin: 12px 0 8px; word-break: break-word; }
            .email { font-size: 15px; font-weight: 700; color: #6b7280; margin: 0 0 16px; word-break: break-word; }
            .qrBox { display: flex; justify-content: center; align-items: center; margin: 18px 0; }
            .qrBox svg { width: 300px !important; height: 300px !important; display: block; }
            .hint { margin-top: 18px; font-size: 15px; color: #374151; line-height: 1.45; }
            .token { margin-top: 14px; font-size: 11px; color: #6b7280; word-break: break-all; }
            @media print { body { padding: 0; } .card { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="${logoUrl}" class="logo" onerror="this.style.display='none'">
            <h1>Kod QR logowania</h1>
            <div class="login">${safeName}</div>
            <div class="email">${safeEmail}</div>
            <div class="qrBox">${qrSvg}</div>
            <div class="hint">Zeskanuj kod QR na ekranie logowania programu pakowania lub kontroli. Login i hasło nadal działają awaryjnie.</div>
            <div class="token">${safeToken}</div>
          </div>
          <script>setTimeout(function(){ window.print(); }, 300);<\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    };
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installAdminQrNameOverrides);
} else {
  installAdminQrNameOverrides();
}
