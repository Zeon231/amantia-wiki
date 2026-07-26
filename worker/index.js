/**
 * Amantia Wiki — edge auth Worker
 *
 * HTTP Basic Auth + roles + edit-level (1–5) in front of the static site.
 *
 *   role "admin" or "dm" → sees all private tiers (both are admin-tier).
 *   role "player"        → sees shared content + only their own /private/<tier>/.
 *
 * Edit permission is a numeric LEVEL (1 = most restricted, 5 = most permissive).
 *   A user with editLevel N can edit any page whose editLevel is >= N.
 *   Level convention (this project):
 *     1 = admin-only  (Trent)
 *     2 = DM-only     (Billy)     — can also edit lvl 3+
 *     3 = player-editable         — can also edit lvl 4+
 *     4 = shared session notes
 *     5 = open scratchpad
 *   Pages without an explicit level default to 1 (admin-only edits).
 *
 * Credentials live in the WIKI_USERS secret as JSON, e.g.:
 *   {
 *     "trent":  { "hash": "<sha256hex>", "role": "admin",  "editLevel": 1 },
 *     "billy":  { "hash": "<sha256hex>", "role": "admin",  "editLevel": 2 },
 *     "daryl":  { "hash": "<sha256hex>", "role": "player", "tier": "aphelia",   "editLevel": 3 },
 *     "lucas":  { "hash": "<sha256hex>", "role": "player", "tier": "alexander", "editLevel": 3 }
 *   }
 * Generate a hash on any OS:   printf '%s' 'THE-PASSWORD' | sha256sum
 *
 * The whole site requires a login BY DEFAULT (fail-closed) — this is not
 * dependent on any dashboard variable, so it cannot silently lapse.
 * Set PUBLIC_SHARED="true" only if you deliberately want the shared wiki open
 * to the public; /private/* stays gated regardless.
 *
 * Requires wrangler.jsonc: main = worker/index.js, assets.binding = ASSETS,
 * assets.run_worker_first = true (so no asset is served before this runs).
 */

const PRIVATE_PREFIX = "/private/"

// Roles that grant "see everything" (all private tiers). Both are admin-tier.
const ADMIN_ROLES = new Set(["admin", "dm"])
const isAdminRole = (role) => ADMIN_ROLES.has(role)

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    const isPrivate = path.startsWith(PRIVATE_PREFIX)

    // Whole-site login is ON BY DEFAULT (fail-closed). It does not depend on a
    // dashboard variable being present, so it can't silently lapse on a redeploy.
    // To deliberately open the shared wiki to the public, set PUBLIC_SHARED="true".
    const shareGate = env.PUBLIC_SHARED !== "true"

    // Shared content, only when explicitly made public.
    if (!isPrivate && !shareGate && path !== "/whoami" && path !== "/logout") {
      return env.ASSETS.fetch(request)
    }

    // Logout: always 401 so the browser drops its cached Basic-Auth credentials.
    // Any subsequent request re-prompts. The URL is documented as the logout
    // trigger; nothing to protect here.
    if (path === "/logout") {
      return new Response(
        "<!doctype html><meta charset=utf-8><title>Signed out</title>" +
        "<style>body{font:15px/1.6 system-ui;background:#15151a;color:#eee;text-align:center;padding:15vh 1rem;max-width:520px;margin:0 auto}a{color:#e8b04b}small{color:#888;display:block;margin-top:2rem;line-height:1.5}</style>" +
        "<h2>Signed out.</h2>" +
        "<p><a href=\"/\">Sign back in →</a></p>" +
        "<small>For a full sign-out, close this browser tab. HTTP Basic Auth is cached by your browser and can only be fully cleared by closing the tab or restarting your browser.</small>",
        {
          status: 401,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "WWW-Authenticate": 'Basic realm="Amantia Wiki — signed out", charset="UTF-8"',
            "Cache-Control": "no-store",
          },
        },
      )
    }

    const auth = await authenticate(request, env)
    if (!auth.ok) return unauthorized()

    // Small endpoint the page can call to render admin-only UI (edit buttons).
    // Returns identity + edit permissions; does not leak page content.
    if (path === "/whoami") {
      return json({
        user: auth.user,
        role: auth.role,
        tier: auth.tier || null,
        editLevel: auth.editLevel,
        canSeeAllTiers: isAdminRole(auth.role),
        canEdit: isAdminRole(auth.role), // admin-only editing, for now
      })
    }

    // ---- Editing API (admin-only) ------------------------------------------
    if (path.startsWith("/api/")) {
      return handleApi(path, request, env, auth)
    }

    // Filter the shared contentIndex so private pages the user can't read
    // are also not enumerable via search / sidebar / home widgets.
    // (The index otherwise lists titles for every page in the build, including
    // private tiers, which would leak the existence of e.g. "Maren Voss" to any
    // authenticated player.)
    if (path === "/static/contentIndex.json") {
      const asset = await env.ASSETS.fetch(request)
      if (!asset.ok) return asset
      let data
      try {
        data = await asset.json()
      } catch {
        return asset
      }
      const out = {}
      for (const slug of Object.keys(data)) {
        if (!slug.startsWith("private/")) { out[slug] = data[slug]; continue }
        const tier = slug.split("/")[1]
        if (isAdminRole(auth.role) || (auth.tier && auth.tier === tier)) {
          out[slug] = data[slug]
        }
      }
      return new Response(JSON.stringify(out), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      })
    }

    if (isPrivate && !canAccessTier(auth, path)) {
      return unauthorized("You are signed in, but this section isn't yours.")
    }

    return env.ASSETS.fetch(request)
  },
}

