# Amazon Best Sellers Finder

A Chrome browser extension that detects the category you're browsing on Amazon and gives you a one-click shortcut to the Best Sellers list for that category — with your Amazon Associates affiliate tag built in.

> **Note:** This repo intentionally contains **two related-but-separate tools** that both work with Amazon Best Sellers data:
> 1. A **Chrome extension** (documented first — the main project) that helps you *navigate to* Best Sellers pages
> 2. A **Python scraper** (`amazon_scrape.py`) that *extracts product data from* a Best Sellers page into a CSV — see [Python Scraper](#python-scraper) below
>
> They're kept in the same repo for convenience since they're both experiments on the same idea. They may split into separate repos later if either one grows.

## Features

- 📊 Floating **"Best Sellers" button** on Amazon search and product pages
- 🔍 Automatically detects the category/browse node from the page
- 🔗 Opens the exact Best Sellers list for that category in a new tab
- 💰 All links include your Amazon Associates affiliate tag
- 🪟 Extension popup also shows a quick link from the toolbar icon

## How to Load in Chrome (Developer Mode)

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **"Load unpacked"**
4. Select this folder (`amazon-bestsellers-extension`)
5. The extension is now active — navigate to any Amazon search or product page

## How It Works

When you visit an Amazon search results page or product page, the extension:
1. Tries to extract the category node ID from the URL, hidden inputs, breadcrumbs, or sidebar links
2. Injects a small floating button (bottom-right) that links to the Best Sellers page for that node
3. Falls back to Amazon's top-level Best Sellers page if no category is detected

## Changing the Affiliate Tag

The tag is defined in **two places** — update both if you ever change your Associates ID:

- `content.js` — line 2: `const AFFILIATE_TAG = "andrewswitzer-20";`
- `popup.js` — line 2: `const AFFILIATE_TAG = "andrewswitzer-20";`

## Publishing to the Chrome Web Store

1. Zip the entire folder contents (not the folder itself)
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 developer fee (if not already done)
4. Upload the zip and fill in the listing details
5. Submit for review (~1-3 days)

## Python Scraper

`amazon_scrape.py` is a standalone Python script — **not part of the Chrome extension**. It scrapes product data directly from a specific Amazon Best Sellers page and saves the results to a CSV.

**What it does:**
- Fetches a hard-coded Best Sellers URL (currently Men's Button-Down Shirts)
- Parses product name, link, rating, review count, and price using BeautifulSoup
- Writes results to `amazon_best_sellers.csv`

**Dependencies:**
```bash
pip install requests beautifulsoup4 pandas
```

**Running it:**
```bash
python amazon_scrape.py
```

The output CSV is `.gitignore`'d since it regenerates on every run.

## File Structure

```
amazon-bestsellers-extension/
├── manifest.json       # Chrome extension config (MV3)
├── content.js          # Injected into Amazon pages — detects category + shows button
├── popup.html          # Extension toolbar popup UI
├── popup.js            # Popup logic — queries content script for best sellers URL
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
