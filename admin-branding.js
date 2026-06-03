(function(){
  const LOGO = 'logo-removebg-preview.png';
  const BRAND = 'GastroSystem';

  function applyBranding(){
    document.title = 'GastroSystem — Panel administratora';

    document.querySelectorAll('.loginLogo img, .adminLogo').forEach(img => {
      img.src = LOGO;
      img.alt = BRAND;
    });

    document.querySelectorAll('.adminSidebarBrand').forEach(el => {
      el.remove();
    });

    const loginTitle = document.querySelector('#loginScreen h1');
    if (loginTitle) {
      loginTitle.textContent = BRAND;
    }

    const loginSubtitle = document.querySelector('#loginScreen .loginSubtitle');
    if (loginSubtitle) {
      loginSubtitle.textContent = 'Panel administratora';
    }

    const header = document.querySelector('.adminHeader');
    const titleWrap = document.querySelector('.adminHeader .adminTitleWrap');
    if (header && titleWrap && !titleWrap.dataset.gastroBrandLayout) {
      titleWrap.dataset.gastroBrandLayout = '1';
      titleWrap.classList.add('gastroHeaderBrand');
    }

    const headerTitle = document.querySelector('.adminHeader h1');
    if (headerTitle) {
      headerTitle.textContent = BRAND;
    }

    const headerSubtitle = document.querySelector('.adminHeader p');
    if (headerSubtitle) {
      headerSubtitle.textContent = 'Panel administratora';
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', applyBranding);
  } else {
    applyBranding();
  }

  setTimeout(applyBranding, 120);
  setTimeout(applyBranding, 500);
  setTimeout(applyBranding, 1200);
  window.applyAdminBranding = applyBranding;
})();