// /private/<tier>/... — admin-tier roles see everything; players only their own.
function canAccessTier(auth, path) {
  if (isAdminRole(auth.role)) return true
  const tier = path.slice(PRIVATE_PREFIX.length).split("/")[0]
  return !!tier && tier === auth.tier
}

// ---- Editing API ----------------------------------------------------------
// Web edits commit to STAGING_BRANCH. They do NOT deploy automatically.
// An admin must POST /api/deploy to merge staging → main, which triggers the
// Cloudflare build. Meanwhile /api/changes reports what's pending vs deployed.
//
// (Local edits via sync-vault.mjs continue to push to main directly — that is
//  a separate console flow owned by the site owner.)
//
// Requires secret GITHUB_TOKEN (fine-grained, Contents: read+write on the repo).
const MAIN_BRANCH = "main"
const STAGING_BRANCH = "staging"

async function handleApi(path, request, env, auth) {
  if (!isAdminRole(auth.role)) return json({ error: "forbidden — admin only" }, 403)
  if (!env.GITHUB_TOKEN) return json({ error: "editing not configured (GITHUB_TOKEN not set)" }, 501)

  const url = new URL(request.url)
  const m = request.method

  // ---- Page CRUD (writes go to staging) ----
  if (path === "/api/page" && m === "GET") {
    const p = normPath(url.searchParams.get("path"))
    if (!p) return json({ error: "bad path" }, 400)
    // Read from staging so the editor sees pending edits too. If staging doesn't
    // exist yet, the API falls back to main (until first write creates staging).
    const branch = (await stagingExists(env)) ? STAGING_BRANCH : MAIN_BRANCH
    const r = await ghContents(env, "GET", p, null, branch)
    if (r.status === 404) return json({ exists: false, path: p, content: "", sha: null })
    if (!r.ok) return json({ error: "github " + r.status }, 502)
    const data = await r.json()
    return json({ exists: true, path: p, sha: data.sha, content: b64decode(data.content), branch })
  }

  if (path === "/api/page" && (m === "PUT" || m === "POST")) {
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: "bad json" }, 400)
    const p = normPath(body.path)
    if (!p) return json({ error: "bad path (must be content/…/*.md)" }, 400)
    const err = await ensureStagingExists(env)
    if (err) return err
    const payload = {
      message: (body.message || "web edit: " + p).slice(0, 200) + " (by " + auth.user + ")",
      content: b64encode(body.content == null ? "" : String(body.content)),
      branch: STAGING_BRANCH,
    }
    if (body.sha) payload.sha = body.sha
    const r = await ghContents(env, "PUT", p, payload)
    if (!r.ok) return json({ error: "github " + r.status, detail: (await r.text()).slice(0, 200) }, 502)
    const data = await r.json()
    return json({
      ok: true, staged: true, path: p,
      sha: data.content && data.content.sha,
      commit: data.commit && data.commit.sha,
      note: "Staged — click Deploy in Admin Settings to publish.",
    })
  }

  if (path === "/api/page" && m === "DELETE") {
    const body = await request.json().catch(() => null)
    if (!body || !body.sha) return json({ error: "sha required to delete" }, 400)
    const p = normPath(body.path)
    if (!p) return json({ error: "bad path" }, 400)
    const err = await ensureStagingExists(env)
    if (err) return err
    const r = await ghContents(env, "DELETE", p, {
      message: ("web delete: " + p + " (by " + auth.user + ")").slice(0, 200),
      sha: body.sha,
      branch: STAGING_BRANCH,
    })
    if (!r.ok) return json({ error: "github " + r.status, detail: (await r.text()).slice(0, 200) }, 502)
    return json({ ok: true, staged: true, deleted: p })
  }

  // ---- Changes log — pending (staging ahead of main) + recently deployed ----
  if (path === "/api/changes" && m === "GET") {
    const pending = { commits: [], files: [], ahead: 0, behind: 0 }
    if (await stagingExists(env)) {
      const cmpR = await ghApi(env, "GET", "/compare/" + MAIN_BRANCH + "..." + STAGING_BRANCH)
      if (cmpR.ok) {
        const cmp = await cmpR.json()
        pending.ahead = cmp.ahead_by || 0
        pending.behind = cmp.behind_by || 0
        pending.commits = (cmp.commits || []).slice(-30).reverse().map(compactCommit)
        pending.files = (cmp.files || []).map(compactFile)
      }
    }
    // Recently deployed = last commits on main
    const recentR = await ghApi(env, "GET", "/commits?sha=" + MAIN_BRANCH + "&per_page=10")
    const recent_deployed = recentR.ok ? (await recentR.json()).map(compactCommit) : []
    return json({ pending, recent_deployed, staging_exists: await stagingExists(env) })
  }

  // ---- Deploy — merge staging into main ----
  if (path === "/api/deploy" && (m === "POST" || m === "PUT")) {
    if (!(await stagingExists(env))) return json({ error: "no staging branch — nothing to deploy" }, 400)
    // Check there's something to deploy
    const cmpR = await ghApi(env, "GET", "/compare/" + MAIN_BRANCH + "..." + STAGING_BRANCH)
    if (!cmpR.ok) return json({ error: "compare failed: github " + cmpR.status }, 502)
    const cmp = await cmpR.json()
    if (!cmp.ahead_by) return json({ ok: false, error: "nothing to deploy (staging is not ahead of main)" }, 400)
    // Perform merge
    const mergeR = await ghApi(env, "POST", "/merges", null, {
      base: MAIN_BRANCH,
      head: STAGING_BRANCH,
      commit_message: "deploy: merge " + STAGING_BRANCH + " -> " + MAIN_BRANCH + " (by " + auth.user + ", " + cmp.ahead_by + " commit" + (cmp.ahead_by === 1 ? "" : "s") + ")",
    })
    if (mergeR.status === 204) return json({ ok: true, note: "Nothing new to merge (already up-to-date)." })
    if (mergeR.status === 409) return json({ error: "merge conflict — resolve on GitHub or in Obsidian" }, 409)
    if (!mergeR.ok) return json({ error: "merge failed: github " + mergeR.status, detail: (await mergeR.text()).slice(0, 200) }, 502)
    const merge = await mergeR.json()
    return json({
      ok: true,
      deployed_commit: merge.sha,
      count: cmp.ahead_by,
      note: "Deploy commit made. Cloudflare rebuild starts within seconds (~1–2 min to live).",
    })
  }

  return json({ error: "unknown endpoint" }, 404)
}

