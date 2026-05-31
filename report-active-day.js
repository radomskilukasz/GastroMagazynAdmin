/*
  Raport Excel po wybranym aktywnym dniu.
  Naprawia stary raport, który liczył wszystkie aktywne dni razem.
*/

function reportActiveDayCurrentMealDate() {
  return String(document.getElementById("archiveMealDateSelect")?.value || "").trim() ||
    String(document.getElementById("activeMealDateSelect")?.value || "").trim() ||
    String(document.getElementById("mealDateInput")?.value || "").trim();
}

async function getReportDataForSelectedActiveDay() {
  const mealDate = reportActiveDayCurrentMealDate();

  if (!mealDate) {
    throw new Error("Wybierz aktywny dzień raportu.");
  }

  const { data: rpcRows, error: reportError } = await supabaseClient.rpc("get_packing_report_rows_for_date", {
    p_meal_date: mealDate
  });

  if (reportError) {
    throw new Error(reportError.message);
  }

  const reportRows = rpcRows || [];

  const { data: brakiData, error: brakiError } = await supabaseClient.rpc("get_braki_report_for_date", {
    p_meal_date: mealDate
  });

  const brakiRows = brakiError
    ? reportRows.filter(x => normalizeStatus(x.status) === "BRAKI")
    : (brakiData || []);

  const sessions = typeof mergeSessionsWithBraki === "function"
    ? mergeSessionsWithBraki(reportRows, brakiRows)
    : reportRows;

  const { data: bagCount, error: bagCountError } = await supabaseClient.rpc("count_unique_bags_for_date", {
    p_meal_date: mealDate
  });

  if (bagCountError) {
    throw new Error(bagCountError.message);
  }

  return {
    sessions,
    brakiRows,
    totalBagsInPlan: bagCount || 0,
    mealDate
  };
}

