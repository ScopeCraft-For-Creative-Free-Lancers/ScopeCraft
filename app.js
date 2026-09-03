const PAYMENT_CHECKOUT_URL = "https://www.paypal.com/ncp/payment/BXRCHBQLJEEYU";
const LICENSE_KEY = "scopecraft_pro_unlocked";
const LICENSE_STORAGE_KEY = "scopecraft_license";
const DRAFT_KEY = "scopecraft_draft_data";
const REFERRAL_CODE_KEY = "scopecraft_user_ref_code";
const ACTIVE_REFERRAL_KEY = "scopecraft_active_referral";
const REFERRAL_PATTERN = /^SCOPE-[A-Z0-9]{4}$/;
const posthogCapture = (event, properties = {}) => {
  if (window.posthog?.capture) window.posthog.capture(event, properties);
};

const $ = (id) => document.getElementById(id);
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

function initializeMicroAnimations() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  qsa(".card:not(.sticky-breakdown)").forEach((card) => {
    card.addEventListener("mousemove", (event) => {
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      card.style.setProperty("--spot-x", `${x * 100}%`);
      card.style.setProperty("--spot-y", `${y * 100}%`);
      card.style.setProperty("--tilt-x", `${(x - 0.5) * 3}deg`);
      card.style.setProperty("--tilt-y", `${(0.5 - y) * 3}deg`);
    });
    card.addEventListener("mouseleave", () => {
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
    });
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled || button.classList.contains("star-btn")) return;
    const bounds = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ui-ripple";
    ripple.style.left = `${event.clientX - bounds.left}px`;
    ripple.style.top = `${event.clientY - bounds.top}px`;
    button.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
}

const currencyMeta = {
  USD: { symbol: "$", rate: 1 },
  EUR: { symbol: "€", rate: 0.92 },
  GBP: { symbol: "£", rate: 0.79 },
  EGP: { symbol: "E£", rate: 48.5 },
  CAD: { symbol: "$", rate: 1.36 },
  AED: { symbol: "AED ", rate: 3.67 },
  SAR: { symbol: "SAR ", rate: 3.75 }
};

const deliverables = {
  short: { hours: 8, rate: 60 },
  long: { hours: 16, rate: 180 },
  ad: { hours: 32, rate: 900 },
  podcast: { hours: 24, rate: 450 },
  custom: { hours: 20, rate: 600 }
};

const state = {
  mode: "project",
  currency: "USD",
  market: 1,
  isPro: localStorage.getItem(LICENSE_STORAGE_KEY) === "pro" || localStorage.getItem(LICENSE_KEY) === "true",
  projectTotal: 0,
  retainerFee: 0,
  changeTotal: 0,
  rowCounters: { milestone: 1, change: 1 },
  isExecuted: false
};

const FEEDBACK_ENDPOINT = "https://formspree.io/f/mwlkbzbd";
const BASELINE_TOTAL_STARS = 60;
const BASELINE_TOTAL_COUNT = 12;
let selectedRating = 0;

function updateHeaderRating() {
  let userFeedback = null;
  try {
    userFeedback = JSON.parse(localStorage.getItem("scopecraft_user_feedback") || "null");
  } catch (error) {
    console.error("Could not read saved feedback rating:", error);
  }
  let totalScore = BASELINE_TOTAL_STARS;
  let totalCount = BASELINE_TOTAL_COUNT;
  if (userFeedback?.rating) {
    const userStars = Number.parseInt(userFeedback.rating, 10) || 5;
    totalScore += userStars;
    totalCount += 1;
  }
  const average = (totalScore / totalCount).toFixed(1);
  const scoreElement = $("rating-score-text");
  const countElement = $("rating-count-text");
  if (scoreElement) scoreElement.innerText = average;
  if (countElement) countElement.innerText = `(${totalCount} reviews)`;
}

function getOrCreateReferralCode() {
  const existing = localStorage.getItem(REFERRAL_CODE_KEY);
  if (existing && REFERRAL_PATTERN.test(existing)) return existing;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const suffix = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const code = `SCOPE-${suffix}`;
  localStorage.setItem(REFERRAL_CODE_KEY, code);
  return code;
}

function initializeReferralSystem() {
  const refParam = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
  if (refParam) localStorage.setItem(ACTIVE_REFERRAL_KEY, refParam);
  const code = getOrCreateReferralCode();
  if ($("user-ref-code")) $("user-ref-code").textContent = code;
  applyReferralPricing();
}

function hasReferralDiscount() {
  return Boolean(localStorage.getItem(ACTIVE_REFERRAL_KEY));
}

function applyReferralPricing() {
  const discounted = hasReferralDiscount();
  const price = discounted ? "$23.20" : "$29";
  const priceElement = $("upgrade-price");
  const badge = $("referral-discount-badge");
  const label = $("upgrade-cta-label");
  if (priceElement) {
    priceElement.innerHTML = discounted
      ? '<span class="line-through text-slate-500 mr-2">$29</span> <span class="text-emerald-400 font-bold">$23.20 USD</span>'
      : "$29 USD — One-Time Payment";
  }
  badge?.classList.toggle("hidden", !discounted);
  if (label) label.textContent = `Unlock Lifetime (${price})`;
}

