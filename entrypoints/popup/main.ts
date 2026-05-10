//* Libraries imports
import type { PopupToSwMessage, SwToPopupMessage } from "~/utils/bridge-messages";

//* Local imports
import { STORAGE_WS_URL } from "~/utils/storage-keys";

const urlInput = document.getElementById("meaw-ws-url") as HTMLInputElement | null;
const connectBtn = document.getElementById("meaw-connect") as HTMLButtonElement | null;
const disconnectBtn = document.getElementById("meaw-disconnect") as HTMLButtonElement | null;
const statusEl = document.getElementById("meaw-status") as HTMLDivElement | null;
const controlledEl = document.getElementById("meaw-controlled") as HTMLDivElement | null;

function renderStatus(payload: SwToPopupMessage) {
  if (!statusEl || !controlledEl) return;
  const socketLabel =
    payload.socketState === "open"
      ? "Connected"
      : payload.socketState === "connecting"
        ? "Connecting…"
        : payload.socketState === "error"
          ? "Error"
          : payload.socketState === "closed"
            ? "Disconnected"
            : "Idle";
  const detail = payload.socketDetail ? ` (${payload.socketDetail})` : "";
  statusEl.textContent = `Socket: ${socketLabel}${detail}`;
  if (payload.controlledTabIds.length === 0) {
    controlledEl.textContent = "Controlled tabs: none";
  } else {
    controlledEl.textContent = `Controlled tabs: ${payload.controlledTabIds.join(", ")}`;
  }
}

async function refreshStatus() {
  const msg: PopupToSwMessage = { source: "meaw.popup", kind: "request-status" };
  const response = await chrome.runtime.sendMessage(msg);
  if (response && typeof response === "object" && (response as SwToPopupMessage).target === "meaw.popup") {
    renderStatus(response as SwToPopupMessage);
    const payload = response as SwToPopupMessage;
    if (urlInput && payload.wsUrl) {
      urlInput.value = payload.wsUrl;
    }
  }
}

function wireUi() {
  if (!urlInput || !connectBtn || !disconnectBtn) return;

  void chrome.storage.sync.get([STORAGE_WS_URL]).then((stored) => {
    const v = stored[STORAGE_WS_URL];
    if (typeof v === "string") {
      urlInput.value = v;
    }
  });

  connectBtn.addEventListener("click", () => {
    const wsUrl = urlInput.value.trim();
    if (!wsUrl) {
      return;
    }
    const msg: PopupToSwMessage = { source: "meaw.popup", kind: "connect", wsUrl };
    void chrome.runtime.sendMessage(msg).then(() => void refreshStatus());
  });

  disconnectBtn.addEventListener("click", () => {
    const msg: PopupToSwMessage = { source: "meaw.popup", kind: "disconnect" };
    void chrome.runtime.sendMessage(msg).then(() => void refreshStatus());
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (message && typeof message === "object" && (message as SwToPopupMessage).target === "meaw.popup") {
      renderStatus(message as SwToPopupMessage);
      const payload = message as SwToPopupMessage;
      if (urlInput && payload.wsUrl) {
        urlInput.value = payload.wsUrl;
      }
    }
  });

  void refreshStatus();
}

wireUi();
