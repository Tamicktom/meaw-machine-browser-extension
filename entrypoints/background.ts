//* Libraries imports
import { defineBackground } from "wxt/utils/define-background";

//* Local imports
import type {
  CaptureScreenshotParams,
  CommandErrorPayload,
  CommandResultPayload,
  ExtensionEventEnvelope,
  GetContentParams,
  ReleaseTabParams,
  ServerCommand,
  TabCloseParams,
  TabNavigateParams,
} from "~/utils/protocol/messages";
import { PROTOCOL_VERSION, parseJsonEnvelope } from "~/utils/protocol/messages";
import type {
  OffscreenToSwMessage,
  PopupToSwMessage,
  SwToOffscreenMessage,
  SwToPopupMessage,
} from "~/utils/bridge-messages";
import { BRIDGE_SOURCE_OFFSCREEN } from "~/utils/bridge-messages";
import { validateTabNavigateUrl } from "~/utils/commands/validate-tab-navigate-url";
import { STORAGE_WS_URL } from "~/utils/storage-keys";

const CONTROLLED_SCRIPT = "meaw-controlled.js";

const controlledTabIds = new Set<number>();

let socketUiState: SwToPopupMessage["socketState"] = "idle";
let socketUiDetail: string | undefined;
let lastWsUrl: string | null = null;

function broadcastPopupStatus() {
  const msg: SwToPopupMessage = {
    target: "meaw.popup",
    kind: "status",
    wsUrl: lastWsUrl,
    socketState: socketUiState,
    socketDetail: socketUiDetail,
    controlledTabIds: Array.from(controlledTabIds),
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function setSocketUi(state: SwToPopupMessage["socketState"], detail?: string) {
  socketUiState = state;
  socketUiDetail = detail;
  broadcastPopupStatus();
}

async function emitToServer(payload: ExtensionEventEnvelope["payload"], type: ExtensionEventEnvelope["type"], correlationId?: string) {
  const envelope: ExtensionEventEnvelope = {
    type,
    protocolVersion: PROTOCOL_VERSION,
    correlationId,
    payload,
  };
  const msg: SwToOffscreenMessage = {
    target: "meaw.offscreen",
    kind: "socket-send",
    payload: envelope,
  };
  try {
    await chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.warn("[meaw] Could not reach offscreen to emit event", e);
  }
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");

  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [offscreenUrl],
    });
    if (contexts.length > 0) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Maintain WebSocket connection for remote browser control commands.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Only a single offscreen")) {
      throw err;
    }
  }
}

async function handleTabNavigate(command: ServerCommand, params: TabNavigateParams): Promise<number> {
  const parsed = validateTabNavigateUrl(params.url);

  let tabId: number;
  if (params.tabId != null) {
    try {
      await chrome.tabs.update(params.tabId, { url: parsed.href, active: true });
      tabId = params.tabId;
    } catch {
      const created = await chrome.tabs.create({ url: parsed.href, active: true });
      if (created.id == null) throw new Error("Could not create tab");
      tabId = created.id;
    }
  } else {
    const created = await chrome.tabs.create({ url: parsed.href, active: true });
    if (created.id == null) throw new Error("Could not create tab");
    tabId = created.id;
  }

  controlledTabIds.add(tabId);
  await emitToServer({ tabId, controlled: true }, "tab.state");
  await injectControlledOverlay(tabId);
  return tabId;
}

async function handleTabClose(command: ServerCommand, params: TabCloseParams): Promise<void> {
  try {
    await chrome.tabs.remove(params.tabId);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "tab.close failed");
  }
}

async function activateTabForCapture(tabId: number): Promise<number> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId == null) throw new Error("Tab has no window");
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
  await sleep(200);
  return tab.windowId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleCaptureScreenshot(command: ServerCommand, params: CaptureScreenshotParams): Promise<{ mimeType: string; base64: string }> {
  let resolvedTabId: number | undefined = params.tabId;
  if (resolvedTabId == null) {
    const tabsList = await chrome.tabs.query({ active: true, currentWindow: true });
    resolvedTabId = tabsList[0]?.id;
  }
  if (resolvedTabId == null) throw new Error("No tab to capture");
  if (!controlledTabIds.has(resolvedTabId)) {
    controlledTabIds.add(resolvedTabId);
    await emitToServer({ tabId: resolvedTabId, controlled: true }, "tab.state");
  }

  const windowId = await activateTabForCapture(resolvedTabId);
  const format = params.format === "jpeg" ? "jpeg" : "png";
  const options: chrome.tabs.CaptureVisibleTabOptions = {
    format,
  };
  if (format === "jpeg" && params.quality != null) {
    options.quality = Math.min(100, Math.max(1, params.quality));
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, options);
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) throw new Error("Invalid capture data");
  return { mimeType, base64 };
}

async function handleGetContent(command: ServerCommand, params: GetContentParams): Promise<{ mode: string; content: string; title: string; url: string }> {
  let resolvedTabId: number | undefined = params.tabId;
  if (resolvedTabId == null) {
    const tabsList = await chrome.tabs.query({ active: true, currentWindow: true });
    resolvedTabId = tabsList[0]?.id;
  }
  if (resolvedTabId == null) throw new Error("No tab for content");

  await injectControlledOverlay(resolvedTabId);
  await sleep(50);

  const mode = params.mode === "html" ? "html" : "text";
  const response = await chrome.tabs.sendMessage(resolvedTabId, {
    type: "MEAW_GET_CONTENT",
    mode,
  });
  if (!response || typeof response !== "object") {
    throw new Error("Content script did not respond; ensure the tab is controlled or try again after load.");
  }
  const r = response as Record<string, unknown>;
  if (typeof r.content !== "string" || typeof r.title !== "string" || typeof r.url !== "string") {
    throw new Error("Invalid content script response");
  }
  return {
    mode,
    content: r.content,
    title: r.title,
    url: r.url,
  };
}

