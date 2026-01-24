/*************************************************
 * item.js (FULL)
 * - Works for ALL stalls
 * - Add-ons affect price
 * - Required groups (free) must be selected before adding
 * - Saves to localStorage hp_cart
 * - Back goes to menu.html?id=...
 *************************************************/

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function readCart() {
  try {
    return JSON.parse(localStorage.getItem("hp_cart") || "[]");
  } catch {
    return [];
  }
}

function writeCart(cart) {
  localStorage.setItem("hp_cart", JSON.stringify(cart));
}

/* =========================================================
   MENU DATA (MUST MATCH stallmenu.js names)
   - addons: checkbox (+price)
   - requiredGroups: radio groups (FREE unless you set price)
========================================================= */
const menuByStall = {
  "ahmad-nasi-lemak": [
    {
      name: "Nasi Lemak",
      price: 7.0,
      img: "images/stalls/nasilemak.jpg",
      desc:
        "Fragrant coconut rice served with sambal, crispy anchovies, peanuts, egg, and cucumber. Simple, satisfying, and a local favourite.",
      addons: [
        { id: "more-rice", label: "More Rice", price: 0.5 },
        { id: "more-chicken", label: "More Chicken", price: 2.0 },
        { id: "extra-egg", label: "Extra Egg and Ikan Bilis", price: 1.0 },
      ],
      requiredGroups: [],
    },
    {
      name: "Fried Noodles",
      price: 6.7,
      img: "images/fried noodles.png",
      desc: "Wok-fried noodles with savoury seasoning and vegetables.",
      addons: [
        { id: "add-egg", label: "Add Egg", price: 1.0 },
        { id: "extra-chilli", label: "Extra Chilli", price: 0.3 },
      ],
      requiredGroups: [],
    },
    {
      name: "Satay (1 Dozen)",
      price: 10.5,
      img: "images/Satay 1D.png",
      desc: "Skewers grilled to perfection, served with peanut sauce.",
      addons: [{ id: "extra-sauce", label: "Extra Peanut Sauce", price: 0.5 }],
      requiredGroups: [],
    },
    {
      name: "Assam Laksa",
      price: 8.0,
      img: "images/Asaam Laks.png",
      desc: "Tangy, spicy broth with noodles and fresh toppings.",
      addons: [{ id: "more-noodles", label: "More Noodles", price: 0.8 }],
      requiredGroups: [],
    },
    {
      name: "Roti Canai",
      price: 5.0,
      img: "images/Roti canai.png",
      desc: "Crispy, flaky roti served with fragrant curry.",
      addons: [{ id: "extra-curry", label: "Extra Curry", price: 0.6 }],
      requiredGroups: [],
    },
    {
      name: "Chendul",
      price: 4.0,
      img: "images/Chendul.png",
      desc: "Classic icy dessert with gula melaka and coconut milk.",
      addons: [{ id: "more-gula", label: "More Gula Melaka", price: 0.4 }],
      requiredGroups: [],
    },
  ],

  "tiong-bahru": [
    {
      name: "Chicken Rice",
      price: 5.0,
      img: "images/stalls/chickenrice.png",
      desc:
        "Tender steamed chicken served with fragrant rice, paired with chilli and ginger sauce. Simple, comforting, and always a classic.",
      addons: [
        { id: "more-rice", label: "More Rice", price: 0.7 },
        { id: "more-chicken", label: "More Chicken", price: 1.2 },
      ],
      requiredGroups: [
        {
          id: "chicken-option",
          title: "Chicken Option (Required)",
          options: [
            { id: "steamed", label: "Steamed Chicken", price: 0 },
            { id: "roasted", label: "Roasted Chicken", price: 0 },
          ],
        },
      ],
    },
    {
      name: "Chicken Cutlet Rice",
      price: 5.5,
      img: "images/ChicCut.png",
      desc: "Crispy chicken cutlet with rice and house sauce.",
      addons: [{ id: "more-sauce", label: "More Sauce", price: 0.5 }],
      requiredGroups: [
        {
          id: "cutlet-sauce",
          title: "Sauce Choice (Required)",
          options: [
            { id: "pepper", label: "Pepper Sauce", price: 0 },
            { id: "mayo", label: "Mayo Sauce", price: 0 },
          ],
        },
      ],
    },
    {
      name: "Fried Rice",
      price: 5.5,
      img: "images/friedrice.png",
      desc: "Wok-fried rice with egg and vegetables.",
      addons: [{ id: "add-egg", label: "Add Egg", price: 1.0 }],
      requiredGroups: [],
    },
    {
      name: "Shredded Chicken Porridge",
      price: 6.0,
      img: "images/ShredChicPorr.png",
      desc: "Smooth porridge topped with shredded chicken.",
      addons: [{ id: "add-egg", label: "Add Egg", price: 1.0 }],
      requiredGroups: [],
    },
    {
      name: "Shredded Chicken Kway Teow",
      price: 6.0,
      img: "images/ShredChicKway.png",
      desc: "Silky kway teow with shredded chicken.",
      addons: [{ id: "more-chilli", label: "More Chilli", price: 0.2 }],
      requiredGroups: [],
    },
    {
      name: "Chicken Wings",
      price: 4.0,
      img: "images/ChicWing.png",
      desc: "Crispy wings, best with chilli sauce.",
      addons: [{ id: "extra-wings", label: "Add 2 More Wings", price: 2.0 }],
      requiredGroups: [],
    },
  ],

  "asia-wok": [
    {
      name: "Mee Goreng",
      price: 6.0,
      img: "images/mee goreng.png",
      desc: "Spicy stir-fried noodles with egg and veg.",
      addons: [{ id: "add-egg", label: "Add Egg", price: 1.0 }],
      requiredGroups: [
        {
          id: "spice",
          title: "Spice Level (Required)",
          options: [
            { id: "mild", label: "Mild", price: 0 },
            { id: "normal", label: "Normal", price: 0 },
            { id: "extra", label: "Extra Spicy", price: 0 },
          ],
        },
      ],
    },
    {
      name: "Fried Beef Dry Hor Fun",
      price: 8.0,
      img: "images/dry hor.png",
      desc: "Dry hor fun stir-fried with beef.",
      addons: [{ id: "more-beef", label: "More Beef", price: 2.0 }],
      requiredGroups: [],
    },
    {
      name: "Cereal Sliced Fish Rice",
      price: 8.5,
      img: "images/sliced fish.png",
      desc: "Cereal-coated fish slices with rice.",
      addons: [{ id: "more-fish", label: "More Fish", price: 2.5 }],
      requiredGroups: [],
    },
    {
      name: "Seafood White Bee Hoon",
      price: 9.0,
      img: "images/whitebeehoon.png",
      desc: "Bee hoon with mixed seafood.",
      addons: [{ id: "more-seafood", label: "More Seafood", price: 3.0 }],
      requiredGroups: [],
    },
    {
      name: "Hong Kong Noodle",
      price: 7.0,
      img: "images/hk noodle.png",
      desc: "Hong Kong style noodles with sauce.",
      addons: [{ id: "more-noodles", label: "More Noodles", price: 0.8 }],
      requiredGroups: [],
    },
    {
      name: "Black Pepper Chicken Cube Rice",
      price: 6.7,
      img: "images/BP.png",
      desc: "Black pepper chicken cubes over rice.",
      addons: [{ id: "more-chicken", label: "More Chicken", price: 2.0 }],
      requiredGroups: [],
    },
  ],

  "al-azhar": [
    {
      name: "Butter Chicken",
      price: 13.0,
      img: "images/ButtChic.png",
      desc: "Tender chicken cooked in a creamy, mildly spiced tomato sauce.",
      addons: [
        { id: "more-rice", label: "More Rice", price: 0.5 },
        { id: "extra-naan", label: "Add Naan", price: 2.0 },
      ],
      requiredGroups: [
        {
          id: "base",
          title: "Choice of Main (Required)",
          options: [
            { id: "plain-rice", label: "Plain Rice", price: 0 },
            { id: "plain-naan", label: "Plain Naan", price: 0 },
            { id: "butter-naan", label: "Butter Naan", price: 0 },
          ],
        },
      ],
    },
    {
      name: "Mutton Biryani",
      price: 13.0,
      img: "images/MuttBir.png",
      desc: "Fragrant biryani with tender mutton.",
      addons: [{ id: "add-raita", label: "Add Raita", price: 1.0 }],
      requiredGroups: [],
    },
    {
      name: "Chicken Biryani",
      price: 11.5,
      img: "images/ChicBir.png",
      desc: "Fragrant biryani with chicken.",
      addons: [{ id: "add-raita", label: "Add Raita", price: 1.0 }],
      requiredGroups: [],
    },
    {
      name: "Beef Biryani",
      price: 12.0,
      img: "images/BeefBir.png",
      desc: "Fragrant biryani with beef.",
      addons: [{ id: "add-raita", label: "Add Raita", price: 1.0 }],
      requiredGroups: [],
    },
    {
      name: "Nasi Sambal Goreng Chicken",
      price: 10.0,
      img: "images/Nasi Sam.png",
      desc: "Spicy sambal goreng with chicken over rice.",
      addons: [{ id: "extra-sambal", label: "Extra Sambal", price: 0.5 }],
      requiredGroups: [],
    },
    {
      name: "Tandoori Chicken",
      price: 9.0,
      img: "images/Tandoori.png",
      desc: "Smoky, grilled tandoori chicken.",
      addons: [{ id: "add-naan", label: "Add Naan", price: 2.0 }],
      requiredGroups: [
        {
          id: "spice",
          title: "Spice Level (Required)",
          options: [
            { id: "mild", label: "Mild", price: 0 },
            { id: "normal", label: "Normal", price: 0 },
            { id: "hot", label: "Hot", price: 0 },
          ],
        },
      ],
    },
  ],

  "fat-buddies": [
    {
      name: "Chicken Bolognese",
      price: 8.0,
      img: "images/ChicBolog.png",
      desc: "Classic bolognese with chicken mince.",
      addons: [
        { id: "more-pasta", label: "More Pasta", price: 2.0 },
        { id: "more-sauce", label: "More Sauce", price: 1.0 },
      ],
      requiredGroups: [],
    },
    {
      name: "Fish and Chips",
      price: 10.0,
      img: "images/F&C.png",
      desc: "Crispy fish with fries.",
      addons: [{ id: "more-fries", label: "More Fries", price: 2.0 }],
      requiredGroups: [
        {
          id: "side",
          title: "Sides (Required)",
          options: [
            { id: "coleslaw", label: "Coleslaw", price: 0 },
            { id: "salad", label: "Salad", price: 0 },
          ],
        },
      ],
    },
    {
      name: "Carbonara",
      price: 8.5,
      img: "images/CarbP.png",
      desc: "Creamy carbonara pasta.",
      addons: [{ id: "add-bacon", label: "Add Bacon", price: 2.0 }],
      requiredGroups: [],
    },
    {
      name: "Beef Burger",
      price: 9.0,
      img: "images/BeefBurg.png",
      desc: "Juicy beef burger with sauce.",
      addons: [{ id: "add-cheese", label: "Add Cheese", price: 1.0 }],
      requiredGroups: [
        {
          id: "cook",
          title: "Beef Doneness (Required)",
          options: [
            { id: "well", label: "Well Done", price: 0 },
            { id: "med", label: "Medium", price: 0 },
          ],
        },
      ],
    },
    {
      name: "Chicken Burger",
      price: 8.0,
      img: "images/ChicBurger.png",
      desc: "Crispy chicken burger.",
      addons: [{ id: "add-cheese", label: "Add Cheese", price: 1.0 }],
      requiredGroups: [],
    },
    {
      name: "Curly Fries",
      price: 4.0,
      img: "images/CurlyFri.png",
      desc: "Crispy curly fries.",
      addons: [{ id: "cheese-sauce", label: "Cheese Sauce", price: 1.0 }],
      requiredGroups: [],
    },
  ],
};

