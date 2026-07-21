#!/usr/bin/env node
/**
 * pull-web.mjs — reverse of sync-vault.mjs.
 *
 * Model: the GitHub `content/` tree is the source of truth (edited on the web).
 * Run this BEFORE editing in Obsidian, so the vault reflects web edits. Then edit
 * in Obsidian and run `node sync-vault.mjs` to push back.
 *
 * It copies content/ back into the vault, reversing the mapping:
 *   content/private/<tier>/   ->  10 - Private/<Player>/
 *   content/<everything else> ->  vault/<same path>
 * and it:
 *   - strips the sync-injected `modified:` frontmatter line
 *   - PRESERVES each note's existing `## DM Notes` section (the web copy has it
 *     stripped), re-appending the vault's DM Notes so DM-only content is never lost
 *
 * Safe by default: prints what it WOULD change. Pass --write to actually modify the vault.
 *   node pull-web.mjs            # dry run
 *   node pull-web.mjs --write    # apply
 * Tip: `git -C . pull` first to fetch the latest web commits into content/.
 */
import { readdir, readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join, dirname, extname } from "path"

const CONTENT_DIR = "./content"
const VAULT_DIR = "C:/Users/zeon2/Documents/Obsidian/DND"
const WRITE = process.argv.includes("--write")

// content/private/<tier> -> vault "10 - Private/<Player>"
const TIER_TO_PLAYER = { vesper: "Vesper", aphelia: "Aphelia", alexander: "Alexander", blondadis: "Blondadis" }

function stripModified(text) {
  if (!text.startsWith("---\n")) return text
  const end = text.indexOf("\n---", 4)
  if (end === -1) return text
  const body = text.slice(4, end).split("\n").filter((l) => !/^modified:\s*/.test(l)).join("\n")
  return "---\n" + body + text.slice(end)
}

function dmNotesSection(text) {
  const i = text.indexOf("\n## DM Notes")
  if (i === -1) return null
  // from the heading to the next `## ` heading or a horizontal rule / EOF
  const after = text.slice(i + 1)
  const m = after.slice("## DM Notes".length).search(/\n## |\n---\n/)
  return m === -1 ? after : after.slice(0, "## DM Notes".length + m)
}

// content path -> vault-relative path
function toVaultPath(rel) {
  if (rel.startsWith("private/")) {
    const parts = rel.split("/")
    const player = TIER_TO_PLAYER[parts[1]] || parts[1]
    return join("10 - Private", player, ...parts.slice(2))
  }
  return rel
}

let changed = 0, skipped = 0, kept = 0

async function walk(dir, rel = "") {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    const r = rel ? rel + "/" + e.name : e.name
    if (e.isDirectory()) { await walk(abs, r); continue }
    if (extname(e.name).toLowerCase() !== ".md") continue

    let web = await readFile(abs, "utf8")
    web = stripModified(web)

    const vaultPath = join(VAULT_DIR, toVaultPath(r))
    let merged = web
    if (existsSync(vaultPath)) {
      const cur = await readFile(vaultPath, "utf8")
      const dm = dmNotesSection(cur)
      if (dm && !/\n## DM Notes/.test(web)) {
        merged = web.replace(/\s*$/, "") + "\n\n" + dm.trim() + "\n"
        kept++
      }
      if (cur === merged) { skipped++; continue }
    }
    changed++
    console.log((WRITE ? "  write " : "  would update ") + toVaultPath(r))
    if (WRITE) { await mkdir(dirname(vaultPath), { recursive: true }); await writeFile(vaultPath, merged, "utf8") }
  }
}

console.log((WRITE ? "✍️  Applying" : "🔎  Dry run —") + " web -> vault\n")
if (!existsSync(CONTENT_DIR)) { console.error("No ./content — run from the blujelly-wiki folder."); process.exit(1) }
await walk(CONTENT_DIR)
console.log(`\n${changed} file(s) ${WRITE ? "updated" : "would change"}, ${kept} kept DM Notes, ${skipped} unchanged`)
if (!WRITE && changed) console.log("Re-run with --write to apply.")
