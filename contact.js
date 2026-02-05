// contact.js
const $ = (id) => document.getElementById(id);

const form = $("contactForm");
const success = $("contactSuccess");

function setErr(id, msg) {
  const el = $(id);
  if (el) el.textContent = msg || "";
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = ($("name").value || "").trim();
    const email = ($("email").value || "").trim();
    const role = $("role").value;
    const category = $("category").value;
    const message = ($("message").value || "").trim();

    // reset errors
    setErr("errName", "");
    setErr("errEmail", "");
    setErr("errRole", "");
    setErr("errCategory", "");
    setErr("errMessage", "");
    if (success) success.hidden = true;

    let ok = true;

    if (name.length < 2) {
      setErr("errName", "Please enter your name.");
      ok = false;
    }
    if (!isEmail(email)) {
      setErr("errEmail", "Please enter a valid email.");
      ok = false;
    }
    if (!role) {
      setErr("errRole", "Please select a role.");
      ok = false;
    }
    if (!category) {
      setErr("errCategory", "Please select a category.");
      ok = false;
    }
    if (message.length < 10) {
      setErr("errMessage", "Message should be at least 10 characters.");
      ok = false;
    }

    if (!ok) return;

    form.reset();
    if (success) success.hidden = false;
  });
}