/* ===== READ URL ===== */
const params = new URLSearchParams(window.location.search);
const stallId = params.get("stall");
const itemSlug = params.get("item");

if (!stallId || !itemSlug || !menuByStall[stallId]) {
  // if missing, go back safely
  window.location.href = "home.html";
}

const item = (menuByStall[stallId] || []).find((x) => slugify(x.name) === itemSlug);
if (!item) {
  window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;
}

/* ===== DOM ===== */
const closeBtn = document.getElementById("closeBtn");
const itemImg = document.getElementById("itemImg");
const itemName = document.getElementById("itemName");
const itemBasePrice = document.getElementById("itemBasePrice");
const itemDesc = document.getElementById("itemDesc");
const addonsList = document.getElementById("addonsList");
const sideNoteEl = document.getElementById("sideNote");
const qtyMinus = document.getElementById("qtyMinus");
const qtyPlus = document.getElementById("qtyPlus");
const qtyVal = document.getElementById("qtyVal");
const addToCartBtn = document.getElementById("addToCartBtn");

/* ===== INIT UI ===== */
itemImg.src = item.img;
itemImg.alt = item.name;
itemName.textContent = item.name;
itemBasePrice.textContent = money(item.price);
itemDesc.textContent = item.desc || "";

/* ===== STATE ===== */
let qty = 1;
const selectedAddons = new Set();
// required picks: { groupId: optionId }
const requiredSelections = {};

