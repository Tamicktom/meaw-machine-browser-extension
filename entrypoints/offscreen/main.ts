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

// Detaches all event handlers from a WebSocket so its async close/error events
// cannot interfere with a newer socket that has replaced it in `socket`.
function detachSocketHandlers(ws: WebSocket): void {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
}

function openSocket(url: string): void {
  // Idempotency: if we already have a live socket to the same URL, do nothing.
  // Without this, repeated `socket-connect` messages (e.g. from the service
  // worker waking up via the keepalive alarm) would tear down and recreate the
  // socket every time, which can leave duplicate connections alive and cause
  // the mock server to broadcast each command to multiple clients.
  if (connectUrl === url && socket) {
    if (socket.readyState === WebSocket.OPEN) {
      manualDisconnect = false;
      forwardState("open");
      return;
    }
    if (socket.readyState === WebSocket.CONNECTING) {
      manualDisconnect = false;
      forwardState("connecting");
      return;
    }
  }

  manualDisconnect = false;
  connectUrl = url;
  forwardState("connecting");

  // Cleanly retire the previous socket: drop its handlers first so its
  // pending close/error events cannot null out the new `socket` reference
  // or schedule a stale reconnect that would duplicate the connection.
  const previousSocket = socket;
  socket = null;
  if (previousSocket) {
    detachSocketHandlers(previousSocket);
    try {
      previousSocket.close();
    } catch {
      // ignore
    }
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
    if (socket !== ws) return;
    reconnectAttempt = 0;
    forwardState("open");
    sendEnvelope({
      type: "extension.connected",
      protocolVersion: PROTOCOL_VERSION,
      payload: {},
    });
  };

  ws.onmessage = (ev) => {
    if (socket !== ws) return;
    if (typeof ev.data === "string") {
      forwardLine(ev.data);
    }
  };

  ws.onerror = () => {
    if (socket !== ws) return;
    forwardState("error", "WebSocket error");
  };

  ws.onclose = (ev) => {
    // Ignore close events from sockets that have already been replaced.
    if (socket !== ws) return;
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
