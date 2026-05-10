/**
 * WebSocket protocol v1 — shared between extension client and remote LLM server.
 * All names and docs are in English.
 */

export const PROTOCOL_VERSION = 1 as const;

//* ─── Client → server ─────────────────────────────────────────────────────────

export type ExtensionEventType =
  | "extension.connected"
  | "extension.disconnected"
  | "command.result"
  | "command.error"
  | "tab.state";

export type ExtensionEventEnvelope = {
  type: ExtensionEventType;
  protocolVersion: typeof PROTOCOL_VERSION;
  correlationId?: string;
  payload: ExtensionEventPayload;
};

export type ExtensionEventPayload =
  | ExtensionConnectedPayload
  | ExtensionDisconnectedPayload
  | CommandResultPayload
  | CommandErrorPayload
  | TabStatePayload;

export type ExtensionConnectedPayload = {
  reason?: string;
};

export type ExtensionDisconnectedPayload = {
  code?: number;
  reason?: string;
};

export type CommandResultPayload = {
  commandId: string;
  action: string;
  ok: true;
  result: unknown;
};

export type CommandErrorPayload = {
  commandId: string;
  action?: string;
  ok: false;
  code: string;
  message: string;
};

export type TabStatePayload = {
  tabId: number;
  controlled: boolean;
};

//* ─── Server → client ─────────────────────────────────────────────────────────

export type ServerCommandEnvelope = {
  type: "command";
  command: ServerCommand;
};

export type ServerCommand = {
  id: string;
  action: ServerCommandAction;
  params: ServerCommandParams;
};

export type ServerCommandAction =
  | "tab.navigate"
  | "tab.close"
  | "page.captureScreenshot"
  | "page.getContent"
  | "session.releaseTab";

export type TabNavigateParams = {
  url: string;
  tabId?: number;
};

export type TabCloseParams = {
  tabId: number;
};

export type CaptureScreenshotParams = {
  tabId?: number;
  format?: "png" | "jpeg";
  quality?: number;
};

export type GetContentParams = {
  tabId?: number;
  mode?: "text" | "html";
};

export type ReleaseTabParams = {
  tabId: number;
};

export type ServerCommandParams =
  | TabNavigateParams
  | TabCloseParams
  | CaptureScreenshotParams
  | GetContentParams
  | ReleaseTabParams;

export function parseJsonEnvelope(raw: string): ServerCommandEnvelope | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    if (obj.type !== "command") return null;
    const command = obj.command;
    if (!command || typeof command !== "object") return null;
    const cmd = command as Record<string, unknown>;
    if (typeof cmd.id !== "string") return null;
    if (typeof cmd.action !== "string") return null;
    if (!cmd.params || typeof cmd.params !== "object" || Array.isArray(cmd.params)) return null;
    return {
      type: "command",
      command: {
        id: cmd.id,
        action: cmd.action as ServerCommandAction,
        params: cmd.params as ServerCommandParams,
      },
    };
  } catch {
    return null;
  }
}
