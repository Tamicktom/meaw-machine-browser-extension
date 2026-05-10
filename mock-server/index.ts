//* Libraries imports
import { openapi } from "@elysia/openapi";
import { Elysia, status, t } from "elysia";

//* Local imports
import { PROTOCOL_VERSION } from "../utils/protocol/messages";
import type { ServerCommandEnvelope } from "../utils/protocol/messages";

const DEFAULT_PORT = 8787;

function resolvePort(): number {
  const raw = process.env.PORT;
  if (raw == null || raw === "") return DEFAULT_PORT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_PORT;
}

const SERVER_HOST = process.env.HOST ?? "127.0.0.1";
const SERVER_PORT = resolvePort();

function buildWsUrl(port: number): string {
  return `ws://${SERVER_HOST}:${port}/ws`;
}

type WsClient = { send(data: string): void };

const clients = new Set<WsClient>();

function logIncomingMessage(message: unknown): void {
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message) as unknown;
      console.log("[meaw-mock] <-", JSON.stringify(parsed).slice(0, 500));
    } catch {
      console.log("[meaw-mock] <- (non-json)", message.slice(0, 200));
    }
    return;
  }
  console.log("[meaw-mock] <-", JSON.stringify(message).slice(0, 500));
}

const healthResponse = t.Object({
  ok: t.Literal(true),
  protocolVersion: t.Number(),
  wsUrl: t.String(),
  connectedClients: t.Number(),
});

const rootResponse = t.Object({
  ok: t.Literal(true),
  protocolVersion: t.Number(),
  wsUrl: t.String(),
  connectedClients: t.Number(),
  hint: t.String(),
});

const commandBody = t.Object({
  command: t.Object({
    id: t.String(),
    action: t.String(),
    params: t.Record(t.String(), t.Unknown()),
  }),
});

const commandOkResponse = t.Object({
  ok: t.Literal(true),
  sent: t.Number(),
});

const commandUnavailableResponse = t.Object({
  ok: t.Literal(false),
  sent: t.Literal(0),
  error: t.String(),
});

const app = new Elysia()
  .use(
    openapi({
      documentation: {
        info: {
          title: "Meaw Machine mock control server",
          version: "1.0.0",
          description:
            "HTTP surface for local testing of the browser extension WebSocket protocol. Interactive docs: /openapi. Raw spec: /openapi/json.",
        },
      },
    }),
  )
  .get(
    "/health",
    () => ({
      ok: true as const,
      protocolVersion: PROTOCOL_VERSION,
      wsUrl: buildWsUrl(SERVER_PORT),
      connectedClients: clients.size,
    }),
    {
      response: {
        200: healthResponse,
      },
      detail: {
        summary: "Health and connection info",
        description: "Returns protocol version, WebSocket URL for the extension popup, and number of connected clients.",
      },
    },
  )
  .get(
    "/",
    () => ({
      ok: true as const,
      protocolVersion: PROTOCOL_VERSION,
      wsUrl: buildWsUrl(SERVER_PORT),
      connectedClients: clients.size,
      hint: 'POST /command with body { "command": { "id", "action", "params" } } to broadcast to all connected extensions.',
    }),
    {
      response: {
        200: rootResponse,
      },
      detail: {
        summary: "Same as health plus usage hint",
      },
    },
  )
  .post(
    "/command",
    ({ body }) => {
      if (clients.size === 0) {
        return status(503, {
          ok: false as const,
          sent: 0 as const,
          error: "No WebSocket clients connected",
        });
      }
      const envelope: ServerCommandEnvelope = {
        type: "command",
        command: {
          id: body.command.id,
          action: body.command.action as ServerCommandEnvelope["command"]["action"],
          params: body.command.params as ServerCommandEnvelope["command"]["params"],
        },
      };
      const json = JSON.stringify(envelope);
      let sent = 0;
      for (const ws of clients) {
        try {
          ws.send(json);
          sent++;
        } catch {
          clients.delete(ws);
        }
      }
      return { ok: true as const, sent };
    },
    {
      body: commandBody,
      response: {
        200: commandOkResponse,
        503: commandUnavailableResponse,
      },
      detail: {
        summary: "Broadcast command to all connected extensions",
        description:
          "Sends a protocol `command` envelope over WebSocket to each connected client. Returns 503 when no WebSocket client is connected.",
      },
    },
  )
  .ws("/ws", {
    detail: {
      hide: true,
    },
    open(ws) {
      clients.add(ws as WsClient);
      console.log("[meaw-mock] client connected, total:", clients.size);
    },
    close(ws) {
      clients.delete(ws as WsClient);
      console.log("[meaw-mock] client disconnected, total:", clients.size);
    },
    message(_ws, message) {
      logIncomingMessage(message);
    },
  });

// Elysia's Bun adapter defaults `reusePort: true`, which silently allows
// multiple mock-server processes to bind to the same port. In a development
// setting that's a footgun: the extension stays "Connected" even after the
// user stops what they think is the only server, because another stale
// instance is still answering. Force `reusePort: false` so a duplicate launch
// fails loudly with a clear hint.
try {
  app.listen({ port: SERVER_PORT, hostname: SERVER_HOST, reusePort: false });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[meaw-mock] Failed to bind ${SERVER_HOST}:${SERVER_PORT}: ${message}`);
  console.error(
    `[meaw-mock] Another process is already listening on port ${SERVER_PORT}. ` +
      `Stop it first, e.g.: lsof -ti:${SERVER_PORT} | xargs -r kill`,
  );
  process.exit(1);
}

console.log(
  `[meaw-mock]
  HTTP http://${SERVER_HOST}:${SERVER_PORT}/health
  OpenAPI http://${SERVER_HOST}:${SERVER_PORT}/openapi
  WebSocket ${buildWsUrl(SERVER_PORT)}
  
  Clients: ${clients.size}`,
);
