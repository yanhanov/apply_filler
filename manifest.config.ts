import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Apply Filler',
  description:
    'Fill job application forms from your saved profile (local matching, no AI for now).',
  version: '0.1.0',
  // Required for Firefox (temporary + permanent installs)
  browser_specific_settings: {
    gecko: {
      id: 'apply-filler@local.dev',
      strict_min_version: '115.0',
    },
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Apply Filler',
    default_icon: {
      '16': 'public/icons/icon16.png',
      '32': 'public/icons/icon32.png',
      '48': 'public/icons/icon48.png',
      '128': 'public/icons/icon128.png',
    },
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['http://*/*', 'https://*/*'],
  icons: {
    '16': 'public/icons/icon16.png',
    '32': 'public/icons/icon32.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
})