function money(value) {
  const meta = currencyMeta[state.currency];
  return `${meta.symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, value) * meta.rate)}`;
}

function rawUsd(value) {
  return value * currencyMeta[state.currency].rate;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 4200);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function animateMoney(id, value) {
  const node = $(id);
  if (!node) return;
  const start = Number(node.dataset.numericValue || 0);
  const end = Math.max(0, value);
  node.dataset.numericValue = String(end);
  const started = performance.now();
  const duration = 420;
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = money(start + (end - start) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function slamExecutedStamp() {
  const sheet = $("contract-canvas");
  const slot = $("preview-status-slot");
  if (!sheet || !slot) return;
  if (state.isExecuted) {
    state.isExecuted = false;
    sheet.classList.remove("is-executed", "contract-shake");
    slot.replaceChildren();
    return;
  }
  state.isExecuted = true;
  const stamp = createExecutedStamp();
  stamp.classList.remove("executed-stamp-visible");
  sheet.classList.remove("contract-shake");
  void stamp.offsetWidth;
  stamp.classList.add("executed-stamp-visible");
  stamp.setAttribute("aria-hidden", "false");
  sheet.classList.add("is-executed");
  sheet.classList.add("contract-shake");
}

function createExecutedStamp() {
  const stamp = document.createElement("div");
  stamp.id = "executed-stamp";
  stamp.className = "executed-stamp";
  stamp.setAttribute("aria-hidden", "true");
  stamp.innerHTML = '<span class="executed-stamp__dot"></span><span>EXECUTED</span>';
  stamp.addEventListener("click", slamExecutedStamp);
  $("preview-status-slot")?.append(stamp);
  return stamp;
}

function toggleContractDarkView() {
  const darkMode = document.body.classList.toggle("dark-mode");
  document.body.dataset.theme = darkMode ? "dark" : "light";
  $("contract-canvas")?.classList.toggle("contract-dark-view", darkMode);
}

const themeToggle = $("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", toggleContractDarkView);
}

function toggleContractFullscreen() {
  const sheet = $("contract-canvas");
  if (!sheet) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else sheet.requestFullscreen?.();
}

function closeDefendRateDrawer() {
  const drawer = $("drawer-negotiation");
  if (!drawer) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function checked(id) {
  return Boolean($(id)?.checked);
}

function riskCount() {
  return ["risk-brief", "risk-deadline", "risk-history", "risk-payments"].filter(checked).length;
}

function calculateProject() {
  const deliverableId = $("select-deliverable").value;
  const base = deliverables[deliverableId] || deliverables.custom;
  const footage = Number($("input-raw-footage").value);
  const turnaround = Number($("select-turnaround").value);
  const revisions = Math.max(0, Number($("input-revisions").value) || 0);
  const subtotal = base.rate * state.market;
  const footageFee = footage > 100 ? Math.ceil((footage - 100) / 50) * 15 : 0;
  const turnaroundFee = subtotal * Math.max(0, turnaround - 1);
  const revisionFee = subtotal * Math.max(0, revisions - 2) * 0.1;
  const addOnFees = [
    { id: "check-motion", fee: 50 },
    { id: "check-sound", fee: 75 },
    { id: "check-script", fee: 100 },
    { id: "check-reformat", fee: 150 }
  ].filter((item) => checked(item.id)).reduce((total, item) => total + item.fee, 0);
  const friction = riskCount() >= 2 ? Math.min(subtotal * 0.15, subtotal * 0.3) : 0;
  const uncappedTotal = subtotal + footageFee + turnaroundFee + revisionFee + addOnFees + friction;
  const ceiling = deliverableId === "ad" ? 6000 : 1500;
  const total = Math.min(uncappedTotal, ceiling);
  state.projectTotal = total;
  setText("text-raw-footage", `${footage}${footage >= 500 ? "+" : ""} GB`);
  setText("text-subtotal", money(subtotal));
  setText("text-market-adjustment", `${state.market.toFixed(2)}x`);
  setText("text-turnaround-fee", money(turnaroundFee + revisionFee + addOnFees));
  setText("text-friction-buffer", money(friction));
  animateMoney("text-grand-total", total);
  setText("text-required-deposit", money(riskCount() >= 2 ? total : total * 0.5));
  $("risk-warning").classList.toggle("hidden", riskCount() < 2);
  updatePreview();
}

function calculateRetainer() {
  const assets = Math.max(1, Number($("input-asset-volume").value) || 1);
  const discount = Number($("select-commitment").value);
  const priority = checked("check-priority-queue") ? 1.25 : 1;
  const perkLoad = (checked("perk-channel") ? 150 : 0) + (checked("perk-strategy") ? 250 : 0) + (checked("perk-rollover") ? 175 : 0);
  const fee = (assets * 175 + perkLoad) * state.market * priority * discount;
  state.retainerFee = fee;
  setText("text-retainer-fee", money(fee));
  setText("text-asset-cost", money(fee / assets));
  setText("text-monthly-floor", money(fee * 0.8));
  setText("text-subtotal", money(fee));
  setText("text-market-adjustment", `${state.market.toFixed(2)}x`);
  setText("text-turnaround-fee", money(priority > 1 ? fee - fee / priority : 0));
  setText("text-friction-buffer", money(0));
  animateMoney("text-grand-total", fee);
  setText("text-required-deposit", money(fee));
}

function calculateChangeOrder() {
  const benchmark = 75 * state.market;
  const total = qsa("#change-order-list .change-row").reduce((sum, row) => {
    const hours = Number(qs('input[id^="change-hours-"]', row)?.value) || 0;
    const rush = qs('input[id^="change-rush-"]', row)?.checked ? 1.5 : 1;
    return sum + hours * benchmark * rush;
  }, 0);
  state.changeTotal = total;
  setText("text-hourly-benchmark", `${money(75 * state.market)}/hr`);
  setText("text-amendment-total", money(total));
  setText("text-subtotal", money(total));
  setText("text-market-adjustment", `${state.market.toFixed(2)}x`);
  setText("text-turnaround-fee", money(0));
  setText("text-friction-buffer", money(0));
  animateMoney("text-grand-total", total);
  setText("text-required-deposit", money(total));
}

function calculate() {
  if (state.mode === "project") calculateProject();
  if (state.mode === "retainer") calculateRetainer();
  if (state.mode === "change-order") calculateChangeOrder();
  posthogCapture("calculator_updated", { mode: state.mode, currency: state.currency });
}

function activateTab(mode) {
  state.mode = mode;
  const tabs = { project: "tab-project", retainer: "tab-retainer", "change-order": "tab-change-order" };
  const panels = { project: "panel-project", retainer: "panel-retainer", "change-order": "panel-change-order" };
  Object.entries(tabs).forEach(([key, id]) => {
    const active = key === mode;
    $(id).classList.toggle("active", active);
    $(id).setAttribute("aria-selected", String(active));
  });
  Object.entries(panels).forEach(([key, id]) => $(id).classList.toggle("hidden", key !== mode));
  calculate();
}

function step(id, amount, min, max) {
  const input = $(id);
  input.value = Math.min(max, Math.max(min, (Number(input.value) || min) + amount));
  calculate();
}

function addMilestone() {
  state.rowCounters.milestone += 1;
  const n = state.rowCounters.milestone;
  const row = document.createElement("div");
  row.className = "milestone-row";
  row.innerHTML = `<input id="milestone-${n}-name" class="control flex-1" value="Delivery milestone ${n}"><input id="milestone-${n}-amount" class="control w-28" value="25" type="number" min="0" max="100" aria-label="Milestone percentage"><button id="btn-remove-milestone-${n}" class="icon-btn" aria-label="Remove milestone"><i data-lucide="trash-2"></i></button>`;
  $("milestone-list").append(row);
  bindDynamicRow(row, "milestone");
  refreshIcons();
}

function addChangeOrder() {
  state.rowCounters.change += 1;
  const n = state.rowCounters.change;
  const row = document.createElement("div");
  row.className = "change-row";
  row.innerHTML = `<input id="change-title-${n}" class="control flex-1" value="Additional production task"><input id="change-hours-${n}" class="control w-24" type="number" value="2" min="0" aria-label="Estimated hours"><label class="check"><input id="change-rush-${n}" type="checkbox"> Rush</label><button id="btn-remove-change-${n}" class="icon-btn" aria-label="Remove change"><i data-lucide="trash-2"></i></button>`;
  $("change-order-list").append(row);
  bindDynamicRow(row, "change");
  refreshIcons();
}

function bindDynamicRow(row, type) {
  row.addEventListener("input", calculate);
  const button = qs("button", row);
  button.addEventListener("click", () => {
    row.remove();
    calculate();
  });
  if (type === "milestone") {
    qsa("input", row).forEach((input) => input.addEventListener("input", updatePreview));
  }
}

function collectFormData() {
  return Object.fromEntries(qsa("input, select, textarea").filter((el) => el.id).map((el) => [el.id, el.type === "checkbox" ? el.checked : el.value]));
}

function restoreFormData(data) {
  Object.entries(data || {}).forEach(([id, value]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value;
  });
  calculate();
}

function updatePreview() {
  if (!$("preview-logo-slot").firstElementChild) {
    $("preview-logo-slot").innerHTML = `<svg class="h-10 w-10" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="ScopeCraft logo"><rect width="80" height="80" rx="18" fill="#121215"/><rect x=".75" y=".75" width="78.5" height="78.5" rx="17.25" stroke="#27272a" stroke-width="1.5"/><path d="M23 34V26c0-1.66 1.34-3 3-3h8M46 23h8c1.66 0 3 1.34 3 3v8M57 46v8c0 1.66-1.34 3-3 3h-8M34 57h-8c-1.66 0-3-1.34-3-3v-8" stroke="#71717a" stroke-width="2.5" stroke-linecap="round"/><path d="m31 40.5 6.5 6.5 12-13.5" stroke="#10b981" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  setText("preview-project-title", $("input-project-title").value || "Statement of Work");
  if (state.isExecuted && !$("executed-stamp")) createExecutedStamp();
  setText("preview-reference", `SC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`);
  setText("preview-contractor-name", $("input-contractor-name")?.value || "Your Full Name");
  setText("preview-entity-name", $("input-entity-name")?.value || "Your Entity / Agency");
  setText("preview-contractor-email", $("input-contractor-email")?.value || "you@example.com");
  setText("preview-client-name", $("input-client-name")?.value || "Client Signer");
  setText("preview-client-company", $("input-client-company")?.value || "Client Company");
  setText("preview-client-email", $("input-client-email")?.value || "client@example.com");
  setText("preview-deliverables", $("input-deliverables").value);
  setText("preview-payment-terms", $("input-payment-terms")?.value || "50% upfront, 50% on final delivery");
  const previewFlow = qs("#contract-canvas > .space-y-5");
  if (previewFlow) {
    ["document-title-section", "parties-block", "deliverables-section", "payment-section", "milestone-section"].forEach((className, index) => {
      previewFlow.children[index]?.classList.add("document-section", className);
    });
    let commercial = $("preview-commercial-terms");
    if (!commercial) {
      commercial = document.createElement("section");
      commercial.id = "preview-commercial-terms";
      commercial.className = "document-section commercial-section";
      const milestoneSection = previewFlow.children[4];
      milestoneSection?.before(commercial);
    }
    const total = state.mode === "retainer" ? state.retainerFee : state.mode === "change-order" ? state.changeTotal : state.projectTotal;
    setText("preview-total-value", money(total));
    setText("preview-billing-schedule", $("input-payment-terms")?.value || "50% upfront");
    setText("preview-turnaround-time", $("select-turnaround")?.selectedOptions[0]?.textContent || "Standard delivery");
    commercial.innerHTML = `<p class="preview-label">Commercial Terms</p><div class="commercial-grid"><div><span>Total Value</span><strong id="preview-total-value">${money(total)}</strong></div><div><span>Billing Schedule</span><strong id="preview-billing-schedule">${escapeHtml($("input-payment-terms")?.value || "50% upfront")}</strong></div><div><span>Turnaround Time</span><strong id="preview-turnaround-time">${escapeHtml($("select-turnaround")?.selectedOptions[0]?.textContent || "Standard delivery")}</strong></div></div>`;
  }
  const accent = $("input-brand-color")?.value || "#10b981";
  $("contract-canvas").style.setProperty("--brand-accent", accent);
  const previewRule = qs(".contract-sheet > .flex");
  if (previewRule) {
    previewRule.style.borderColor = accent;
    previewRule.classList.add("contract-header");
  }
  $("preview-heading").style.color = accent;
  const date = $("input-effective-date")?.value;
  setText("preview-effective-date", date || "Effective date");
  const milestones = qsa("#milestone-list .milestone-row").map((row) => ({
    name: qs('input[id^="milestone-"][id$="-name"]', row)?.value || "Milestone",
    amount: qs('input[id^="milestone-"][id$="-amount"]', row)?.value || "0"
  }));
  $("preview-milestones").innerHTML = milestones.map((item, index) => `<tr><td>${escapeHtml(item.name)}</td><td>${date || "TBD"}</td><td class="fee-cell">${escapeHtml(item.amount)}%</td></tr>`).join("");
  renderLegalTerms();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderLegalTerms() {
  const legal = $("preview-legal-terms");
  const signatures = $("preview-signature-block");
  if (!legal || !signatures) return;
  if (!state.isPro) {
    legal.innerHTML = "";
    signatures.innerHTML = `<div class="border border-dashed border-zinc-300 bg-zinc-50 rounded-lg p-6 text-center my-6"><p class="text-sm font-semibold text-zinc-700">Execution Block &amp; Enforceable Legal Terms Locked</p><p class="text-xs text-zinc-500 mt-1">Upgrade to ScopeCraft Pro to structurally inject binding legal terms, dispute resolution, IP assignment, and dual execution blocks.</p></div>`;
    return;
  }
  legal.innerHTML = `<div class="space-y-3 border-t border-zinc-200 pt-4"><section><h3 class="font-bold text-zinc-900">Scope Boundaries &amp; Acceptance</h3><p>Client has five business days to review and accept each delivery. Silence after that window constitutes acceptance.</p></section><section><h3 class="font-bold text-zinc-900">Compensation &amp; Milestones</h3><p>Fees follow the milestone schedule. Late balances accrue a 1.5% monthly fee. High-risk engagements require a 100% non-refundable kill fee.</p></section><section><h3 class="font-bold text-zinc-900">Intellectual Property Ownership</h3><p>All intellectual property remains the contractor's property until 100% of the final balance is settled.</p></section><section><h3 class="font-bold text-zinc-900">Out-of-Scope Work</h3><p>Additional work requires written approval and is billed at the ${money(75 * state.market)}/hr benchmark.</p></section><section><h3 class="font-bold text-zinc-900">Independent Contractor &amp; Liability</h3><p>The provider is an independent contractor. Parties provide mutual indemnification, with liability capped at fees paid under this statement.</p></section><section><h3 class="font-bold text-zinc-900">Governing Law &amp; Dispute Resolution</h3><p>Disputes will be handled through binding arbitration under the governing law agreed by the parties.</p></section></div>`;
  signatures.innerHTML = `<div class="signature-panel"><div class="signature-grid"><div><p class="signature-name">Service Provider</p><div class="signature-line"></div><div class="signature-fields"><span>Printed name</span><span>Date</span></div></div><div><p class="signature-name">Client Authorized Representative</p><div class="signature-line"></div><div class="signature-fields"><span>Printed name</span><span>Date</span></div></div></div></div>`;
}

function applyLicenseState() {
  const license = localStorage.getItem(LICENSE_STORAGE_KEY);
  state.isPro = license === "pro";
  const badge = $("badge-license");
  const footerStatus = $("footer-license-status");
  if (badge) {
    badge.textContent = state.isPro ? "Pro Lifetime" : "Free Draft";
    badge.style.background = state.isPro ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";
    badge.style.color = state.isPro ? "#4ade80" : "#f87171";
    badge.classList.toggle("license-free", !state.isPro);
  }
  if (footerStatus) {
    footerStatus.textContent = state.isPro ? "● License: Pro Lifetime" : "License: Free Draft";
    footerStatus.style.color = state.isPro ? "#34d399" : "";
    footerStatus.classList.toggle("license-free", !state.isPro);
  }
  if (!state.isExecuted) $("preview-status-slot")?.replaceChildren();
  const scripts = $("defend-rate-content");
  const overlay = $("defend-rate-lock-overlay");
  if (scripts) {
    scripts.classList.toggle("filter", !state.isPro);
    scripts.classList.toggle("blur-sm", !state.isPro);
    scripts.classList.toggle("pointer-events-none", !state.isPro);
    scripts.classList.toggle("opacity-40", !state.isPro);
    scripts.classList.toggle("select-none", !state.isPro);
    applyDefendRateModalState();
  }
  if (overlay) {
    overlay.classList.toggle("hidden", state.isPro);
    overlay.style.display = state.isPro ? "none" : "flex";
  }
  renderLegalTerms();
}

function applyDefendRateModalState() {
  const isPro = localStorage.getItem(LICENSE_STORAGE_KEY) === "pro";
  const overlay = $("defend-rate-lock-overlay");
  const content = $("defend-rate-content");
  if (overlay) {
    overlay.style.display = isPro ? "none" : "flex";
    overlay.classList.toggle("hidden", isPro);
  }
  if (content) {
    content.style.filter = isPro ? "none" : "blur(6px)";
    content.style.webkitFilter = isPro ? "none" : "blur(6px)";
    content.style.opacity = isPro ? "1" : "0.3";
    content.style.pointerEvents = isPro ? "auto" : "none";
    content.style.userSelect = isPro ? "text" : "none";
    content.style.webkitUserSelect = isPro ? "text" : "none";
    content.classList.toggle("blur-sm", !isPro);
    content.classList.toggle("pointer-events-none", !isPro);
    content.classList.toggle("opacity-40", !isPro);
    content.classList.toggle("select-none", !isPro);
  }
}

function updateLicenseUI() {
  applyLicenseState();
}

function copyText(text, success = "Copied to clipboard.") {
  navigator.clipboard.writeText(text).then(() => showToast(success)).catch(() => showToast("Clipboard access was blocked by the browser."));
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position: fixed; top: -9999px; left: -9999px; opacity: 0;";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy command failed");
}

function copyPitch() {
  const title = $("input-project-title").value || "your project";
  const total = state.mode === "retainer" ? state.retainerFee : state.mode === "change-order" ? state.changeTotal : state.projectTotal;
  copyText(`Hi! 👋 For ${title}, I can deliver the agreed scope with clear milestones, review gates, and accountable turnaround. The investment is ${money(total)}, with ${riskCount() >= 2 ? "100% upfront" : "50% upfront"} to reserve production capacity. Once approved, I will issue the formal SOW and kickoff schedule.`, "WhatsApp / DM pitch copied.");
}

function getCustomizeModal() {
  return $("customize-modal");
}

window.openCustomizeModal = function openCustomizeModal() {
  const modal = getCustomizeModal();
  if (!modal) return;
  applyReferralPricing();
  const isPro = localStorage.getItem(LICENSE_STORAGE_KEY) === "pro";
  const upgradeBtn = $("btn-upgrade-cta") ||
    [...modal.querySelectorAll("button")].find((button) =>
      button.innerText.includes("Upgrade") ||
      button.innerText.includes("$29") ||
      button.innerText.includes("Lifetime")
    );
  if (upgradeBtn) {
    if (isPro) {
      upgradeBtn.style.setProperty("display", "none", "important");
      upgradeBtn.classList.add("hidden");
    } else {
      upgradeBtn.style.removeProperty("display");
      upgradeBtn.classList.remove("hidden");
    }
  }
  modal.classList.remove("hidden");
};

window.closeCustomizeModal = function closeCustomizeModal() {
  getCustomizeModal()?.classList.add("hidden");
};

window.syncModalFieldsToContract = function syncModalFieldsToContract() {
  const canvas = document.getElementById("contract-canvas") || document.querySelector(".bg-white");
  if (!canvas) return;
  [
    { selector: 'input[placeholder*="Full name"]', target: ".service-provider-name" },
    { selector: 'input[placeholder*="Signer name"]', target: ".client-name" },
    { selector: 'input[placeholder*="Company name"]', target: ".client-company" },
    { selector: "textarea", target: ".payment-terms" }
  ].forEach(({ selector, target }) => {
    const input = document.querySelector(selector);
    const node = canvas.querySelector(target);
    if (input && node && input.value.trim()) node.innerText = input.value;
  });
  updatePreview();
}

window.exportSinglePagePDF = function exportSinglePagePDF(filename = "ScopeCraft_Draft_Agreement.pdf", button = null) {
  const canvas = $("contract-canvas");
  if (!canvas) {
    alert("Error: Could not locate the contract canvas element (#contract-canvas).");
    return;
  }
  if (typeof html2pdf === "undefined") {
    alert("Error: html2pdf library failed to load from CDN.");
    return;
  }
  const originalText = button?.textContent;
  if (button) {
    button.textContent = "Generating PDF...";
    button.disabled = true;
  }
  const restoreButton = () => {
    if (button) {
      button.textContent = originalText || "Export Watermarked Sample (PDF)";
      button.disabled = false;
    }
  };
  window.closeCustomizeModal();
  const opt = {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, scrollY: 0, scrollX: 0, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };
  try {
    window.html2pdf()
      .set(opt)
      .from(canvas)
      .toPdf()
      .get("pdf")
      .then((pdf) => {
        pdf.save(filename);
      })
      .then(restoreButton)
      .catch((error) => {
        console.error("PDF export error:", error);
        alert(`PDF generation error: ${error.message || error}`);
        restoreButton();
      });
  } catch (error) {
    console.error("PDF export error:", error);
    alert(`PDF generation error: ${error.message || error}`);
    restoreButton();
  }
};

function initPaymentListener() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("payment") && !params.has("unlock")) return;
  if (params.get("payment") === "success" || params.get("unlock") === "pro") {
    state.isPro = true;
    localStorage.setItem(LICENSE_STORAGE_KEY, "pro");
    localStorage.setItem(LICENSE_KEY, "true");
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) restoreFormData(JSON.parse(saved));
    window.history.replaceState({}, document.title, window.location.pathname);
    updateLicenseUI();
    showToast("Pro Lifetime Active! Legal clauses unlocked & watermarks stripped.");
    if (params.get("payment") === "success") window.setTimeout(() => window.exportSinglePagePDF(), 800);
  }
}

