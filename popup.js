// Amazon Best Sellers Finder - popup.js
const AFFILIATE_TAG = "andrewswitzer-20";

const link = document.getElementById("bestsellers-link");
const status = document.getElementById("status");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url) {
    setNotAmazon();
    return;
  }

  const url = tab.url;
  if (!url.includes("amazon.com")) {
    setNotAmazon();
    return;
  }

  // Ask the content script for the best sellers URL
  chrome.tabs.sendMessage(tab.id, { action: "getBestSellersUrl" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Fallback — build from current URL ourselves
      const fallbackUrl = buildFallbackUrl(url);
      link.href = fallbackUrl;
      status.textContent = "Using top-level Best Sellers (category not detected).";
      status.className = "status";
      return;
    }

    link.href = response.url;
    if (response.detected) {
      status.textContent = "✓ Category detected!";
      status.className = "status detected";
    } else {
      status.textContent = "Category not detected — showing all Best Sellers.";
      status.className = "status";
    }
  });
});

function setNotAmazon() {
  link.href = `https://www.amazon.com/gp/bestsellers/?tag=${AFFILIATE_TAG}`;
  link.textContent = "Browse Amazon Best Sellers →";
  status.textContent = "Not on Amazon — opens top Best Sellers.";
}

function buildFallbackUrl(url) {
  const params = new URLSearchParams(new URL(url).search);
  const node = params.get("node");
  if (node) {
    return `https://www.amazon.com/gp/bestsellers/ref=zg_bs_nav/?node=${node}&tag=${AFFILIATE_TAG}`;
  }
  return `https://www.amazon.com/gp/bestsellers/?tag=${AFFILIATE_TAG}`;
}
