/*
  Wersja panelu admin bez widocznych sekcji:
  - Pakowanie stanowiskowe — podgląd hali
  - Aktywne logowania

  Stare funkcje zostają w app.js dla zgodności, ale odświeżanie panelu nie odpytuje już tych sekcji.
*/

async function refreshAdminData() {
  await Promise.allSettled([
    loadUsersList(),
    loadMealDate(),
    loadOperationalStatus(),
    loadQrUsers()
  ]);
}