async function handleReleaseTab(command: ServerCommand, params: ReleaseTabParams): Promise<void> {
  controlledTabIds.delete(params.tabId);
  await emitToServer({ tabId: params.tabId, controlled: false }, "tab.state");
  try {
    await chrome.tabs.sendMessage(params.tabId, { type: "MEAW_RELEASE" });
  } catch {
    // Tab may have no content script; ignore
  }
}

async function injectControlledOverlay(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [CONTROLLED_SCRIPT],
    });
  } catch (e) {
    console.warn("[meaw] overlay inject failed", e);
  }
}

async function executeServerCommand(command: ServerCommand): Promise<unknown> {
  switch (command.action) {
    case "tab.navigate":
      return await handleTabNavigate(command, command.params as TabNavigateParams);
    case "tab.close":
      await handleTabClose(command, command.params as TabCloseParams);
      return { closed: true };
    case "page.captureScreenshot":
      return await handleCaptureScreenshot(command, command.params as CaptureScreenshotParams);
    case "page.getContent":
      return await handleGetContent(command, command.params as GetContentParams);
    case "session.releaseTab":
      await handleReleaseTab(command, command.params as ReleaseTabParams);
      return { released: true };
    default:
      throw new Error(`Unknown action: ${String((command as ServerCommand).action)}`);
  }
}

async function routeIncomingSocketLine(raw: string) {
  const parsed = parseJsonEnvelope(raw);
  if (!parsed) {
    console.warn("[meaw] Non-command message ignored:", raw.slice(0, 200));
    return;
  }
  const command = parsed.command;
  try {
    const result = await executeServerCommand(command);
    const payload: CommandResultPayload = {
      commandId: command.id,
      action: command.action,
      ok: true,
      result,
    };
    await emitToServer(payload, "command.result", command.id);
  } catch (err) {
    const payload: CommandErrorPayload = {
      commandId: command.id,
      action: command.action,
      ok: false,
      code: "COMMAND_FAILED",
      message: err instanceof Error ? err.message : String(err),
    };
    await emitToServer(payload, "command.error", command.id);
  }
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.alarms.create("meaw.keepalive", { periodInMinutes: 1 });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "meaw.keepalive") {
      // Wake service worker periodically for long sessions.
    }
  });

  chrome.runtime.onStartup.addListener(async () => {
    const stored = await chrome.storage.sync.get([STORAGE_WS_URL]);
    const url = stored[STORAGE_WS_URL];
    if (typeof url === "string" && url.length > 0) {
      lastWsUrl = url;
      await ensureOffscreenDocument();
      const msg: SwToOffscreenMessage = { target: "meaw.offscreen", kind: "socket-connect", url };
      await chrome.runtime.sendMessage(msg);
    }
  });

  void (async () => {
    const stored = await chrome.storage.sync.get([STORAGE_WS_URL]);
    const url = stored[STORAGE_WS_URL];
    if (typeof url === "string" && url.length > 0) {
      lastWsUrl = url;
      await ensureOffscreenDocument();
      await chrome.runtime.sendMessage({
        target: "meaw.offscreen",
        kind: "socket-connect",
        url,
      } satisfies SwToOffscreenMessage);
    }
  })();

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (controlledTabIds.has(tabId)) {
      controlledTabIds.delete(tabId);
      void emitToServer({ tabId, controlled: false }, "tab.state");
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!controlledTabIds.has(tabId)) return;
    if (changeInfo.status === "complete" || changeInfo.url) {
      void injectControlledOverlay(tabId);
    }
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (message && typeof message === "object" && (message as OffscreenToSwMessage).source === BRIDGE_SOURCE_OFFSCREEN) {
      const msg = message as OffscreenToSwMessage;
      if (msg.kind === "socket-line") {
        void routeIncomingSocketLine(msg.raw);
      }
      if (msg.kind === "socket-state") {
        setSocketUi(msg.state, msg.detail);
      }
      return false;
    }

    if (message && typeof message === "object" && (message as PopupToSwMessage).source === "meaw.popup") {
      const msg = message as PopupToSwMessage;
      if (msg.kind === "request-status") {
        sendResponse({
          target: "meaw.popup",
          kind: "status",
          wsUrl: lastWsUrl,
          socketState: socketUiState,
          socketDetail: socketUiDetail,
          controlledTabIds: Array.from(controlledTabIds),
        } satisfies SwToPopupMessage);
        return false;
      }
      if (msg.kind === "connect") {
        void (async () => {
          lastWsUrl = msg.wsUrl;
          await chrome.storage.sync.set({ [STORAGE_WS_URL]: msg.wsUrl });
          await ensureOffscreenDocument();
          const out: SwToOffscreenMessage = {
            target: "meaw.offscreen",
            kind: "socket-connect",
            url: msg.wsUrl,
          };
          await chrome.runtime.sendMessage(out);
          sendResponse({ ok: true });
        })();
        return true;
      }
      if (msg.kind === "disconnect") {
        void (async () => {
          const out: SwToOffscreenMessage = { target: "meaw.offscreen", kind: "socket-disconnect" };
          await chrome.runtime.sendMessage(out);
          sendResponse({ ok: true });
        })();
        return true;
      }
    }

    return false;
  });
});
