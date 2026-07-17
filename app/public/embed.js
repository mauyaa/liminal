/**
 * Liminal embeddable checkout button.
 *
 * Usage - paste anywhere on any website:
 *   <script src="https://app-eight-lovat-94.vercel.app/embed.js"
 *           data-liminal-sku="your-sku" async></script>
 *
 * Optional attributes:
 *   data-label="Buy now"   custom button text (default: live title + price)
 *   data-theme="light"     "dark" (default) or "light"
 *
 * Renders a button in place of the script tag that opens the hosted
 * checkout in a popup (Stripe-Checkout-style redirect model - the buyer's
 * wallet interaction happens on the hosted page, never on the host site,
 * so the host site needs no wallet code and never touches funds). Listing
 * title and price are fetched live from the same Solana Actions endpoint
 * wallets use, so the button can't drift from the real price.
 */
(function () {
  // currentScript is null when the tag is injected dynamically (tag
  // managers, next/script, etc.) - fall back to the newest unmounted
  // embed tag so both loading styles work.
  var script = document.currentScript;
  if (!script || !script.getAttribute("data-liminal-sku")) {
    var candidates = document.querySelectorAll(
      "script[data-liminal-sku]:not([data-liminal-mounted])"
    );
    if (candidates.length > 0) script = candidates[candidates.length - 1];
  }
  if (!script) return;
  script.setAttribute("data-liminal-mounted", "true");

  var sku = script.getAttribute("data-liminal-sku");
  if (!sku) {
    console.error("[liminal-embed] data-liminal-sku attribute is required");
    return;
  }

  var origin = new URL(script.src).origin;
  var checkoutUrl = origin + "/pay/" + encodeURIComponent(sku);
  var customLabel = script.getAttribute("data-label");
  var theme = script.getAttribute("data-theme") === "light" ? "light" : "dark";

  var button = document.createElement("button");
  button.type = "button";
  button.textContent = customLabel || "Buy with Liminal";
  button.setAttribute("aria-busy", "false");
  var s = button.style;
  s.display = "inline-flex";
  s.alignItems = "center";
  s.gap = "8px";
  s.padding = "0 22px";
  s.height = "44px";
  s.borderRadius = "9999px";
  s.border = theme === "light" ? "1px solid #e0e0e0" : "none";
  s.background = theme === "light" ? "#ffffff" : "#0a0a0a";
  s.color = theme === "light" ? "#0a0a0a" : "#ffffff";
  s.fontFamily = "system-ui, -apple-system, sans-serif";
  s.fontSize = "14px";
  s.fontWeight = "600";
  s.cursor = "pointer";
  s.transition = "opacity 120ms ease";
  button.onmouseenter = function () { s.opacity = "0.85"; };
  button.onmouseleave = function () { s.opacity = "1"; };

  button.addEventListener("click", function () {
    var w = 480;
    var h = 720;
    var left = Math.max(0, (window.screen.width - w) / 2);
    var top = Math.max(0, (window.screen.height - h) / 2);
    var popup = window.open(
      checkoutUrl,
      "liminal-checkout",
      "width=" + w + ",height=" + h + ",left=" + left + ",top=" + top
    );
    if (!popup) window.location.href = checkoutUrl; // popup blocked - navigate instead
  });

  script.parentNode.insertBefore(button, script);

  // Live label from the Actions endpoint (already CORS-open for wallets).
  if (!customLabel) {
    fetch(origin + "/api/actions/buy/" + encodeURIComponent(sku))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (meta) {
        if (meta && meta.label && meta.title) {
          button.textContent = meta.title + " · " + meta.label;
        }
      })
      .catch(function () {});
  }
})();
