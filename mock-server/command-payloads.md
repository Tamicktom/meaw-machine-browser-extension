# `POST /command` payload examples

Reference for the mock control server's HTTP entrypoint that broadcasts a
**protocol v1 `command` envelope** over WebSocket to every connected extension
client. Keep this file in sync with [`utils/protocol/messages.ts`](../utils/protocol/messages.ts)
and the **WebSocket protocol** section in [`README.md`](../README.md).

- Endpoint: `POST http://127.0.0.1:8787/command`
- Content type: `application/json`
- Source of truth (route): [`mock-server/index.ts`](./index.ts)
- Source of truth (actions and params): [`utils/protocol/messages.ts`](../utils/protocol/messages.ts)

## Request body

```json
{
  "command": {
    "id": "string (unique per request, echoed back as commandId / correlationId)",
    "action": "tab.navigate | tab.close | page.captureScreenshot | page.getContent | session.releaseTab",
    "params": { }
  }
}
```

The mock server wraps `command` into the `ServerCommandEnvelope`:

```json
{
  "type": "command",
  "command": { "id": "...", "action": "...", "params": { } }
}
```

## Response shapes

- **200 OK** — at least one client received the broadcast.

```json
{ "ok": true, "sent": 1 }
```

- **503 Service Unavailable** — no extension is currently connected.

```json
{ "ok": false, "sent": 0, "error": "No WebSocket clients connected" }
```

## `tab.navigate`

Updates `tabId` if provided and valid; otherwise creates a new tab. The tab is
opened in the background and placed in the `meaw-machine` tab group, then
marked as controlled.

Params:

| Field   | Type     | Required | Notes                                            |
|---------|----------|----------|--------------------------------------------------|
| `url`   | `string` | yes      | Must be `http://` or `https://`.                 |
| `tabId` | `number` | no       | When omitted, a new tab is created.              |

Open a new controlled tab:

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "nav-1",
      "action": "tab.navigate",
      "params": { "url": "https://example.com" }
    }
  }'
```

Reuse an existing tab:

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "nav-2",
      "action": "tab.navigate",
      "params": { "url": "https://example.org", "tabId": 1234 }
    }
  }'
```

Expected `command.result` payload from the extension:

```json
{
  "commandId": "nav-1",
  "action": "tab.navigate",
  "ok": true,
  "result": 1234
}
```

## `tab.close`

Closes the given tab. Does not require the tab to be controlled.

Params:

| Field   | Type     | Required | Notes |
|---------|----------|----------|-------|
| `tabId` | `number` | yes      |       |

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "close-1",
      "action": "tab.close",
      "params": { "tabId": 1234 }
    }
  }'
```

Expected `command.result`:

```json
{
  "commandId": "close-1",
  "action": "tab.close",
  "ok": true,
  "result": { "closed": true }
}
```

## `page.captureScreenshot`

Captures the **visible viewport** of a controlled tab via
`chrome.tabs.captureVisibleTab`. Omit `tabId` only when there is exactly one
controlled tab. The mock server also auto-saves successful captures under
`mock-server/screenshots/`.

Params:

| Field     | Type                | Required | Notes                                                            |
|-----------|---------------------|----------|------------------------------------------------------------------|
| `tabId`   | `number`            | no       | Required when more than one controlled tab exists.               |
| `format`  | `"png" \| "jpeg"`   | no       | Defaults to `"png"`.                                             |
| `quality` | `number` (1..100)   | no       | Only used for `"jpeg"`; clamped to `[1, 100]`.                   |

Default PNG capture of the only controlled tab:

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "shot-1",
      "action": "page.captureScreenshot",
      "params": {}
    }
  }'
```

JPEG capture of a specific controlled tab with custom quality:

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "shot-2",
      "action": "page.captureScreenshot",
      "params": { "tabId": 1234, "format": "jpeg", "quality": 70 }
    }
  }'
```

Expected `command.result`:

```json
{
  "commandId": "shot-1",
  "action": "page.captureScreenshot",
  "ok": true,
  "result": {
    "mimeType": "image/png",
    "base64": "iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```

The `base64` field has no `data:` URL prefix.

## `page.getContent`

Reads the page content via the `meaw-controlled` content script. Returns
trimmed text or HTML (size-capped by the content script).

Params:

| Field   | Type                 | Required | Notes                                                         |
|---------|----------------------|----------|---------------------------------------------------------------|
| `tabId` | `number`             | no       | Defaults to the active tab in the current window.             |
| `mode`  | `"text" \| "html"`   | no       | Defaults to `"text"`.                                         |

Plain text from the active tab:

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "read-1",
      "action": "page.getContent",
      "params": { "mode": "text" }
    }
  }'
```

HTML from a specific tab:

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "read-2",
      "action": "page.getContent",
      "params": { "tabId": 1234, "mode": "html" }
    }
  }'
```

Expected `command.result`:

```json
{
  "commandId": "read-1",
  "action": "page.getContent",
  "ok": true,
  "result": {
    "mode": "text",
    "title": "Example Domain",
    "url": "https://example.com/",
    "content": "Example Domain\nThis domain is for use in illustrative examples..."
  }
}
```

## `session.releaseTab`

Unregisters the tab from extension control and removes the on-page UI strip.
The tab itself remains open.

Params:

| Field   | Type     | Required | Notes |
|---------|----------|----------|-------|
| `tabId` | `number` | yes      |       |

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{
    "command": {
      "id": "release-1",
      "action": "session.releaseTab",
      "params": { "tabId": 1234 }
    }
  }'
```

Expected `command.result`:

```json
{
  "commandId": "release-1",
  "action": "session.releaseTab",
  "ok": true,
  "result": { "released": true }
}
```

## Error envelope

Whenever the extension fails to execute a command, it emits a `command.error`
event over the WebSocket back to the mock server (visible in the mock's stdout
log):

```json
{
  "type": "command.error",
  "protocolVersion": 1,
  "correlationId": "shot-1",
  "payload": {
    "commandId": "shot-1",
    "action": "page.captureScreenshot",
    "ok": false,
    "code": "COMMAND_FAILED",
    "message": "page.captureScreenshot: no controlled tabs; control a tab first (e.g. tab.navigate) or pass tabId."
  }
}
```

The HTTP `POST /command` response itself stays `200 { ok: true, sent: N }` —
errors are reported asynchronously over the WebSocket.

## Tips

- Use unique `id` values per request so you can correlate `command.result` /
  `command.error` events in the mock server logs.
- Inspect connected clients and protocol version with
  `GET /health` (or visit `/openapi` for the interactive Scalar UI).
- To capture or read content, the target tab must be **controlled**: send a
  `tab.navigate` first (or pass an existing controlled `tabId`).
