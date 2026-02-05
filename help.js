// help.js
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const search = $("#faqSearch");
const chips = $$(".chip");
const items = $$(".faqItem");

let currentCat = "all";

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function applyFilters() {
  const q = normalize(search.value);

  items.forEach((card) => {
    const cat = card.getAttribute("data-cat") || "";
    const keywords = normalize(card.getAttribute("data-keywords"));
    const text = normalize(card.innerText);

    const matchCat = currentCat === "all" ? true : cat === currentCat;
    const matchSearch =
      q.length === 0 ? true : keywords.includes(q) || text.includes(q);

    card.style.display = matchCat && matchSearch ? "" : "none";
  });
}

chips.forEach((btn) => {
  btn.addEventListener("click", () => {
    chips.forEach((c) => c.classList.remove("isActive"));
    btn.classList.add("isActive");
    currentCat = btn.getAttribute("data-cat") || "all";
    applyFilters();
  });
});

if (search) search.addEventListener("input", applyFilters);

// accordion
$$(".faqQ").forEach((qBtn) => {
  qBtn.addEventListener("click", () => {
    const card = qBtn.closest(".faqItem");
    const ans = card.querySelector(".faqA");
    const isOpen = qBtn.getAttribute("aria-expanded") === "true";

    qBtn.setAttribute("aria-expanded", String(!isOpen));
    ans.hidden = isOpen;

    const icon = qBtn.querySelector(".faqIcon");
    if (icon) icon.textContent = isOpen ? "+" : "–";
  });
});
