import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Apply Filler",
  description:
    "Fill job applications from your profile; AI drafts cover letters and answers (Gemini, OpenAI, Claude, Grok, OpenRouter).",
  version: "0.1.6",
  // Required for Firefox (temporary + permanent installs)
  browser_specific_settings: {
    gecko: {
      id: "apply-filler@local.dev",
      // 140+ required for built-in data_collection_permissions consent UI
      strict_min_version: "140.0",
      // Required by AMO (Nov 2025+). Gemini may send profile + vacancy/form text to Google.
      data_collection_permissions: {
        required: ["personallyIdentifyingInfo", "websiteContent"],
      },
    },
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Apply Filler",
    default_icon: {
      "16": "public/icons/icon16.png",
      "32": "public/icons/icon32.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png",
    },
  },
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: ["http://*/*", "https://*/*"],
  icons: {
    "16": "public/icons/icon16.png",
    "32": "public/icons/icon32.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png",
  },
});
