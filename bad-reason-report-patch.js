/*
  Patch raportu admina:
  dodaje kolumnę "Powód niepoprawnej" do eksportu Excel oraz osobną zakładkę z podsumowaniem powodów.
*/

async function exportExcel() {
  setSessionsStatus("⏳ Generuję raport Excel...", "info");
  el("exportReportButton").disabled = true;

  try {
    const report = await getReportData();
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
    const badReasons = {};

    data.forEach(x => {
      const worker = displayLogin(x.user_login || "brak użytkownika");
      const status = normalizeStatus(x.status);

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
      if (status === "POPRAWNA") workers[worker].correct++;
      if (status === "NIEPOPRAWNA") {
        workers[worker].bad++;
        const reason = String(x.bad_reason || "Nie podano powodu").trim() || "Nie podano powodu";
        badReasons[reason] = (badReasons[reason] || 0) + 1;
      }
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

    const historyRows = data.map(x => {
      const status = normalizeStatus(x.status) || "";
      return [
        x.bag_qr || "",
        status,
        status === "NIEPOPRAWNA" ? (x.bad_reason || "Nie podano powodu") : "",
        displayLogin(x.user_login || ""),
        x.expected_count || 0,
        x.correct_count || 0,
        formatDuration(x.duration_seconds),
        x.missing_trays || "",
        x.wrong_trays || "",
        x.duplicate_trays || "",
        x.all_scans || "",
        x.closed_at ? new Date(x.closed_at).toLocaleString("pl-PL") : ""
      ];
    });

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

    const badReasonRows = [
      ["POWODY NIEPOPRAWNYCH TOREB"],
      ["Dzień jedzony", formatDatePL(report.mealDate)],
      [],
      ["Powód", "Liczba"],
      ...Object.entries(badReasons)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => [reason, count])
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
        "Powód niepoprawnej",
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
    setColumnWidths(historySheet, [24, 18, 30, 28, 18, 16, 18, 35, 35, 35, 60, 22]);
    setAutoFilter(historySheet, "A1:L1");
    historySheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    const brakiSheet = sheetFromRows(brakiSheetRows);
    setColumnWidths(brakiSheet, [24, 16, 28, 16, 18, 40, 55, 35, 35, 18, 24]);
    setAutoFilter(brakiSheet, "A4:K4");
    brakiSheet["!freeze"] = { xSplit: 0, ySplit: 4 };

    const badReasonSheet = sheetFromRows(badReasonRows);
    setColumnWidths(badReasonSheet, [36, 12]);
    setAutoFilter(badReasonSheet, "A4:B4");
    badReasonSheet["!freeze"] = { xSplit: 0, ySplit: 4 };

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Podsumowanie");
    XLSX.utils.book_append_sheet(workbook, workersSheet, "Pracownicy");
    XLSX.utils.book_append_sheet(workbook, historySheet, "Historia");
    XLSX.utils.book_append_sheet(workbook, brakiSheet, "Braki");
    XLSX.utils.book_append_sheet(workbook, badReasonSheet, "Powody błędów");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `raport_pakowania_${date}.xlsx`);

    reportExportedThisSession = true;
    lastReportExportAt = new Date();

    setSessionsStatus(
      `✅ Raport Excel wygenerowany.\nDzień jedzony: ${formatDatePL(report.mealDate)}\nWpisów w raporcie: ${total}\nPoprawne: ${correct}\nNiepoprawne: ${bad}\nBraki: ${braki}\nDodano kolumnę: Powód niepoprawnej oraz zakładkę Powody błędów.`,
      "ok"
    );

    return true;

  } catch (err) {
    setSessionsStatus("❌ Nie udało się wygenerować raportu: " + err.message, "bad");
    return false;
  } finally {
    el("exportReportButton").disabled = false;
  }
}

(function loadAdminCsvDateModes(){
  if (document.getElementById('adminCsvDateModesScript')) return;
  const script = document.createElement('script');
  script.id = 'adminCsvDateModesScript';
  script.src = 'admin-csv-date-modes.js?v=1';
  document.body.appendChild(script);
})();
