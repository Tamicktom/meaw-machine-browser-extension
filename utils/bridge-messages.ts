//* Internal Chrome runtime messaging (service worker ↔ offscreen ↔ popup).

import type { ExtensionEventEnvelope } from "./protocol/messages";

export const BRIDGE_SOURCE_OFFSCREEN = "meaw.bridge.offscreen" as const;

export type OffscreenToSwMessage =
  | {
      source: typeof BRIDGE_SOURCE_OFFSCREEN;
      kind: "socket-line";
      raw: string;
    }
  | {
      source: typeof BRIDGE_SOURCE_OFFSCREEN;
      kind: "socket-state";
      state: "connecting" | "open" | "closed" | "error";
      detail?: string;
    };

export type SwToOffscreenMessage =
  | {
      target: "meaw.offscreen";
      kind: "socket-connect";
      url: string;
    }
  | {
      target: "meaw.offscreen";
      kind: "socket-disconnect";
    }
  | {
      target: "meaw.offscreen";
      kind: "socket-send";
      payload: ExtensionEventEnvelope;
    };

export type PopupToSwMessage =
  | {
      source: "meaw.popup";
      kind: "request-status";
    }
  | {
      source: "meaw.popup";
      kind: "connect";
      wsUrl: string;
    }
  | {
      source: "meaw.popup";
      kind: "disconnect";
    };

export type SwToPopupMessage = {
  target: "meaw.popup";
  kind: "status";
  wsUrl: string | null;
  socketState: "idle" | "connecting" | "open" | "closed" | "error";
  socketDetail?: string;
  controlledTabIds: number[];
};
