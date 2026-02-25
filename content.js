// Amazon Best Sellers Finder - content.js
// To update the affiliate tag, change the value below:
const AFFILIATE_TAG = "andrewswitzer-20";

// ─── SETUP ───────────────────────────────────────────────────────────────────

const currentUrl = window.location.href;
const isSearchPage = /\/s[\/?]/.test(currentUrl) || currentUrl.includes("field-keywords");
const isProductPage = /\/dp\/[A-Z0-9]{10}/.test(currentUrl);

// Listen for popup requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getBestSellersUrl") {
    getResult().then(sendResponse);
    return true; // keep channel open for async response
  }
});

if (isSearchPage || isProductPage) {
  init();
}

// ─── INIT ────────────────────────────────────────────────────────────────────

async function init() {
  // Inject button immediately with a loading state
  const btn = injectButton("📊 Finding Best Sellers…", "#");

  const result = await getResult();
  btn.href = result.url;
  btn.innerText = result.label
    ? `📊 Best Sellers: ${result.label}`
    : "📊 Best Sellers";
  btn.title = result.url;
}

// ─── MAIN DETECTION ──────────────────────────────────────────────────────────

async function getResult() {
  // 1. Try fast in-page detection first (works on product pages + dept-filtered searches)
  const fast = detectFromPage();
  if (fast) return fast;

  // 2. For search pages: fetch the first product's page to get its category
  if (isSearchPage) {
    const fromProduct = await detectFromFirstProduct();
    if (fromProduct) return fromProduct;
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

  // B. Current URL has node= param
  const nodeParam = new URLSearchParams(window.location.search).get("node");
  if (nodeParam) {
    return {
      url: `https://www.amazon.com/gp/bestsellers/?node=${nodeParam}&tag=${AFFILIATE_TAG}`,
      label: null,
      detected: true,
    };
  }

  // C. Product page: look for zgbs links directly in the DOM
  //    (Best Sellers Rank section links directly to the category zgbs page)
  const zgbsLinks = document.querySelectorAll('a[href*="/zgbs/"]');
  for (const a of zgbsLinks) {
    const result = buildResultFromZgbsHref(a.href, a.innerText.trim());
    if (result) return result;
  }

  return null;
}

// ─── ASYNC DETECTION (FIRST PRODUCT PAGE FETCH) ──────────────────────────────

async function detectFromFirstProduct() {
  // Get the first product ASIN from search results
  const firstResult = document.querySelector(
    '[data-component-type="s-search-result"][data-asin]'
  );
  if (!firstResult) return null;

  const asin = firstResult.dataset.asin;
  if (!asin || asin.length < 5) return null;

  try {
    const response = await fetch(`https://www.amazon.com/dp/${asin}`, {
      credentials: "include",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return null;

    const html = await response.text();

    // Extract all zgbs hrefs from the raw HTML using regex
    // (DOMParser not used to keep this lightweight)
    const zgbsRegex = /href="(\/[^"]*\/zgbs\/[^"]+)"/g;
    let match;
    while ((match = zgbsRegex.exec(html)) !== null) {
      const fullHref = "https://www.amazon.com" + match[1];
      const result = buildResultFromZgbsHref(fullHref, null);
      if (result) return result;
    }
  } catch (e) {
    // Silently fail — network error, CORS, etc.
  }

  return null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Given a zgbs URL, build our result object with affiliate tag
function buildResultFromZgbsHref(href, linkText) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split("/").filter(Boolean);
    const zgbsIdx = parts.indexOf("zgbs");
    if (zgbsIdx === -1) return null;

    const dept = parts[zgbsIdx + 1];
    const nodeId = parts[zgbsIdx + 2];
    if (!dept || !nodeId || !/^\d+$/.test(nodeId)) return null;

    // Build clean label from the first path segment (e.g. "Best-Sellers-Hair-Combs")
    const rawSlug = parts[0] || "";
    const label =
      linkText?.slice(0, 40) ||
      rawSlug
        .replace(/^Best-Sellers-?/i, "")
        .replace(/-/g, " ")
        .trim() ||
      null;

    return {
      url: `https://www.amazon.com/${rawSlug}/zgbs/${dept}/${nodeId}?tag=${AFFILIATE_TAG}`,
      label,
      detected: true,
      nodeId,
      dept,
    };
  } catch (e) {
    return null;
  }
}

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

// ─── BUTTON ──────────────────────────────────────────────────────────────────

function injectButton(label, href) {
  if (document.getElementById("amz-bestsellers-btn")) {
    return document.getElementById("amz-bestsellers-btn");
  }

  const btn = document.createElement("a");
  btn.id = "amz-bestsellers-btn";
  btn.href = href;
  btn.target = "_blank";
  btn.rel = "noopener noreferrer";
  btn.innerText = label;

  Object.assign(btn.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "999999",
    background: "#ff9900",
    color: "#111",
    fontFamily: "Arial, sans-serif",
    fontSize: "13px",
    fontWeight: "bold",
    padding: "10px 16px",
    borderRadius: "24px",
    textDecoration: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    opacity: "0.82",
    transition: "opacity 0.2s, transform 0.2s",
    cursor: "pointer",
    maxWidth: "300px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "1";
    btn.style.transform = "scale(1.05)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "0.82";
    btn.style.transform = "scale(1)";
  });

  document.body.appendChild(btn);
  return btn;
}
