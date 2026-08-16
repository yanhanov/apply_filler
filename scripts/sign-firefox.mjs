#!/usr/bin/env node
/**
 * Load .env then run: web-ext sign --source-dir dist ...
 * Usage: node scripts/sign-firefox.mjs [listed|unlisted]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(resolve('.env'))

const channel = process.argv[2] === 'listed' ? 'listed' : 'unlisted'
const apiKey = process.env.WEB_EXT_API_KEY?.trim()
const apiSecret = process.env.WEB_EXT_API_SECRET?.trim()

if (!apiKey || !apiSecret) {
  console.error(
    'Missing WEB_EXT_API_KEY / WEB_EXT_API_SECRET.\nCopy .env.example → .env and fill in your AMO API credentials.',
  )
  process.exit(1)
}

const args = [
  'web-ext',
  'sign',
  '--source-dir',
  'dist',
  '--artifacts-dir',
  'web-ext-artifacts',
  '--channel',
  channel,
]

if (channel === 'listed') {
  const metaPath = resolve('amo-metadata.json')
  if (!existsSync(metaPath)) {
    console.error('Missing amo-metadata.json (required for listed AMO submissions).')
    process.exit(1)
  }
  args.push('--amo-metadata', metaPath)
  // Don't block for hours on human review — check status in Developer Hub.
  args.push('--approval-timeout', '0')
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    WEB_EXT_API_KEY: apiKey,
    WEB_EXT_API_SECRET: apiSecret,
  },
})

process.exit(result.status ?? 1)
