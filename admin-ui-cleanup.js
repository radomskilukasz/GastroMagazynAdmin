/*
  Porządek w panelu admina pod nowy proces:
  - jeden CSV: plan + dane klienta,
  - wybór aktywnego dnia przy archiwizacji,
  - ukrycie starego osobnego importu klientów / manifestu,
  - czytelniejsze komunikaty.
*/

(function () {
  function q(id) {
    return document.getElementById(id);
  }

  function sectionOf(el) {
    return el && el.closest ? el.closest("section") : null;
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setHtml(el, value) {
    if (el) el.innerHTML = value;
  }

  function formatDay(value) {
    if (typeof activeDaysFormatDate === "function") return activeDaysFormatDate(value);
    if (!value) return "-";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;

    return d.toLocaleDateString("pl-PL");
  }

  function syncMainActiveDay(value) {
    if (!value) return;

    const mainSelect = q("activeMealDateSelect");
    const mealInput = q("mealDateInput");

    if (mainSelect) {
      mainSelect.value = value;
      mainSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (mealInput) {
      mealInput.value = value;
    }
  }

  function getActiveOptionsFromMainSelect() {
    const mainSelect = q("activeMealDateSelect");

    if (!mainSelect) return [];

    return [...mainSelect.options]
      .filter(opt => opt.value)
      .map(opt => ({
        value: opt.value,
        label: opt.textContent || opt.value
      }));
  }

  function syncArchiveDateSelect() {
    const archiveSelect = q("archiveMealDateSelect");
    const archiveStatus = q("archiveDateChooserStatus");

    if (!archiveSelect) return;

    const options = getActiveOptionsFromMainSelect();

    if (!options.length) {
      archiveSelect.innerHTML = `<option value="">Brak aktywnych dni</option>`;

      if (archiveStatus) {
        archiveStatus.textContent = "Brak aktywnych dni do archiwizacji. Można wgrać nowy jeden CSV.";
        archiveStatus.className = "statusBox ok";
      }

      return;
    }

    const current =
      q("activeMealDateSelect")?.value ||
      q("mealDateInput")?.value ||
      options[0].value;

    archiveSelect.innerHTML = options
      .map(opt => `
        <option value="${opt.value}" ${opt.value === current ? "selected" : ""}>
          ${opt.label}
        </option>
      `)
      .join("");

    const selected = archiveSelect.value || options[0].value;

    syncMainActiveDay(selected);

    if (archiveStatus) {
      archiveStatus.textContent = "Wybrano dzień do archiwizacji: " + formatDay(selected);
      archiveStatus.className = "statusBox info";
    }
  }

  function moveActiveDayChoiceIntoArchiveCard() {
    const archiveSection = sectionOf(q("resetDayButton"));

    if (!archiveSection || q("archiveMealDateSelect")) return;

    const body =
      archiveSection.querySelector(".actionStack") ||
      archiveSection.querySelector(".sectionBody") ||
      archiveSection;

    const chooser = document.createElement("div");
    chooser.className = "subPanel";
    chooser.id = "archiveDateChooserBox";

    chooser.innerHTML = `
      <h3 class="subPanelTitle">Wybierz aktywny dzień do zamknięcia</h3>

      <div class="roleBox">
        <select id="archiveMealDateSelect"></select>
        <button id="archiveRefreshDaysButton" class="lightBtn" style="width:auto;">🔄 Odśwież dni</button>
      </div>

      <p class="statusBox info" id="archiveDateChooserStatus">
        Archiwizacja działa tylko na wybranej dacie. Inne aktywne dni zostają nietknięte.
      </p>
    `;

    body.insertBefore(chooser, body.firstChild);

    q("archiveRefreshDaysButton")?.addEventListener("click", async () => {
      if (typeof loadActivePackingDays === "function") {
        await loadActivePackingDays();
      }

      syncArchiveDateSelect();
    });

    q("archiveMealDateSelect")?.addEventListener("change", event => {
      const value = String(event.target.value || "");

      syncMainActiveDay(value);

      const archiveStatus = q("archiveDateChooserStatus");

      if (archiveStatus) {
        archiveStatus.textContent = value
          ? "Wybrano dzień do archiwizacji: " + formatDay(value)
          : "Nie wybrano aktywnego dnia.";

        archiveStatus.className = value ? "statusBox info" : "statusBox warn";
      }
    });
  }

  function cleanImportCard() {
    const section = sectionOf(q("uploadButton"));

    if (!section) return;

    setText(section.querySelector("h2"), "📥 Jeden import CSV: plan + dane klienta");
    setText(
      section.querySelector(".sectionHint"),
      "Wgraj jeden plik CSV. System sam rozdzieli plan pakowania i dane klienta."
    );

    setText(q("uploadButton"), "⬆️ Wgraj jeden CSV");

    const mealLabel = section.querySelector('label[for="mealDateInput"]') ||
      [...section.querySelectorAll("label")].find(x => x.textContent.includes("Dzień jedzony"));

    setText(mealLabel, "Dzień jedzony — z CSV albo ręcznie");

    const tip = [...section.querySelectorAll(".adminTip")]
      .find(x => x.textContent.includes("Format kolumn"));

    if (tip) {
      setHtml(tip, `
        <b>Nowy obowiązujący format CSV:</b><br>
        <code>client_id;delivery_date;zone;default_diet;variant;calories;bag_qr;tray_qr;meal;code;size;dish_name</code>
        <br><br>
        Jeden plik zasila jednocześnie <b>plan pakowania</b> oraz <b>dane klienta</b>.
        Stary osobny import klientów / manifestu nie jest już używany.
      `);
    }
  }

  function cleanArchiveCard() {
    const section = sectionOf(q("resetDayButton"));

    if (!section) return;

    setText(section.querySelector("h2"), "📦 Raport i archiwizacja aktywnego dnia");
    setText(
      section.querySelector(".sectionHint"),
      "Wybierz aktywny dzień, pobierz raport i zamknij tylko tę datę. Archiwum zostaje osobno."
    );

    setText(q("resetDayButton"), "🧹 Zarchiwizuj wybrany dzień");

    const tip = section.querySelector(".adminTip");

    if (tip) {
      setHtml(tip, `
        Archiwizacja działa po <b>wybranym aktywnym dniu</b>.
        Zamykana jest tylko wskazana data, a inne aktywne dni zostają bez zmian.
        <br><br>
        Jeżeli dzień był już w archiwum, system tylko posprząta ewentualne pozostałe dane robocze tej daty.
      `);
    }
  }

  function improveActiveDaysPanel() {
    const panel = q("activeDaysPanel");

    if (!panel) return;

    setText(panel.querySelector("h2"), "📅 Aktywne dni");
    setText(
      panel.querySelector(".sectionHint"),
      "Tu widać tylko dni robocze, które są jeszcze w aktywnym systemie. Archiwum zostaje osobno."
    );

    const button = q("applyActiveMealDateButton");

    if (button) {
      button.textContent = "Ustaw dzień do pracy";
    }
  }

  function hideObsoleteClientImport() {
    document.querySelectorAll("section.adminSection").forEach(section => {
      const text = (section.textContent || "").toLowerCase();

      const isMainImport = section.contains(q("uploadButton"));
      const isPostReportCancel = text.includes("odwołaj") || text.includes("odwołana") || text.includes("odwołane");
      const isArchiveClear = text.includes("czyszczenie archiwum") || text.includes("wyczyść archiwum");

      const looksLikeOldClientImport =
        (
          text.includes("import") &&
          (text.includes("klient") || text.includes("manifest")) &&
          !isMainImport &&
          !isPostReportCancel &&
          !isArchiveClear
        ) ||
        text.includes("zbiorczych klientów") ||
        text.includes("zbiorczych klientow");

      if (looksLikeOldClientImport) {
        section.style.display = "none";
        section.dataset.hiddenByNewImport = "true";
      }
    });
  }

  function installAdminUiCleanup() {
    cleanImportCard();
    cleanArchiveCard();
    hideObsoleteClientImport();
    moveActiveDayChoiceIntoArchiveCard();
    improveActiveDaysPanel();
    syncArchiveDateSelect();

    const oldRender = window.renderActivePackingDays;

    if (typeof oldRender === "function" && !oldRender.__adminUiCleanupWrapped) {
      const wrapped = function () {
        const result = oldRender.apply(this, arguments);

        improveActiveDaysPanel();
        syncArchiveDateSelect();

        return result;
      };

      wrapped.__adminUiCleanupWrapped = true;
      window.renderActivePackingDays = wrapped;
    }

    const oldLoad = window.loadActivePackingDays;

    if (typeof oldLoad === "function" && !oldLoad.__adminUiCleanupWrapped) {
      const wrappedLoad = async function () {
        const result = await oldLoad.apply(this, arguments);

        improveActiveDaysPanel();
        syncArchiveDateSelect();

        return result;
      };

      wrappedLoad.__adminUiCleanupWrapped = true;
      window.loadActivePackingDays = wrappedLoad;
    }

    setTimeout(() => {
      cleanImportCard();
      cleanArchiveCard();
      hideObsoleteClientImport();
      moveActiveDayChoiceIntoArchiveCard();
      improveActiveDaysPanel();
      syncArchiveDateSelect();
    }, 600);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", installAdminUiCleanup);
  } else {
    installAdminUiCleanup();
  }
})();
