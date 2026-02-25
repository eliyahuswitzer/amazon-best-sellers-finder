// Amazon Best Sellers Finder - content.js
// To update the affiliate tag, change the value below:
const AFFILIATE_TAG = "andrewswitzer-20";

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getBestSellersUrl") {
    const result = getBestSellersUrl();
    sendResponse(result);
  }
});

// Only inject button on search or product pages
const currentUrl = window.location.href;
const isSearchPage = currentUrl.includes("/s?") || /\/s\//.test(currentUrl);
const isProductPage = /\/dp\/[A-Z0-9]{10}/.test(currentUrl);

if (isSearchPage || isProductPage) {
  injectButton();
}

// ─── NODE DETECTION ──────────────────────────────────────────────────────────

function getBestSellersUrl() {
  const nodeInfo = detectNode();
  if (nodeInfo && nodeInfo.nodeId) {
    const url = `https://www.amazon.com/gp/bestsellers/?node=${nodeInfo.nodeId}&tag=${AFFILIATE_TAG}`;
    return { url, detected: true, label: nodeInfo.label || null };
  }
  return {
    url: `https://www.amazon.com/gp/bestsellers/?tag=${AFFILIATE_TAG}`,
    detected: false,
    label: null,
  };
}

function detectNode() {
  // Try strategies in order of specificity, return first match

  // 1. Current URL has rh=n%3AXXXXX (e.g. after clicking a department in sidebar)
  //    Amazon encodes the node as n:XXXXX inside the rh parameter
  const fromRh = extractNodeFromRh(window.location.href);
  if (fromRh) return fromRh;

  // 2. Current URL has plain node= param
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("node")) {
    return { nodeId: urlParams.get("node") };
  }

  // 3. Hidden input #searchNodeID (Amazon sometimes puts this on search pages)
  const hiddenNode = document.getElementById("searchNodeID");
  if (hiddenNode && hiddenNode.value) {
    return { nodeId: hiddenNode.value };
  }

  // 4. Sidebar department/category links containing rh=n%3A
  //    These appear in the left panel under "Department", "Category" etc.
  //    Pick the most specific (deepest) one available.
  const sidebarNode = extractNodeFromSidebarLinks();
  if (sidebarNode) return sidebarNode;

  // 5. Breadcrumb links: /b?node=XXXXX or /b/?node=XXXXX
  const breadcrumbNode = extractNodeFromBreadcrumbs();
  if (breadcrumbNode) return breadcrumbNode;

  // 6. Product page — Best Sellers Rank links that go to /zgbs/
  const zgbsNode = extractNodeFromZgbsLinks();
  if (zgbsNode) return zgbsNode;

  return null;
}

// Pulls n:XXXXX out of the rh= URL parameter (handles encoded and decoded forms)
function extractNodeFromRh(urlStr) {
  try {
    const params = new URLSearchParams(new URL(urlStr).search);
    const rh = params.get("rh");
    if (!rh) return null;

    // rh can look like "n:3760901" or "n:3760901,p_n_feature_two_browse-bin:..."
    // It may be URL-encoded as "n%3A3760901"
    const decoded = decodeURIComponent(rh);
    const match = decoded.match(/(?:^|[,|])n:(\d+)/);
    if (match) return { nodeId: match[1] };
  } catch (e) {}
  return null;
}

// Looks at ALL links on the page for rh=n%3A patterns (sidebar, filters, etc.)
// Prefers links inside known sidebar/filter containers; falls back to any link.
function extractNodeFromSidebarLinks() {
  // Selectors that typically contain the sidebar filter links on Amazon search pages
  const containerSelectors = [
    "#departments",
    "#filters",
    "#s-refinements",
    ".s-refinement-container",
    "[data-cel-widget='left-pane']",
    "#leftNav",
    ".a-section.a-spacing-none.a-spacing-top-micro",
  ];

  let candidates = [];

  for (const sel of containerSelectors) {
    const container = document.querySelector(sel);
    if (!container) continue;
    const links = container.querySelectorAll("a[href]");
    links.forEach((a) => {
      const node = extractNodeFromRh(a.href);
      if (node) {
        // Try to grab the visible label for this link
        node.label = a.innerText.trim() || null;
        candidates.push(node);
      }
    });
    if (candidates.length > 0) break;
  }

  // If nothing found in known containers, scan ALL links on page
  if (candidates.length === 0) {
    document.querySelectorAll("a[href]").forEach((a) => {
      const node = extractNodeFromRh(a.href);
      if (node) {
        node.label = a.innerText.trim() || null;
        candidates.push(node);
      }
    });
  }

  // Prefer the most specific node: heuristically the one with the longest
  // matching text or just pick the first one
  return candidates.length > 0 ? candidates[0] : null;
}

// Looks for breadcrumb links like /b?node=XXXX
function extractNodeFromBreadcrumbs() {
  const crumbs = document.querySelectorAll('a[href*="/b?node="], a[href*="/b/?node="]');
  if (crumbs.length === 0) return null;
  // Most specific = last breadcrumb
  const last = crumbs[crumbs.length - 1];
  const nodeParam = new URL(last.href).searchParams.get("node");
  if (nodeParam) return { nodeId: nodeParam, label: last.innerText.trim() || null };
  return null;
}

// Product pages: Best Sellers Rank links go to /zgbs/DEPT/NODE
function extractNodeFromZgbsLinks() {
  const rankLinks = document.querySelectorAll('a[href*="/zgbs/"]');
  if (rankLinks.length === 0) return null;
  for (const a of rankLinks) {
    try {
      const pathParts = new URL(a.href).pathname.split("/").filter(Boolean);
      const zgbsIdx = pathParts.indexOf("zgbs");
      if (zgbsIdx !== -1 && pathParts[zgbsIdx + 2]) {
        return {
          nodeId: pathParts[zgbsIdx + 2],
          dept: pathParts[zgbsIdx + 1] || null,
          label: a.innerText.trim() || null,
        };
      }
    } catch (e) {}
  }
  return null;
}

// ─── BUTTON INJECTION ────────────────────────────────────────────────────────

function injectButton() {
  if (document.getElementById("amz-bestsellers-btn")) return;

  const { url, detected, label } = getBestSellersUrl();
  const btnLabel = detected && label ? `📊 Best Sellers: ${label}` : "📊 Best Sellers";

  const btn = document.createElement("a");
  btn.id = "amz-bestsellers-btn";
  btn.href = url;
  btn.target = "_blank";
  btn.rel = "noopener noreferrer";
  btn.title = "View Best Sellers in this category";
  btn.innerText = btnLabel;

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
    maxWidth: "280px",
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

  // Re-run detection after a short delay — Amazon sometimes loads sidebar reactively
  setTimeout(() => {
    const updated = getBestSellersUrl();
    if (updated.detected && updated.url !== url) {
      btn.href = updated.url;
      if (updated.label) {
        btn.innerText = `📊 Best Sellers: ${updated.label}`;
      }
    }
  }, 2000);
}
