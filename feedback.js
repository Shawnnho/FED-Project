/* =========================================
   BUTTON REDIRECTS
========================================= */

function writeReview() {
  // Redirects to the Review page
  // Make sure your review file is named 'review.html' or 'Review-tab.html'
  window.location.href = "review.html"; 
}

function fileComplaint() {
  // Redirects to the Complaint page
  window.location.href = "complaint.html";
}

function viewHistory() {
  // Keep this as an alert for now unless you have a history page ready
  alert("Opening Feedback History...");
}

/* =========================================
   MOBILE HAMBURGER MENU LOGIC
========================================= */
document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuBtn");
  const navMobile = document.getElementById("navMobile");
  const navBackdrop = document.getElementById("navBackdrop");

  // Safety check
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

  // Close menu when clicking a link inside it
  navMobile.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
});