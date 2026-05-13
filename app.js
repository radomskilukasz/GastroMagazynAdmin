const PROJECT_URL = "https://lanmmbpqxmenyjwvwpkt.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_sYrinkI1u2zr9uXZwsERNg_HE0wQKsC";
const DOMAIN = "@pakowanie.local";

let supabaseClient = null;
let currentSession = null;
let activeLinesCache = [];
let activeLoginsCache = [];
let operationalSnapshot = null;
let reportExportedThisSession = false;
let lastReportExportAt = null;
let qrUsersCache = [];
let currentQrToken = "";
let currentQrEmail = "";
let currentQrSvg = "";

const el = id => document.getElementById(id);

function setLoginStatus(text, type = "info") { setBox("loginStatus", text, type); }
function setUploadStatus(text, type = "info") { setBox("uploadStatus", text, type); }
function setSessionsStatus(text, type = "info") { setBox("sessionsStatus", text, type); }
function setRoleStatus(text, type = "info") { setBox("roleStatus", text, type); }
function setUserStatus(text, type = "info") { setBox("userStatus", text, type); }
function setStationStatus(text, type = "info") { setBox("stationStatus", text, type); }
function setLoginsStatus(text, type = "info") { setBox("loginsStatus", text, type); }
function setOperationalStatus(text, type = "info") { setBox("operationalStatus", text, type); }
function setMealDateStatus(text, type = "info") { setBox("mealDateStatus", text, type); }
function setQrStatus(text, type = "info") { setBox("qrStatus", text, type); }

function setBox(id, text, type = "info") {
  const box = el(id);
  if (!box) return;
  box.innerText = text;
  box.className = "statusBox " + type;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
}

function showChoiceModal({ title, text, details = "", buttons = [] }) {
  return new Promise(resolve => {
    el("confirmTitle").innerText = title || "Potwierdź akcję";
    el("confirmText").innerText = text || "";

    if (details) {
      el("confirmDetails").innerHTML = details;
      el("confirmDetails").classList.remove("hidden");
    } else {
      el("confirmDetails").innerHTML = "";
      el("confirmDetails").classList.add("hidden");
    }

    el("confirmButtons").innerHTML = buttons.map((btn, index) => `
      <button class="modalBtn ${btn.className || "btnAnother"}" data-index="${index}">
        ${escapeHtml(btn.label)}
      </button>
    `).join("");

    [...el("confirmButtons").querySelectorAll("button")].forEach(button => {
      button.onclick = () => {
        const index = Number(button.dataset.index);
        const value = buttons[index]?.value;
        el("confirmModal").classList.add("hidden");
        resolve(value);
      };
    });

    el("confirmModal").classList.remove("hidden");
  });
}

function closeDetailsModal() {
  el("detailsModal").classList.add("hidden");
}

function getEmail(loginValue) {
  const value = String(loginValue || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("@")) return value;
  return value + DOMAIN;
}

function displayLogin(value) {
  return String(value || "").toLowerCase().replace(DOMAIN, "");
}

function normalizeStatus(status) {
  const value = String(status || "").toUpperCase().trim();
  if (value === "NIEPRAWIDŁOWA") return "NIEPOPRAWNA";
  if (value === "DO_DOPAKOWANIA" || value === "DO DOPAKOWANIA") return "BRAKI";
  return value;
}

function formatDatePL(dateText) {
  if (!dateText) return "-";
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return dateText;
  return d.toLocaleDateString("pl-PL");
}

function formatDateTimePL(dateText) {
  if (!dateText) return "-";
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return dateText;
  return d.toLocaleString("pl-PL");
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "-";
  if (seconds < 60) return seconds + "s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + "m " + s + "s";
}

function splitItems(text) {
  if (!text || text === "-") return [];
  return String(text).split("|").map(x => x.trim()).filter(Boolean);
}

function translateError(msg) {
  const m = String(msg || "").toLowerCase();

  if (m.includes("invalid login credentials")) return "Nieprawidłowy login lub hasło.";
  if (m.includes("email not confirmed")) return "Konto nie zostało potwierdzone.";
  if (m.includes("user not found")) return "Nieznany użytkownik.";
  if (m.includes("invalid email")) return "Nieprawidłowy login lub email.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Brak połączenia z internetem lub Supabase.";

  return msg || "Nieznany błąd.";
}

