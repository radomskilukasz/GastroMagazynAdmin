/*
  Dodatkowe funkcje admina:
  - tworzenie konta z nazwą wyświetlaną,
  - czyszczenie archiwum po zakresie meal_date.

  Ważne:
  app.js podpina do createUserButton starą funkcję createUser() przez addEventListener.
  Samo ustawienie onclick nie usuwa tego listenera, więc wcześniej odpalały się dwie funkcje:
  1) stara createUser() bez display_name,
  2) nowa createUserWithDisplayName().
  Dlatego przy instalacji nadpisania wymieniamy przycisk na klona i dopiero do niego podpinamy nową funkcję.
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

async function createUserWithDisplayName(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

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
    const result = await adminExtraCallFunction("admin-create-user", {
      login: loginRaw,
      email,
      password,
      role,
      display_name: displayName,
      full_name: displayName,
      displayName,
      fullName: displayName,
      user_metadata: {
        display_name: displayName,
        full_name: displayName,
        name: displayName
      }
    });

    const functionOk = result?.ok === true || result?.status === "OK" || result?.message;

    if (!functionOk && result?.error) {
      throw new Error(result.error);
    }

    let displayNameSaved = false;
    let displayNameWarning = "";

    try {
      const { data, error } = await supabaseClient.rpc("admin_set_user_display_name_by_email", {
        target_user_email: email,
        target_display_name: displayName
      });

      if (error || data !== "OK") {
        displayNameWarning = error?.message || data || "funkcja nie zwróciła OK";
      } else {
        displayNameSaved = true;
      }
    } catch (displayErr) {
      displayNameWarning = displayErr.message;
    }

    if (displayNameSaved) {
      adminExtraSetUserStatus("✅ Dodano użytkownika: " + displayName + " (" + email + ") z rolą " + role, "ok");
    } else {
      adminExtraSetUserStatus(
        "✅ Konto zostało utworzone: " + email + " z rolą " + role + "\n" +
        "⚠️ Dodatkowy zapis nazwy przez RPC nie potwierdził OK: " + displayNameWarning + "\n" +
        "Jeżeli Edge Function admin-create-user obsługuje display_name, nazwa mogła mimo tego zapisać się w metadanych.",
        "warn"
      );
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

function replaceButtonWithoutOldListeners(buttonId, handler) {
  const oldButton = document.getElementById(buttonId);
  if (!oldButton || !oldButton.parentNode) return null;

  const newButton = oldButton.cloneNode(true);
  newButton.removeAttribute("onclick");
  newButton.addEventListener("click", handler);
  oldButton.parentNode.replaceChild(newButton, oldButton);
  return newButton;
}

function installAdminExtraOverrides() {
  replaceButtonWithoutOldListeners("createUserButton", event => createUserWithDisplayName(event));

  replaceButtonWithoutOldListeners("clearArchiveButton", event => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    clearArchiveBetweenDates();
  });

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
    if (e.key === "Enter") createUserWithDisplayName(e);
  });
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installAdminExtraOverrides);
} else {
  installAdminExtraOverrides();
}
