/*
  Admin CSV modes:
  - plan dnia: data tylko z delivery_date w CSV
  - odwołane diety: ten sam CSV, data tylko z delivery_date w CSV
*/
(function(){
  if (window.__adminCsvDateModesInstalled) return;
  window.__adminCsvDateModesInstalled = true;

  function box(id){ return document.getElementById(id); }

  function hideFormGroup(inputId){
    const input = box(inputId);
    if (!input) return;
    const group = input.closest('.formGroup');
    if (group) group.style.display = 'none';
  }

  function getCsvDateOrShowError(parsed, setStatusFn, label){
    const dates = typeof getCsvMealDates === 'function'
      ? getCsvMealDates(parsed)
      : [];

    if (!dates.length) {
      setStatusFn('❌ CSV ' + label + ' musi zawierać kolumnę delivery_date z jedną datą.', 'bad');
      return '';
    }

    if (dates.length > 1) {
      setStatusFn(
        '❌ CSV ' + label + ' zawiera więcej niż jedną datę: ' + dates.map(formatDatePL).join(', ') + '. Wgraj osobny plik dla jednego dnia.',
        'bad'
      );
      return '';
    }

    return dates[0];
  }

  function applyAdminTexts(){
    hideFormGroup('mealDateInput');
    hideFormGroup('postReportMealDateInput');

    const mealDateStatus = box('mealDateStatus');
    if (mealDateStatus) {
      mealDateStatus.textContent = 'Dzień jedzony będzie pobrany automatycznie z kolumny delivery_date w CSV.';
      mealDateStatus.className = 'statusBox info';
    }

    const uploadButton = box('uploadButton');
    if (uploadButton) uploadButton.textContent = '⬆️ Wgraj plan dnia CSV';

    const fileInput = box('fileInput');
    const importSection = fileInput ? fileInput.closest('.adminSection') : null;
    if (importSection) {
      const title = importSection.querySelector('h2');
      const hint = importSection.querySelector('.sectionHint');
      const label = importSection.querySelector('label[for="fileInput"], label');
      const tip = importSection.querySelector('.adminTip');

      if (title) title.textContent = '📥 Wgrywanie planu dnia CSV';
      if (hint) hint.textContent = 'Wgraj plan pakowania i dane klienta. Data dnia jedzonego jest brana z kolumny delivery_date w CSV.';
      if (label && String(label.textContent || '').toLowerCase().includes('plik csv')) label.textContent = 'CSV planu dnia';
      if (tip) {
        tip.innerHTML = '<b>Format CSV:</b><br><code>client_id;delivery_date;zone;default_diet;variant;calories;bag_qr;tray_qr;meal;code;size;dish_name</code><br><br>Nie podajesz daty ręcznie. CSV musi zawierać dokładnie jedną datę w kolumnie <b>delivery_date</b>.';
      }
    }

    const cancelInput = box('postReportDeleteFile');
    const cancelSection = cancelInput ? cancelInput.closest('.adminSection') : null;
    if (cancelSection) {
      const title = cancelSection.querySelector('h2');
      const hint = cancelSection.querySelector('.sectionHint');
      const labels = cancelSection.querySelectorAll('label');
      const previewButton = box('previewPostReportDeleteButton');
      const executeButton = box('executePostReportDeleteButton');
      const tip = cancelSection.querySelector('.adminTip');
      const status = box('postReportDeleteStatus');

      if (title) title.textContent = '🚫 Wgrywanie CSV odwołanych diet';
      if (hint) hint.textContent = 'Wgraj taki sam CSV jak plan dnia, ale zawierający diety/torby do odwołania. Data jest brana z delivery_date.';
      labels.forEach(function(label){
        if (String(label.textContent || '').toLowerCase().includes('csv')) label.textContent = 'CSV odwołanych diet';
      });
      if (previewButton) previewButton.textContent = '🔎 Sprawdź CSV odwołanych diet';
      if (executeButton) executeButton.textContent = '⛔ Odwołaj diety z CSV';
      if (tip) {
        tip.innerHTML = 'Wgraj <b>ten sam format CSV</b> co przy planie dnia. System odczyta <b>delivery_date</b> oraz unikalne <b>bag_qr</b>, a następnie oznaczy te torby/diety jako odwołane dla tej daty.';
      }
      if (status) {
        status.textContent = 'Status: wybierz CSV odwołanych diet. Data zostanie pobrana z kolumny delivery_date.';
        status.className = 'statusBox info';
      }
    }
  }

  const originalUpload = window.upload;
  window.upload = async function(){
    const file = box('fileInput') && box('fileInput').files ? box('fileInput').files[0] : null;
    if (!file) {
      setUploadStatus('❌ Wybierz CSV planu dnia.', 'bad');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsvDocument(text);
      const csvDate = getCsvDateOrShowError(parsed, setUploadStatus, 'planu dnia');
      if (!csvDate) return;

      if (box('mealDateInput')) box('mealDateInput').value = csvDate;
      setMealDateStatus('Dzień jedzony z CSV: ' + formatDatePL(csvDate), 'ok');
    } catch(err) {
      setUploadStatus('❌ Nie udało się odczytać daty z CSV: ' + err.message, 'bad');
      return;
    }

    if (typeof originalUpload === 'function') return originalUpload.apply(this, arguments);
  };

  const originalPreviewPostReportDelete = window.previewPostReportDelete;
  window.previewPostReportDelete = async function(){
    const file = box('postReportDeleteFile') && box('postReportDeleteFile').files ? box('postReportDeleteFile').files[0] : null;
    if (!file) {
      setPostReportDeleteStatus('❌ Wybierz CSV odwołanych diet.', 'bad');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsvDocument(text);
      const csvDate = getCsvDateOrShowError(parsed, setPostReportDeleteStatus, 'odwołanych diet');
      if (!csvDate) return;

      if (box('postReportMealDateInput')) box('postReportMealDateInput').value = csvDate;
      setPostReportDeleteStatus('⏳ Data z CSV: ' + formatDatePL(csvDate) + '. Sprawdzam torby do odwołania...', 'info');
    } catch(err) {
      setPostReportDeleteStatus('❌ Nie udało się odczytać daty z CSV odwołanych diet: ' + err.message, 'bad');
      return;
    }

    if (typeof originalPreviewPostReportDelete === 'function') return originalPreviewPostReportDelete.apply(this, arguments);
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', applyAdminTexts);
  } else {
    applyAdminTexts();
  }

  setTimeout(applyAdminTexts, 500);
  setTimeout(applyAdminTexts, 1200);
})();