/* ===== BUILD UI HELPERS ===== */
function buildSectionTitle(titleText) {
  const title = document.createElement("div");
  title.classList.add("itemSectionTitle");
  title.textContent = titleText;
  return title;
}

function buildDivider() {
  const hr = document.createElement("hr");
  hr.classList.add("itemDivider");
  return hr;
}

/* ===== BUILD ADDONS (checkbox) ===== */
function renderAddons() {
  addonsList.innerHTML = "";

  // If no addons + no required groups, show empty message (optional)
  const hasAddons = Array.isArray(item.addons) && item.addons.length > 0;
  const hasRequired = Array.isArray(item.requiredGroups) && item.requiredGroups.length > 0;

  // We will render required groups ABOVE addons to match your screenshot style.
  if (hasRequired) {
    item.requiredGroups.forEach((g, idx) => {
      // divider line between groups (like the screenshot)
      if (idx === 0) addonsList.appendChild(buildDivider());

      const groupTitle = document.createElement("div");
      groupTitle.classList.add("reqTitle");
      groupTitle.textContent = `— ${g.title}`;
      addonsList.appendChild(groupTitle);

      (g.options || []).forEach((opt) => {
        const row = document.createElement("label");
        row.classList.add("addonRow");

        const rb = document.createElement("input");
        rb.type = "radio";
        rb.name = `req_${g.id}`;
        rb.value = opt.id;

        rb.addEventListener("change", () => {
          requiredSelections[g.id] = opt.id;
          updateTotal();
        });

        const text = document.createElement("span");
        text.textContent = opt.label;

        // required options should show +$0.00
        const price = document.createElement("span");
        price.classList.add("addonPrice");
        price.textContent = opt.price ? `+ ${money(opt.price)}` : "+ $0.00";

        row.appendChild(rb);
        row.appendChild(text);
        row.appendChild(price);

        addonsList.appendChild(row);
      });

      addonsList.appendChild(buildDivider());
    });
  }

  // Add Ons section (checkbox)
  if (hasAddons) {
    const addOnLabel = document.createElement("div");
    addOnLabel.classList.add("reqTitle");
    addOnLabel.textContent = "— Add On’s";
    addonsList.appendChild(addOnLabel);

    item.addons.forEach((a) => {
      const row = document.createElement("label");
      row.classList.add("addonRow");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = a.id;

      cb.addEventListener("change", () => {
        if (cb.checked) selectedAddons.add(a.id);
        else selectedAddons.delete(a.id);
        updateTotal();
      });

      const text = document.createElement("span");
      text.textContent = a.label;

      const price = document.createElement("span");
      price.classList.add("addonPrice");
      price.textContent = `+ ${money(a.price)}`;

      row.appendChild(cb);
      row.appendChild(text);
      row.appendChild(price);

      addonsList.appendChild(row);
    });
  }

  // If nothing
  if (!hasAddons && !hasRequired) {
    const empty = document.createElement("div");
    empty.classList.add("emptyAddons");
    empty.textContent = "No add-ons available.";
    addonsList.appendChild(empty);
  }
}