function bindEvents() {
  $("select-currency").addEventListener("change", (event) => { state.currency = event.target.value; calculate(); });
  $("select-market").addEventListener("change", (event) => { state.market = Number(event.target.value); calculate(); });
  $("tab-project").addEventListener("click", () => activateTab("project"));
  $("tab-retainer").addEventListener("click", () => activateTab("retainer"));
  $("tab-change-order").addEventListener("click", () => activateTab("change-order"));
  $("btn-revisions-minus").addEventListener("click", () => step("input-revisions", -1, 0, 10));
  $("btn-revisions-plus").addEventListener("click", () => step("input-revisions", 1, 0, 10));
  $("btn-assets-minus").addEventListener("click", () => step("input-asset-volume", -1, 1, 40));
  $("btn-assets-plus").addEventListener("click", () => step("input-asset-volume", 1, 1, 40));
  $("btn-add-milestone").addEventListener("click", addMilestone);
  $("btn-add-change").addEventListener("click", addChangeOrder);
  $("btn-open-negotiation")?.addEventListener("click", () => {
    posthogCapture("negotiation_drawer_opened");
    applyDefendRateModalState();
    $("drawer-negotiation").classList.add("open");
    $("drawer-negotiation").setAttribute("aria-hidden", "false");
  });
  $("close-defend-modal")?.addEventListener("click", closeDefendRateDrawer);
  $("btn-copy-pitch").addEventListener("click", copyPitch);
  $("btn-header-export")?.addEventListener("click", () => {
    const exportButton = state.isPro ? $("btn-export-pro") : $("btn-export-sample");
    exportButton?.click();
  });
  $("btn-header-theme")?.addEventListener("click", toggleContractDarkView);
  $("btn-header-sponsor")?.addEventListener("click", () => showToast("Thank you for supporting ScopeCraft."));
  $("dock-copy-link")?.addEventListener("click", () => $("btn-copy-ref")?.click());
  $("dock-export-pdf")?.addEventListener("click", () => {
    const exportButton = state.isPro ? $("btn-export-pro") : $("btn-export-sample");
    exportButton?.click();
  });
  $("btn-inline-export")?.addEventListener("click", () => $("dock-export-pdf")?.click());
  $("btn-inline-print")?.addEventListener("click", () => window.print());
  $("btn-inline-link")?.addEventListener("click", () => $("dock-copy-link")?.click());
  $("dock-approve-sign")?.addEventListener("click", slamExecutedStamp);
  $("executed-stamp")?.addEventListener("click", slamExecutedStamp);
  $("dock-dark-view")?.addEventListener("click", toggleContractDarkView);
  $("dock-fullscreen")?.addEventListener("click", toggleContractFullscreen);
  $("btn-upgrade-cta").addEventListener("click", () => { localStorage.setItem(DRAFT_KEY, JSON.stringify(collectFormData())); window.location.href = PAYMENT_CHECKOUT_URL; });
  $("btn-apply-ref").addEventListener("click", () => {
    const input = $("input-ref-code");
    const code = input?.value.trim().toUpperCase() || "";
    const feedback = $("ref-code-feedback");
    if (!REFERRAL_PATTERN.test(code)) {
      if (feedback) {
        feedback.textContent = "Enter a code like SCOPE-9K4F.";
        feedback.className = "text-[10px] text-amber-400";
      }
      return;
    }
    localStorage.setItem(ACTIVE_REFERRAL_KEY, code);
    applyReferralPricing();
    if (feedback) {
      feedback.textContent = "Referral discount applied.";
      feedback.className = "text-[10px] text-emerald-400";
    }
  });
  $("btn-copy-ref").addEventListener("click", async (event) => {
    event.preventDefault();
    const referralElement = $("user-ref-code");
    const code = referralElement?.value?.trim() || referralElement?.textContent?.trim() || getOrCreateReferralCode();
    const button = $("btn-copy-ref");
    const label = button?.querySelector("span");
    const originalLabel = label?.textContent || "📋 Copy Link";
    try {
      await copyToClipboard(code);
      if (label) label.textContent = "Copied!";
      const toast = $("ref-copy-toast");
      toast?.classList.remove("hidden");
      window.clearTimeout(button?.copyFeedbackTimeout);
      button.copyFeedbackTimeout = window.setTimeout(() => {
        if (label) label.textContent = originalLabel;
        toast?.classList.add("hidden");
      }, 2000);
    } catch (error) {
      showToast("Could not copy referral code. Please try again.");
      console.error("Could not copy referral code:", error);
    }
  });
  $("btn-reset-license").addEventListener("click", () => {
    const confirmed = window.confirm(
      "Are you sure you want to reset your license?\n\nThis will remove your Pro status on this browser and revert to the Free tier (re-locking the Defend Your Rate playbooks and restoring watermarks)."
    );
    if (!confirmed) return;
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    localStorage.removeItem("license");
    localStorage.removeItem(LICENSE_KEY);
    localStorage.removeItem(DRAFT_KEY);
    window.location.reload();
  });
  qsa(".script-card").forEach((card) => qs(".copy-script", card).addEventListener("click", (event) => {
    if (!state.isPro) {
      event.preventDefault();
      event.stopPropagation();
      window.openCustomizeModal();
      return;
    }
    copyText(qs("p", card).textContent, "Negotiation script copied.");
  }));
  qsa("input, select, textarea").forEach((input) => input.addEventListener("input", calculate));
  bindDynamicRow(qs("#milestone-list .milestone-row"), "milestone");
  bindDynamicRow(qs("#change-order-list .change-row"), "change");
  $("input-custom-logo").addEventListener("change", (event) => {
    if (!state.isPro) { event.target.value = ""; showToast("Custom logos are available with Pro."); return; }
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => { $("preview-logo-slot").innerHTML = `<img src="${reader.result}" alt="Custom brand logo" style="max-width:42px;max-height:42px">`; });
    reader.readAsDataURL(file);
  });
  $("input-brand-color").addEventListener("input", (event) => { if (state.isPro) updatePreview(); });
}

