function setTestBagStatus(text, type = "info") {
  if (typeof setBox === "function") {
    setBox("testBagStatus", text, type);
    return;
  }

  const box = document.getElementById("testBagStatus");
  if (!box) return;
  box.innerText = text;
  box.className = "statusBox " + type;
}

function normalizeTestQr(value) {
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

function safeFileName(value) {
  return String(value || "TORBA")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "TORBA";
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeBarcodeDataUrl(value) {
  if (!window.JsBarcode) {
    throw new Error("Biblioteka JsBarcode nie wczytała się.");
  }

  const canvas = makeCanvas(900, 260);

  window.JsBarcode(canvas, String(value), {
    format: "CODE128",
    displayValue: false,
    margin: 10,
    width: 3,
    height: 150
  });

  return canvas.toDataURL("image/png");
}

function makeQrDataUrl(value, pixelSize = 420) {
  if (!window.qrcode) {
    throw new Error("Biblioteka qrcode-generator nie wczytała się.");
  }

  const qr = window.qrcode(0, "M");
  qr.addData(String(value));
  qr.make();

  const moduleCount = qr.getModuleCount();
  const quiet = 4;
  const cells = moduleCount + quiet * 2;
  const scale = Math.max(2, Math.floor(pixelSize / cells));
  const canvasSize = cells * scale;
  const canvas = makeCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = "#000000";

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
      }
    }
  }

  return canvas.toDataURL("image/png");
}

function computeQrLayout(count) {
  const pageW = 210;
  const pageH = 297;
  const margin = 9;
  const topReserved = 60;
  const availableW = pageW - margin * 2;
  const availableH = pageH - topReserved - margin;

  let best = null;

  for (let cols = 1; cols <= 6; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = availableW / cols;
    const cellH = availableH / rows;
    const qrSize = Math.min(cellW - 7, cellH - 13, 34);

    if (qrSize < 11) continue;

    const candidate = { cols, rows, cellW, cellH, qrSize };

    if (!best || candidate.qrSize > best.qrSize) {
      best = candidate;
    }
  }

  if (best) return best;

  const cols = 6;
  const rows = Math.max(1, Math.ceil(count / cols));
  return {
    cols,
    rows,
    cellW: availableW / cols,
    cellH: availableH / rows,
    qrSize: Math.max(7, Math.min(10, (availableH / rows) - 8))
  };
}

function wrapCanvasText(ctx, text, maxWidthPx, maxLines) {
  const words = String(text || "-").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach(word => {
    const test = current ? current + " " + word : word;

    if (ctx.measureText(test).width <= maxWidthPx || !current) {
      current = test;
      return;
    }

    lines.push(current);
    current = word;
  });

  if (current) lines.push(current);

  const limited = lines.slice(0, maxLines || 2);

  if (lines.length > limited.length && limited.length) {
    let last = limited[limited.length - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxWidthPx) {
      last = last.slice(0, -1);
    }
    limited[limited.length - 1] = last + "…";
  }

  return limited.length ? limited : ["-"];
}

