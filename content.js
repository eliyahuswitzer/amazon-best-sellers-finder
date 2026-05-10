// Amazon Best Sellers Finder - content.js
// To update the affiliate tag, change the value below:
const AFFILIATE_TAG = "andrewswitzer-20";

// ─── SETUP ───────────────────────────────────────────────────────────────────

const currentUrl = window.location.href;
const isSearchPage = /\/s[\/?]/.test(currentUrl) || currentUrl.includes("field-keywords");
const isProductPage = /\/dp\/[A-Z0-9]{10}/.test(currentUrl);
// Browse-node pages (/b?node=…) are category pages we can resolve directly
// from the node= param. Require the param so we don't render on vague /b
// pages that lack one — guessing a category from those would be noise.
const isBrowsePage =
  /\/b[\/?]/.test(currentUrl) &&
  !!new URLSearchParams(window.location.search).get("node");

// Tracks the loading button's dot animation so renderStack() can cancel it
// when real results arrive. Must be declared here (not next to renderStack
// below) because init() is called synchronously before the script reaches
// this file's later `let` declarations — accessing a `let` in its temporal
// dead zone throws ReferenceError and bricks the extension.
let loadingAnimationInterval = null;

// Listen for popup requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getBestSellersUrl") {
    getResult().then(sendResponse);
    return true; // keep channel open for async response
  }
});

if (isSearchPage || isProductPage || isBrowsePage) {
  init();
}

// ─── INIT ────────────────────────────────────────────────────────────────────

async function init() {
  // Show an immediate loading state so the user sees *something*
  renderStack(null, []);

  const result = await getResult();
  renderStack(result, result.alternatives || []);
}

// ─── MAIN DETECTION ──────────────────────────────────────────────────────────

async function getResult() {
  // 1. Try fast in-page detection first (works on product pages + dept-filtered searches)
  const fast = detectFromPage();
  if (fast) return fast;

  // 2a. Browse pages where path B couldn't find a dept in the DOM:
  //     fetch a product from the page and pull the dept from its BSR.
  if (isBrowsePage) {
    const fromBrowse = await detectFromBrowsePage();
    if (fromBrowse) return fromBrowse;
  }

  // 2b. Product pages where the live-DOM BSR scan found nothing:
  //     re-fetch the product and try again against the server response.
  if (isProductPage) {
    const fromProduct = await detectFromProductPage();
    if (fromProduct) return fromProduct;
  }

  // 2c. For search pages: look at "Best Seller" badges on the results —
  //     those are ground truth (Amazon itself is saying "this is #1 in X")
  if (isSearchPage) {
    const fromBadges = await detectFromBadgedProducts();
    if (fromBadges) return fromBadges;
  }

  // 3. Fallback: top-level Best Sellers
  return {
    url: `https://www.amazon.com/gp/bestsellers/?tag=${AFFILIATE_TAG}`,
    label: null,
    detected: false,
  };
}

// ─── FAST (IN-PAGE) DETECTION ────────────────────────────────────────────────

function detectFromPage() {
  // A. Current URL has rh=n:XXXXX (dept-filtered search)
  const rhNode = extractNodeFromRh(window.location.href);
  if (rhNode) {
    return {
      url: `https://www.amazon.com/gp/bestsellers/?node=${rhNode.nodeId}&tag=${AFFILIATE_TAG}`,
      label: null,
      detected: true,
    };
  }

  // B. Current URL has node= param.
  //    `/gp/bestsellers/?node=XXX` alone does NOT resolve to the right
  //    category on Amazon — it needs the department slug too. On browse
  //    pages we try to find a zgbs / bestsellers link in the DOM whose
  //    nodeId matches; that link's path gives us the dept. If nothing
  //    matches, fall through so the async detectFromBrowsePage() can try
  //    fetching a product page. For non-browse URLs with node= we keep
  //    the deptless URL as a best-effort last resort.
  const nodeParam = new URLSearchParams(window.location.search).get("node");
  if (nodeParam) {
    if (isBrowsePage) {
      const match = findMatchingBestSellersLink(nodeParam);
      if (match) {
        return {
          url: `https://www.amazon.com/gp/bestsellers/${match.dept}/${match.nodeId}?tag=${AFFILIATE_TAG}`,
          label: extractBrowsePageLabel(),
          detected: true,
          nodeId: match.nodeId,
          dept: match.dept,
        };
      }
    } else {
      return {
        url: `https://www.amazon.com/gp/bestsellers/?node=${nodeParam}&tag=${AFFILIATE_TAG}`,
        label: null,
        detected: true,
      };
    }
  }

  // C. Product page: scan the BSR section in the live DOM.
  //    Both /zgbs/ (older) and /gp/bestsellers/{dept}/{nodeId} (newer) are
  //    valid BSR URL formats, so we match either. The async fallback in
  //    detectFromProductPage() handles cases where the section hasn't
  //    rendered by document_idle.
  if (isProductPage) {
    const fromBsr = extractBsrFromHtml(document.body.innerHTML);
    if (fromBsr) return fromBsr;
  }

  return null;
}

