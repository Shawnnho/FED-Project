const form = document.getElementById("loginForm");
const emailOrPhone = document.getElementById("emailOrPhone");
const password = document.getElementById("password");
const rememberMe = document.getElementById("rememberMe");
const emailError = document.getElementById("emailError");
const pwError = document.getElementById("pwError");
const statusMsg = document.getElementById("statusMsg");

const togglePasswordBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");
const roleButtons = Array.from(document.querySelectorAll(".role"));

let selectedRole = "guest";

// ===== Load remembered value =====
(function initRemembered() {
  const saved = localStorage.getItem("hawker_remember_user");
  if (saved) {
    emailOrPhone.value = saved;
    rememberMe.checked = true;
  }
})();

// ===== Role selection =====
roleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    roleButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    selectedRole = btn.dataset.role;
  });
});

// ===== Toggle password (IMAGE SWAP ONLY) =====
togglePasswordBtn.addEventListener("click", () => {
  const isHidden = password.type === "password";

  password.type = isHidden ? "text" : "password";

  eyeIcon.src = isHidden ? "images/show.png" : "images/hide.png";
  eyeIcon.alt = isHidden ? "Hide password" : "Show password";

  togglePasswordBtn.setAttribute(
    "aria-label",
    isHidden ? "Hide password" : "Show password",
  );
});

// ===== Validation =====
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhone(value) {
  return /^[89]\d{7}$/.test(value.trim());
}

function validate() {
  let ok = true;
  emailError.textContent = "";
  pwError.textContent = "";
  statusMsg.textContent = "";

  const user = emailOrPhone.value.trim();
  const pw = password.value;

  if (!user) {
    emailError.textContent = "Please enter your email or phone number.";
    ok = false;
  } else if (!(isEmail(user) || isPhone(user))) {
    emailError.textContent = "Enter a valid email or SG phone (8 digits).";
    ok = false;
  }

  if (!pw) {
    pwError.textContent = "Please enter your password.";
    ok = false;
  } else if (pw.length < 6) {
    pwError.textContent = "Password must be at least 6 characters.";
    ok = false;
  }

  return ok;
}

// ===== Submit =====
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validate()) return;

  const user = emailOrPhone.value.trim();

  if (rememberMe.checked) {
    localStorage.setItem("hawker_remember_user", user);
  } else {
    localStorage.removeItem("hawker_remember_user");
  }

  statusMsg.textContent = `✅ Signed in as ${selectedRole} (${user})`;
});