document.addEventListener("DOMContentLoaded", () => {
  let canvas = document.getElementById("contract-canvas");
  if (!canvas) {
    canvas = document.querySelector(".aspect-\\[210\\/297\\]") ||
      document.querySelector(".bg-white.text-black") ||
      document.querySelector('[class*="aspect-"]');
    if (canvas) canvas.id = "contract-canvas";
  }
});

document.addEventListener("click", (event) => {
  const modal = getCustomizeModal();
  const helpModal = $("help-modal");
  const defendDrawer = $("drawer-negotiation");
  const target = event.target.closest("button, a");
  if (defendDrawer && event.target === defendDrawer) {
    closeDefendRateDrawer();
    return;
  }
  if (target?.id === "btn-open-help") {
    event.preventDefault();
    helpModal?.classList.remove("hidden");
    initializeFeedbackState();
    return;
  }
  if (helpModal && (event.target === helpModal || target?.id === "btn-close-help")) {
    event.preventDefault();
    helpModal.classList.add("hidden");
    return;
  }
  if (modal && event.target === modal) {
    event.preventDefault();
    window.closeCustomizeModal();
    return;
  }
  if (!target) return;
  const text = target.innerText.trim();

  if (target.classList.contains("star-btn")) {
    event.preventDefault();
    selectedRating = Number(target.dataset.rating) || 0;
    updateStarRating();
    return;
  }

  if (target.id === "btn-submit-feedback") {
    event.preventDefault();
    if (selectedRating < 1) {
      alert("Please pick a star rating first");
      return;
    }
    target.disabled = true;
    target.innerText = "Sending...";
    const payload = {
      rating: `${selectedRating} / 5 Stars`,
      comment: $("feedback-comment")?.value.trim() || "No comment provided",
      license: localStorage.getItem(LICENSE_STORAGE_KEY) === "pro" ? "Pro Lifetime" : "Free Tier",
      referral_code: localStorage.getItem(REFERRAL_CODE_KEY) || "None",
      submitted_at: new Date().toLocaleString()
    };
    fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).then((response) => {
      if (!response.ok) throw new Error("Network error");
      localStorage.setItem("scopecraft_user_feedback", JSON.stringify(payload));
      posthogCapture("feedback_submitted", { rating: selectedRating });
      $("feedback-form-container")?.classList.add("hidden");
      $("feedback-success-state")?.classList.remove("hidden");
      updateHeaderRating();
    }).catch((error) => {
      console.error("Feedback submission failed:", error);
      alert("Could not send feedback. Please check your connection and try again.");
      target.disabled = false;
      target.innerText = "Submit Feedback";
    });

    return;
  }

  if (target.id === "btn-unlock-playbooks") {
    event.preventDefault();
    event.stopPropagation();
    window.openCustomizeModal();
    return;
  }

  if (!state.isPro && target.closest("#defend-rate-container")) {
    event.preventDefault();
    event.stopPropagation();
    window.openCustomizeModal();
    return;
  }

  if (target.classList.contains("btn-upgrade-pro") && !target.id) {
    event.preventDefault();
    window.openCustomizeModal();
    return;
  }

  if (text.includes("Generate Client Agreement") || target.id === "btn-export-free") {
    event.preventDefault();
    window.openCustomizeModal();
    return;
  }

  if (
    text === "✕" ||
    text === "×" ||
    target.getAttribute("aria-label") === "Close" ||
    target.classList.contains("modal-close")
  ) {
    event.preventDefault();
    window.closeCustomizeModal();
    return;
  }

  if (text.includes("Sign & Export Certified PDF") || target.id === "btn-export-pro") {
    event.preventDefault();
    const isProLicensed = localStorage.getItem(LICENSE_STORAGE_KEY) === "pro";
    state.isPro = isProLicensed;
    if (!isProLicensed) {
      alert("Unlock ScopeCraft Pro with a one-time $29 lifetime purchase to export a certified agreement.");
      window.openCustomizeModal();
      return;
    }
    window.syncModalFieldsToContract();
    window.closeCustomizeModal();
    posthogCapture("certified_pdf_export_requested");
    window.exportSinglePagePDF("ScopeCraft_Agreement.pdf", target);
    return;
  }

  if (text.includes("Export Watermarked Sample") || target.id === "btn-export-sample") {
    event.preventDefault();
    event.stopPropagation();
    window.syncModalFieldsToContract();
    posthogCapture("draft_pdf_export_requested");
    window.exportSinglePagePDF("ScopeCraft_Draft_Agreement.pdf", target);
  }
});

