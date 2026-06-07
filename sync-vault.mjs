#!/usr/bin/env node
/**
 * sync-vault.mjs
 * Copies the Amantia DnD vault to Quartz content/ folder.
 * - Skips private folders (Sessions, Encounters, DM Notes, etc.)
 * - Skips non-.md files (xlsx, docx, pdf, js, etc.)
 * - Strips ## DM Notes sections from any note that has them
 *
 * Run: node sync-vault.mjs
 * Then: npm run quartz build (or git add/commit/push to trigger Cloudflare)
 */

import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join, extname, dirname, basename } from 'path'

// ── CONFIG ─────────────────────────────────────────────────────────────────

const VAULT_DIR  = 'C:/Users/zeon2/Documents/Obsidian/DND'
const CONTENT_DIR = './content'

// Folders to skip entirely (relative to vault root)
const SKIP_FOLDERS = new Set([
  '.obsidian',
  'Templates',
  '05 - Sessions',
  '06 - Encounters',
  '09 - DM Notes',
  'Amantia Source Material',
])

// ── DM NOTES STRIPPING ─────────────────────────────────────────────────────

function stripDmNotes(content) {
  const lines = content.split('\n')
  const out = []
  let inDmSection = false

  for (const line of lines) {
    // Start of DM Notes section
    if (line === '## DM Notes') {
      inDmSection = true
      continue  // drop the header itself
    }

    if (inDmSection) {
      // Exit on next ## heading — keep it
      if (/^## /.test(line)) {
        inDmSection = false
        out.push(line)
      }
      // Exit on horizontal rule (footer separator) — keep it
      else if (line === '---') {
        inDmSection = false
        out.push(line)
      }
      // Otherwise drop the line (DM content)
    } else {
      out.push(line)
    }
  }

  // Collapse more than two consecutive blank lines left by the removal
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

// ── FILE SYNC ──────────────────────────────────────────────────────────────

let copied = 0
let stripped = 0
let skipped = 0

async function syncDir(srcDir, destDir) {
  const entries = await readdir(srcDir, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath  = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)

    if (entry.isDirectory()) {
      if (SKIP_FOLDERS.has(entry.name)) {
        console.log(`  ⏭  skip folder: ${entry.name}`)
        skipped++
        continue
      }
      await mkdir(destPath, { recursive: true })
      await syncDir(srcPath, destPath)

    } else if (entry.isFile()) {
      // Only copy markdown files
      if (extname(entry.name).toLowerCase() !== '.md') continue

      await mkdir(dirname(destPath), { recursive: true })

      let content = await readFile(srcPath, 'utf8')
      const hadDm = content.includes('## DM Notes')
      if (hadDm) {
        content = stripDmNotes(content)
        stripped++
      }

      await writeFile(destPath, content, 'utf8')
      copied++
    }
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────

console.log('🗺  Amantia Wiki — vault sync\n')
console.log(`Source : ${VAULT_DIR}`)
console.log(`Dest   : ${CONTENT_DIR}\n`)

// Clear existing content (except index.md which we manage manually)
if (existsSync(CONTENT_DIR)) {
  const existing = await readdir(CONTENT_DIR, { withFileTypes: true })
  for (const e of existing) {
    if (e.name === 'index.md') continue  // keep the hand-written home page
    await rm(join(CONTENT_DIR, e.name), { recursive: true, force: true })
  }
}

await mkdir(CONTENT_DIR, { recursive: true })
await syncDir(VAULT_DIR, CONTENT_DIR)

console.log(`✅  Done`)
console.log(`   ${copied} notes copied`)
console.log(`   ${stripped} notes had DM Notes sections stripped`)
console.log(`   ${skipped} private folders skipped`)
console.log(`\nNext: git add content/ && git commit -m "sync vault" && git push`)
