import { buildSync } from 'esbuild'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const distDir = resolve('dist')
const manifestPath = join(distDir, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

/** Find the background chunk (has RUN_FILL). CRX sometimes points the SW loader at the wrong file. */
function findBackgroundEntry() {
  const assetsDir = join(distDir, 'assets')
  const files = readdirSync(assetsDir).filter((f) => f.endsWith('.js') && !f.endsWith('.map'))
  for (const file of files) {
    const text = readFileSync(join(assetsDir, file), 'utf8')
    if (text.includes('RUN_FILL') && text.includes('GET_PROFILE') && text.includes('chrome.runtime.onMessage')) {
      return join(assetsDir, file)
    }
  }
  throw new Error('Could not find background bundle with RUN_FILL in dist/assets')
}

const entry = findBackgroundEntry()
const outfile = join(distDir, 'background.js')

buildSync({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile,
  // chrome.* is provided by the extension runtime
  external: [],
  logLevel: 'silent',
})

// Classic non-module background — works on Firefox without ES module background support
manifest.background = {
  scripts: ['background.js'],
}

if (manifest.browser_specific_settings?.gecko) {
  manifest.browser_specific_settings.gecko.strict_min_version = '140.0'
}
if (!manifest.browser_specific_settings) {
  manifest.browser_specific_settings = {}
}
manifest.browser_specific_settings.gecko_android = {
  strict_min_version: '142.0',
}

if (Array.isArray(manifest.web_accessible_resources)) {
  manifest.web_accessible_resources = manifest.web_accessible_resources.map((entry) => {
    if (entry && typeof entry === 'object' && 'use_dynamic_url' in entry) {
      const { use_dynamic_url: _ignored, ...rest } = entry
      return rest
    }
    return entry
  })
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Patched Firefox background → background.js (from ${entry.split('/').pop()})`)