renderAddons();

/* ===== PRICE CALC ===== */
function addonsTotal() {
  let sum = 0;
  (item.addons || []).forEach((a) => {
    if (selectedAddons.has(a.id)) sum += Number(a.price || 0);
  });
  return sum;
}

function requiredTotal() {
  let sum = 0;
  (item.requiredGroups || []).forEach((g) => {
    const picked = requiredSelections[g.id];
    const opt = (g.options || []).find((o) => o.id === picked);
    if (opt) sum += Number(opt.price || 0); // usually 0 (free)
  });
  return sum;
}

function unitPrice() {
  return Number(item.price || 0) + addonsTotal() + requiredTotal();
}

function allRequiredChosen() {
  const groups = item.requiredGroups || [];
  for (const g of groups) {
    if (!requiredSelections[g.id]) return false;
  }
  return true;
}

function updateTotal() {
  const ok = allRequiredChosen();
  const total = unitPrice() * qty;

  addToCartBtn.textContent = ok
    ? `Add to Cart (${money(total)})`
    : `Fill required options`;

  // disable if missing required
  addToCartBtn.disabled = !ok;
  addToCartBtn.classList.toggle("disabled", !ok);
}

updateTotal();

/* ===== NAV ===== */
closeBtn.addEventListener("click", () => {
  window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;
});

