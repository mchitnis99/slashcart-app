import { chromium, type Browser } from "playwright";

export type WalmartResult = {
  name: string;
  price: number;
  inStock: boolean;
};

export async function scrapeWalmartPrice(
  itemName: string,
  zipCode?: string
): Promise<WalmartResult | null> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
    });

    // Set Walmart's location cookie so results reflect the right store
    if (zipCode) {
      await context.addCookies([
        {
          name: "location-data",
          value: JSON.stringify({ postalCode: zipCode }),
          domain: ".walmart.com",
          path: "/",
        },
      ]);
    }

    const page = await context.newPage();

    const query = encodeURIComponent(itemName);
    await page.goto(`https://www.walmart.com/search?q=${query}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // 1. Try __NEXT_DATA__ — Walmart uses Next.js internally and embeds full product
    //    data in the page as JSON, which is far more reliable than DOM selectors.
    const fromNextData = await page.evaluate(() => {
      try {
        const el = document.getElementById("__NEXT_DATA__");
        if (!el) return null;
        const json = JSON.parse(el.textContent || "");

        // Walk the nested search result structure looking for the first item with a price.
        // The exact path varies by Walmart deployment; we search broadly.
        const stacks =
          json?.props?.pageProps?.initialData?.searchResult?.itemStacks ??
          json?.props?.pageProps?.searchResult?.itemStacks ?? [];

        for (const stack of stacks) {
          for (const item of stack?.items ?? []) {
            const price =
              item?.price?.currentPrice?.price ??
              item?.priceInfo?.currentPrice?.price ??
              item?.price?.primary ??
              item?.primaryOffer?.offerPrice;
            const name = item?.name ?? item?.title ?? "";
            if (typeof price === "number" && price > 0) {
              return { name, price };
            }
            // price might be a string like "2.48"
            const parsed = parseFloat(price);
            if (!isNaN(parsed) && parsed > 0) {
              return { name, price: parsed };
            }
          }
        }
      } catch {
        // JSON parse failed — page might be a CAPTCHA or error page
      }
      return null;
    });

    if (fromNextData) {
      return { name: fromNextData.name || itemName, price: fromNextData.price, inStock: true };
    }

    // 2. Try JSON-LD structured data
    const fromLd = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || "");
          // ItemList
          if (data["@type"] === "ItemList") {
            for (const entry of data.itemListElement ?? []) {
              const item = entry.item ?? entry;
              const price = item?.offers?.price ?? item?.offers?.lowPrice;
              if (price && Number(price) > 0) {
                return { name: item.name ?? "", price: Number(price) };
              }
            }
          }
          // Single Product
          if (data["@type"] === "Product") {
            const price = data.offers?.price ?? data.offers?.lowPrice;
            if (price && Number(price) > 0) {
              return { name: data.name ?? "", price: Number(price) };
            }
          }
        } catch {}
      }
      return null;
    });

    if (fromLd) {
      return { name: fromLd.name || itemName, price: fromLd.price, inStock: true };
    }

    // 3. DOM fallback — try aria-labels on price elements, which are more stable
    //    than class names across Walmart redesigns.
    const fromDom = await page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('[aria-label*="current price"]'),
        ...document.querySelectorAll('[data-automation-id="product-price"]'),
        ...document.querySelectorAll('[itemprop="price"]'),
      ];

      for (const el of candidates) {
        const raw =
          el.getAttribute("aria-label") ??
          el.getAttribute("content") ??
          el.textContent ??
          "";
        const match = raw.match(/\$?(\d+\.\d{1,2})/);
        if (!match) continue;

        const price = parseFloat(match[1]);
        if (price <= 0) continue;

        // Walk up to find the product card and get its title
        const card = el.closest("[data-item-id]") ?? el.closest("li");
        const nameEl =
          card?.querySelector('[data-automation-id="product-title"]') ??
          card?.querySelector("a[href*='/ip/']");
        return { name: nameEl?.textContent?.trim() ?? "", price };
      }
      return null;
    });

    if (fromDom) {
      return { name: fromDom.name || itemName, price: fromDom.price, inStock: true };
    }

    return null;
  } catch {
    return null;
  } finally {
    await browser?.close();
  }
}