// ─── BSR EXTRACTION (SHARED) ────────────────────────────────────────────────
//
// Given any Amazon product-page HTML (either from the live DOM or a fetch
// response), isolate the "Best Sellers Rank" block and extract the most
// specific (dept, nodeId) pair from it. Amazon lists BSR entries broad →
// specific, so the LAST link in the block is the subcategory we want.

function extractBsrFromHtml(html) {
  const bsrMatch = html.match(/Best Sellers Rank[\s\S]{0,3000}/i);
  if (!bsrMatch) return null;
  const section = bsrMatch[0];

  const urlRegex =
    /href=['"][^'"]*(?:\/gp\/bestsellers|\/zgbs)\/([a-z][a-z-]*)\/(\d+)[^'"]*['"]/gi;
  const urlMatches = [...section.matchAll(urlRegex)];
  if (urlMatches.length === 0) return null;

  const last = urlMatches[urlMatches.length - 1];
  const dept = last[1];
  const nodeId = last[2];

  // Best-effort label: grab the anchor's inner text if it's a plain string.
  // Some anchors have nested spans; in that case we accept a null label
  // rather than returning garbage.
  const withTextRegex =
    /<a\s+[^>]*href=['"][^'"]*(?:\/gp\/bestsellers|\/zgbs)\/([a-z][a-z-]*)\/(\d+)[^'"]*['"][^>]*>\s*([^<]{1,80})\s*<\/a>/gi;
  const withText = [...section.matchAll(withTextRegex)];
  const labelEntry = withText.find((m) => m[1] === dept && m[2] === nodeId);
  const label = labelEntry ? labelEntry[3].trim() : null;

  return {
    url: `https://www.amazon.com/gp/bestsellers/${dept}/${nodeId}?tag=${AFFILIATE_TAG}`,
    label: label?.slice(0, 60) || null,
    detected: true,
    nodeId,
    dept,
  };
}

// Async fallback for product pages: fetch the canonical product URL and
// re-run BSR extraction on the server response. Helps when the BSR block
// is lazy-rendered after document_idle, or when the live DOM has been
// mutated in a way that drops the BSR links.
async function detectFromProductPage() {
  const asin = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
  if (!asin) return null;
  try {
    const resp = await fetch(`https://www.amazon.com/dp/${asin}`, {
      credentials: "include",
      headers: { Accept: "text/html" },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return extractBsrFromHtml(html);
  } catch (e) {
    return null;
  }
}

// ─── BADGE-BASED DETECTION (SEARCH PAGES) ───────────────────────────────────
//
// Strategy: Amazon marks products on the search results page with a
// "Best Seller in {Category}" badge. Those badges are ground truth — the
// product really is #1 in that category according to Amazon itself. We use
// those products as our seed list (instead of random top-of-page items
// which are often sponsored ads for unrelated categories).
//
// For each unique category name found in badge aria-labels, we fetch ONE
// representative product page and scrape the node ID from its "Best Sellers
// Rank" section. One fetch per distinct category is enough — all products
// with the same badge text land in the same zgbs node.

async function detectFromBadgedProducts() {
  // Amazon renders each badge 2-3 times per product (main badge,
  // rio-badge-component, rio-badge-supplementary-group) — dedupe by ASIN.
  const badgeEls = document.querySelectorAll(
    '[class*="rio-badge-component"], div#BEST_SELLER'
  );

  // Group by category name. For each unique category, remember the first
  // ASIN we saw (our "representative") and count how many distinct products
  // are best sellers in it — that count becomes the tiebreaker later.
  const byCategory = new Map(); // categoryName -> { count, asin }
  const seenAsinCategory = new Set(); // "asin::category" dedupe key

  for (const badge of badgeEls) {
    if (!/best\s*seller/i.test(badge.textContent)) continue;

    const card = badge.closest("[data-asin]");
    const asin = card?.dataset.asin;
    if (!asin || asin.length < 5) continue;

    // The category name lives in the child span's aria-label, e.g.
    // aria-label="in Manual Toothbrushes". Much cleaner than textContent
    // which concatenates "Best Seller" + "in Manual Toothbrushes".
    const inLabel = badge.querySelector('[aria-label^="in "]');
    const categoryName = inLabel
      ?.getAttribute("aria-label")
      ?.replace(/^in\s+/i, "")
      .trim();
    if (!categoryName) continue;

    const dedupeKey = `${asin}::${categoryName}`;
    if (seenAsinCategory.has(dedupeKey)) continue;
    seenAsinCategory.add(dedupeKey);

    const entry = byCategory.get(categoryName) || { count: 0, asin };
    entry.count++;
    byCategory.set(categoryName, entry);
  }

  if (byCategory.size === 0) return null;

  // Fetch one representative product per unique category and extract the
  // real zgbs (dept, nodeId) from its Best Sellers Rank section.
  const resolved = await Promise.all(
    [...byCategory.entries()].map(async ([categoryName, { count, asin }]) => {
      try {
        const resp = await fetch(`https://www.amazon.com/dp/${asin}`, {
          credentials: "include",
          headers: { Accept: "text/html" },
        });
        if (!resp.ok) return null;
        const html = await resp.text();

        // Isolate the "Best Sellers Rank" section before matching. The rest
        // of the page has navigation-menu zgbs links (e.g. "Best Sellers in
        // Beauty") that would pollute the results — that's the exact bug
        // the previous implementation had.
        const bsrMatch = html.match(/Best Sellers Rank[\s\S]{0,3000}/i);
        if (!bsrMatch) return null;

        // Amazon uses two URL formats here:
        //   /gp/bestsellers/{dept}/{nodeId}/...   ← most common in BSR
        //   /{slug}/zgbs/{dept}/{nodeId}/...      ← older "pretty" URL
        // Quotes can be single OR double. This regex handles all of that.
        const linkRegex =
          /href=['"][^'"]*(?:\/gp\/bestsellers|\/zgbs)\/([a-z][a-z-]*)\/(\d+)[^'"]*['"]/gi;
        const matches = [...bsrMatch[0].matchAll(linkRegex)];
        if (matches.length === 0) return null;

        // BSR lists rankings from broadest to most specific, e.g.
        //   "#103 in Health & Household"
        //   "#1 in Manual Toothbrushes"
        // The LAST match is the most specific subcategory — what we want.
        const last = matches[matches.length - 1];
        return {
          categoryName,
          count,
          dept: last[1],
          nodeId: last[2],
        };
      } catch (e) {
        return null;
      }
    })
  );

  const successful = resolved.filter(Boolean);
  if (successful.length === 0) return null;

  // Pick the category with the most badged products. Tiebreaker: deeper
  // (longer) node IDs tend to mean more specific subcategories.
  successful.sort(
    (a, b) => b.count - a.count || b.nodeId.length - a.nodeId.length
  );
  const [winner, ...rest] = successful;

  // Build URLs for the primary + up to 4 alternative categories (5 total).
  const toResult = (r) => ({
    url: `https://www.amazon.com/gp/bestsellers/${r.dept}/${r.nodeId}?tag=${AFFILIATE_TAG}`,
    label: r.categoryName,
    nodeId: r.nodeId,
    dept: r.dept,
  });

  return {
    ...toResult(winner),
    detected: true,
    alternatives: rest.slice(0, 4).map(toResult),
  };
}

// ─── BROWSE-PAGE DETECTION (/b?node=…) ─────────────────────────────────────
//
// Browse pages give us a nodeId via ?node= but no dept slug, and
// `/gp/bestsellers/?node=XXX` on its own doesn't resolve to the right
// category. So we need to find the dept for that nodeId from somewhere.
//
// Fast path (sync, in detectFromPage): scan the DOM for any link of the
// form /zgbs/{dept}/{nodeId} or /gp/bestsellers/{dept}/{nodeId} whose
// nodeId matches our target. Amazon often links to the category's Best
// Sellers page somewhere on the browse page itself.
//
// Slow path (this function): fetch a handful of product pages listed on
// the browse page and look at their Best Sellers Rank section. Every
// product in the category has a BSR entry for the category's nodeId,
// and that entry's link includes the dept slug.

function findMatchingBestSellersLink(targetNodeId) {
  const links = document.querySelectorAll(
    'a[href*="/zgbs/"], a[href*="/gp/bestsellers/"]'
  );
  for (const a of links) {
    const m = a.href.match(
      /(?:\/gp\/bestsellers|\/zgbs)\/([a-z][a-z-]*)\/(\d+)/
    );
    if (m && m[2] === targetNodeId) {
      return { dept: m[1], nodeId: m[2] };
    }
  }
  return null;
}

function extractBrowsePageLabel() {
  // "/Laptop-Chargers-Adapters/b" → "Laptop Chargers Adapters"
  const m = window.location.pathname.match(/^\/([^\/]+)\/b\/?$/);
  return m ? m[1].replace(/-/g, " ") : null;
}

async function detectFromBrowsePage() {
  const targetNode = new URLSearchParams(window.location.search).get("node");
  if (!targetNode) return null;

  // Sample up to 3 product ASINs from the browse page. Sponsored ads might
  // be in other categories so their BSR won't mention our target node —
  // we just skip those and try the next one.
  const asins = [
    ...new Set(
      [...document.querySelectorAll("[data-asin]")]
        .map((el) => el.dataset.asin)
        .filter((a) => a && /^[A-Z0-9]{10}$/.test(a))
    ),
  ].slice(0, 3);

  for (const asin of asins) {
    try {
      const resp = await fetch(`https://www.amazon.com/dp/${asin}`, {
        credentials: "include",
        headers: { Accept: "text/html" },
      });
      if (!resp.ok) continue;
      const html = await resp.text();

      const bsrMatch = html.match(/Best Sellers Rank[\s\S]{0,3000}/i);
      if (!bsrMatch) continue;

      const linkRegex =
        /href=['"][^'"]*(?:\/gp\/bestsellers|\/zgbs)\/([a-z][a-z-]*)\/(\d+)[^'"]*['"]/gi;
      const matches = [...bsrMatch[0].matchAll(linkRegex)];
      const hit = matches.find((m) => m[2] === targetNode);
      if (!hit) continue;

      return {
        url: `https://www.amazon.com/gp/bestsellers/${hit[1]}/${hit[2]}?tag=${AFFILIATE_TAG}`,
        label: extractBrowsePageLabel(),
        detected: true,
        nodeId: hit[2],
        dept: hit[1],
      };
    } catch (e) {
      continue;
    }
  }

  return null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Extract n:XXXXX node from rh= URL parameter
function extractNodeFromRh(urlStr) {
  try {
    const rh = new URL(urlStr).searchParams.get("rh");
    if (!rh) return null;
    const match = decodeURIComponent(rh).match(/(?:^|[,|])n:(\d+)/);
    if (match) return { nodeId: match[1] };
  } catch (e) {}
  return null;
}

// ─── BUTTON STACK ────────────────────────────────────────────────────────────

// Render the floating button stack: one primary button + up to N alternatives.
// `primary` is either a result object or null (null = loading state).
// Always removes any existing stack first so calling this replaces the UI.
function renderStack(primary, alternatives) {
  // Cancel any running loading animation before we rebuild the stack.
  if (loadingAnimationInterval) {
    clearInterval(loadingAnimationInterval);
    loadingAnimationInterval = null;
  }

  document.getElementById("amz-bestsellers-stack")?.remove();

  const stack = document.createElement("div");
  stack.id = "amz-bestsellers-stack";
  Object.assign(stack.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "999999",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "8px",
    maxWidth: "320px",
  });

  // Primary button
  let primaryLabel;
  let primaryHref;
  if (primary === null) {
    // Start the dot animation at one dot — interval will cycle 1→2→3→1.
    primaryLabel = "📊 Finding Best Sellers.";
    primaryHref = "#";
  } else {
    primaryLabel = primary.label
      ? `📊 Best Sellers: ${primary.label}`
      : "📊 Best Sellers";
    primaryHref = primary.url;
  }
  const primaryBtn = createButton({
    label: primaryLabel,
    href: primaryHref,
    variant: "primary",
  });
  stack.appendChild(primaryBtn);

  // Alternative buttons (up to 4 — primary + 4 = 5 total max)
  for (const alt of alternatives.slice(0, 4)) {
    stack.appendChild(
      createButton({
        label: `📊 ${alt.label}`,
        href: alt.url,
        variant: "secondary",
      })
    );
  }

  document.body.appendChild(stack);

  // If this was a loading render, start the dot animation. Cycles
  // "📊 Finding Best Sellers." → ".." → "..." → "." every 400ms until
  // the next renderStack call clears the interval.
  if (primary === null) {
    const baseLabel = "📊 Finding Best Sellers";
    let dots = 1;
    loadingAnimationInterval = setInterval(() => {
      dots = (dots % 3) + 1;
      primaryBtn.innerText = baseLabel + ".".repeat(dots);
    }, 400);
  }
}

// Create a single pill button. Shared between primary and secondary variants;
// secondary is visually lighter so the primary remains the clear focus.
function createButton({ label, href, variant }) {
  const isPrimary = variant === "primary";
  const baseOpacity = isPrimary ? "0.82" : "0.72";

  const btn = document.createElement("a");
  btn.href = href;
  btn.target = "_blank";
  btn.rel = "noopener noreferrer";
  btn.innerText = label;
  btn.title = href;

  Object.assign(btn.style, {
    background: "#ff9900",
    color: "#111",
    fontFamily: "Arial, sans-serif",
    fontSize: isPrimary ? "13px" : "12px",
    fontWeight: "bold",
    padding: isPrimary ? "10px 16px" : "7px 13px",
    borderRadius: "24px",
    textDecoration: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    opacity: baseOpacity,
    transition: "opacity 0.2s, transform 0.2s",
    cursor: "pointer",
    maxWidth: "300px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "block",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "1";
    btn.style.transform = "scale(1.05)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = baseOpacity;
    btn.style.transform = "scale(1)";
  });

  return btn;
}
