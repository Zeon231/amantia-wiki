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

import { readdir, readFile, writeFile, mkdir, rm, copyFile, stat, unlink, rmdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, extname, dirname, basename, relative, sep } from 'path'
import { execSync } from 'child_process'

// ── DRIFT DETECTION ────────────────────────────────────────────────────────
// If a content/ file's last git-commit author is NOT the local user, someone
// else touched it (GitHub web UI, the wiki's web editor, a teammate) since
// the last sync. Overwriting would silently revert their work — so we skip
// and warn. Set FORCE=1 to override (e.g., you know your vault edit should
// win the conflict).
let LOCAL_GIT_USER = null
try { LOCAL_GIT_USER = execSync('git config user.name', { encoding: 'utf8' }).trim() } catch { /* not a git repo */ }
const FORCE = process.env.FORCE === '1'
let driftSkipped = 0
function lastCommitAuthor(filePath) {
  try {
    return execSync('git log -1 --format=%an -- ' + JSON.stringify(filePath), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch { return null }
}
function lastCommitMsg(filePath) {
  try {
    return execSync('git log -1 --format=%s -- ' + JSON.stringify(filePath), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch { return null }
}
function isDriftedFile(destPath, newContent, existingContent) {
  if (!LOCAL_GIT_USER) return false
  if (existingContent === null || existingContent === undefined) return false
  if (newContent === existingContent) return false
  const author = lastCommitAuthor(destPath)
  if (!author) return false
  return author !== LOCAL_GIT_USER
}

// Image/asset extensions to copy verbatim (maps, portraits, item art, etc.)
const ASSET_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'])

// ── CONFIG ─────────────────────────────────────────────────────────────────

const VAULT_DIR  = 'C:/Users/zeon2/Documents/Obsidian/DND'
const CONTENT_DIR = './content'

// Folders to skip entirely (relative to vault root)
const SKIP_FOLDERS = new Set([
  '.obsidian',
  'Templates',
  '06 - Encounters',
  '09 - DM Notes',
  '10 - Private',
  'Amantia Source Material',
  'website', // vault's own local Quartz project — not campaign content
])

// Per-player private tiers live in "10 - Private/<Player>/" and are SKIPPED above by default.
// When PUBLISH_PRIVATE=1, they are instead published into gated paths: content/private/<player>/
// These pages are protected ONLY by the edge Worker (worker/index.js) + the WIKI_USERS secret.
// NEVER deploy a build that includes them unless that Worker is live and you have tested that
// /private/<player>/ returns 401 without credentials.
const PRIVATE_DIR = '10 - Private'
const PUBLISH_PRIVATE = process.env.PUBLISH_PRIVATE === '1'

async function syncPrivate() {
  const srcRoot = join(VAULT_DIR, PRIVATE_DIR)
  if (!existsSync(srcRoot)) return
  const players = await readdir(srcRoot, { withFileTypes: true })
  for (const p of players) {
    if (!p.isDirectory()) continue
    const slug = p.name.toLowerCase().replace(/\s+/g, '-')
    await copyPrivateDir(join(srcRoot, p.name), join(CONTENT_DIR, 'private', slug))
    console.log(`  🔒 published private tier: ${p.name} → /private/${slug}/`)
  }
}

async function copyPrivateDir(srcDir, destDir) {
  const entries = await readdir(srcDir, { withFileTypes: true })
  for (const e of entries) {
    const s = join(srcDir, e.name)
    const d = join(destDir, e.name)
    if (e.isDirectory()) { await copyPrivateDir(s, d); continue }
    if (extname(e.name).toLowerCase() !== '.md') continue
    await mkdir(dirname(d), { recursive: true })
    let content = await readFile(s, 'utf8')
    if (content.includes('## DM Notes')) content = stripDmNotes(content)
    content = stripSharedFrontmatterFields(content)
    content = sanitizeFrontmatterPlaceholders(content)
    content = stampModified(content, (await stat(s)).mtime.toISOString())
    await writeFile(d, content, 'utf8')
    copied++
  }
}

// ── DM NOTES STRIPPING ─────────────────────────────────────────────────────

// Remove fields from a note's frontmatter that would leak the note's existence
// into shared indexes (tag pages, aliases, description snippets).
// Used for private-tier notes so their titles/tags don't surface on public tag
// pages or in contentIndex previews — even the Worker-side index filter benefits
// from these being absent as defense-in-depth.
function stripSharedFrontmatterFields(content) {
  if (!content.startsWith('---\n')) return content
  const end = content.indexOf('\n---', 4)
  if (end === -1) return content
  const body = content.slice(4, end).split('\n').filter(
    (l) => !/^(tags|aliases|description|socialDescription):/.test(l),
  ).join('\n')
  return '---\n' + body + content.slice(end)
}

// Guard against `[?]` (the campaign UI's "unknown" placeholder) accidentally
// appearing as a raw frontmatter VALUE. In YAML that opens a flow sequence with
// a `?` explicit-key marker → parse error → whole site build fails.
// Body uses of `[?]` are fine (they render as text). This only touches
// unquoted frontmatter values on the field lines.
function sanitizeFrontmatterPlaceholders(content) {
  if (!content.startsWith('---\n')) return content
  const end = content.indexOf('\n---', 4)
  if (end === -1) return content
  const head = content.slice(4, end).split('\n').map((l) => {
    // Match "key: [?]" (with optional trailing whitespace) → "key:" (blank value)
    return l.replace(/^(\s*[A-Za-z_][\w-]*\s*:)\s*\[\?\]\s*$/, '$1')
  }).join('\n')
  return '---\n' + head + content.slice(end)
}

// Stamp `modified:` in frontmatter from the vault file's mtime, so the wiki's
// "Most Recent" ordering survives git (which does not preserve file mtimes).
function stampModified(content, iso) {
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---', 4)
    if (end !== -1) {
      const body = content.slice(4, end).split('\n').filter((l) => !/^modified:\s*/.test(l)).join('\n')
      return '---\n' + body + '\nmodified: ' + iso + content.slice(end)
    }
  }
  return '---\nmodified: ' + iso + '\n---\n\n' + content
}

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

// ── WEB-EDITABLE FRONTMATTER FIELDS ───────────────────────────────────────
// Fields that can be set via the wiki's web editor / image uploader and are
// often NOT mirrored back to the vault. When the vault version of a note has
// these fields empty (or missing) but the currently-deployed content/ note
// has a value, we preserve the deployed value instead of blanking it out.
const WEB_EDITABLE_FIELDS = ['portrait', 'banner', 'banner-y']

function extractFrontmatter(text) {
  if (!text || !text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end === -1) return null
  const body = text.slice(4, end)
  const fields = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (m) fields[m[1]] = m[2].trim()
  }
  return { body, end, fields }
}

// If the vault version of `text` blanks a WEB_EDITABLE_FIELD that is set in
// the currently-deployed `destText`, splice the deployed value back in so we
// don't wipe a portrait/banner that was set via the web editor.
function mergeWebEditableFields(text, destText) {
  if (!destText) return text
  const srcFm = extractFrontmatter(text); const destFm = extractFrontmatter(destText)
  if (!srcFm || !destFm) return text
  let body = srcFm.body
  for (const key of WEB_EDITABLE_FIELDS) {
    const srcVal = srcFm.fields[key]
    const destVal = destFm.fields[key]
    if (destVal && destVal !== '' && (!srcVal || srcVal === '')) {
      const re = new RegExp('^(' + key + '\\s*:).*$', 'm')
      if (re.test(body)) body = body.replace(re, key + ': ' + destVal)
      else body += (body.endsWith('\n') ? '' : '\n') + key + ': ' + destVal
    }
  }
  return '---\n' + body + text.slice(4 + srcFm.body.length)
}

// ── FILE SYNC ──────────────────────────────────────────────────────────────

let copied = 0
let stripped = 0
let skipped = 0
let assets = 0
const writtenPaths = new Set() // relative POSIX paths under CONTENT_DIR, written this sync

function relPosix(p) { return relative(CONTENT_DIR, p).split(sep).join('/') }

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
      const ext = extname(entry.name).toLowerCase()

      // Copy image/asset files verbatim (maps, portraits, item art, etc.)
      if (ASSET_EXTS.has(ext)) {
        await mkdir(dirname(destPath), { recursive: true })
        await copyFile(srcPath, destPath)
        writtenPaths.add(relPosix(destPath))
        assets++
        continue
      }

      // Only process markdown otherwise
      if (ext !== '.md') continue

      await mkdir(dirname(destPath), { recursive: true })

      let content = await readFile(srcPath, 'utf8')
      const hadDm = content.includes('## DM Notes')
      if (hadDm) {
        content = stripDmNotes(content)
        stripped++
      }
      const srcStat = await stat(srcPath)
      content = sanitizeFrontmatterPlaceholders(content)
      content = stampModified(content, srcStat.mtime.toISOString())

      // Preserve web-editor-set frontmatter (portrait/banner) if the vault has
      // blanked them. The web upload flow doesn't write back to the vault.
      let destExisting = null
      try { destExisting = await readFile(destPath, 'utf8') } catch { /* no prior */ }
      if (destExisting) content = mergeWebEditableFields(content, destExisting)

      // Drift check: if the current content/ file was last committed by
      // someone other than the local git user, the vault version would
      // overwrite their edit. Skip and warn unless FORCE=1.
      if (!FORCE && isDriftedFile(destPath, content, destExisting)) {
        const who = lastCommitAuthor(destPath), msg = lastCommitMsg(destPath)
        console.log(`  ⚠  DRIFT: ${relPosix(destPath)}`)
        console.log(`     last touched by "${who}" — "${(msg || '').slice(0, 70)}"`)
        console.log(`     vault change would overwrite. Skipped. Use FORCE=1 to override.`)
        writtenPaths.add(relPosix(destPath)) // prevent orphan cleanup from deleting it
        driftSkipped++
        continue
      }

      await writeFile(destPath, content, 'utf8')
      writtenPaths.add(relPosix(destPath))
      copied++
    }
  }
}

