const CART_KEY = "hp_cart";

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function money(n) {
  return (Number(n) || 0).toFixed(2);
}

function calcCount(cart) {
  let c = 0;
  for (const it of cart) c += Number(it.qty ?? it.quantity ?? 1) || 1;
  return c;
}

function updateBadges(count) {
  const el = document.getElementById("cartCount");
  if (el) {
    el.textContent = String(count);
    el.classList.toggle("isZero", count <= 0);
  }
  const elM = document.getElementById("cartCountMobile");
  if (elM) {
    elM.textContent = String(count);
    elM.classList.toggle("isZero", count <= 0);
  }
}

function render() {
  const list = document.getElementById("cartList");
  const empty = document.getElementById("cartEmpty");
  const summary = document.getElementById("cartSummary");
  const subText = document.getElementById("cartSub");

  const cart = readCart();
  const count = calcCount(cart);

  updateBadges(count);
  if (subText) subText.textContent = `${count} item${count === 1 ? "" : "s"}`;

  if (!list) return;

  list.innerHTML = "";

  if (cart.length === 0) {
    empty && (empty.hidden = false);
    summary && (summary.style.display = "none");
    return;
  }

  empty && (empty.hidden = true);
  summary && (summary.style.display = "");

  let subtotal = 0;

  cart.forEach((it, idx) => {
    const qty = Number(it.qty ?? it.quantity ?? 1) || 1;

    // Support both schemas:
    const name = it.name ?? it.itemName ?? "Item";
    const img = it.img ?? it.image ?? "images/defaultFood.png";
    const note = it.note ?? it.sideNote ?? "";
    const addons = Array.isArray(it.addons) ? it.addons : [];
    const required = Array.isArray(it.required) ? it.required : [];

    // if totalPrice is missing, derive from unitPrice * qty
    const unitPrice =
      Number(it.unitPrice ?? it.basePrice ?? it.price ?? 0) || 0;
    const line = Number(it.totalPrice) || unitPrice * qty;

    subtotal += line;

    const card = document.createElement("article");
    card.className = "menuCard cartCard";

    card.innerHTML = `
      <div class="menuImgWrap">
        <img src="${img}" alt="${name}" />
      </div>

      <div class="menuInfo">
        <div class="menuName">${name}</div>
        <div class="menuPrice">$${money(line)}</div>

        <div class="cartMeta">
          ${
            addons.length
              ? `<div class="cartMetaLine"><strong>Add-ons:</strong> ${addons
                  .map((a) => {
                    const label = a.label ?? a.name ?? "";
                    const price = Number(a.price);
                    return Number.isFinite(price) && price > 0
                      ? `${label} (+$${price.toFixed(2)})`
                      : label;
                  })
                  .join(", ")}</div>`
              : ""
          }
          ${required.length ? `<div class="cartMetaLine"><strong>Options:</strong> ${required.map((r) => `${r.groupTitle}: ${r.optionLabel}`).join(", ")}</div>` : ""}
          ${note ? `<div class="cartMetaLine"><strong>Note:</strong> ${note}</div>` : ""}
        </div>
      </div>

      <div class="cartQtyWrap">
        <button class="cartQtyBtn" data-act="plus" data-i="${idx}" type="button">+</button>
        <div class="cartQtyNum">${qty}</div>
        <button class="cartQtyBtn" data-act="minus" data-i="${idx}" type="button">−</button>
      </div>
    `;

    list.appendChild(card);
  });

  // Update totals
  const delivery = 0; // you can change later
  document.getElementById("sumSubtotal").textContent = money(subtotal);
  document.getElementById("sumDelivery").textContent = money(delivery);
  document.getElementById("sumTotal").textContent = money(subtotal + delivery);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;

  const act = btn.getAttribute("data-act");
  const i = Number(btn.getAttribute("data-i"));
  const cart = readCart();
  if (!cart[i]) return;

  const qty = Number(cart[i].qty ?? cart[i].quantity ?? 1) || 1;

  if (act === "plus") {
    cart[i].qty = qty + 1;
  }

  if (act === "minus") {
    if (qty <= 1) {
      // remove item if quantity hits 0
      cart.splice(i, 1);
    } else {
      cart[i].qty = qty - 1;
    }
  }

  // Recompute totalPrice if you want it stored
  const unitPrice =
    Number(cart[i]?.unitPrice ?? cart[i]?.basePrice ?? cart[i]?.price ?? 0) ||
    0;
  if (cart[i]) cart[i].totalPrice = unitPrice * cart[i].qty;

  saveCart(cart);
  render();
});

document.getElementById("checkoutBtn")?.addEventListener("click", () => {
  alert("Checkout next step (connect to your payment page).");
});

document.addEventListener("DOMContentLoaded", render);
window.addEventListener("pageshow", render);
window.addEventListener("storage", (e) => e.key === CART_KEY && render());
