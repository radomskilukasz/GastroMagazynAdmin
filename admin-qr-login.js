/* QR logowanie do panelu administratora — tylko rola admin. */
(function(){
  var QR_FN = 'qr-login-session';

  function loadCssOnce(hrefPart, href){
    if (!document.querySelector('link[href*="' + hrefPart + '"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
  }

  function loadAdminTabs(){
    loadCssOnce('admin-tabs.css', 'admin-tabs.css?v=2');
    loadCssOnce('admin-tabs-polish.css', 'admin-tabs-polish.css?v=1');

    if (!document.querySelector('script[src*="admin-tabs.js"]')) {
      var script = document.createElement('script');
      script.src = 'admin-tabs.js?v=2';
      script.async = false;
      document.body.appendChild(script);
    }
  }

  function byId(id){ return document.getElementById(id); }
  function norm(value){ return String(value || '').trim().replace(/\s+/g, ''); }

  function addStyles(){
    if (byId('adminQrLoginStyles')) return;
    var style = document.createElement('style');
    style.id = 'adminQrLoginStyles';
    style.textContent = '.adminQrLoginBox{margin:16px 0 18px;padding:16px;border-radius:18px;background:rgba(249,115,22,.10);border:1px solid rgba(249,115,22,.25)}.adminQrLoginBox label{color:#fdba74;font-weight:900}.adminQrLoginInput{width:100%;min-height:50px;margin-top:8px;border:2px solid rgba(249,115,22,.45);border-radius:14px;padding:12px 14px;font-size:18px;font-weight:800;outline:none;background:#09111b;color:#f8fafc}.adminQrLoginInput:focus{box-shadow:0 0 0 4px rgba(249,115,22,.16)}.adminQrLoginBtn{width:100%;margin-top:10px}.adminQrDivider{display:flex;align-items:center;gap:10px;margin:16px 0 12px;color:#94a3b8;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.adminQrDivider:before,.adminQrDivider:after{content:"";height:1px;background:rgba(148,163,184,.24);flex:1}';
    document.head.appendChild(style);
  }

  function focusQr(){
    var input = byId('adminQrLoginInput');
    if (!input) return;
    setTimeout(function(){ input.focus(); input.click(); }, 80);
  }

  function injectUi(){
    addStyles();
    var loginInput = byId('adminLogin');
    if (!loginInput || byId('adminQrLoginBox')) return;

    var box = document.createElement('div');
    box.id = 'adminQrLoginBox';
    box.className = 'adminQrLoginBox';
    box.innerHTML = '<label>Kod QR administratora</label><input id="adminQrLoginInput" class="adminQrLoginInput" placeholder="Zeskanuj kod QR admina" autocomplete="off"><button id="adminQrLoginButton" type="button" class="loginBtn adminQrLoginBtn">Zaloguj kodem QR</button><div class="adminQrDivider">albo login i hasło</div>';

    var firstLabel = loginInput.previousElementSibling;
    loginInput.parentNode.insertBefore(box, firstLabel || loginInput);

    var btn = byId('adminQrLoginButton');
    var input = byId('adminQrLoginInput');
    if (btn) btn.addEventListener('click', adminQrLogin);
    if (input) input.addEventListener('keydown', function(e){ if (e.key === 'Enter') adminQrLogin(); });

    focusQr();
  }

  function updateTexts(){
    var sections = Array.prototype.slice.call(document.querySelectorAll('.adminSection'));
    var qrSection = sections.find(function(section){ return section.textContent.indexOf('Kody QR logowania') !== -1; });
    if (!qrSection) return;
    var hint = qrSection.querySelector('.sectionHint');
    if (hint) hint.innerText = 'Generuj kody QR dla workerów, managerów i adminów.';
    var tip = qrSection.querySelector('.adminTip');
    if (tip) tip.innerHTML = 'Wygenerowanie nowego QR zastępuje poprzedni kod użytkownika. QR działa dla <b>workerów, managerów i adminów</b>. Login i hasło nadal działają awaryjnie.';
  }

  async function adminQrLogin(){
    var input = byId('adminQrLoginInput');
    var button = byId('adminQrLoginButton');
    var token = norm(input ? input.value : '');

    if (!token) {
      setLoginStatus('❌ Zeskanuj kod QR administratora.', 'bad');
      focusQr();
      return;
    }

    setLoginStatus('⏳ Sprawdzam kod QR admina...', 'info');
    if (input) input.disabled = true;
    if (button) { button.disabled = true; button.innerText = 'Sprawdzam QR...'; }

    try {
      var res = await fetch(PROJECT_URL + '/functions/v1/' + QR_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': PUBLISHABLE_KEY },
        body: JSON.stringify({ raw_token: token, token: token, user_agent: navigator.userAgent || null })
      });

      var json = await res.json().catch(function(){ return {}; });

      if (!res.ok) {
        setLoginStatus('❌ Nie udało się zalogować QR: ' + (json.error || json.message || 'Nieznany błąd.'), 'bad');
        if (input) input.value = '';
        focusQr();
        return;
      }

      var session = json.session || (json.data && json.data.session) || json;
      var accessToken = session.access_token || json.access_token;
      var refreshToken = session.refresh_token || json.refresh_token;

      if (!accessToken || !refreshToken) {
        setLoginStatus('❌ Funkcja QR nie zwróciła pełnej sesji.', 'bad');
        if (input) input.value = '';
        focusQr();
        return;
      }

      var setResult = await supabaseClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      var setData = setResult.data;
      var setError = setResult.error;

      if (setError || !setData || !setData.session || !setData.session.user) {
        setLoginStatus('❌ Nie udało się ustawić sesji: ' + ((setError && setError.message) || 'brak użytkownika'), 'bad');
        if (input) input.value = '';
        focusQr();
        return;
      }

      var user = setData.session.user;
      var role = json.role || json.user_role || (json.data && (json.data.role || json.data.user_role)) || await getUserRole(user.id);

      if (!hasAccess(role, ['admin'])) {
        setLoginStatus('❌ Ten kod QR nie ma dostępu do panelu administratora.', 'bad');
        await supabaseClient.auth.signOut();
        if (input) input.value = '';
        focusQr();
        return;
      }

      currentSession = setData.session;
      if (byId('adminLoginBadge')) byId('adminLoginBadge').innerText = '✅ ' + displayLogin(user.email);
      setLoginStatus('✅ Zalogowano kodem QR: ' + displayLogin(user.email), 'ok');
      if (input) input.value = '';

      if (byId('loginScreen')) byId('loginScreen').classList.add('hidden');
      if (byId('adminPanel')) byId('adminPanel').classList.remove('hidden');
      loadAdminTabs();
      await refreshAdminData();

    } catch (err) {
      setLoginStatus('❌ Błąd logowania QR: ' + err.message, 'bad');
      if (input) input.value = '';
      focusQr();
    } finally {
      if (input) input.disabled = false;
      if (button) { button.disabled = false; button.innerText = 'Zaloguj kodem QR'; }
    }
  }

  window.adminQrLogin = adminQrLogin;

  var oldLogout = window.adminLogout;
  if (typeof oldLogout === 'function' && !window.__adminQrLogoutWrapped) {
    window.__adminQrLogoutWrapped = true;
    window.adminLogout = async function(){
      await oldLogout.apply(this, arguments);
      focusQr();
    };
  }

  function init(){ injectUi(); updateTexts(); loadAdminTabs(); }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init);
  else init();
})();
