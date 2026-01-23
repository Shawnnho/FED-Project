/* =========================================
   1. NAVIGATION & BUTTONS
========================================= */
function writeReview() {
  window.location.href = "review.html";
}

/* =========================================
   2. SUBMIT REVIEW (With Validation & Redirect)
========================================= */
function submitReview() {
  const btn = document.getElementById("submit-btn");
  const msg = document.getElementById("success-msg");
  const input = document.getElementById("review-text");
  const stall = document.getElementById("stall-select");
  const error = document.getElementById("error-msg");

  // CHECK: Has the user selected a stall?
  if (!stall.value) {
    error.innerText = "Please select a stall"; 
    error.style.display = "block";
    return; 
  }

  // CHECK: Is the review text empty?
  if (input.value.trim() === "") {
    error.innerText = "Please enter your review"; 
    error.style.display = "block";
    return; 
  }

  // IF ALL GOOD: Proceed
  error.style.display = "none";
  btn.style.display = "none";
  msg.style.display = "flex";

  // REDIRECT: Wait 3 seconds, then go to Home
  setTimeout(function() {
    window.location.href = "feedback.html";
  }, 1000);
}

/* =========================================
   3. STAR RATING LOGIC
========================================= */
if (document.getElementById("star-container")) {
  const stars = document.querySelectorAll(".star");
  
  stars.forEach(star => {
    star.addEventListener("click", function() {
      const value = parseInt(this.getAttribute("data-value"));
      stars.forEach(s => s.classList.remove("active"));
      for (let i = 0; i < value; i++) {
        stars[i].classList.add("active");
      }
    });
  });
  
  const dropdown = document.getElementById("stall-select");
  const stallHeader = document.getElementById("selected-stall-text");
  
  if (dropdown && stallHeader) {
    dropdown.addEventListener("change", function() {
      stallHeader.innerText = this.options[this.selectedIndex].text;
    });
  }
}

/* =========================================
   4. MOBILE HAMBURGER MENU (From Team's Code)
   This makes the mobile menu open/close
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