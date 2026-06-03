(function(){
  const KEY = "gastro_admin_tab";
  const tabs = [
    ["pulpit", "▦", "Pulpit"],
    ["import", "⇩", "Import CSV"],
    ["dni", "▣", "Dni robocze"],
    ["raporty", "▤", "Raporty"],
    ["torby", "▢", "Torby"],
    ["uzytkownicy", "◌", "Użytkownicy"],
    ["narzedzia", "⚙", "Narzędzia"]
  ];

  function q(sel, root){ return (root || document).querySelector(sel); }
  function qa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

  function titleOf(section){
    return String(section.querySelector("h2")?.textContent || "").toLowerCase();
  }

  function classify(section){
    const t = titleOf(section);
    const out = new Set();

    if (section.id === "activeDaysPanel" || t.includes("aktywne dni")) { out.add("pulpit"); out.add("dni"); }
    if (t.includes("import csv") || t.includes("jeden import")) { out.add("pulpit"); out.add("import"); }
    if (t.includes("raport") || t.includes("archiwizacja dnia")) { out.add("pulpit"); out.add("dni"); out.add("raporty"); }
    if (t.includes("zmiany poraportowe") || t.includes("odwołaj torby")) { out.add("torby"); out.add("raporty"); }
    if (t.includes("czyszczenie archiwum")) { out.add("raporty"); out.add("narzedzia"); }
    if (t.includes("generator testowej") || t.includes("pdf")) { out.add("pulpit"); out.add("torby"); out.add("narzedzia"); }
    if (t.includes("użytkownicy") || t.includes("role") || t.includes("qr")) { out.add("uzytkownicy"); }

    if (!out.size) out.add("narzedzia");
    section.dataset.adminTabs = Array.from(out).join(" ");
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
        <img src="logo.png" alt="logo">
        <div><div class="brandName">MealFlow</div><div class="brandSub">Catering Logistics</div></div>
      </div>
      <nav class="adminSideNav">
        ${tabs.map(x => `<button type="button" class="adminTabButton" data-tab="${x[0]}"><span>${x[1]}</span><b>${x[2]}</b></button>`).join("")}
      </nav>
      <div class="adminSidebarFooter"><div>v2.5.0</div><div class="onlineDot"><span></span> Online</div></div>
    `;

    const main = document.createElement("main");
    main.className = "adminMainArea";

    panel.insertBefore(layout, header);
    layout.appendChild(side);
    layout.appendChild(main);
    main.appendChild(header);

    const kpi = document.createElement("section");
    kpi.className = "adminKpiGrid";
    kpi.innerHTML = `
      <div class="adminKpiCard"><div class="kpiIcon">▣</div><div><div class="kpiLabel">AKTYWNE DNI</div><div class="kpiValue" id="kpiActiveDays">-</div><div class="kpiSub">dni robocze</div></div></div>
      <div class="adminKpiCard"><div class="kpiIcon">▢</div><div><div class="kpiLabel">TORBY W PLANIE</div><div class="kpiValue" id="kpiBags">-</div><div class="kpiSub">sztuk</div></div></div>
      <div class="adminKpiCard"><div class="kpiIcon">▤</div><div><div class="kpiLabel">TACKI W PLANIE</div><div class="kpiValue" id="kpiTrays">-</div><div class="kpiSub">sztuk</div></div></div>
      <div class="adminKpiCard red"><div class="kpiIcon">×</div><div><div class="kpiLabel">ODWOŁANE</div><div class="kpiValue" id="kpiCancelled">-</div><div class="kpiSub">torby</div></div></div>
      <div class="adminKpiCard green"><div class="kpiIcon">✓</div><div><div class="kpiLabel">STATUS</div><div class="kpiValue">Gotowy</div><div class="kpiSub">panel działa</div></div></div>
    `;
    main.appendChild(kpi);
    main.appendChild(grid);

    panel.dataset.tabsReady = "1";
  }

  function classifyAll(){ qa(".adminGrid > .adminSection").forEach(classify); }

  function setTab(id){
    const exists = tabs.some(x => x[0] === id);
    const tab = exists ? id : "pulpit";
    localStorage.setItem(KEY, tab);
    document.body.dataset.adminTab = tab;

    qa(".adminTabButton").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    classifyAll();

    qa(".adminGrid > .adminSection").forEach(section => {
      const list = String(section.dataset.adminTabs || "").split(/\s+/);
      section.classList.toggle("adminTabHidden", !list.includes(tab));
    });
  }

  async function refreshKpi(){
    if (!window.supabaseClient) return;
    try {
      const res = await window.supabaseClient.rpc("active_packing_days");
      const rows = (res.data || []).filter(r => r && r.meal_date);
      const active = rows.filter(r => Number(r.planned_trays || 0) + Number(r.sessions_count || 0) + Number(r.cancelled_count || 0) > 0);
      const bags = active.reduce((s,r) => s + Number(r.planned_bags || 0), 0);
      const trays = active.reduce((s,r) => s + Number(r.planned_trays || 0), 0);
      const cancelled = active.reduce((s,r) => s + Number(r.cancelled_count || 0), 0);
      if (q("#kpiActiveDays")) q("#kpiActiveDays").textContent = active.length.toLocaleString("pl-PL");
      if (q("#kpiBags")) q("#kpiBags").textContent = bags.toLocaleString("pl-PL");
      if (q("#kpiTrays")) q("#kpiTrays").textContent = trays.toLocaleString("pl-PL");
      if (q("#kpiCancelled")) q("#kpiCancelled").textContent = cancelled.toLocaleString("pl-PL");
    } catch(e) {}
  }

  function bind(){
    qa(".adminTabButton").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
  }

  function observe(){
    const grid = q(".adminGrid");
    if (!grid || grid.dataset.tabObserver === "1") return;
    grid.dataset.tabObserver = "1";
    new MutationObserver(() => setTab(localStorage.getItem(KEY) || "pulpit")).observe(grid, { childList:true });
  }

  function wrapRefresh(){
    const old = window.refreshAdminData;
    if (typeof old !== "function" || old.__tabsWrap) return;
    const wrapped = async function(){
      const result = await old.apply(this, arguments);
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
    observe();
    wrapRefresh();
    setTab(localStorage.getItem(KEY) || "pulpit");
    refreshKpi();
    setTimeout(() => { setTab(localStorage.getItem(KEY) || "pulpit"); refreshKpi(); }, 800);
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
  else start();
})();
