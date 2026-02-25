// Amazon Best Sellers Finder - content.js
// To update the affiliate tag, change the value below:
const AFFILIATE_TAG = "andrewswitzer-20";

// Only run on search or product pages
const url = window.location.href;
const isSearchPage = url.includes("/s?") || url.includes("/s/");
const isProductPage = /\/dp\/[A-Z0-9]{10}/.test(url);

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getBestSellersUrl") {
    const url = getBestSellersUrl();
    const detected = url.includes("node=") || url.includes("/zgbs/");
    sendResponse({ url, detected });
  }
});

if (!isSearchPage && !isProductPage) {
  // Not a relevant page, do nothing
} else {
  injectButton();
}

function getBestSellersUrl() {
  let nodeId = null;
  let department = null;

  // --- Strategy 1: URL param ?node=XXXX or &node=XXXX ---
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("node")) {
    nodeId = urlParams.get("node");
  }

  // --- Strategy 2: Hidden input #searchNodeID ---
  const hiddenNode = document.getElementById("searchNodeID");
  if (!nodeId && hiddenNode) {
    nodeId = hiddenNode.value;
  }

  // --- Strategy 3: Breadcrumb links with /b?node= ---
  if (!nodeId) {
    const breadcrumbs = document.querySelectorAll('a[href*="/b?node="], a[href*="/b/?node="]');
    if (breadcrumbs.length > 0) {
      // Use the last breadcrumb (most specific category)
      const lastCrumb = breadcrumbs[breadcrumbs.length - 1];
      const crumbUrl = new URL(lastCrumb.href);
      nodeId = crumbUrl.searchParams.get("node");
    }
  }

  // --- Strategy 4: Sidebar "Department" filter links ---
  if (!nodeId) {
    const sidebarLinks = document.querySelectorAll('#departments a[href*="node="], .a-expander-content a[href*="node="]');
    if (sidebarLinks.length > 0) {
      const sidebarUrl = new URL(sidebarLinks[0].href);
      nodeId = sidebarUrl.searchParams.get("node");
    }
  }

  // --- Strategy 5: Product page — look for Best Sellers Rank section ---
  if (!nodeId && isProductPage) {
    const rankLinks = document.querySelectorAll('#SalesRank a[href*="/zgbs/"], #detailBulletsWrapper_feature_div a[href*="/zgbs/"]');
    if (rankLinks.length > 0) {
      const rankUrl = new URL(rankLinks[0].href);
      // zgbs URLs look like /Best-Sellers-DEPARTMENT/zgbs/dept/nodeId
      const pathParts = rankUrl.pathname.split("/").filter(Boolean);
      // Find the index of "zgbs" in the path
      const zgbsIdx = pathParts.indexOf("zgbs");
      if (zgbsIdx !== -1) {
        department = pathParts[zgbsIdx + 1] || null;
        nodeId = pathParts[zgbsIdx + 2] || null;
      }
    }
  }

  // Build the URL
  if (nodeId) {
    if (department) {
      return `https://www.amazon.com/Best-Sellers/zgbs/${department}/${nodeId}?tag=${AFFILIATE_TAG}`;
    }
    return `https://www.amazon.com/gp/bestsellers/ref=zg_bs_nav/?node=${nodeId}&tag=${AFFILIATE_TAG}`;
  }

  // Fallback: Amazon top-level best sellers
  return `https://www.amazon.com/gp/bestsellers/?tag=${AFFILIATE_TAG}`;
}

function injectButton() {
  // Avoid injecting twice
  if (document.getElementById("amz-bestsellers-btn")) return;

  const bestSellersUrl = getBestSellersUrl();

  const btn = document.createElement("a");
  btn.id = "amz-bestsellers-btn";
  btn.href = bestSellersUrl;
  btn.target = "_blank";
  btn.rel = "noopener noreferrer";
  btn.title = "View Best Sellers in this category";
  btn.innerText = "📊 Best Sellers";

  Object.assign(btn.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "999999",
    background: "#ff9900",
    color: "#111",
    fontFamily: "Arial, sans-serif",
    fontSize: "14px",
    fontWeight: "bold",
    padding: "10px 16px",
    borderRadius: "24px",
    textDecoration: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    opacity: "0.75",
    transition: "opacity 0.2s, transform 0.2s",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "1";
    btn.style.transform = "scale(1.05)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "0.75";
    btn.style.transform = "scale(1)";
  });

  document.body.appendChild(btn);
}
