(function(){
  const KEY = "gastro_admin_tab";
  const USER_KEY = "gastro_admin_user_tab";
  const BRAND_LOGO = "logo-removebg-preview.png";
  const BRAND_NAME = "GastroSystem";

  const tabs = [
    ["pulpit", "▦", "Pulpit", "Centrum dowodzenia: szybki import, aktywne dni i zamknięcie dnia"],
    ["import", "⇩", "Import CSV", "Wgrywanie nowego planu i danych klienta"],
    ["dni", "▣", "Dni robocze", "Aktywne daty i zamykanie dnia"],
    ["raporty", "▤", "Raporty", "Eksporty, archiwum i czyszczenie"],
    ["torby", "▢", "Torby", "Odwołania i testowe etykiety"],
    ["uzytkownicy", "◌", "Użytkownicy", "Role, konta oraz QR logowania"],
    ["narzedzia", "⚙", "Narzędzia", "Techniczne funkcje pomocnicze" ]
  ];

  const userTabs = [
    ["lista", "Lista"],
    ["dodaj", "Dodaj"],
    ["role", "Role"],
    ["qr", "QR"]
  ];

  function q(sel, root){ return (root || document).querySelector(sel); }
  function qa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }
  function titleOf(section){ return String(section.querySelector("h2")?.textContent || "").toLowerCase(); }

  function classify(section){
    const t = titleOf(section);
    const out = new Set();

    if (section.id === "activeDaysPanel" || t.includes("aktywne dni")) { out.add("pulpit"); out.add("dni"); }
    if (t.includes("import csv") || t.includes("jeden import")) { out.add("pulpit"); out.add("import"); }
    if (t.includes("raport") || t.includes("archiwizacja dnia")) { out.add("pulpit"); out.add("dni"); out.add("raporty"); }
    if (t.includes("zmiany poraportowe") || t.includes("odwołaj torby")) { out.add("torby"); out.add("raporty"); }
    if (t.includes("czyszczenie archiwum")) { out.add("raporty"); out.add("narzedzia"); }
    if (t.includes("generator testowej") || t.includes("pdf")) { out.add("torby"); out.add("narzedzia"); }
    if (t.includes("użytkownicy") || t.includes("role") || t.includes("qr")) { out.add("uzytkownicy"); }

    if (!out.size) out.add("narzedzia");
    section.dataset.adminTabs = Array.from(out).join(" ");
  }

  function bindSidebarHover(layout, side){
    if (!layout || !side || side.dataset.hoverBound === "1") return;
    side.dataset.hoverBound = "1";

    side.addEventListener("mouseenter", () => {
      layout.classList.add("sidebarOpen");
    });

    side.addEventListener("mouseleave", () => {
      layout.classList.remove("sidebarOpen");
    });
  }

  function addLayout(){
    const panel = q("#adminPanel");
    if (!panel || panel.dataset.tabsReady === "1") return;

    const header = q(".adminHeader", panel);
    const grid = q(".adminGrid", panel);
    if (!header || !grid) return;

    const layout = document.createElement("div");
    layout.className = "adminAppLayout";

    const side = document.createElement("aside");
    side.className = "adminSidebar";
    side.innerHTML = `
      <div class="adminSidebarBrand">
        <img src="${BRAND_LOGO}" alt="${BRAND_NAME}">
        <div><div class="brandName">${BRAND_NAME}</div><div class="brandSub">Catering Logistics</div></div>
      </div>
      <nav class="adminSideNav">
        ${tabs.map(x => `<button type="button" class="adminTabButton" data-tab="${x[0]}" title="${x[3]}"><span>${x[1]}</span><b>${x[2]}</b></button>`).join("")}
      </nav>
      <div class="adminSidebarFooter"><div>v2.8.0</div><div class="onlineDot"><span></span> System online</div></div>
    `;

    const main = document.createElement("main");
    main.className = "adminMainArea";

    panel.insertBefore(layout, header);
    layout.appendChild(side);
    layout.appendChild(main);
    main.appendChild(header);

    const toolbar = document.createElement("section");
    toolbar.className = "adminTabToolbar";
    toolbar.innerHTML = `<div><div class="toolbarEyebrow">Widok</div><h2 id="adminTabTitle">Pulpit</h2><p id="adminTabSubtitle">Centrum dowodzenia: szybki import, aktywne dni i zamknięcie dnia</p></div>`;
    main.appendChild(toolbar);

    const kpi = document.createElement("section");
    kpi.className = "adminKpiGrid";
    kpi.innerHTML = `
      <div class="adminKpiCard"><div class="kpiIcon">▣</div><div><div class="kpiLabel">AKTYWNE DNI</div><div class="kpiValue" id="kpiActiveDays">0</div><div class="kpiSub">dni robocze</div></div></div>
      <div class="adminKpiCard"><div class="kpiIcon">▢</div><div><div class="kpiLabel">TORBY W PLANIE</div><div class="kpiValue" id="kpiBags">0</div><div class="kpiSub">sztuk</div></div></div>
      <div class="adminKpiCard"><div class="kpiIcon">▤</div><div><div class="kpiLabel">TACKI W PLANIE</div><div class="kpiValue" id="kpiTrays">0</div><div class="kpiSub">sztuk</div></div></div>
      <div class="adminKpiCard red"><div class="kpiIcon">×</div><div><div class="kpiLabel">ODWOŁANE</div><div class="kpiValue" id="kpiCancelled">0</div><div class="kpiSub">torby</div></div></div>
      <div class="adminKpiCard green"><div class="kpiIcon">✓</div><div><div class="kpiLabel">STATUS</div><div class="kpiValue">Gotowy</div><div class="kpiSub">panel działa</div></div></div>
    `;
    main.appendChild(kpi);
    main.appendChild(grid);

    bindSidebarHover(layout, side);
    panel.dataset.tabsReady = "1";
  }

  function classifyAll(){ qa(".adminGrid > .adminSection").forEach(classify); }
  function tabMeta(id){ return tabs.find(x => x[0] === id) || tabs[0]; }

  function compactPulpit(activeTab){
    const isPulpit = activeTab === "pulpit";
    document.body.classList.toggle("compactPulpit", isPulpit);
  }

  function setTab(id){
    const exists = tabs.some(x => x[0] === id);
    const tab = exists ? id : "pulpit";
    localStorage.setItem(KEY, tab);
    document.body.dataset.adminTab = tab;
    compactPulpit(tab);

    const meta = tabMeta(tab);
    if (q("#adminTabTitle")) q("#adminTabTitle").textContent = meta[2];
    if (q("#adminTabSubtitle")) q("#adminTabSubtitle").textContent = meta[3];

    qa(".adminTabButton").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    classifyAll();

    qa(".adminGrid > .adminSection").forEach(section => {
      const list = String(section.dataset.adminTabs || "").split(/\s+/);
      section.classList.toggle("adminTabHidden", !list.includes(tab));
    });
  }

  function asNumber(v){ return Number(v || 0); }
  function fmt(v){ return asNumber(v).toLocaleString("pl-PL"); }

  function setKpi(active, bags, trays, cancelled){
    if (q("#kpiActiveDays")) q("#kpiActiveDays").textContent = fmt(active);
    if (q("#kpiBags")) q("#kpiBags").textContent = fmt(bags);
    if (q("#kpiTrays")) q("#kpiTrays").textContent = fmt(trays);
    if (q("#kpiCancelled")) q("#kpiCancelled").textContent = fmt(cancelled);
  }

  async function refreshKpi(){
    try {
      if (typeof supabaseClient === "undefined") return;
      const res = await supabaseClient.rpc("active_packing_days");
      if (res.error) throw res.error;

      const rows = (res.data || []).filter(r => r && r.meal_date);
      const active = rows.filter(r => asNumber(r.planned_trays) + asNumber(r.sessions_count) + asNumber(r.cancelled_count) + asNumber(r.planned_bags) > 0);
      const bags = active.reduce((s,r) => s + asNumber(r.planned_bags), 0);
      const trays = active.reduce((s,r) => s + asNumber(r.planned_trays), 0);
      const cancelled = active.reduce((s,r) => s + asNumber(r.cancelled_count), 0);
      setKpi(active.length, bags, trays, cancelled);
    } catch(e) {
      setKpi(0,0,0,0);
    }
  }

  function bind(){
    qa(".adminTabButton").forEach(btn => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });

    const layout = q(".adminAppLayout");
    const side = q(".adminSidebar");
    bindSidebarHover(layout, side);
  }

  function observe(){
    const grid = q(".adminGrid");
    if (!grid || grid.dataset.tabObserver === "1") return;
    grid.dataset.tabObserver = "1";
    new MutationObserver(() => {
      improveUserSection();
      setTab(localStorage.getItem(KEY) || "pulpit");
      refreshKpi();
    }).observe(grid, { childList:true });
  }

  function setUserSubTab(id){
    const active = userTabs.some(x => x[0] === id) ? id : "lista";
    localStorage.setItem(USER_KEY, active);
    const section = findUsersSection();
    if (!section) return;

    section.dataset.userSubtab = active;
    qa("[data-user-subtab-button]", section).forEach(btn => btn.classList.toggle("active", btn.dataset.userSubtabButton === active));
    qa(".subPanel", section).forEach(panel => {
      const type = panel.dataset.userPanel || "inne";
      panel.classList.toggle("userPanelHidden", type !== active && !(active === "lista" && type === "status"));
    });
  }

  function findUsersSection(){ return qa(".adminSection").find(section => titleOf(section).includes("użytkownicy")); }

  function improveUserSection(){
    const section = findUsersSection();
    if (!section || section.dataset.userImproved === "1") return;

    const panels = qa(".subPanel", section);
    panels.forEach(panel => {
      const text = String(panel.textContent || "").toLowerCase();
      if (text.includes("lista użytkowników")) panel.dataset.userPanel = "lista";
      else if (text.includes("status qr")) panel.dataset.userPanel = "lista";
      else if (text.includes("dodaj nowego")) panel.dataset.userPanel = "dodaj";
      else if (text.includes("nadaj rolę")) panel.dataset.userPanel = "role";
      else if (text.includes("usuń użytkownika")) panel.dataset.userPanel = "role";
      else if (text.includes("kody qr")) panel.dataset.userPanel = "qr";
      else panel.dataset.userPanel = "inne";
    });

    const body = q(".sectionBody .actionStack", section);
    if (body) {
      const nav = document.createElement("div");
      nav.className = "userSubTabs";
      nav.innerHTML = userTabs.map(x => `<button type="button" data-user-subtab-button="${x[0]}">${x[1]}</button>`).join("");
      body.insertBefore(nav, body.firstChild);
      qa("[data-user-subtab-button]", nav).forEach(btn => btn.addEventListener("click", () => setUserSubTab(btn.dataset.userSubtabButton)));
    }

    section.dataset.userImproved = "1";
    setUserSubTab(localStorage.getItem(USER_KEY) || "lista");
  }

  function wrapRefresh(){
    const old = window.refreshAdminData;
    if (typeof old !== "function" || old.__tabsWrap) return;
    const wrapped = async function(){
      const result = await old.apply(this, arguments);
      improveUserSection();
      await refreshKpi();
      setTab(localStorage.getItem(KEY) || "pulpit");
      return result;
    };
    wrapped.__tabsWrap = true;
    window.refreshAdminData = wrapped;
  }

  function start(){
    addLayout();
    bind();
    classifyAll();
    improveUserSection();
    observe();
    wrapRefresh();
    setTab(localStorage.getItem(KEY) || "pulpit");
    refreshKpi();
    setTimeout(() => { improveUserSection(); setTab(localStorage.getItem(KEY) || "pulpit"); refreshKpi(); bind(); }, 400);
    setTimeout(refreshKpi, 1400);
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
})();
