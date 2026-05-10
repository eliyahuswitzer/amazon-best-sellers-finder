import requests
from bs4 import BeautifulSoup
import pandas as pd

# URL of the Amazon Best Sellers page for Men's Button-Down Shirts
url = "https://www.amazon.com/Best-Sellers-Clothing-Shoes-Jewelry-Mens-Button-Down-Shirts/zgbs/fashion/121177981011/"

# Fetch the page content
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}
response = requests.get(url, headers=headers)
response.raise_for_status()  # Ensure we notice bad responses

# Parse the HTML content
soup = BeautifulSoup(response.content, "html.parser")

# Find the product listings
product_elements = soup.select(".zg-item-immersion")

# Extract details for each product
products = []

for product in product_elements:
    name = product.select_one(".p13n-sc-truncate").get_text(strip=True)
    link = product.find("a", class_="a-link-normal")['href']
    full_link = f"https://www.amazon.com{link}"
    rating_element = product.select_one(".a-icon-alt")
    rating = rating_element.get_text(strip=True) if rating_element else "No rating"
    review_count_element = product.select_one(".a-size-small .a-link-normal")
    review_count = review_count_element.get_text(strip=True) if review_count_element else "No reviews"
    price_element = product.select_one(".p13n-sc-price")
    price = price_element.get_text(strip=True) if price_element else "No price"

    products.append({
        "Name": name,
        "Link": full_link,
        "Rating": rating,
        "Review Count": review_count,
        "Price": price
    })

# Convert to DataFrame
df = pd.DataFrame(products)

# Display the DataFrame
print(df)

# Save to CSV
df.to_csv("amazon_best_sellers.csv", index=False)

print("Data has been saved to amazon_best_sellers.csv")