async function getUserRole(userId) {
  const { data, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.role;
}

function hasAccess(role, allowedRoles) {
  return allowedRoles.includes(role);
}

function operationalHasData(row) {
  if (!row) return false;

  return [
    "packing_plan_count",
    "packing_sessions_count",
    "packing_session_items_count",
    "station_lines_count",
    "station_bags_count",
    "station_item_states_count",
    "station_scans_count",
    "tray_scans_count",
    "packing_item_events_count"
  ].some(key => Number(row[key] || 0) > 0);
}

function operationalDataDetailsHtml(row) {
  if (!row) return "Brak danych statusu.";

  return `
    Plan pakowania: <b>${Number(row.packing_plan_count || 0)}</b><br>
    Raport / sesje: <b>${Number(row.packing_sessions_count || 0)}</b><br>
    Pozycje sesji: <b>${Number(row.packing_session_items_count || 0)}</b><br>
    Stanowiska: <b>${Number(row.station_lines_count || 0)}</b><br>
    Torby stanowiskowe: <b>${Number(row.station_bags_count || 0)}</b><br>
    Stany pozycji stanowiskowych: <b>${Number(row.station_item_states_count || 0)}</b><br>
    Skany stanowiskowe: <b>${Number(row.station_scans_count || 0)}</b><br>
    Stare skany indywidualne: <b>${Number(row.tray_scans_count || 0)}</b><br>
    Historia zdarzeń: <b>${Number(row.packing_item_events_count || 0)}</b>
  `;
}

async function adminLogin() {
  try {
    setLoginStatus("⏳ Loguję...", "info");

    const loginValue = el("adminLogin").value;
    const passwordValue = el("adminPassword").value;
    const email = getEmail(loginValue);

    if (!email) {
      setLoginStatus("❌ Wpisz login lub email.", "bad");
      return;
    }

    if (!passwordValue) {
      setLoginStatus("❌ Wpisz hasło.", "bad");
      return;
    }

    el("loginButton").disabled = true;
    el("loginButton").innerText = "Loguję...";

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: passwordValue
    });

    el("loginButton").disabled = false;
    el("loginButton").innerText = "Zaloguj";

    if (error) {
      setLoginStatus("❌ " + translateError(error.message), "bad");
      return;
    }

    currentSession = data.session;

    const role = await getUserRole(data.user.id);

    if (!hasAccess(role, ["admin"])) {
      setLoginStatus("❌ Brak dostępu do panelu administratora.", "bad");
      return;
    }

    el("adminLoginBadge").innerText = "✅ " + displayLogin(data.user.email);
    setLoginStatus("✅ Zalogowano jako: " + data.user.email, "ok");

    el("loginScreen").classList.add("hidden");
    el("adminPanel").classList.remove("hidden");

    await refreshAdminData();

  } catch (err) {
    setLoginStatus("❌ Błąd techniczny: " + err.message, "bad");
  } finally {
    if (el("loginButton")) {
      el("loginButton").disabled = false;
      el("loginButton").innerText = "Zaloguj";
    }
  }
}

async function adminLogout() {
  await supabaseClient.auth.signOut();
  currentSession = null;
  el("adminPanel").classList.add("hidden");
  el("loginScreen").classList.remove("hidden");
  setLoginStatus("Status: gotowy do logowania", "info");
}

async function refreshAdminData() {
  await Promise.allSettled([
    loadUsersList(),
    loadMealDate(),
    loadStationOverview(),
    loadActiveLogins(),
    loadOperationalStatus(),
    loadQrUsers()
  ]);
}

async function loadUsersList() {
  const list = el("usersList");
  if (!list) return;

  const { data, error } = await supabaseClient.rpc("list_auth_users_for_admin");

  if (error) {
    setRoleStatus("⚠️ Nie udało się pobrać listy użytkowników: " + error.message, "bad");
    return;
  }

  list.innerHTML = (data || []).map(row => {
    const email = row.email || "";
    return `<option value="${escapeHtml(email)}"></option>`;
  }).join("");
}

async function loadOperationalStatus() {
  const { data, error } = await supabaseClient.rpc("admin_operational_data_status");

  if (error) {
    setOperationalStatus("❌ Nie udało się pobrać stanu danych operacyjnych: " + error.message, "bad");
    return null;
  }

  const row = data && data.length ? data[0] : null;
  operationalSnapshot = row;

  if (!row) {
    setOperationalStatus("Brak danych o stanie operacyjnym.", "warn");
    return null;
  }

  const total =
    Number(row.packing_plan_count || 0) +
    Number(row.packing_sessions_count || 0) +
    Number(row.packing_session_items_count || 0) +
    Number(row.station_lines_count || 0) +
    Number(row.station_bags_count || 0) +
    Number(row.station_item_states_count || 0) +
    Number(row.station_scans_count || 0) +
    Number(row.tray_scans_count || 0) +
    Number(row.packing_item_events_count || 0);

  const text =
    `Plan: ${row.packing_plan_count || 0}\n` +
    `Raport/sesje: ${row.packing_sessions_count || 0}\n` +
    `Pozycje sesji: ${row.packing_session_items_count || 0}\n` +
    `Stanowiska: ${row.station_lines_count || 0}\n` +
    `Torby stanowiskowe: ${row.station_bags_count || 0}\n` +
    `Stany pozycji stanowiskowych: ${row.station_item_states_count || 0}\n` +
    `Skany stanowiskowe: ${row.station_scans_count || 0}\n` +
    `Stare tray_scans: ${row.tray_scans_count || 0}\n` +
    `Historia zdarzeń: ${row.packing_item_events_count || 0}`;

  setOperationalStatus(
    total > 0
      ? "Dane operacyjne NIE są puste:\n" + text
      : "Dane operacyjne są puste. Można wgrać nowy plan.",
    total > 0 ? "warn" : "ok"
  );

  return row;
}

async function saveMealDate() {
  const mealDate = el("mealDateInput").value;

  if (!mealDate) {
    setUploadStatus("❌ Wpisz dzień jedzony przed wgraniem planu.", "bad");
    return false;
  }

  const { error } = await supabaseClient
    .from("app_settings")
    .upsert({ key: "meal_date", value: mealDate }, { onConflict: "key" });

  if (error) {
    setUploadStatus("❌ Nie udało się zapisać dnia jedzonego: " + error.message, "bad");
    return false;
  }

  setMealDateStatus("Dzień jedzony: " + formatDatePL(mealDate), "ok");
  return true;
}

async function loadMealDate() {
  const { data, error } = await supabaseClient
    .from("app_settings")
    .select("value")
    .eq("key", "meal_date")
    .maybeSingle();

  if (!error && data && data.value) {
    el("mealDateInput").value = data.value;
    setMealDateStatus("Dzień jedzony: " + formatDatePL(data.value), "ok");
  } else {
    el("mealDateInput").value = "";
    setMealDateStatus("Dzień jedzony: nieustawiony.", "warn");
  }
}

