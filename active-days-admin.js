/*
  Aktywne dni pakowania — warstwa nad istniejącym panelem admina.
  - pokazuje dni z public.active_packing_days(),
  - pozwala wybrać aktywny dzień,
  - przepina reset na admin_reset_operational_data_for_date(meal_date),
  - nie rusza archiwum.
*/

let activePackingDaysCache = [];
let selectedActiveMealDate = "";

function activeDaysEl(id) {
  return document.getElementById(id);
}

function activeDaysFormatDate(value) {
  if (typeof formatDatePL === "function") return formatDatePL(value);
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pl-PL");
}

function activeDaysEscape(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);
  return String(value ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function activeDaysSetStatus(text, type = "info") {
  const box = activeDaysEl("activeDaysStatus") || activeDaysEl("operationalStatus");
  if (!box) return;
  box.innerText = text;
  box.className = "statusBox " + type;
}

function activeDaysNumber(value) {
  return Number(value || 0);
}

function activeDaysTotal(row) {
  return activeDaysNumber(row.planned_trays) +
    activeDaysNumber(row.sessions_count) +
    activeDaysNumber(row.station_lines_count) +
    activeDaysNumber(row.station_bags_count) +
    activeDaysNumber(row.station_scans_count) +
    activeDaysNumber(row.events_count) +
    activeDaysNumber(row.cancelled_count);
}

function ensureActiveDaysPanel() {
  if (activeDaysEl("activeDaysPanel")) return;

  const importSection = activeDaysEl("mealDateInput")?.closest("section");
  const archiveSection = activeDaysEl("resetDayButton")?.closest("section");
  const container = importSection?.parentNode || archiveSection?.parentNode;

  if (!container) return;

  const section = document.createElement("section");
  section.className = "adminSection fullWidth";
  section.id = "activeDaysPanel";
  section.innerHTML = `
    <div class="sectionHeader">
      <div>
        <h2>📅 Aktywne dni robocze</h2>
        <div class="sectionHint">Wybierz dzień, na którym pracujesz. Archiwizacja i reset zamkną tylko wybraną datę.</div>
      </div>
    </div>
    <div class="sectionBody">
      <div class="actionStack">
        <div class="roleBox">
          <select id="activeMealDateSelect"></select>
          <button id="refreshActiveDaysButton" class="lightBtn" style="width:auto;">🔄 Odśwież dni</button>
          <button id="applyActiveMealDateButton" class="darkBtn" style="width:auto;">Ustaw jako dzień roboczy</button>
        </div>
        <p id="activeDaysStatus" class="statusBox info">Status aktywnych dni: nieodświeżony.</p>
        <div id="activeDaysTable" class="tableWrap"></div>
      </div>
    </div>
  `;

  if (archiveSection && archiveSection.parentNode === container) {
    container.insertBefore(section, archiveSection);
  } else if (importSection && importSection.nextSibling) {
    container.insertBefore(section, importSection.nextSibling);
  } else {
    container.appendChild(section);
  }

  activeDaysEl("refreshActiveDaysButton")?.addEventListener("click", () => loadActivePackingDays());

  activeDaysEl("applyActiveMealDateButton")?.addEventListener("click", () => {
    applySelectedActiveMealDate();
  });

  activeDaysEl("activeMealDateSelect")?.addEventListener("change", event => {
    selectedActiveMealDate = String(event.target.value || "");
  });
}

function renderActivePackingDays() {
  const select = activeDaysEl("activeMealDateSelect");
  const table = activeDaysEl("activeDaysTable");

  if (!select || !table) return;

  if (!activePackingDaysCache.length) {
    select.innerHTML = `<option value="">Brak aktywnych dni</option>`;
    table.innerHTML = "";
    activeDaysSetStatus("Brak aktywnych dni roboczych. Można wgrać nowy plan.", "ok");
    return;
  }

  const currentFormDate = String(activeDaysEl("mealDateInput")?.value || "").trim();

  if (!selectedActiveMealDate || !activePackingDaysCache.some(row => row.meal_date === selectedActiveMealDate)) {
    selectedActiveMealDate =
      currentFormDate && activePackingDaysCache.some(row => row.meal_date === currentFormDate)
        ? currentFormDate
        : activePackingDaysCache[0].meal_date;
  }

  select.innerHTML = activePackingDaysCache.map(row => `
    <option value="${activeDaysEscape(row.meal_date)}" ${row.meal_date === selectedActiveMealDate ? "selected" : ""}>
      ${activeDaysEscape(activeDaysFormatDate(row.meal_date))} — ${activeDaysNumber(row.planned_bags)} toreb / ${activeDaysNumber(row.planned_trays)} tacek
    </option>
  `).join("");

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Dzień</th>
          <th>Torby</th>
          <th>Tacki</th>
          <th>Sesje</th>
          <th>Poprawne</th>
          <th>Niepoprawne</th>
          <th>Braki</th>
          <th>Odwołane</th>
          <th>Stanowiska</th>
        </tr>
      </thead>
      <tbody>
        ${activePackingDaysCache.map(row => `
          <tr>
            <td><b>${activeDaysEscape(activeDaysFormatDate(row.meal_date))}</b></td>
            <td>${activeDaysNumber(row.planned_bags)}</td>
            <td>${activeDaysNumber(row.planned_trays)}</td>
            <td>${activeDaysNumber(row.sessions_count)}</td>
            <td>${activeDaysNumber(row.correct_count)}</td>
            <td>${activeDaysNumber(row.bad_count)}</td>
            <td>${activeDaysNumber(row.braki_count)}</td>
            <td>${activeDaysNumber(row.cancelled_count)}</td>
            <td>${activeDaysNumber(row.station_lines_count)} / ${activeDaysNumber(row.station_bags_count)} / ${activeDaysNumber(row.station_scans_count)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  activeDaysSetStatus(
    "Aktywne dni: " + activePackingDaysCache.length + ". Wybrany dzień: " + activeDaysFormatDate(selectedActiveMealDate) + ".",
    "info"
  );
}

async function loadActivePackingDays() {
  ensureActiveDaysPanel();

  try {
    activeDaysSetStatus("⏳ Pobieram aktywne dni...", "info");

    const { data, error } = await supabaseClient.rpc("active_packing_days");

    if (error) {
      activeDaysSetStatus("❌ Nie udało się pobrać aktywnych dni: " + error.message, "bad");
      return [];
    }

    activePackingDaysCache = (data || []).filter(row => {
      return row && row.meal_date && activeDaysTotal(row) > 0;
    });

    renderActivePackingDays();
    return activePackingDaysCache;

  } catch (err) {
    activeDaysSetStatus("❌ Błąd aktywnych dni: " + err.message, "bad");
    return [];
  }
}

async function applySelectedActiveMealDate() {
  const value = selectedActiveMealDate || String(activeDaysEl("activeMealDateSelect")?.value || "").trim();

  if (!value) {
    activeDaysSetStatus("❌ Nie ma wybranego aktywnego dnia.", "bad");
    return false;
  }

  const input = activeDaysEl("mealDateInput");
  if (input) input.value = value;

  if (typeof saveMealDate === "function") {
    const ok = await saveMealDate();
    if (!ok) return false;
  }

  activeDaysSetStatus("✅ Ustawiono dzień roboczy: " + activeDaysFormatDate(value), "ok");
  return true;
}
async function getReportDataForActiveDay() {
  const mealDate =
    selectedActiveMealDate ||
    String(activeDaysEl("activeMealDateSelect")?.value || "").trim() ||
    String(activeDaysEl("mealDateInput")?.value || "").trim();

  if (!mealDate) {
    if (typeof window.__baseGetReportData === "function") {
      return await window.__baseGetReportData();
    }

    throw new Error("Brak wybranego dnia raportu.");
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
async function resetSelectedActiveDay(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  const days = activePackingDaysCache.length ? activePackingDaysCache : await loadActivePackingDays();
  const formDate = String(activeDaysEl("mealDateInput")?.value || "").trim();
  const mealDate = selectedActiveMealDate || formDate || (days[0]?.meal_date || "");

  if (!mealDate) {
    if (typeof setSessionsStatus === "function") {
      setSessionsStatus("❌ Nie ma aktywnego dnia do archiwizacji/resetu.", "bad");
    }
    return;
  }

  const row = days.find(x => x.meal_date === mealDate) || null;
  const sessionsCount = activeDaysNumber(row?.sessions_count);

  const details = row
    ? `Dzień: <b>${activeDaysEscape(activeDaysFormatDate(mealDate))}</b><br>` +
      `Torby: <b>${activeDaysNumber(row.planned_bags)}</b><br>` +
      `Tacki: <b>${activeDaysNumber(row.planned_trays)}</b><br>` +
      `Sesje: <b>${activeDaysNumber(row.sessions_count)}</b><br>` +
      `Poprawne: <b>${activeDaysNumber(row.correct_count)}</b><br>` +
      `Niepoprawne: <b>${activeDaysNumber(row.bad_count)}</b><br>` +
      `Braki: <b>${activeDaysNumber(row.braki_count)}</b><br>` +
      `Odwołane: <b>${activeDaysNumber(row.cancelled_count)}</b><br>` +
      `Stanowiska / torby / skany: <b>${activeDaysNumber(row.station_lines_count)} / ${activeDaysNumber(row.station_bags_count)} / ${activeDaysNumber(row.station_scans_count)}</b><br><br>` +
      `Zamknięta zostanie tylko ta data. Inne aktywne dni zostają nietknięte.`
    : `Dzień: <b>${activeDaysEscape(activeDaysFormatDate(mealDate))}</b><br><br>Zamknięta zostanie tylko ta data.`;

  const choice = await showChoiceModal({
    title: "🧹 Zarchiwizować wybrany aktywny dzień?",
    text: sessionsCount > 0
      ? "System najpierw wygeneruje raport Excel, a potem zarchiwizuje i wyczyści tylko wybraną datę."
      : "System zarchiwizuje i wyczyści tylko wybraną datę. Raport Excel nie zostanie pobrany, bo nie ma sesji pakowania.",
    details,
    buttons: [
      { label:"Anuluj", value:"cancel", className:"btnCancel" },
      { label:"Zarchiwizuj wybrany dzień", value:"continue", className:"btnReplace" }
    ]
  });

  if (choice !== "continue") return;

  if (sessionsCount > 0 && typeof exportExcel === "function") {
    if (activeDaysEl("mealDateInput")) {
      activeDaysEl("mealDateInput").value = mealDate;
    }

    if (typeof saveMealDate === "function") {
      await saveMealDate();
    }

    if (typeof setSessionsStatus === "function") {
      setSessionsStatus("⏳ Najpierw generuję raport Excel dla " + activeDaysFormatDate(mealDate) + "...", "info");
    }

    const exported = await exportExcel();

    if (!exported) {
      if (typeof setSessionsStatus === "function") {
        setSessionsStatus("❌ Reset anulowany, bo nie udało się wygenerować raportu.", "bad");
      }
      return;
    }
  }

  const typed = window.prompt(
    "Aby potwierdzić archiwizację i reset dnia " + activeDaysFormatDate(mealDate) + ", wpisz dokładnie: RESET"
  );

  if (typed !== "RESET") {
    if (typeof setSessionsStatus === "function") {
      setSessionsStatus("⚠️ Reset anulowany. Nie wpisano poprawnie słowa RESET.", "warn");
    }
    return;
  }

  const button = activeDaysEl("resetDayButton");

  if (button) button.disabled = true;

  if (typeof setSessionsStatus === "function") {
    setSessionsStatus("⏳ Archiwizuję i czyszczę tylko dzień " + activeDaysFormatDate(mealDate) + "...", "info");
  }

  try {
    const { data, error } = await supabaseClient.rpc("admin_reset_operational_data_for_date", {
      p_meal_date: mealDate
    });

    if (error) {
      if (typeof setSessionsStatus === "function") {
        setSessionsStatus("❌ Nie udało się zamknąć dnia: " + error.message, "bad");
      }
      return;
    }

    if (data !== "OK" && data !== "ALREADY_ARCHIVED") {
      if (typeof setSessionsStatus === "function") {
        setSessionsStatus("❌ Nie udało się zamknąć dnia: " + data, "bad");
      }
      return;
    }

    if (activeDaysEl("mealDateInput")?.value === mealDate) {
      activeDaysEl("mealDateInput").value = "";
    }

    if (typeof setMealDateStatus === "function") {
      setMealDateStatus("Dzień jedzony: nieustawiony.", "warn");
    }

    selectedActiveMealDate = "";
    activePackingDaysCache = [];

    if (typeof setSessionsStatus === "function") {
      setSessionsStatus(
        "✅ Dzień " + activeDaysFormatDate(mealDate) + " został zarchiwizowany i wyczyszczony. Inne aktywne dni nie zostały ruszone.",
        "ok"
      );
    }

    if (typeof refreshAdminData === "function") {
      await refreshAdminData();
    }

    await loadActivePackingDays();

  } finally {
    if (button) button.disabled = false;
  }
}

function installActiveDaysAdmin() {
  ensureActiveDaysPanel();
if (typeof window.getReportData === "function" && !window.__baseGetReportData) {
  window.__baseGetReportData = window.getReportData;
  window.getReportData = getReportDataForActiveDay;
}
  const oldReset = activeDaysEl("resetDayButton");

  if (oldReset && oldReset.parentNode) {
    const newReset = oldReset.cloneNode(true);
    newReset.innerText = "🧹 Zarchiwizuj wybrany dzień";
    newReset.removeAttribute("onclick");
    newReset.addEventListener("click", resetSelectedActiveDay);
    oldReset.parentNode.replaceChild(newReset, oldReset);
  }

  const oldRefresh = window.refreshAdminData;

  if (typeof oldRefresh === "function" && !oldRefresh.__activeDaysWrapped) {
    const wrapped = async function(...args) {
      const result = await oldRefresh.apply(this, args);
      await loadActivePackingDays();
      return result;
    };

    wrapped.__activeDaysWrapped = true;
    window.refreshAdminData = wrapped;
  }

  loadActivePackingDays();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installActiveDaysAdmin);
} else {
  installActiveDaysAdmin();
}
