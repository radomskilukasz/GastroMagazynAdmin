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

function pdfSafeText(value) {
  return String(value || "")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e")
    .replace(/ł/g, "l").replace(/ń/g, "n").replace(/ó/g, "o")
    .replace(/ś/g, "s").replace(/ź/g, "z").replace(/ż/g, "z")
    .replace(/Ą/g, "A").replace(/Ć/g, "C").replace(/Ę/g, "E")
    .replace(/Ł/g, "L").replace(/Ń/g, "N").replace(/Ó/g, "O")
    .replace(/Ś/g, "S").replace(/Ź/g, "Z").replace(/Ż/g, "Z")
    .replace(/[–—]/g, "-")
    .replace(/[„”]/g, '"')
    .replace(/[’]/g, "'");
}

function addWrappedCenteredPdfText(doc, text, y, maxWidth, fontSize, bold = false, maxLines = 99) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);

  const pageW = 210;
  const safe = pdfSafeText(text);
  const lines = doc.splitTextToSize(safe, maxWidth).slice(0, maxLines);
  const lineHeight = fontSize * 0.36 + 1.4;

  lines.forEach((line, index) => {
    doc.text(line, pageW / 2, y + index * lineHeight, { align: "center" });
  });

  return y + Math.max(1, lines.length) * lineHeight;
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

    // Identyczne przeliczenie jak wydruk QR logowania:
    // .card width 420px, border 3px, logo 80px, QR 300px przy 96 dpi.
    const pxToMm = 25.4 / 96;
    const cardW = 420 * pxToMm;
    const cardH = 258;
    const borderW = 3 * pxToMm;
    const logoSize = 80 * pxToMm;
    const qrSize = 300 * pxToMm;

    const cardX = (pageW - cardW) / 2;
    const cardY = 18;
    const centerX = pageW / 2;

    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(borderW);
    doc.roundedRect(cardX, cardY, cardW, cardH, 7, 7);

    const logoDataUrl = await loadImageAsDataUrl("logo.png");
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", centerX - logoSize / 2, cardY + 10, logoSize, logoSize);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const labelLines = doc.splitTextToSize(pdfSafeText(label), cardW - 18).slice(0, 3);
    labelLines.forEach((line, index) => {
      doc.text(line, centerX, cardY + 49 + index * 8.5, { align: "center" });
    });

    const qrUrl = makeQrDataUrl(qrContent, 900);
    const qrX = centerX - qrSize / 2;
    const qrY = cardY + 84;

    doc.addImage(qrUrl, "PNG", qrX, qrY, qrSize, qrSize);

    const infoText = "Tymczasowe rozwiazanie kodow QR, ktore nie istnieja na produktach lub tackach sprzedawanych na naszych stronach";
    addWrappedCenteredPdfText(doc, infoText, cardY + 185, cardW - 20, 11, false, 4);

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.25);
    doc.line(cardX + 14, cardY + 218, cardX + cardW - 14, cardY + 218);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Zawartosc kodu QR:", centerX, cardY + 232, { align: "center" });

    addWrappedCenteredPdfText(doc, qrContent, cardY + 244, cardW - 22, 13, true, 3);

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
