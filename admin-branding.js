(function(){
  const LOGO = 'logo-removebg-preview.png';
  const BRAND = 'GastroSystem';

  function applyBranding(){
    document.title = 'GastroSystem — Panel administratora';

    document.querySelectorAll('.loginLogo img, .adminLogo, .adminSidebarBrand img').forEach(img => {
      img.src = LOGO;
      img.alt = BRAND;
    });

    document.querySelectorAll('.brandName').forEach(el => {
      el.textContent = BRAND;
    });

    const loginTitle = document.querySelector('#loginScreen h1');
    if (loginTitle && !loginTitle.dataset.brandDone) {
      loginTitle.textContent = 'GastroSystem';
      loginTitle.dataset.brandDone = '1';
    }

    const headerTitle = document.querySelector('.adminHeader h1');
    if (headerTitle && !headerTitle.dataset.brandDone) {
      headerTitle.textContent = 'Panel administratora';
      headerTitle.dataset.brandDone = '1';
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', applyBranding);
  } else {
    applyBranding();
  }

  setTimeout(applyBranding, 250);
  setTimeout(applyBranding, 900);
  window.applyAdminBranding = applyBranding;
})();