async function exportExcelForSelectedActiveDay() {
  const mealDate = reportActiveDayCurrentMealDate();

  if (!mealDate) {
    setSessionsStatus("❌ Wybierz aktywny dzień raportu.", "bad");
    return false;
  }

  const mealInput = document.getElementById("mealDateInput");
  if (mealInput) mealInput.value = mealDate;

  setSessionsStatus("⏳ Generuję raport Excel dla " + formatDatePL(mealDate) + "...", "info");

  const button = document.getElementById("exportReportButton");
  if (button) button.disabled = true;

  try {
    const report = await getReportDataForSelectedActiveDay();
    const data = report.sessions || [];
    const brakiRows = report.brakiRows || [];

    const total = data.length;
    const correct = data.filter(x => normalizeStatus(x.status) === "POPRAWNA").length;
    const bad = data.filter(x => normalizeStatus(x.status) === "NIEPOPRAWNA").length;
    const braki = data.filter(x => normalizeStatus(x.status) === "BRAKI").length;

    const finalPacked = correct + bad;
    const accuracy = finalPacked ? Math.round((correct / finalPacked) * 100) : 0;

    const durations = data
      .map(x => x.duration_seconds)
      .filter(x => typeof x === "number");

    const avgDuration = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    const workers = {};

    data.forEach(x => {
      const worker = displayLogin(x.user_login || "brak użytkownika");

      if (!workers[worker]) {
        workers[worker] = {
          worker,
          total:0,
          correct:0,
          bad:0,
          braki:0,
          wrong:0,
          missing:0,
          duplicates:0,
          duration:0,
          durationCount:0
        };
      }

      workers[worker].total++;

      const status = normalizeStatus(x.status);

      if (status === "POPRAWNA") workers[worker].correct++;
      if (status === "NIEPOPRAWNA") workers[worker].bad++;
      if (status === "BRAKI") workers[worker].braki++;

      workers[worker].wrong += splitItems(x.wrong_trays).length;
      workers[worker].missing += splitItems(x.missing_trays).length;
      workers[worker].duplicates += splitItems(x.duplicate_trays).length;

      if (typeof x.duration_seconds === "number") {
        workers[worker].duration += x.duration_seconds;
        workers[worker].durationCount++;
      }
    });

    const workersRows = Object.values(workers)
      .sort((a, b) => b.total - a.total)
      .map(w => {
        const workerFinal = w.correct + w.bad;
        const workerAccuracy = workerFinal ? Math.round((w.correct / workerFinal) * 100) : 0;
        const workerAvg = w.durationCount ? Math.round(w.duration / w.durationCount) : 0;

        return [
          w.worker,
          w.total,
          w.correct,
          w.bad,
          w.braki,
          workerAccuracy + "%",
          formatDuration(workerAvg),
          w.missing,
          w.wrong,
          w.duplicates
        ];
      });

    const historyRows = data.map(x => [
      x.bag_qr || "",
      normalizeStatus(x.status) || "",
      displayLogin(x.user_login || ""),
      x.expected_count || 0,
      x.correct_count || 0,
      formatDuration(x.duration_seconds),
      x.missing_trays || "",
      x.wrong_trays || "",
      x.duplicate_trays || "",
      x.all_scans || "",
      x.closed_at ? new Date(x.closed_at).toLocaleString("pl-PL") : ""
    ]);

    const brakiSessionIds = new Set(
      data
        .filter(x => normalizeStatus(x.status) === "BRAKI")
        .map(x => x.id || x.session_id)
    );

    const brakiExportRows = brakiRows.length
      ? brakiRows.filter(x => brakiSessionIds.has(x.id || x.session_id))
      : data.filter(x => normalizeStatus(x.status) === "BRAKI");

    const brakiSheetRows = [
      ["BRAKI / DO DOPAKOWANIA"],
      ["Dzień jedzony", formatDatePL(report.mealDate)],
      [],
      [
        "QR torby",
        "Status",
        "Pracownik / stanowisko",
        "Postęp",
        "Liczba brakujących",
        "Brakujące tacki",
        "Wszystkie skany",
        "Błędne tacki",
        "Duplikaty",
        "Czas pakowania",
        "Data zamknięcia"
      ],
      ...brakiExportRows.map(x => [
        x.bag_qr || "",
        normalizeStatus(x.status) || "BRAKI",
        displayLogin(x.user_login || ""),
        `${x.correct_count || 0}/${x.expected_count || 0}`,
        x.missing_count || splitItems(x.missing_trays).length || 0,
        x.missing_trays || "",
        x.all_scans || "",
        x.wrong_trays || "",
        x.duplicate_trays || "",
        formatDuration(x.duration_seconds),
        x.closed_at ? new Date(x.closed_at).toLocaleString("pl-PL") : ""
      ])
    ];

    const summaryRows = [
      ["PODSUMOWANIE"],
      ["Dzień jedzony", formatDatePL(report.mealDate)],
      [],
      ["Łącznie wpisów w raporcie", total],
      ["Finalnie zapakowane", `${finalPacked} / ${report.totalBagsInPlan}`],
      ["Poprawne", correct],
      ["Niepoprawne", bad],
      ["Braki / do dopakowania", braki],
      ["Poprawność finalnych", accuracy + "%"],
      ["Średni czas pakowania", formatDuration(avgDuration)]
    ];

    const workersSheetRows = [
      ["RANKING PRACOWNIKÓW"],
      ["Dzień jedzony", formatDatePL(report.mealDate)],
      [],
      [
        "Pracownik",
        "Razem",
        "Poprawne",
        "Niepoprawne",
        "Braki",
        "Poprawność finalnych",
        "Średni czas",
        "Brakujące tacki",
        "Błędne tacki",
        "Duplikaty"
      ],
      ...workersRows
    ];

    const historySheetRows = [
      [
        "QR torby",
        "Status",
        "Pracownik / stanowisko",
        "Oczekiwane tacki",
        "Poprawne tacki",
        "Czas pakowania",
        "Brakujące tacki",
        "Błędne tacki",
        "Duplikaty",
        "Wszystkie skany",
        "Data zamknięcia"
      ],
      ...historyRows
    ];

    const workbook = XLSX.utils.book_new();

    const summarySheet = sheetFromRows(summaryRows);
    setColumnWidths(summarySheet, [30, 55]);

    const workersSheet = sheetFromRows(workersSheetRows);
    setColumnWidths(workersSheet, [28, 12, 12, 14, 12, 20, 16, 18, 16, 14]);
    setAutoFilter(workersSheet, "A4:J4");
    workersSheet["!freeze"] = { xSplit: 0, ySplit: 4 };

    const historySheet = sheetFromRows(historySheetRows);
    setColumnWidths(historySheet, [24, 18, 28, 18, 16, 18, 35, 35, 35, 60, 22]);
    setAutoFilter(historySheet, "A1:K1");
    historySheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    const brakiSheet = sheetFromRows(brakiSheetRows);
    setColumnWidths(brakiSheet, [24, 16, 28, 16, 18, 40, 55, 35, 35, 18, 24]);
    setAutoFilter(brakiSheet, "A4:K4");
    brakiSheet["!freeze"] = { xSplit: 0, ySplit: 4 };

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Podsumowanie");
    XLSX.utils.book_append_sheet(workbook, workersSheet, "Pracownicy");
    XLSX.utils.book_append_sheet(workbook, historySheet, "Historia");
    XLSX.utils.book_append_sheet(workbook, brakiSheet, "Braki");

    XLSX.writeFile(workbook, `raport_pakowania_${report.mealDate}.xlsx`);

    reportExportedThisSession = true;
    lastReportExportAt = new Date();

    setSessionsStatus(
      `✅ Raport Excel wygenerowany dla ${formatDatePL(report.mealDate)}.\nWpisów w raporcie: ${total}\nFinalnie zapakowane: ${finalPacked}/${report.totalBagsInPlan}\nPoprawne: ${correct}\nNiepoprawne: ${bad}\nBraki: ${braki}`,
      "ok"
    );

    return true;

  } catch (err) {
    setSessionsStatus("❌ Nie udało się wygenerować raportu: " + err.message, "bad");
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

window.getReportData = getReportDataForSelectedActiveDay;
window.exportExcel = exportExcelForSelectedActiveDay;
window.exportExcelForSelectedActiveDay = exportExcelForSelectedActiveDay;

function installActiveDayReportButton() {
  const oldButton = document.getElementById("exportReportButton");
  if (!oldButton || oldButton.dataset.activeDayReportBound === "true") return;

  const newButton = oldButton.cloneNode(true);
  newButton.dataset.activeDayReportBound = "true";
  newButton.textContent = "📤 Eksport Excel dla wybranego dnia";
  newButton.addEventListener("click", exportExcelForSelectedActiveDay);
  oldButton.parentNode.replaceChild(newButton, oldButton);
}

function installActiveDayReportButtonRepeated() {
  installActiveDayReportButton();
  setTimeout(installActiveDayReportButton, 0);
  setTimeout(installActiveDayReportButton, 300);
  setTimeout(installActiveDayReportButton, 800);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installActiveDayReportButtonRepeated);
} else {
  installActiveDayReportButtonRepeated();
}
