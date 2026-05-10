# Meaw Machine (Chromium extension)

Chromium-only Manifest V3 extension that maintains a **WebSocket** connection to your **LLM control server** (out of scope for this repo), executes remote commands on tabs, and shows a **visible bar** on pages that are under remote control.

## Features

- Offscreen document holds the WebSocket (MV3 service workers are not reliable for long-lived sockets).
- Commands: open/navigate tab, optional tab close, viewport screenshot (`captureVisibleTab`), read page text or HTML via content script, release controlled tab (removes UI strip).
- Popup UI to set **WebSocket URL**, connect/disconnect, and see socket plus controlled-tab status.

## Development

Requirements: [Bun](https://bun.sh/) 1.1 or newer.

```bash
bun install
bun run dev
```

Load the unpacked extension from `.output/chrome-mv3` (Chromium → Extensions → Load unpacked).

Production build:

```bash
bun run build
```

Output: `.output/chrome-mv3`

## Mock control server (local testing)

A small [Elysia](https://elysiajs.com/) server in `mock-server/` opens the same WebSocket protocol the real control server would use, so you can connect the extension without an LLM backend.

```bash
bun run mock-server
```

Default listen address: `127.0.0.1:8787`. Override with `HOST` and `PORT` if needed.

- Interactive API docs (Scalar): [`http://127.0.0.1:8787/openapi`](http://127.0.0.1:8787/openapi) — powered by [`@elysia/openapi`](https://elysiajs.com/plugins/openapi.md).
- Raw OpenAPI JSON: `http://127.0.0.1:8787/openapi/json`.

1. Start the mock, then open `http://127.0.0.1:8787/health` (or `/`) and copy **`wsUrl`** — for example `ws://127.0.0.1:8787/ws`.
2. In the extension popup, paste that URL and click **Connect**.
3. Send a command to every connected client via HTTP:

```bash
curl -s -X POST http://127.0.0.1:8787/command \
  -H 'Content-Type: application/json' \
  -d '{"command":{"id":"demo-1","action":"tab.navigate","params":{"url":"https://example.com"}}}'
```

If no extension is connected, `POST /command` returns **503** with `{ "ok": false, "sent": 0 }`.

## Configuration

- Open the extension **popup** (toolbar icon).
- Enter a `ws://` or `wss://` URL and click **Connect**.
- The URL is stored in `chrome.storage.sync` under `meaw.wsUrl`.

## Permissions

The manifest requests `tabs`, `scripting`, `storage`, `offscreen`, `windows`, `activeTab`, `alarms`, and host permission `<all_urls>` so automation and screenshots work on normal browsing pages.

## WebSocket protocol (v1)

All messages are JSON text. The extension uses `protocolVersion: 1`.

### Server → extension

Send a command envelope:

```json
{
  "type": "command",
  "command": {
    "id": "unique-id",
    "action": "tab.navigate",
    "params": { "url": "https://example.com" }
  }
}
```

Supported `action` values:

| Action | Params | Notes |
|--------|--------|--------|
| `tab.navigate` | `{ "url": string, "tabId"?: number }` | Updates `tabId` if valid; otherwise creates a tab. Tab is marked controlled and the UI strip is injected. |
| `tab.close` | `{ "tabId": number }` | Closes the tab. |
| `page.captureScreenshot` | `{ "tabId"?: number, "format"?: "png" \| "jpeg", "quality"?: number }` | Activates the tab, captures **visible viewport** only. Result includes `mimeType` and base64 (no `data:` prefix). |
| `page.getContent` | `{ "tabId"?: number, "mode"?: "text" \| "html" }` | Returns trimmed text or HTML (size-capped). |
| `session.releaseTab` | `{ "tabId": number }` | Unregisters control and removes the strip. |

### Extension → server

Events (examples):

- `extension.connected` / `extension.disconnected` — socket lifecycle.
- `command.result` — `{ commandId, action, ok: true, result }`.
- `command.error` — `{ commandId, action?, ok: false, code, message }`.
- `tab.state` — `{ tabId, controlled: boolean }`.

`correlationId` mirrors `command.id` when applicable.

## Limitations

- **Viewport only** for screenshots (`chrome.tabs.captureVisibleTab`). Full-page capture is not implemented (would need scrolling, stitching, or `chrome.debugger`).
- Chromium only; not tested for Firefox/Safari MV3 differences.

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | WXT dev / watch |
| `bun run build` | Production bundle |
| `bun run zip` | Zip for store upload (WXT) |
| `bun run check` | TypeScript `tsc --noEmit` |
| `bun run mock-server` | Local Elysia WebSocket mock + `POST /command` |
