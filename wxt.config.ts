import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Meaw Machine",
    description: "Remote browser control via WebSocket (LLM server)",
    permissions: [
      "alarms",
      "activeTab",
      "tabs",
      "scripting",
      "storage",
      "offscreen",
      "windows",
    ],
    host_permissions: ["<all_urls>"],
  },
});
