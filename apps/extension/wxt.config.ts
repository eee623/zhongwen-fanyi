import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";

const extensionIcons = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png"
};

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "中文同传 Dubbing",
    description: "实时把网页播放器和 Chrome 本地视频英语音频翻译成中文字幕与中文原声音色配音。",
    version: "0.1.0",
    permissions: ["activeTab", "offscreen", "scripting", "storage", "tabCapture"],
    host_permissions: ["<all_urls>"],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' ws://localhost:* http://localhost:* wss://* https://*"
    },
    icons: extensionIcons,
    action: {
      default_title: "中文同传",
      default_icon: extensionIcons
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Ctrl+Shift+Y",
          mac: "Command+Shift+Y"
        },
        description: "打开中文同传控制面板"
      }
    },
    minimum_chrome_version: "116"
  },
  vite: () => ({
    plugins: [react()]
  })
});