// Remove files under content/ that this sync did NOT write AND that used to
// come from the vault (i.e., the file has a corresponding vault path that no
// longer exists — a proper vault-side rename or delete). Anything without a
// vault-side counterpart (web-uploaded images, /private/*, /_media/*) is
// PRESERVED.
const CLEANUP_SKIP_TOP = new Set(['private', '_media']) // never touched by sync
let removed = 0
async function cleanupOrphans(dir) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = join(dir, e.name)
    const rel = relPosix(p)
    if (e.isDirectory()) {
      // Skip subtrees the sync doesn't own
      const top = rel.split('/')[0]
      if (CLEANUP_SKIP_TOP.has(top)) continue
      await cleanupOrphans(p)
      // Remove empty directories that came from now-deleted vault folders
      try {
        const remaining = await readdir(p)
        if (!remaining.length) await rmdir(p)
      } catch { /* not empty */ }
      continue
    }
    if (!e.isFile()) continue
    if (writtenPaths.has(rel)) continue
    if (rel === 'index.md') continue // hand-written home page
    // If the corresponding vault path still exists, the sync SKIPPED it
    // deliberately (private/DM notes/templates) — do not touch.
    if (existsSync(join(VAULT_DIR, rel))) continue
    // No vault-side counterpart at all → preserve (came from web upload etc.).
    // We only remove files whose vault dir exists but the file within was
    // renamed/deleted. Heuristic: parent dir exists in the vault AND file has
    // a .md extension AND file is NOT under a preserved subpath.
    const ext = extname(e.name).toLowerCase()
    if (ext !== '.md' && !ASSET_EXTS.has(ext)) continue
    const relDir = dirname(rel)
    if (relDir !== '.' && !existsSync(join(VAULT_DIR, relDir))) continue
    try { await unlink(p); removed++ } catch { /* ignore */ }
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────