async function fetchAllSessionsFallback() {
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    const { data, error } = await supabaseClient
      .from("packing_sessions")
      .select("*")
      .order("closed_at", { ascending:false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const rows = data || [];
    all = all.concat(rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function mergeSessionsWithBraki(reportRows, brakiReportRows) {
  const map = new Map();

  (reportRows || []).forEach(row => {
    const id = row?.id || row?.session_id;
    if (id) map.set(id, row);
  });

  (brakiReportRows || []).forEach(row => {
    const id = row?.id || row?.session_id;
    if (id && !map.has(id)) {
      map.set(id, row);
    }
  });

  return [...map.values()].sort((a, b) => {
    const da = new Date(a.closed_at || a.session_closed_at || 0).getTime();
    const db = new Date(b.closed_at || b.session_closed_at || 0).getTime();
    return db - da;
  });
}

async function getReportData() {
  let reportRows = [];

  const { data: rpcRows, error: reportError } = await supabaseClient.rpc("get_packing_report_rows");

  if (reportError) {
    console.warn("get_packing_report_rows nie działa, używam fallback SELECT:", reportError.message);
    reportRows = await fetchAllSessionsFallback();
  } else {
    reportRows = rpcRows || [];
  }

  let brakiRows = [];

  const { data: brakiData, error: brakiError } = await supabaseClient.rpc("get_braki_report");

  if (brakiError) {
    console.warn("get_braki_report nie działa, używam filtrowania po statusie BRAKI:", brakiError.message);
    brakiRows = reportRows.filter(x => normalizeStatus(x.status) === "BRAKI");
  } else {
    brakiRows = brakiData || [];
  }

  const sessions = mergeSessionsWithBraki(reportRows, brakiRows);

  const { data: bagCount, error: bagCountError } = await supabaseClient.rpc("count_unique_bags");

  if (bagCountError) {
    throw new Error(bagCountError.message);
  }

  const { data: mealDateRow } = await supabaseClient
    .from("app_settings")
    .select("value")
    .eq("key", "meal_date")
    .maybeSingle();

  return {
    sessions,
    brakiRows,
    totalBagsInPlan: bagCount || 0,
    mealDate: mealDateRow?.value || ""
  };
}

function sheetFromRows(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function setColumnWidths(sheet, widths) {
  sheet["!cols"] = widths.map(width => ({ wch: width }));
}

function setAutoFilter(sheet, range) {
  sheet["!autofilter"] = { ref: range };
}

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

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `raport_pakowania_${date}.xlsx`);

    reportExportedThisSession = true;
    lastReportExportAt = new Date();

    setSessionsStatus(
      `✅ Raport Excel wygenerowany.\nDzień jedzony: ${formatDatePL(report.mealDate)}\nWpisów w raporcie: ${total}\nPoprawne: ${correct}\nNiepoprawne: ${bad}\nBraki: ${braki}\nDodano zakładkę Braki.`,
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

async function resetDay() {
  const row = await loadOperationalStatus();
  const mealDate = el("mealDateInput").value;

  if (!row || !operationalHasData(row)) {
    setSessionsStatus("Dane operacyjne są już puste. Nie ma czego resetować.", "warn");
    return;
  }

  if (!mealDate) {
    setSessionsStatus(
      "❌ Nie można zamknąć dnia, bo nie ustawiono dnia jedzonego.
Archiwum jest zapisywane wyłącznie po meal_date, więc najpierw ustaw dzień jedzony.",
      "bad"
    );
    return;
  }

  const sessionsCount = Number(row.packing_sessions_count || 0);

  const choice = await showChoiceModal({
    title: "🧹 Zarchiwizować dzień i wyczyścić system?",
    text: sessionsCount > 0
      ? "Przed resetem system pobierze raport Excel, zapisze archiwum pod dniem jedzonym, a dopiero potem wyczyści dane robocze."
      : "System zapisze archiwum pod dniem jedzonym i wyczyści dane robocze. Raport Excel nie zostanie pobrany, bo nie ma jeszcze żadnych sesji pakowania.",
    details:
      `Dzień jedzony / meal_date: <b>${escapeHtml(formatDatePL(mealDate))}</b><br><br>` +
      operationalDataDetailsHtml(row) +
      `<br><br>Zostaną użytkownicy, role, struktura systemu oraz archiwum.`,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Pobierz raport, archiwizuj i resetuj dzień", value:"continue", className:"btnReplace" }
    ]
  });

  if (choice !== "continue") return;

  if (sessionsCount > 0) {
    setSessionsStatus("⏳ Najpierw generuję raport Excel...", "info");

    const exported = await exportExcel();

    if (!exported) {
      setSessionsStatus("❌ Reset anulowany, bo nie udało się wygenerować raportu.", "bad");
      return;
    }
  }

  const typed = window.prompt("Aby potwierdzić archiwizację i reset dnia, wpisz dokładnie: RESET");

  if (typed !== "RESET") {
    setSessionsStatus("⚠️ Reset anulowany. Nie wpisano poprawnie słowa RESET.", "warn");
    return;
  }

  setSessionsStatus("⏳ Archiwizuję dzień jedzony i czyszczę dane operacyjne...", "info");
  el("resetDayButton").disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc("admin_reset_operational_data");

    if (error) {
      setSessionsStatus("❌ Nie udało się wykonać archiwizacji/resetu dnia: " + error.message, "bad");
      return;
    }

    if (data === "NO_MEAL_DATE") {
      setSessionsStatus(
        "❌ Reset zatrzymany. Brakuje dnia jedzonego / meal_date.
Ustaw dzień jedzony i spróbuj ponownie.",
        "bad"
      );
      return;
    }

    if (data === "ALREADY_ARCHIVED") {
      setSessionsStatus(
        "⚠️ Reset zatrzymany. Ten dzień jedzony jest już w archiwum.
System nie wyczyścił danych, żeby nie ryzykować utraty lub zdublowania archiwum.",
        "warn"
      );
      return;
    }

    if (data !== "OK") {
      setSessionsStatus("❌ Nie udało się wykonać archiwizacji/resetu dnia: " + data, "bad");
      return;
    }

    reportExportedThisSession = false;
    lastReportExportAt = null;

    el("fileInput").value = "";
    el("mealDateInput").value = "";
    setMealDateStatus("Dzień jedzony: nieustawiony.", "warn");

    setSessionsStatus(
      `✅ Dzień jedzony ${formatDatePL(mealDate)} został zarchiwizowany, a dane robocze wyczyszczone.
Możesz wgrać nowy plan CSV.`,
      "ok"
    );

    await refreshAdminData();

  } finally {
    el("resetDayButton").disabled = false;
  }
}

function parseCsvLine(line, delimiter = ";") {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseCsvText(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter(line => line.trim() !== "");

  if (lines.length < 2) return [];

  return lines.slice(1).map(line => parseCsvLine(line, ";"));
}

async function upload() {
  const statusRow = await loadOperationalStatus();

  if (statusRow && operationalHasData(statusRow)) {
    setUploadStatus(
      "❌ Nie można wgrać nowego planu, bo stare dane operacyjne nie są wyczyszczone.\nNajpierw pobierz raport i wykonaj reset dnia.",
      "bad"
    );
    return;
  }

  const dateSaved = await saveMealDate();
  if (!dateSaved) return;

  const file = el("fileInput").files[0];

  if (!file) {
    setUploadStatus("❌ Wybierz plik CSV.", "bad");
    return;
  }

  setUploadStatus("⏳ Czytam plik...", "info");
  el("uploadButton").disabled = true;

  try {
    const text = await file.text();
    const rows = parseCsvText(text);

    if (rows.length < 1) {
      setUploadStatus("❌ Plik jest pusty albo nie ma danych.", "bad");
      return;
    }

    const batchId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);

    const data = rows.map(r => ({
      import_batch_id: batchId,
      bag_qr: String(r[0] || "").trim(),
      tray_qr: String(r[1] || "").trim(),
      meal: String(r[2] || "").trim(),
      code: String(r[3] || "").trim(),
      size: String(r[4] || "").trim(),
      dish_name: String(r[5] || "").trim()
    })).filter(x => x.bag_qr && x.tray_qr);

    if (!data.length) {
      setUploadStatus("❌ Nie znaleziono poprawnych wierszy. Sprawdź kolejność kolumn.", "bad");
      return;
    }

    setUploadStatus("⏳ Wysyłam dane: " + data.length + " rekordów...", "info");

    const chunkSize = 500;
    let inserted = 0;

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);

      const { error } = await supabaseClient.from("packing_plan").insert(chunk);

      if (error) {
        setUploadStatus("❌ Błąd importu po " + inserted + " rekordach: " + error.message, "bad");
        return;
      }

      inserted += chunk.length;
      setUploadStatus("⏳ Wgrano " + inserted + " / " + data.length + "...", "info");
    }

    reportExportedThisSession = false;

    setUploadStatus(
      "✅ Plan załadowany: " + inserted +
      " rekordów.\nDzień jedzony: " + formatDatePL(el("mealDateInput").value) +
      "\nImport batch: " + batchId,
      "ok"
    );

    await refreshAdminData();

  } catch (err) {
    setUploadStatus("❌ Błąd importu: " + err.message, "bad");
  } finally {
    el("uploadButton").disabled = false;
  }
}

async function setUserRole() {
  const loginValue = el("roleUserLogin").value.trim();
  const role = el("roleSelect").value;
  const email = getEmail(loginValue);

  if (!email) {
    setRoleStatus("❌ Wpisz login lub email użytkownika.", "bad");
    return;
  }

  setRoleStatus("⏳ Nadaję rolę...", "info");

  const { data, error } = await supabaseClient.rpc("set_user_role_by_email", {
    user_email: email,
    new_role: role
  });

  if (error) {
    setRoleStatus("❌ Błąd: " + error.message, "bad");
    return;
  }

  if (data !== "OK") {
    setRoleStatus("❌ " + data, "bad");
    return;
  }

  setRoleStatus("✅ Nadano rolę: " + role + " dla " + email, "ok");
  await loadUsersList();
  await loadQrUsers();
}

async function callAdminFunction(functionName, payload) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token || currentSession?.access_token;

  if (!token) {
    throw new Error("Brak aktywnej sesji admina.");
  }

  const res = await fetch(`${PROJECT_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": PUBLISHABLE_KEY
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || json.message || "Błąd funkcji admina.");
  }

  return json;
}

async function createUser() {
  const email = getEmail(el("newUserLogin").value);
  const password = el("newUserPassword").value;
  const role = el("newUserRole").value;

  if (!email) {
    setUserStatus("❌ Wpisz login lub email nowego użytkownika.", "bad");
    return;
  }

  if (!password || password.length < 6) {
    setUserStatus("❌ Hasło musi mieć minimum 6 znaków.", "bad");
    return;
  }

  setUserStatus("⏳ Dodaję użytkownika...", "info");

  try {
    await callAdminFunction("admin-create-user", { email, password, role });
    setUserStatus("✅ Dodano użytkownika: " + email + " z rolą " + role, "ok");
    el("newUserLogin").value = "";
    el("newUserPassword").value = "";
    await loadUsersList();
    await loadQrUsers();
  } catch (err) {
    setUserStatus("❌ Nie udało się dodać użytkownika: " + err.message, "bad");
  }
}

async function deleteUser() {
  const email = getEmail(el("deleteUserLogin").value);

  if (!email) {
    setUserStatus("❌ Wpisz login lub email użytkownika do usunięcia.", "bad");
    return;
  }

  const choice = await showChoiceModal({
    title:"🗑️ Usunąć użytkownika?",
    text:"To usunie konto użytkownika z systemu logowania.",
    details:`Użytkownik: <b>${escapeHtml(email)}</b>`,
    buttons:[
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Usuń użytkownika", value:"delete", className:"btnReplace" }
    ]
  });

  if (choice !== "delete") return;

  setUserStatus("⏳ Usuwam użytkownika...", "info");

  try {
    await callAdminFunction("admin-delete-user", { email });
    setUserStatus("✅ Usunięto użytkownika: " + email, "ok");
    el("deleteUserLogin").value = "";
    await loadUsersList();
    await loadActiveLogins();
    await loadQrUsers();
  } catch (err) {
    setUserStatus("❌ Nie udało się usunąć użytkownika: " + err.message, "bad");
  }
}

async function loadStationOverview() {
  setStationStatus("⏳ Pobieram stan pakowania stanowiskowego...", "info");

  const { data, error } = await supabaseClient.rpc("admin_station_overview");

  if (error) {
    setStationStatus("❌ Nie udało się pobrać stanowisk: " + error.message, "bad");
    renderStationLines([]);
    return;
  }

  activeLinesCache = data || [];
  renderStationLines(activeLinesCache);

  const activeLines = activeLinesCache.filter(x => String(x.line_status || "").toLowerCase() === "active").length;
  const queued = activeLinesCache.reduce((sum, x) => sum + Number(x.active_bags || 0), 0);
  const bad = activeLinesCache.reduce((sum, x) => sum + Number(x.bad_bags || 0), 0);

  el("statLines").innerText = activeLines;
  el("statQueued").innerText = queued;
  el("statBadStation").innerText = bad;

  setStationStatus("✅ Dane stanowisk odświeżone.", "ok");
}

function renderStationLines(rows) {
  if (!rows.length) {
    el("stationLinesTable").innerHTML = `<div style="padding:18px;color:#6b7280;">Brak aktywnych stanowisk.</div>`;
    return;
  }

  el("stationLinesTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Stanowisko</th>
          <th>Status</th>
          <th>Lider</th>
          <th>Pracownicy</th>
          <th>W obiegu</th>
          <th>Gotowe</th>
          <th>Błędy</th>
          <th>Utworzono</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((line, index) => {
          const status = String(line.line_status || "-");
          const rowClass = status === "active" ? "activeRow" : status === "closed" ? "" : "warnRow";
          return `
            <tr class="${rowClass}">
              <td><b>${escapeHtml(line.line_name || "-")}</b></td>
              <td>${stationStatusBadge(status)}</td>
              <td>${escapeHtml(displayLogin(line.leader_email || "-"))}</td>
              <td>${Number(line.active_workers || 0)}</td>
              <td><b>${Number(line.active_bags || 0)}</b></td>
              <td class="ok">${Number(line.done_bags || 0)}</td>
              <td class="bad">${Number(line.bad_bags || 0)}</td>
              <td>${formatDateTimePL(line.created_at)}</td>
              <td>
                <div style="display:flex;gap:8px;min-width:360px;">
                  <button class="smallBtn lightBtn" onclick="showLineDetails(${index})">Szczegóły</button>
                  <button class="smallBtn warning" onclick="clearStationQueue('${escapeJs(line.line_id)}','${escapeJs(line.line_name || "")}')">Wyczyść kolejkę</button>
                  <button class="smallBtn danger" onclick="closeStationLineAdmin('${escapeJs(line.line_id)}','${escapeJs(line.line_name || "")}')">Zamknij</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function stationStatusBadge(status) {
  if (status === "active") return `<span class="badge badgeOk">AKTYWNE</span>`;
  if (status === "closed") return `<span class="badge badgeMuted">ZAMKNIĘTE</span>`;
  return `<span class="badge badgeWarn">${escapeHtml(status || "-")}</span>`;
}

async function showLineDetails(index) {
  const line = activeLinesCache[index];
  if (!line) return;

  el("detailsTitle").innerText = "Stanowisko: " + (line.line_name || "-");
  el("detailsContent").innerHTML = `<div class="statusBox info">⏳ Pobieram szczegóły stanowiska...</div>`;
  el("detailsModal").classList.remove("hidden");

  const { data, error } = await supabaseClient.rpc("admin_station_line_details", {
    target_line_id: line.line_id
  });

  if (error) {
    el("detailsContent").innerHTML = `<div class="statusBox bad">❌ ${escapeHtml(error.message)}</div>`;
    return;
  }

  const rows = data || [];

  if (!rows.length) {
    el("detailsContent").innerHTML = `<div class="statusBox info">Brak toreb w kolejce tego stanowiska.</div>`;
    return;
  }

  el("detailsContent").innerHTML = `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Pozycja</th>
            <th>Torba</th>
            <th>Status torby</th>
            <th>Posiłek</th>
            <th>Tacka oczekiwana</th>
            <th>Status tacki</th>
            <th>Skan</th>
            <th>Pracownik</th>
            <th>Czas</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${r.has_error ? "badRow" : ""}">
              <td>${escapeHtml(r.queue_position ?? "-")}</td>
              <td><b>${escapeHtml(r.bag_qr || "-")}</b></td>
              <td>${escapeHtml(r.bag_status || "-")}</td>
              <td>${escapeHtml(r.meal || "-")}</td>
              <td>${escapeHtml(r.expected_tray_qr || "-")}</td>
              <td>${scanStatusBadge(r.scan_status)}</td>
              <td>${escapeHtml(r.scanned_tray_qr || "-")}</td>
              <td>${escapeHtml(displayLogin(r.scanned_by_email || "-"))}</td>
              <td>${formatDateTimePL(r.scanned_at)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function scanStatusBadge(status) {
  const s = String(status || "not_scanned");
  if (s === "ok") return `<span class="badge badgeOk">OK</span>`;
  if (s === "brak") return `<span class="badge badgeWarn">BRAK</span>`;
  if (["wrong", "forced_bad", "duplicate"].includes(s)) return `<span class="badge badgeBad">${escapeHtml(s)}</span>`;
  return `<span class="badge badgeMuted">NIE SPAKOWANO</span>`;
}

async function clearStationQueue(lineId, lineName) {
  const choice = await showChoiceModal({
    title:"🧹 Wyczyścić kolejkę stanowiska?",
    text:"To anuluje aktywne torby z obiegu na wybranym stanowisku.",
    details:`Stanowisko: <b>${escapeHtml(lineName)}</b><br><br>Używaj tego, gdy kolejka się zacięła albo lider chce zacząć od nowa.`,
    buttons:[
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Wyczyść kolejkę stanowiska", value:"clear", className:"btnReplace" }
    ]
  });

  if (choice !== "clear") return;

  setStationStatus("⏳ Czyszczę kolejkę stanowiska...", "info");

  const { data, error } = await supabaseClient.rpc("admin_clear_station_queue", {
    target_line_id: lineId
  });

  if (error || data !== "OK") {
    setStationStatus("❌ Nie udało się wyczyścić kolejki: " + (error?.message || data), "bad");
    return;
  }

  setStationStatus("✅ Kolejka stanowiska wyczyszczona.", "ok");
  await loadStationOverview();
}

async function closeStationLineAdmin(lineId, lineName) {
  const choice = await showChoiceModal({
    title:"🔒 Zamknąć stanowisko?",
    text:"Stanowisko zostanie oznaczone jako zamknięte i nie powinno być dalej używane przez pracowników.",
    details:`Stanowisko: <b>${escapeHtml(lineName)}</b>`,
    buttons:[
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Zamknij stanowisko", value:"close", className:"btnReplace" }
    ]
  });

  if (choice !== "close") return;

  setStationStatus("⏳ Zamykam stanowisko...", "info");

  const { data, error } = await supabaseClient.rpc("admin_close_station_line", {
    target_line_id: lineId
  });

  if (error || data !== "OK") {
    setStationStatus("❌ Nie udało się zamknąć stanowiska: " + (error?.message || data), "bad");
    return;
  }

  setStationStatus("✅ Stanowisko zamknięte.", "ok");
  await loadStationOverview();
}

async function clearAllStationQueues() {
  const choice = await showChoiceModal({
    title:"🧹 Wyczyścić wszystkie kolejki?",
    text:"To anuluje aktywne torby ze wszystkich stanowisk.",
    details:"Używaj tylko awaryjnie, np. gdy zmieniacie plan lub system był testowany.",
    buttons:[
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Wyczyść wszystkie kolejki", value:"clear", className:"btnReplace" }
    ]
  });

  if (choice !== "clear") return;

  setStationStatus("⏳ Czyszczę wszystkie kolejki...", "info");

  const { data, error } = await supabaseClient.rpc("admin_clear_all_station_queues");

  if (error || data !== "OK") {
    setStationStatus("❌ Nie udało się wyczyścić kolejek: " + (error?.message || data), "bad");
    return;
  }

  setStationStatus("✅ Wszystkie kolejki wyczyszczone.", "ok");
  await loadStationOverview();
}

async function closeAllStationLines() {
  const choice = await showChoiceModal({
    title:"🔒 Zamknąć wszystkie stanowiska?",
    text:"Wszystkie aktywne stanowiska zostaną zamknięte.",
    details:"Pracownicy powinni odświeżyć stronę lub wrócić do wyboru stanowiska.",
    buttons:[
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Zamknij wszystkie stanowiska", value:"close", className:"btnReplace" }
    ]
  });

  if (choice !== "close") return;

  setStationStatus("⏳ Zamykam wszystkie stanowiska...", "info");

  const { data, error } = await supabaseClient.rpc("admin_close_all_station_lines");

  if (error || data !== "OK") {
    setStationStatus("❌ Nie udało się zamknąć stanowisk: " + (error?.message || data), "bad");
    return;
  }

  setStationStatus("✅ Wszystkie stanowiska zamknięte.", "ok");
  await loadStationOverview();
}

async function loadActiveLogins() {
  const { data, error } = await supabaseClient.rpc("admin_active_login_locks");

  if (error) {
    setLoginsStatus("❌ Nie udało się pobrać aktywnych logowań: " + error.message, "bad");
    renderActiveLogins([]);
    return;
  }

  activeLoginsCache = data || [];
  renderActiveLogins(activeLoginsCache);
  el("statLogins").innerText = activeLoginsCache.length;
  setLoginsStatus("✅ Aktywne wpisy logowań odświeżone.", "ok");
}

function renderActiveLogins(rows) {
  if (!rows.length) {
    el("activeLoginsTable").innerHTML = `<div style="padding:18px;color:#6b7280;">Brak aktywnych wpisów logowania.</div>`;
    return;
  }

  el("activeLoginsTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Użytkownik</th>
          <th>Tryb</th>
          <th>Stanowisko</th>
          <th>Utworzono</th>
          <th>Wygasa</th>
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td><b>${escapeHtml(displayLogin(row.user_email || row.user_id || "-"))}</b></td>
            <td>${escapeHtml(row.mode || "-")}</td>
            <td>${escapeHtml(row.line_name || row.line_id || "-")}</td>
            <td>${formatDateTimePL(row.locked_at)}</td>
            <td>${formatDateTimePL(row.expires_at)}</td>
            <td>
              <button class="smallBtn danger" onclick="forceLogoutUser(${index})">Usuń wpis</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function forceLogoutUser(index) {
  const row = activeLoginsCache[index];
  if (!row) return;

  const choice = await showChoiceModal({
    title:"🔐 Usunąć wpis logowania?",
    text:"To usunie wpis z tabeli aktywnych logowań. Nie blokuje to już konta na innych urządzeniach.",
    details:`Użytkownik: <b>${escapeHtml(row.user_email || row.user_id || "-")}</b><br>Tryb: <b>${escapeHtml(row.mode || "-")}</b><br>Stanowisko: <b>${escapeHtml(row.line_name || row.line_id || "-")}</b>`,
    buttons:[
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Usuń wpis logowania", value:"logout", className:"btnReplace" }
    ]
  });

  if (choice !== "logout") return;

  setLoginsStatus("⏳ Usuwam wpis logowania...", "info");

  const { data, error } = await supabaseClient.rpc("admin_force_release_login_lock", {
    target_user_id: row.user_id
  });

  if (error || data !== "OK") {
    setLoginsStatus("❌ Nie udało się usunąć wpisu: " + (error?.message || data), "bad");
    return;
  }

  setLoginsStatus("✅ Wpis logowania usunięty: " + (row.user_email || row.user_id), "ok");
  await loadActiveLogins();
}

async function loadQrUsers() {
  const table = el("qrTokensTable");
  if (!table || !supabaseClient) return;

  const { data, error } = await supabaseClient.rpc("admin_list_qr_users");

  if (error) {
    table.innerHTML = `<div style="padding:18px;color:#991b1b;">Nie udało się pobrać kodów QR: ${escapeHtml(error.message)}</div>`;
    return;
  }

  qrUsersCache = data || [];
  renderQrUsers(qrUsersCache);
}

function renderQrUsers(rows) {
  if (!rows.length) {
    el("qrTokensTable").innerHTML = `<div style="padding:18px;color:#6b7280;">Brak workerów i managerów.</div>`;
    return;
  }

  el("qrTokensTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Użytkownik</th>
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
          const statusLabel = !hasQr ? "BRAK QR" : active ? "AKTYWNY" : "WYŁĄCZONY";
          const badgeClass = !hasQr ? "badgeMuted" : active ? "badgeOk" : "badgeBad";

          return `
            <tr>
              <td><b>${escapeHtml(displayLogin(row.user_email || "-"))}</b></td>
              <td>${escapeHtml(row.user_role || "-")}</td>
              <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
              <td>${escapeHtml(row.token_hint || "-")}</td>
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
        }).join("")}
      </tbody>
    </table>
  `;
}

function selectQrUser(index) {
  const row = qrUsersCache[index];
  if (!row) return;

  el("qrUserLogin").value = row.user_email || "";
  setQrStatus("Wybrano użytkownika: " + displayLogin(row.user_email || ""), "info");
}

async function generateQrForIndex(index) {
  const row = qrUsersCache[index];
  if (!row) return;

  el("qrUserLogin").value = row.user_email || "";
  await generateQrLoginForUser();
}

async function disableQrForIndex(index) {
  const row = qrUsersCache[index];
  if (!row) return;

  el("qrUserLogin").value = row.user_email || "";
  await disableQrLoginForUser();
}

async function generateQrLoginForUser() {
  const email = getEmail(el("qrUserLogin").value);

  if (!email) {
    setQrStatus("❌ Wpisz login lub email użytkownika.", "bad");
    return;
  }

  const choice = await showChoiceModal({
    title: "🔳 Wygenerować kod QR?",
    text: "Nowy kod QR zastąpi poprzedni kod tego użytkownika.",
    details: `Użytkownik: <b>${escapeHtml(email)}</b><br><br>Po wygenerowaniu od razu wydrukuj kod. Pełny token jest pokazany tylko po wygenerowaniu.`,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Wygeneruj QR", value:"generate", className:"btnAnother" }
    ]
  });

  if (choice !== "generate") return;

  setQrStatus("⏳ Generuję kod QR...", "info");
  el("qrGenerateButton").disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc("admin_regenerate_user_qr", {
      target_user_email: email
    });

    if (error) {
      setQrStatus("❌ Nie udało się wygenerować QR: " + error.message, "bad");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      setQrStatus("❌ Baza nie zwróciła danych QR.", "bad");
      return;
    }

    if (row.status !== "OK") {
      setQrStatus("❌ Nie udało się wygenerować QR: " + row.status, "bad");
      await loadQrUsers();
      return;
    }

    if (!row.qr_token) {
      setQrStatus("❌ Wygenerowano kod, ale baza nie zwróciła tokenu QR do wydruku.", "bad");
      await loadQrUsers();
      return;
    }

    await renderQrCode(row.qr_token, row.user_email || email);

    setQrStatus(
      "✅ Wygenerowano kod QR dla: " + (row.user_email || email) +
      "\nRola: " + (row.user_role || "-") +
      "\nKod QR powinien być widoczny poniżej.",
      "ok"
    );

    await loadQrUsers();

  } catch (err) {
    setQrStatus("❌ Błąd generowania QR: " + err.message, "bad");
  } finally {
    el("qrGenerateButton").disabled = false;
  }
}
function makeQrSvg(token, cellSize = 8, margin = 2) {
  if (!window.qrcode) {
    throw new Error("Biblioteka qrcode-generator nie wczytała się.");
  }

  const qr = window.qrcode(0, "M");
  qr.addData(String(token));
  qr.make();

  return qr.createSvgTag(cellSize, margin);
}
  
async function renderQrCode(token, email) {
  currentQrToken = token;
  currentQrEmail = email;

  el("qrPreview").classList.remove("hidden");
  el("qrPreviewUser").innerText = displayLogin(email);

  const box = el("qrCanvasBox");
  box.innerHTML = "";

  try {
    currentQrSvg = makeQrSvg(token, 8, 2);
    box.innerHTML = currentQrSvg;

    const svg = box.querySelector("svg");
    if (svg) {
      svg.style.width = "280px";
      svg.style.height = "280px";
      svg.style.display = "block";
      svg.style.margin = "0 auto";
    }

    el("qrTokenText").innerText =
      "Użytkownik: " + displayLogin(email) +
      "\nToken QR: " + token;

  } catch (err) {
    currentQrSvg = "";
    box.innerHTML = "";
    el("qrTokenText").innerText = "Token QR:\n" + token;
    setQrStatus("❌ Token wygenerowany, ale nie udało się narysować QR: " + err.message, "bad");
  }
}
async function disableQrLoginForUser() {
  const email = getEmail(el("qrUserLogin").value);

  if (!email) {
    setQrStatus("❌ Wpisz login lub email użytkownika.", "bad");
    return;
  }

  const choice = await showChoiceModal({
    title: "🚫 Wyłączyć QR?",
    text: "Użytkownik nie zaloguje się już tym kodem QR. Login i hasło dalej będą działały.",
    details: `Użytkownik: <b>${escapeHtml(email)}</b>`,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Wyłącz QR", value:"disable", className:"btnReplace" }
    ]
  });

  if (choice !== "disable") return;

  setQrStatus("⏳ Wyłączam QR...", "info");
  el("qrDisableButton").disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc("admin_disable_user_qr", {
      target_user_email: email
    });

    if (error) {
      setQrStatus("❌ Nie udało się wyłączyć QR: " + error.message, "bad");
      return;
    }

    if (data !== "OK") {
      setQrStatus("⚠️ Wynik: " + data, "warn");
    } else {
      setQrStatus("✅ Kod QR wyłączony dla: " + email, "ok");
    }

    if (currentQrEmail && getEmail(currentQrEmail) === email) {
      currentQrToken = "";
      currentQrEmail = "";
      el("qrPreview").classList.add("hidden");
      el("qrCanvasBox").innerHTML = "";
      el("qrTokenText").innerText = "";
    }

    await loadQrUsers();

  } catch (err) {
    setQrStatus("❌ Błąd wyłączania QR: " + err.message, "bad");
  } finally {
    el("qrDisableButton").disabled = false;
  }
}

function printCurrentQr() {
  if (!currentQrToken || !currentQrEmail) {
    setQrStatus("❌ Najpierw wygeneruj kod QR.", "bad");
    return;
  }

  let qrSvg = currentQrSvg;

  try {
    if (!qrSvg) {
      qrSvg = makeQrSvg(currentQrToken, 8, 2);
    }
  } catch (err) {
    setQrStatus("❌ Nie udało się przygotować QR do druku: " + err.message, "bad");
    return;
  }

  const safeUser = escapeHtml(displayLogin(currentQrEmail));
  const safeToken = escapeHtml(currentQrToken);

  const printWindow = window.open("", "_blank", "width=720,height=900");

  if (!printWindow) {
    setQrStatus("❌ Przeglądarka zablokowała okno drukowania. Zezwól na wyskakujące okna.", "bad");
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
        <img src="logo.png" class="logo" onerror="this.style.display='none'">
        <h1>Kod QR logowania</h1>
        <div class="login">${safeUser}</div>

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

window.addEventListener("DOMContentLoaded", () => {
  if (!window.supabase) {
    setLoginStatus("❌ Biblioteka Supabase się nie wczytała. Sprawdź internet.", "bad");
    return;
  }

  supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY);
  setLoginStatus("Status: gotowy do logowania", "info");

  el("loginButton").addEventListener("click", adminLogin);
  el("uploadButton").addEventListener("click", upload);
  el("exportReportButton").addEventListener("click", exportExcel);
  el("resetDayButton").addEventListener("click", resetDay);
  el("setRoleButton").addEventListener("click", setUserRole);
  el("createUserButton").addEventListener("click", createUser);
  el("deleteUserButton").addEventListener("click", deleteUser);
  el("refreshStationButton").addEventListener("click", refreshAdminData);
  el("clearAllQueuesButton").addEventListener("click", clearAllStationQueues);
  el("closeAllLinesButton").addEventListener("click", closeAllStationLines);

  el("qrGenerateButton").addEventListener("click", generateQrLoginForUser);
  el("qrDisableButton").addEventListener("click", disableQrLoginForUser);
  el("qrPrintButton").addEventListener("click", printCurrentQr);

  el("adminLogin").addEventListener("keydown", e => {
    if (e.key === "Enter") el("adminPassword").focus();
  });

  el("adminPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") adminLogin();
  });

  el("qrUserLogin").addEventListener("keydown", e => {
    if (e.key === "Enter") generateQrLoginForUser();
  });
});