/* ===== QTY ===== */
qtyMinus.addEventListener("click", () => {
  qty = Math.max(1, qty - 1);
  qtyVal.textContent = qty;
  updateTotal();
});

qtyPlus.addEventListener("click", () => {
  qty += 1;
  qtyVal.textContent = qty;
  updateTotal();
});

/* ===== ADD TO CART ===== */
addToCartBtn.addEventListener("click", () => {
  if (!allRequiredChosen()) {
    alert("Please select all required options before adding to cart.");
    return;
  }

  const perItem = unitPrice();
  const total = perItem * qty;

  const chosenAddons = (item.addons || [])
    .filter((a) => selectedAddons.has(a.id))
    .map((a) => ({ id: a.id, label: a.label, price: a.price }));

  const chosenRequired = (item.requiredGroups || []).map((g) => {
    const optId = requiredSelections[g.id];
    const opt = (g.options || []).find((o) => o.id === optId);
    return {
      groupId: g.id,
      groupTitle: g.title,
      optionId: opt?.id || "",
      optionLabel: opt?.label || "",
      price: Number(opt?.price || 0), // should be 0 for required
    };
  });

  const cartItem = {
    stallId,
    itemId: slugify(item.name),
    name: item.name,
    img: item.img,
    qty,
    note: (sideNoteEl?.value || "").trim(),
    addons: chosenAddons,
    required: chosenRequired,
    unitPrice: perItem,
    totalPrice: total,
  };

  const cart = readCart();
  cart.push(cartItem);
  writeCart(cart);

  window.location.href = `menu.html?id=${encodeURIComponent(stallId)}`;
});