function updateStarRating() {
  qsa(".star-btn").forEach((star) => {
    const active = Number(star.dataset.rating) <= selectedRating;
    star.classList.toggle("text-amber-400", active);
    star.classList.toggle("text-slate-600", !active);
    star.setAttribute("aria-checked", String(active));
  });
}

function initializeFeedbackState() {
  const helpCard = qs("#help-modal .modal-card");
  const feedback = $("feedback-section");
  if (helpCard && feedback && feedback.parentElement !== helpCard) helpCard.append(feedback);
  qsa(".star-btn").forEach((star) => {
    if (star.dataset.feedbackBound) return;
    star.dataset.feedbackBound = "true";
    star.addEventListener("mouseenter", () => {
      const preview = Number(star.dataset.rating) || 0;
      qsa(".star-btn").forEach((item) => {
        item.classList.toggle("text-amber-400", Number(item.dataset.rating) <= preview);
        item.classList.toggle("text-slate-600", Number(item.dataset.rating) > preview);
      });
    });
    star.addEventListener("mouseleave", updateStarRating);
  });
  const saved = localStorage.getItem("scopecraft_user_feedback");
  const form = $("feedback-form-container");
  const success = $("feedback-success-state");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      selectedRating = Number.parseInt(data.rating, 10) || 0;
      if ($("feedback-comment")) $("feedback-comment").value = data.comment || "";
      form?.classList.add("hidden");
      success?.classList.remove("hidden");
      updateStarRating();
    } catch (error) {
      console.error("Could not restore saved feedback:", error);
    }
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const helpModal = $("help-modal");
  if (helpModal && !helpModal.classList.contains("hidden")) {
    helpModal.classList.add("hidden");
    return;
  }
  const modal = getCustomizeModal();
  if (modal && !modal.classList.contains("hidden")) window.closeCustomizeModal();
  if ($("drawer-negotiation")?.classList.contains("open")) closeDefendRateDrawer();
});

document.addEventListener("DOMContentLoaded", () => {
  initializeReferralSystem();
  updateHeaderRating();
  initializeFeedbackState();
  initializeMicroAnimations();
  bindEvents();
  initPaymentListener();
  applyLicenseState();
  calculate();
  refreshIcons();
});

window.togglePro = function togglePro(enable = true) {
  localStorage.setItem(LICENSE_STORAGE_KEY, enable ? "pro" : "free");
  applyLicenseState();
  window.location.reload();
};

applyLicenseState();