console.log('🗺  Amantia Wiki — vault sync\n')
console.log(`Source : ${VAULT_DIR}`)
console.log(`Dest   : ${CONTENT_DIR}\n`)

await mkdir(CONTENT_DIR, { recursive: true })
await syncDir(VAULT_DIR, CONTENT_DIR)
if (PUBLISH_PRIVATE) {
  console.log('\n🔒 PUBLISH_PRIVATE=1 — publishing per-player private tiers into /private/* (gate with the Worker!)')
  await syncPrivate()
}
await cleanupOrphans(CONTENT_DIR)

console.log(`✅  Done`)
console.log(`   ${copied} notes copied`)
console.log(`   ${assets} image assets copied`)
console.log(`   ${stripped} notes had DM Notes sections stripped`)
console.log(`   ${skipped} private folders skipped`)
console.log(`   ${removed} orphaned notes removed (deleted/renamed in vault)`)
if (driftSkipped) {
  console.log(`\n⚠  ${driftSkipped} file(s) SKIPPED — content/ had a newer edit from someone else.`)
  console.log(`   Review the DRIFT lines above. To force-overwrite them with the vault version,`)
  console.log(`   re-run:  FORCE=1 node sync-vault.mjs`)
} else {
  console.log(`\nNext: git add content/ && git commit -m "sync vault" && git push`)
}
