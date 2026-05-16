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
          <h2>🔳 Generator dowolnego kodu QR PDF</h2>
          <div class="sectionHint">Wpisz własny tekst do zakodowania oraz podpis widoczny nad kodem QR.</div>
        </div>
      </div>

      <div class="sectionBody">
        <div class="actionStack">
          <div class="roleBox">
            <input id="manualQrLabelInput" placeholder="Podpis na górze, np. Shot Malina" autocomplete="off">
            <input id="manualQrCodeInput" placeholder="Co ma zawierać QR, np. SHOT/MALINA" autocomplete="off">
            <button id="manualQrPdfButton" class="darkBtn">🔳 Generuj PDF z QR</button>
          </div>

          <div class="adminTip">
            PDF zawiera logo u góry, Twój podpis, kod QR, stałą informację o tymczasowym rozwiązaniu oraz dokładną zawartość kodu QR na samym dole.
          </div>

          <p id="manualQrStatus" class="statusBox info">Status: wpisz podpis i zawartość QR, a następnie wygeneruj PDF.</p>
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

function loadImageAsDataUrl(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        resolve("");
      }
    };

    img.onerror = () => resolve("");
    img.src = src;
  });
}

function addWrappedCenteredParagraph(doc, text, y, maxWidth, fontSize, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);

  const pageW = 210;
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  lines.forEach((line, index) => {
    doc.text(line, pageW / 2, y + index * (fontSize * 0.38 + 1.4), { align: "center" });
  });

  return y + lines.length * (fontSize * 0.38 + 1.4);
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

  if (!window.jspdf?.jsPDF) {
    setManualQrStatus("❌ Biblioteka jsPDF nie wczytała się.", "bad");
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.innerText = "Generuję PDF...";
    }

    setManualQrStatus("⏳ Generuję PDF z kodem QR...", "info");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;

    const logoDataUrl = await loadImageAsDataUrl("logo.png");
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 91, 10, 28, 28);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    const labelLines = doc.splitTextToSize(label, 174).slice(0, 3);
    labelLines.forEach((line, index) => {
      doc.text(line, pageW / 2, 49 + index * 9, { align: "center" });
    });

    const qrUrl = makeQrDataUrl(qrContent, 900);
    const qrSize = 92;
    const qrX = (pageW - qrSize) / 2;
    const qrY = 78;

    doc.addImage(qrUrl, "PNG", qrX, qrY, qrSize, qrSize);

    const infoText = "Tymczasowe rozwiązanie kodów qr które nie istnieją na produktach lub tackach sprzedawanych na naszych stronach";
    addWrappedCenteredParagraph(doc, infoText, 188, 176, 12, false);

    doc.setDrawColor(220, 220, 220);
    doc.line(18, 236, 192, 236);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Zawartość kodu QR:", pageW / 2, 248, { align: "center" });

    addWrappedCenteredParagraph(doc, qrContent, 258, 176, 13, true);

    doc.save("kod_qr_" + safeFileName(label || qrContent) + ".pdf");

    setManualQrStatus(
      "✅ Wygenerowano PDF z kodem QR.\nPodpis: " + label + "\nZawartość QR: " + qrContent,
      "ok"
    );
  } catch (err) {
    setManualQrStatus("❌ Nie udało się wygenerować PDF: " + err.message, "bad");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerText = "🔳 Generuj PDF z QR";
    }
  }
}

window.addEventListener("DOMContentLoaded", insertManualQrSection);