function makeTextImageDataUrl(text, maxWidthMm, fontSizePt, options = {}) {
  /*
    jsPDF w domyślnej czcionce Helvetica nie obsługuje poprawnie polskich znaków.
    Dlatego teksty z planu, np. Śniadanie / Łosoś / Przekąska, renderujemy na canvasie
    przez przeglądarkę i wstawiamy do PDF jako PNG. To usuwa problem znaków &&&&.
  */
  const scale = 5;
  const pxPerMm = 8;
  const canvasW = Math.max(80, Math.round(maxWidthMm * pxPerMm));
  const fontPx = Math.max(12, Math.round(fontSizePt * scale));
  const lineHeightPx = Math.round(fontPx * 1.22);
  const paddingPx = Math.round(2 * scale);

  const measuringCanvas = makeCanvas(canvasW, 10);
  const measureCtx = measuringCanvas.getContext("2d");
  measureCtx.font = `${options.bold ? "800" : "400"} ${fontPx}px Arial, Helvetica, sans-serif`;

  const lines = wrapCanvasText(measureCtx, text, canvasW - paddingPx * 2, options.maxLines || 2);
  const canvasH = Math.max(lineHeightPx + paddingPx * 2, lines.length * lineHeightPx + paddingPx * 2);
  const canvas = makeCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.font = `${options.bold ? "800" : "400"} ${fontPx}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = options.color || "#111827";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  lines.forEach((line, index) => {
    ctx.fillText(line, canvasW / 2, paddingPx + index * lineHeightPx);
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthMm: maxWidthMm,
    heightMm: canvasH / pxPerMm
  };
}

function addCenteredWrappedText(doc, text, centerX, y, maxWidth, fontSize, options = {}) {
  const img = makeTextImageDataUrl(text, maxWidth, fontSize, options);
  doc.addImage(img.dataUrl, "PNG", centerX - img.widthMm / 2, y, img.widthMm, img.heightMm);
}

async function getBagPlanRowsForPdf(bagQr) {
  const { data, error } = await supabaseClient
    .from("packing_plan")
    .select("id, bag_qr, tray_qr, meal, code, size, dish_name")
    .eq("bag_qr", bagQr)
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function generateTestBagPdf() {
  const input = document.getElementById("testBagQrInput");
  const button = document.getElementById("testBagPdfButton");
  const bagQr = normalizeTestQr(input?.value || "");

  if (!bagQr) {
    setTestBagStatus("❌ Wpisz QR torby.", "bad");
    input?.focus();
    return;
  }

  if (!supabaseClient) {
    setTestBagStatus("❌ Brak połączenia z Supabase. Zaloguj się ponownie.", "bad");
    return;
  }

  if (!window.jspdf?.jsPDF) {
    setTestBagStatus("❌ Biblioteka jsPDF nie wczytała się.", "bad");
    return;
  }

  if (button) {
    button.disabled = true;
    button.innerText = "Generuję PDF...";
  }

  setTestBagStatus("⏳ Szukam torby w planie...", "info");

  try {
    const rows = await getBagPlanRowsForPdf(bagQr);

    if (!rows.length) {
      setTestBagStatus("❌ Nie znaleziono torby w aktualnym planie: " + bagQr, "bad");
      return;
    }

    setTestBagStatus("⏳ Generuję PDF testowy dla torby " + bagQr + "...", "info");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = 210;
    const margin = 9;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("TEST SKANOWANIA TORBY", pageW / 2, 12, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Wydruk kontrolny z panelu administratora", pageW / 2, 17, { align: "center" });

    const barcodeUrl = makeBarcodeDataUrl(bagQr);
    doc.addImage(barcodeUrl, "PNG", 28, 22, 154, 28);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(bagQr, pageW / 2, 56, { align: "center" });

    doc.setDrawColor(210, 210, 210);
    doc.line(margin, 61, pageW - margin, 61);

    const layout = computeQrLayout(rows.length);
    const startY = 66;

    rows.forEach((row, index) => {
      const col = index % layout.cols;
      const r = Math.floor(index / layout.cols);
      const cellX = margin + col * layout.cellW;
      const cellY = startY + r * layout.cellH;
      const centerX = cellX + layout.cellW / 2;
      const qrX = centerX - layout.qrSize / 2;
      const qrY = cellY + 1.5;

      const trayQr = String(row.tray_qr || "").trim();
      const qrUrl = makeQrDataUrl(trayQr, 380);

      doc.addImage(qrUrl, "PNG", qrX, qrY, layout.qrSize, layout.qrSize);

      addCenteredWrappedText(doc, trayQr, centerX, qrY + layout.qrSize + 3.4, layout.cellW - 4, layout.qrSize < 12 ? 4.4 : 5.6, {
        bold: true,
        maxLines: 2
      });

      const mealLine = [row.meal, row.code, row.size].filter(Boolean).join(" / ");
      if (mealLine && layout.qrSize >= 13) {
        addCenteredWrappedText(doc, mealLine, centerX, qrY + layout.qrSize + 10, layout.cellW - 4, 4.2, {
          bold: false,
          maxLines: 1
        });
      }
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(
      "Torba: " + bagQr + " | Tacki: " + rows.length + " | Wygenerowano: " + new Date().toLocaleString("pl-PL"),
      pageW / 2,
      292,
      { align: "center" }
    );

    doc.save("test_torby_" + safeFileName(bagQr) + ".pdf");

    setTestBagStatus(
      "✅ Wygenerowano PDF testowy.\nTorba: " + bagQr + "\nLiczba kodów QR tacek: " + rows.length,
      "ok"
    );

  } catch (err) {
    setTestBagStatus("❌ Nie udało się wygenerować PDF: " + err.message, "bad");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerText = "🧾 Generuj PDF testowy";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("testBagPdfButton");
  const input = document.getElementById("testBagQrInput");

  if (button) button.addEventListener("click", generateTestBagPdf);
  if (input) {
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") generateTestBagPdf();
    });
  }
});
