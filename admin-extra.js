/*
  Dodatkowe funkcje admina:
  - tworzenie konta z nazwą wyświetlaną,
  - czyszczenie archiwum po zakresie meal_date.
*/

function adminExtraGetEmail(loginValue) {
  if (typeof getEmail === "function") return getEmail(loginValue);

  const value = String(loginValue || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("@")) return value;
  return value + "@pakowanie.local";
}

function adminExtraSetUserStatus(text, type = "info") {
  if (typeof setUserStatus === "function") {
    setUserStatus(text, type);
    return;
  }

  const box = document.getElementById("userStatus");
  if (!box) return;
  box.innerText = text;
  box.className = "statusBox " + type;
}

function adminExtraSetArchiveStatus(text, type = "info") {
  const box = document.getElementById("archiveClearStatus");
  if (!box) return;
  box.innerText = text;
  box.className = "statusBox " + type;
}

async function adminExtraCallFunction(functionName, payload) {
  if (typeof callAdminFunction === "function") {
    return await callAdminFunction(functionName, payload);
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token || currentSession?.access_token;

  if (!token) {
    throw new Error("Brak aktywnej sesji admina.");
  }

  const res = await fetch(`${PROJECT_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": PUBLISHABLE_KEY
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || json.message || "Błąd funkcji admina.");
  }

  return json;
}

async function createUserWithDisplayName() {
  const loginEl = document.getElementById("newUserLogin");
  const displayEl = document.getElementById("newUserDisplayName");
  const passwordEl = document.getElementById("newUserPassword");
  const roleEl = document.getElementById("newUserRole");
  const button = document.getElementById("createUserButton");

  const loginRaw = String(loginEl?.value || "").trim();
  const email = adminExtraGetEmail(loginRaw);
  const displayName = String(displayEl?.value || "").trim();
  const password = String(passwordEl?.value || "");
  const role = String(roleEl?.value || "worker");

  if (!email) {
    adminExtraSetUserStatus("❌ Wpisz login lub email nowego użytkownika.", "bad");
    loginEl?.focus();
    return;
  }

  if (!displayName) {
    adminExtraSetUserStatus("❌ Wpisz ładną nazwę użytkownika, np. Daria Malczewska.", "bad");
    displayEl?.focus();
    return;
  }

  if (!password || password.length < 6) {
    adminExtraSetUserStatus("❌ Hasło musi mieć minimum 6 znaków.", "bad");
    passwordEl?.focus();
    return;
  }

  if (button) {
    button.disabled = true;
    button.innerText = "Dodaję...";
  }

  adminExtraSetUserStatus("⏳ Dodaję użytkownika i zapisuję nazwę wyświetlaną...", "info");

  try {
    await adminExtraCallFunction("admin-create-user", {
      email,
      login: loginRaw,
      password,
      role,
      display_name: displayName,
      full_name: displayName
    });

    const { data, error } = await supabaseClient.rpc("admin_set_user_display_name_by_email", {
      target_user_email: email,
      target_display_name: displayName
    });

    if (error || data !== "OK") {
      adminExtraSetUserStatus(
        "⚠️ Konto zostało utworzone, ale nie udało się zapisać nazwy wyświetlanej: " + (error?.message || data),
        "warn"
      );
    } else {
      adminExtraSetUserStatus("✅ Dodano użytkownika: " + displayName + " (" + email + ") z rolą " + role, "ok");
    }

    if (loginEl) loginEl.value = "";
    if (displayEl) displayEl.value = "";
    if (passwordEl) passwordEl.value = "";

    if (typeof loadUsersList === "function") await loadUsersList();
    if (typeof loadQrUsers === "function") await loadQrUsers();

  } catch (err) {
    adminExtraSetUserStatus("❌ Nie udało się dodać użytkownika: " + err.message, "bad");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerText = "➕ Dodaj użytkownika";
    }
  }
}

async function clearArchiveBetweenDates() {
  const fromEl = document.getElementById("archiveClearDateFrom");
  const toEl = document.getElementById("archiveClearDateTo");
  const button = document.getElementById("clearArchiveButton");

  const dateFrom = String(fromEl?.value || "").trim();
  const dateTo = String(toEl?.value || "").trim();

  if (!dateFrom || !dateTo) {
    adminExtraSetArchiveStatus("❌ Wybierz datę od i datę do.", "bad");
    return;
  }

  if (dateFrom > dateTo) {
    adminExtraSetArchiveStatus("❌ Data OD nie może być późniejsza niż data DO.", "bad");
    return;
  }

  const confirmed = window.prompt(
    "UWAGA: usuniesz archiwum po dniu jedzonym od " + dateFrom + " do " + dateTo + ".\n" +
    "Tej operacji nie da się cofnąć.\n\n" +
    "Aby potwierdzić, wpisz dokładnie: USUN ARCHIWUM"
  );

  if (confirmed !== "USUN ARCHIWUM") {
    adminExtraSetArchiveStatus("⚠️ Czyszczenie archiwum anulowane.", "warn");
    return;
  }

  if (button) {
    button.disabled = true;
    button.innerText = "Czyszczę...";
  }

  adminExtraSetArchiveStatus("⏳ Czyszczę archiwum z zakresu " + dateFrom + " — " + dateTo + "...", "info");

  try {
    const { data, error } = await supabaseClient.rpc("admin_clear_archive_between_dates", {
      date_from: dateFrom,
      date_to: dateTo
    });

    if (error) {
      adminExtraSetArchiveStatus("❌ Nie udało się wyczyścić archiwum: " + error.message, "bad");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const status = String(row?.status || data || "");
    const deletedDays = Number(row?.deleted_days || 0);

    if (status === "OK") {
      adminExtraSetArchiveStatus("✅ Wyczyściłem archiwum. Usunięte dni: " + deletedDays + ". Zakres: " + dateFrom + " — " + dateTo + ".", "ok");
    } else if (status === "NO_ROWS") {
      adminExtraSetArchiveStatus("⚠️ W tym zakresie nie było archiwalnych dni do usunięcia.", "warn");
    } else if (status === "BAD_RANGE") {
      adminExtraSetArchiveStatus("❌ Błędny zakres dat.", "bad");
    } else {
      adminExtraSetArchiveStatus("❌ Nie udało się wyczyścić archiwum: " + (status || "Nieznany błąd."), "bad");
    }

  } catch (err) {
    adminExtraSetArchiveStatus("❌ Błąd czyszczenia archiwum: " + err.message, "bad");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerText = "🗑️ Wyczyść archiwum z zakresu";
    }
  }
}

function installAdminExtraOverrides() {
  const createBtn = document.getElementById("createUserButton");
  if (createBtn) {
    createBtn.onclick = event => {
      event.preventDefault();
      createUserWithDisplayName();
    };
  }

  const clearArchiveBtn = document.getElementById("clearArchiveButton");
  if (clearArchiveBtn) {
    clearArchiveBtn.onclick = event => {
      event.preventDefault();
      clearArchiveBetweenDates();
    };
  }

  const loginEl = document.getElementById("newUserLogin");
  const displayEl = document.getElementById("newUserDisplayName");
  const passwordEl = document.getElementById("newUserPassword");

  loginEl?.addEventListener("keydown", e => {
    if (e.key === "Enter") displayEl?.focus();
  });

  displayEl?.addEventListener("keydown", e => {
    if (e.key === "Enter") passwordEl?.focus();
  });

  passwordEl?.addEventListener("keydown", e => {
    if (e.key === "Enter") createUserWithDisplayName();
  });
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installAdminExtraOverrides);
} else {
  installAdminExtraOverrides();
}
