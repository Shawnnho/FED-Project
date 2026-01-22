/**************************************
 * menu.js
 * Shared mobile hamburger navigation
 **************************************/

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuBtn");
  const navMobile = document.getElementById("navMobile");
  const navBackdrop = document.getElementById("navBackdrop");

  // safety check (prevents errors on pages without the menu)
  if (!menuBtn || !navMobile || !navBackdrop) return;

  function openMenu() {
    navMobile.classList.add("open");
    navBackdrop.classList.add("open");
    document.body.classList.add("menuOpen");
    menuBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    navMobile.classList.remove("open");
    navBackdrop.classList.remove("open");
    document.body.classList.remove("menuOpen");
    menuBtn.setAttribute("aria-expanded", "false");
  }

  menuBtn.addEventListener("click", () => {
    const isOpen = navMobile.classList.contains("open");
    isOpen ? closeMenu() : openMenu();
  });

  navBackdrop.addEventListener("click", closeMenu);

  // close menu when clicking a link
  navMobile.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  // ESC key closes menu
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
});
// Auto set ACTIVE link based on current filename
const current = window.location.pathname.split("/").pop() || "home.html";

document.querySelectorAll(".nav a.pill, #navMobile a.mLink").forEach((a) => {
  const href = (a.getAttribute("href") || "").split("?")[0];
  a.classList.toggle("active", href === current);
});
