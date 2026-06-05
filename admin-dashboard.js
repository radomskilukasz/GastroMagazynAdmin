(function(){
  function q(sel, root){ return (root || document).querySelector(sel); }
  function fmt(value){ return Number(value || 0).toLocaleString('pl-PL'); }
  function pct(done,total){ return total ? Math.round((done/total)*100) : 0; }
  function safeDate(value){
    if (!value) return '-';
    if (typeof formatDatePL === 'function') return formatDatePL(value);
    return String(value);
  }

  function ensureStyle(){
    if (q('#adminDashboardStyle')) return;
    const style = document.createElement('style');
    style.id = 'adminDashboardStyle';
    style.textContent = `
      .adminDashboard{display:none;margin-bottom:18px;}
      body[data-admin-tab="pulpit"] .adminDashboard{display:block;}
      body[data-admin-tab="pulpit"] .adminGrid{display:none!important;}
      .dashHero{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-bottom:16px;}
      .dashCard{background:linear-gradient(180deg,rgba(17,27,38,.96),rgba(8,15,24,.96));border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:20px;box-shadow:0 18px 45px rgba(0,0,0,.22);}
      .dashCard h3{margin:0 0 10px;color:#f8fafc;font-size:20px;letter-spacing:-.03em;}
      .dashMuted{color:#94a3b8;font-size:13px;line-height:1.45;}
      .dashBig{font-size:46px;line-height:1;font-weight:950;color:#f8fafc;letter-spacing:-.06em;margin-top:8px;}
      .dashGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}
      .dashMetric{min-height:142px;background:linear-gradient(180deg,rgba(17,27,38,.96),rgba(8,15,24,.96));border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:18px;box-shadow:0 18px 45px rgba(0,0,0,.20);}
      .dashLabel{color:#94a3b8;font-size:12px;font-weight:950;letter-spacing:.07em;text-transform:uppercase;}
      .dashValue{font-size:38px;line-height:1.05;font-weight:950;color:#f8fafc;letter-spacing:-.05em;margin-top:10px;}
      .dashSub{color:#94a3b8;font-size:13px;margin-top:7px;}
      .dashOrange{border-color:rgba(249,115,22,.28);}
      .dashOrange .dashValue{color:#fdba74;}
      .dashGreen{border-color:rgba(34,197,94,.24);}
      .dashGreen .dashValue{color:#86efac;}
      .dashBlue{border-color:rgba(59,130,246,.24);}
      .dashBlue .dashValue{color:#bfdbfe;}
      .dashRed{border-color:rgba(239,68,68,.24);}
      .dashRed .dashValue{color:#fca5a5;}
      .dashProgress{height:12px;background:rgba(15,23,42,.90);border:1px solid rgba(148,163,184,.16);border-radius:999px;overflow:hidden;margin-top:16px;}
      .dashProgress span{display:block;height:100%;background:linear-gradient(90deg,var(--orange),#22c55e);border-radius:999px;transition:width .2s ease;}
      .dashDays{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
      .dashDayPill{border:1px solid rgba(249,115,22,.24);background:rgba(249,115,22,.09);color:#fdba74;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;}
      @media(max-width:1250px){.dashHero,.dashGrid{grid-template-columns:1fr 1fr;}}
      @media(max-width:760px){.dashHero,.dashGrid{grid-template-columns:1fr;}.dashBig{font-size:36px;}.dashValue{font-size:32px;}}
    `;
    document.head.appendChild(style);
  }

  function ensureDashboard(){
    ensureStyle();
    let dashboard = q('#adminDashboard');
    if (dashboard) return dashboard;

    const kpi = q('.adminKpiGrid');
    const grid = q('.adminGrid');
    if (!kpi || !grid) return null;

    dashboard = document.createElement('section');
    dashboard.id = 'adminDashboard';
    dashboard.className = 'adminDashboard';
    dashboard.innerHTML = renderLoading();
    kpi.parentElement.insertBefore(dashboard, grid);
    return dashboard;
  }

  function renderLoading(){
    return `<div class="dashCard"><h3>Pulpit operacyjny</h3><div class="dashMuted">Ładuję szybki podgląd systemu...</div></div>`;
  }

  function renderDashboard(stats){
    const progress = pct(stats.packedBags, stats.plannedBags);
    const daysHtml = stats.days.length
      ? stats.days.map(d => `<span class="dashDayPill">${safeDate(d.meal_date)} · ${fmt(d.planned_bags)} toreb · ${fmt(d.sessions_count)} sesji</span>`).join('')
      : '<span class="dashDayPill">Brak aktywnych dni</span>';

    return `
      <div class="dashHero">
        <div class="dashCard dashOrange">
          <h3>Postęp pakowania</h3>
          <div class="dashMuted">Finalnie spakowane torby względem planu aktywnych dni.</div>
          <div class="dashBig">${progress}%</div>
          <div class="dashProgress"><span style="width:${Math.min(progress,100)}%"></span></div>
          <div class="dashSub">${fmt(stats.packedBags)} / ${fmt(stats.plannedBags)} toreb</div>
        </div>
        <div class="dashCard">
          <h3>Aktywne dni wysyłki</h3>
          <div class="dashMuted">Daty, które mają dane robocze w systemie.</div>
          <div class="dashDays">${daysHtml}</div>
        </div>
      </div>

      <div class="dashGrid">
        <div class="dashMetric dashOrange"><div class="dashLabel">Aktywne dni</div><div class="dashValue">${fmt(stats.activeDays)}</div><div class="dashSub">daty w obiegu</div></div>
        <div class="dashMetric dashBlue"><div class="dashLabel">Aktywne sesje / wpisy</div><div class="dashValue">${fmt(stats.sessions)}</div><div class="dashSub">z raportu pakowania</div></div>
        <div class="dashMetric dashGreen"><div class="dashLabel">Spakowane</div><div class="dashValue">${fmt(stats.packedBags)}</div><div class="dashSub">torby zarejestrowane jako sesje</div></div>
        <div class="dashMetric dashRed"><div class="dashLabel">Odwołane</div><div class="dashValue">${fmt(stats.cancelled)}</div><div class="dashSub">torby wyłączone z pakowania</div></div>
        <div class="dashMetric"><div class="dashLabel">Torby w planie</div><div class="dashValue">${fmt(stats.plannedBags)}</div><div class="dashSub">unikalne bag_qr</div></div>
        <div class="dashMetric"><div class="dashLabel">Tacki w planie</div><div class="dashValue">${fmt(stats.plannedTrays)}</div><div class="dashSub">pozycje tray_qr</div></div>
        <div class="dashMetric dashBlue"><div class="dashLabel">Zalogowani</div><div class="dashValue">${fmt(stats.logins)}</div><div class="dashSub">aktywne wpisy logowania</div></div>
        <div class="dashMetric dashGreen"><div class="dashLabel">Stanowiska</div><div class="dashValue">${fmt(stats.activeLines)}</div><div class="dashSub">aktywne linie / stanowiska</div></div>
      </div>
    `;
  }

  async function getActiveDays(){
    const res = await supabaseClient.rpc('active_packing_days');
    if (res.error) throw res.error;
    return (res.data || []).filter(r => r && r.meal_date).filter(r => Number(r.planned_trays||0)+Number(r.sessions_count||0)+Number(r.cancelled_count||0)+Number(r.planned_bags||0)>0);
  }

  async function getActiveLogins(){
    try {
      const res = await supabaseClient.rpc('admin_active_login_locks');
      if (res.error) return Array.isArray(window.activeLoginsCache) ? window.activeLoginsCache : [];
      return res.data || [];
    } catch(e) {
      return Array.isArray(window.activeLoginsCache) ? window.activeLoginsCache : [];
    }
  }

  async function getStationLines(){
    try {
      const res = await supabaseClient.rpc('admin_station_overview');
      if (res.error) return Array.isArray(window.activeLinesCache) ? window.activeLinesCache : [];
      return res.data || [];
    } catch(e) {
      return Array.isArray(window.activeLinesCache) ? window.activeLinesCache : [];
    }
  }

  async function refreshDashboard(){
    const box = ensureDashboard();
    if (!box || typeof supabaseClient === 'undefined') return;

    try {
      const days = await getActiveDays();
      const logins = await getActiveLogins();
      const lines = await getStationLines();
      const activeLines = (lines || []).filter(x => String(x.line_status || '').toLowerCase() === 'active').length;

      const plannedBags = days.reduce((s,r) => s + Number(r.planned_bags || 0), 0);
      const plannedTrays = days.reduce((s,r) => s + Number(r.planned_trays || 0), 0);
      const sessions = days.reduce((s,r) => s + Number(r.sessions_count || 0), 0);
      const cancelled = days.reduce((s,r) => s + Number(r.cancelled_count || 0), 0);

      box.innerHTML = renderDashboard({
        days,
        activeDays: days.length,
        plannedBags,
        plannedTrays,
        sessions,
        packedBags: sessions,
        cancelled,
        logins: (logins || []).length,
        activeLines
      });
    } catch(err) {
      box.innerHTML = `<div class="dashCard dashRed"><h3>Pulpit operacyjny</h3><div class="dashMuted">Nie udało się pobrać danych pulpitu: ${String(err.message || err)}</div></div>`;
    }
  }

  function wrapRefresh(){
    const old = window.refreshAdminData;
    if (typeof old !== 'function' || old.__dashboardWrap) return;
    const wrapped = async function(){
      const result = await old.apply(this, arguments);
      await refreshDashboard();
      return result;
    };
    wrapped.__dashboardWrap = true;
    window.refreshAdminData = wrapped;
  }

  function start(){
    ensureDashboard();
    wrapRefresh();
    refreshDashboard();
    setInterval(refreshDashboard, 30000);
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else start();
})();