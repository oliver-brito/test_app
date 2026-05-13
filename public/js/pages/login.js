// Login page entry.

import "../ui/errorModal.js";
import "../ui/apiDebugConsole.js";
import { apiCall } from "../shared/api.js";

const $form = document.getElementById("loginForm");
const $error = document.getElementById("error");
const $loading = document.getElementById("loading");
const $loginBtn = document.getElementById("loginBtn");
const $sessionExpiredInfo = document.getElementById("sessionExpiredInfo");

const urlParams = new URLSearchParams(window.location.search);
const sessionExpired = urlParams.get("session_expired") === "true";
const returnUrl = urlParams.get("return_url") || "/index.html";

if (sessionExpired) $sessionExpiredInfo.style.display = "block";

document.querySelector(".password-toggle")?.addEventListener("click", () => {
  const $password = document.getElementById("password");
  const $toggle = document.querySelector(".password-toggle");
  if ($password.type === "password") {
    $password.type = "text";
    $toggle.textContent = "🙈 Hide";
  } else {
    $password.type = "password";
    $toggle.textContent = "👁️ Show";
  }
});

async function loadDefaultCredentials() {
  try {
    const response = await fetch("/auth/defaults");
    if (response.ok) {
      const defaults = await response.json();
      document.getElementById("apiBase").value = defaults.apiBase || "";
      document.getElementById("username").value = defaults.username || "";
      document.getElementById("password").value = defaults.password || "";
    }
  } catch (error) {
    console.warn("Could not load default credentials:", error);
  }
}

$form.addEventListener("submit", async (e) => {
  e.preventDefault();
  $error.classList.remove("show");
  $error.textContent = "";
  $loading.classList.add("show");
  $loginBtn.disabled = true;

  const credentials = {
    apiBase: document.getElementById("apiBase").value.trim(),
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
  };

  try {
    const data = await apiCall("/login", {
      method: "POST",
      body: credentials,
      showErrorModal: true,
    });

    if (data && data.session) {
      sessionStorage.setItem("av_credentials", JSON.stringify(credentials));
      sessionStorage.setItem(
        "av_session",
        JSON.stringify({
          session: data.session,
          version: data.version,
          username: credentials.username,
          customerId: data.customerId,
        })
      );
      window.location.href = returnUrl;
    } else {
      $error.textContent = "❌ " + (data?.error || "Login failed");
      $error.classList.add("show");
    }
  } catch (error) {
    $error.textContent = "❌ " + error.message;
    $error.classList.add("show");
  } finally {
    $loading.classList.remove("show");
    $loginBtn.disabled = false;
  }
});

loadDefaultCredentials();