// -- helpers ----------------------------------------------------------------

function compactCommit(c) {
  return {
    sha: (c.sha || "").slice(0, 7),
    message: (c.commit && c.commit.message || "").split("\n")[0].slice(0, 140),
    author: (c.commit && c.commit.author && c.commit.author.name) || (c.author && c.author.login) || "?",
    date: c.commit && c.commit.author && c.commit.author.date,
  }
}
function compactFile(f) {
  return {
    filename: f.filename,
    status: f.status, // "added" | "modified" | "removed" | "renamed"
    additions: f.additions || 0,
    deletions: f.deletions || 0,
    previous_filename: f.previous_filename,
  }
}

function normPath(p) {
  if (!p) return null
  p = String(p).replace(/^\/+/, "")
  if (!p.startsWith("content/")) p = "content/" + p
  if (p.indexOf("..") !== -1 || !p.endsWith(".md")) return null
  return p
}

// Contents-API request (path is repo-relative like "content/foo.md")
function ghContents(env, method, repoPath, body, branch) {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/")
  const qs = method === "GET" && branch ? "?ref=" + encodeURIComponent(branch) : ""
  return ghApi(env, method, "/contents/" + encoded + qs, null, body)
}

// Generic GitHub-API request (subpath is repo-relative like "/compare/..." or "/git/refs")
function ghApi(env, method, subpath, _unused, body) {
  const repo = env.GITHUB_REPO || "Zeon231/amantia-wiki"
  return fetch("https://api.github.com/repos/" + repo + subpath, {
    method,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "amantia-wiki-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

let _stagingCached = null
async function stagingExists(env) {
  if (_stagingCached === true) return true
  const r = await ghApi(env, "GET", "/git/ref/heads/" + STAGING_BRANCH)
  if (r.status === 200) { _stagingCached = true; return true }
  return false
}
// Create staging from main if it doesn't exist. Returns null on success, or
// a JSON error Response if creation failed (so callers can early-return).
async function ensureStagingExists(env) {
  if (await stagingExists(env)) return null
  // Get main's HEAD SHA
  const headR = await ghApi(env, "GET", "/git/ref/heads/" + MAIN_BRANCH)
  if (!headR.ok) return json({ error: "cannot read main ref: github " + headR.status }, 502)
  const headData = await headR.json()
  const sha = headData.object && headData.object.sha
  if (!sha) return json({ error: "main ref has no sha" }, 502)
  // Create staging ref pointing at main's HEAD
  const createR = await ghApi(env, "POST", "/git/refs", null, {
    ref: "refs/heads/" + STAGING_BRANCH,
    sha,
  })
  if (!createR.ok && createR.status !== 422) {
    return json({ error: "cannot create staging branch: github " + createR.status, detail: (await createR.text()).slice(0, 200) }, 502)
  }
  _stagingCached = true
  return null
}

function b64decode(b64) {
  const bin = atob((b64 || "").replace(/\s/g, ""))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
function b64encode(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || ""
  if (!header.startsWith("Basic ")) return { ok: false }

  let user, pass
  try {
    const decoded = atob(header.slice(6))
    const i = decoded.indexOf(":")
    if (i < 0) return { ok: false }
    user = decoded.slice(0, i)
    pass = decoded.slice(i + 1)
  } catch {
    return { ok: false }
  }

  let users = {}
  try {
    users = JSON.parse(env.WIKI_USERS || "{}")
  } catch {
    return { ok: false }
  }

  const entry = users[user]
  if (!entry || typeof entry.hash !== "string") return { ok: false }
  const passHash = await sha256hex(pass)
  if (!timingSafeEqualHex(passHash, entry.hash.toLowerCase())) return { ok: false }

  const role = isAdminRole(entry.role) ? entry.role : "player"
  return {
    ok: true,
    user,
    role,
    tier: entry.tier,
    // Default players to a mid level so they can edit player-editable pages
    // but not admin-only ones. Admin-tier roles default to 1 (can edit anything).
    editLevel: Number.isFinite(entry.editLevel)
      ? entry.editLevel
      : isAdminRole(role)
        ? 1
        : 3,
  }
}

function unauthorized(msg) {
  return new Response(msg || "Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Amantia Wiki", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  })
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Constant-time compare of two equal-length hex strings.
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}
