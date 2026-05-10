//* Libraries imports
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

const ROOT_ID = "meaw-controlled-root";

function removeBanner() {
  const existing = document.getElementById(ROOT_ID);
  existing?.remove();
}

function mountBanner() {
  removeBanner();

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.setAttribute("data-meaw-controlled", "true");

  const shadow = host.attachShadow({ mode: "closed" });

  const strip = document.createElement("div");
  strip.setAttribute(
    "style",
    [
      "box-sizing:border-box",
      "position:fixed",
      "top:0",
      "left:0",
      "right:0",
      "z-index:2147483646",
      "pointer-events:none",
      "padding:8px 12px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "gap:8px",
      "background:#1e293b",
      "color:#f8fafc",
      'font:600 13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      "letter-spacing:0.02em",
      "border-bottom:1px solid rgba(248,250,252,0.15)",
      "box-shadow:0 2px 8px rgba(15,23,42,0.35)",
    ].join(";"),
  );

  const label = document.createElement("span");
  label.textContent = "This tab is remotely controlled by Meaw / LLM session";

  strip.appendChild(label);

  shadow.appendChild(strip);

  const injectPoint = document.documentElement;
  if (injectPoint.firstChild) {
    injectPoint.insertBefore(host, injectPoint.firstChild);
  } else {
    injectPoint.appendChild(host);
  }
}

function extractContent(mode: "text" | "html"): { content: string; title: string; url: string } {
  const title = document.title || "";
  const url = location.href;
  if (mode === "html") {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    const strip = clone.querySelector(`#${ROOT_ID}`);
    strip?.remove();
    return {
      content: clone.outerHTML.slice(0, 2_000_000),
      title,
      url,
    };
  }
  const bodyText = document.body?.innerText ?? "";
  return {
    content: bodyText.slice(0, 2_000_000),
    title,
    url,
  };
}

export default defineUnlistedScript(() => {
  mountBanner();

  type AugmentedWindow = Window & { __meawControlListeners?: boolean };
  const win = window as AugmentedWindow;
  if (!win.__meawControlListeners) {
    win.__meawControlListeners = true;
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!message || typeof message !== "object") return false;
      const msg = message as Record<string, unknown>;
      if (msg.type === "MEAW_GET_CONTENT") {
        const mode = msg.mode === "html" ? "html" : "text";
        sendResponse(extractContent(mode));
        return true;
      }
      if (msg.type === "MEAW_RELEASE") {
        removeBanner();
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });
  }
});
