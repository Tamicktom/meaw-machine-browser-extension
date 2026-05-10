//* Libraries imports
import { PROTOCOL_VERSION } from "~/utils/protocol/messages";
import type { ExtensionEventEnvelope } from "~/utils/protocol/messages";
import type { OffscreenToSwMessage, SwToOffscreenMessage } from "~/utils/bridge-messages";
import { BRIDGE_SOURCE_OFFSCREEN } from "~/utils/bridge-messages";

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let connectUrl: string | null = null;
let manualDisconnect = false;

function forwardState(state: Extract<OffscreenToSwMessage, { kind: "socket-state" }>["state"], detail?: string) {
  const msg: OffscreenToSwMessage = {
    source: BRIDGE_SOURCE_OFFSCREEN,
    kind: "socket-state",
    state,
    detail,
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function forwardLine(raw: string) {
  const msg: OffscreenToSwMessage = {
    source: BRIDGE_SOURCE_OFFSCREEN,
    kind: "socket-line",
    raw,
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function scheduleReconnect() {
  if (manualDisconnect || !connectUrl) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(30_000, 500 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void openSocket(connectUrl!);
  }, delay);
}

function sendEnvelope(envelope: ExtensionEventEnvelope) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(envelope));
}

function openSocket(url: string): void {
  manualDisconnect = false;
  connectUrl = url;
  forwardState("connecting");
  try {
    socket?.close();
  } catch {
    // ignore
  }
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    forwardState("error", e instanceof Error ? e.message : "WebSocket construct failed");
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
    forwardState("open");
    sendEnvelope({
      type: "extension.connected",
      protocolVersion: PROTOCOL_VERSION,
      payload: {},
    });
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      forwardLine(ev.data);
    }
  };

  ws.onerror = () => {
    forwardState("error", "WebSocket error");
  };

  ws.onclose = (ev) => {
    socket = null;
    sendEnvelope({
      type: "extension.disconnected",
      protocolVersion: PROTOCOL_VERSION,
      payload: { code: ev.code, reason: ev.reason },
    });
    forwardState("closed", `code=${ev.code}`);
    if (!manualDisconnect) {
      scheduleReconnect();
    }
  };
}

function closeSocket() {
  manualDisconnect = true;
  connectUrl = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  try {
    socket?.close();
  } catch {
    // ignore
  }
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!message || typeof message !== "object") return;
  const msg = message as SwToOffscreenMessage;
  if (msg.target !== "meaw.offscreen") return;

  if (msg.kind === "socket-connect") {
    openSocket(msg.url);
    return;
  }
  if (msg.kind === "socket-disconnect") {
    closeSocket();
    return;
  }
  if (msg.kind === "socket-send") {
    sendEnvelope(msg.payload);
  }
});
