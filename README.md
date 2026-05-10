# Meaw Machine (Chromium extension)

Chromium-only Manifest V3 extension that maintains a **WebSocket** connection to your **LLM control server** (out of scope for this repo), executes remote commands on tabs, and shows a **visible bar** on pages that are under remote control.

## Features

- Offscreen document holds the WebSocket (MV3 service workers are not reliable for long-lived sockets).
- Commands: open/navigate tab, optional tab close, viewport screenshot (`captureVisibleTab`), read page text or HTML via content script, release controlled tab (removes UI strip).
- Popup UI to set **WebSocket URL**, connect/disconnect, and see socket plus controlled-tab status.

## Development

Requirements: Node 20+.

```bash
npm install
npm run dev
```

Load the unpacked extension from `.output/chrome-mv3` (Chromium → Extensions → Load unpacked).

Production build:

```bash
npm run build
```

Output: `.output/chrome-mv3`

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
| `npm run dev` | WXT dev / watch |
| `npm run build` | Production bundle |
| `npm run zip` | Zip for store upload (WXT) |
| `npm run check` | TypeScript `tsc --noEmit` |
