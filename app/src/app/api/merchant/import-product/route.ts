import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, rateLimitedResponse, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Store-connect import: given any product page URL, extract the product's
 * title, description, image, and price so a merchant can list something
 * they already sell elsewhere without retyping it.
 *
 * Extraction is standards-based, not brittle HTML scraping: JSON-LD
 * `Product` schema first (what Shopify, WooCommerce, BigCommerce, and most
 * storefronts emit for Google Shopping), Open Graph meta tags as the
 * fallback (what every link preview uses). If a page exposes neither, we
 * return what we found and the merchant fills the rest - never a guess.
 */

const MAX_HTML_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 8_000;

interface ImportedProduct {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  priceUsd: number | null;
  storeName: string | null;
  source: "json-ld" | "open-graph" | "mixed" | "none";
}

/**
 * SSRF guard: this endpoint fetches caller-supplied URLs from our server,
 * so refuse anything that could point back into private address space.
 * Hostname-literal checks only (public DNS names that resolve privately
 * are out of scope for a devnet demo - noted in README).
 */
function isBlockedUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("[")) return true;
  if (/^127\./.test(host) || /^0\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, property: string): string | null {
  // property/name attribute in either order relative to content.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

type JsonLdNode = Record<string, unknown>;

/** Flatten a JSON-LD document (raw node, array, or @graph) into nodes. */
function jsonLdNodes(doc: unknown): JsonLdNode[] {
  if (Array.isArray(doc)) return doc.flatMap(jsonLdNodes);
  if (doc && typeof doc === "object") {
    const node = doc as JsonLdNode;
    const graph = node["@graph"];
    return Array.isArray(graph) ? [node, ...graph.flatMap(jsonLdNodes)] : [node];
  }
  return [];
}

function isProductNode(node: JsonLdNode): boolean {
  const t = node["@type"];
  if (typeof t === "string") return t.toLowerCase() === "product";
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && x.toLowerCase() === "product");
  return false;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return decodeEntities(value);
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v);
      if (s) return s;
    }
    return null;
  }
  if (value && typeof value === "object") {
    // ImageObject and friends carry the string under url/contentUrl.
    const obj = value as JsonLdNode;
    return firstString(obj.url) ?? firstString(obj.contentUrl);
  }
  return null;
}

function extractPrice(offers: unknown): number | null {
  const candidates = Array.isArray(offers) ? offers : [offers];
  for (const offer of candidates) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as JsonLdNode;
    const raw = o.price ?? o.lowPrice ?? (o.priceSpecification as JsonLdNode | undefined)?.price;
    const price = typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

function parseProduct(html: string): ImportedProduct {
  let fromJsonLd: Partial<ImportedProduct> = {};

  const ldBlocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const block of ldBlocks) {
    try {
      const nodes = jsonLdNodes(JSON.parse(block[1]));
      const product = nodes.find(isProductNode);
      if (!product) continue;
      fromJsonLd = {
        title: firstString(product.name),
        description: firstString(product.description),
        imageUrl: firstString(product.image),
        priceUsd: extractPrice(product.offers),
      };
      break;
    } catch {
      // Malformed JSON-LD is common in the wild - just move on.
    }
  }

  const og = {
    title: metaContent(html, "og:title") ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null),
    description: metaContent(html, "og:description") ?? metaContent(html, "description"),
    imageUrl: metaContent(html, "og:image"),
    priceRaw: metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount"),
    storeName: metaContent(html, "og:site_name"),
  };
  const ogPrice = og.priceRaw ? parseFloat(og.priceRaw) : NaN;

  const result: ImportedProduct = {
    title: fromJsonLd.title ?? (og.title ? decodeEntities(og.title) : null),
    description: fromJsonLd.description ?? og.description,
    imageUrl: fromJsonLd.imageUrl ?? og.imageUrl,
    priceUsd: fromJsonLd.priceUsd ?? (Number.isFinite(ogPrice) && ogPrice > 0 ? ogPrice : null),
    storeName: og.storeName,
    source: "none",
  };

  const usedJsonLd = Object.values(fromJsonLd).some((v) => v != null);
  const usedOg = result.title != null || result.imageUrl != null || result.description != null;
  result.source = usedJsonLd && usedOg ? "mixed" : usedJsonLd ? "json-ld" : usedOg ? "open-graph" : "none";
  return result;
}

export async function POST(request: NextRequest) {
  if (await isRateLimited("import-product", requestIp(request), 10, 60)) {
    return rateLimitedResponse();
  }

  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) {
    return NextResponse.json({ message: "url is required" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return NextResponse.json({ message: "url must be a valid absolute URL" }, { status: 400 });
  }
  if (isBlockedUrl(url)) {
    return NextResponse.json({ message: "only public http(s) URLs can be imported" }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        // Storefronts commonly serve bot-fallback pages to bare fetch UAs.
        "User-Agent":
          "Mozilla/5.0 (compatible; LiminalImport/1.0; +https://app-eight-lovat-94.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    // Re-check after redirects so a public URL can't bounce us private.
    if (isBlockedUrl(new URL(res.url))) {
      return NextResponse.json({ message: "URL redirected somewhere non-public" }, { status: 400 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { message: `that page answered ${res.status} - check the URL is public` },
        { status: 422 }
      );
    }
    html = (await res.text()).slice(0, MAX_HTML_BYTES);
  } catch {
    return NextResponse.json(
      { message: "couldn't reach that page - check the URL and try again" },
      { status: 422 }
    );
  }

  const product = parseProduct(html);
  if (product.source === "none") {
    return NextResponse.json(
      { message: "no product data found on that page - fill the form manually" },
      { status: 422 }
    );
  }

  return NextResponse.json(product);
}
