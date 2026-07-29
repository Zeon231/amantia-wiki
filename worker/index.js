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
  async fetch(request, env, ctx) {
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

    // Fire-and-forget access log for ALL authenticated request paths (the
    // isLoggablePath filter inside decides which ones actually get an entry).
    if (ctx && ctx.waitUntil) ctx.waitUntil(logAccess(env, request, auth))

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
        viewAsBy: auth.viewAsBy || null, // if set, admin is impersonating
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
  // /api/view-as must remain callable even DURING impersonation — otherwise
  // an admin who impersonated a player would be stuck as that player. It
  // passes the gate if the caller is currently an admin OR was originally
  // an admin (viewAsBy). All other endpoints require the effective role
  // to be admin.
  const isRealAdmin = isAdminRole(auth.role) || !!auth.viewAsBy
  if (path === "/api/view-as") {
    if (!isRealAdmin) return json({ error: "forbidden — admin only" }, 403)
    if (request.method === "GET") {
      // List candidates (canonical names + roles/tiers, no hashes) for the picker
      let users = {}
      try { users = JSON.parse(env.WIKI_USERS || "{}") } catch {}
      const list = Object.keys(users).map((k) => ({
        user: k,
        role: users[k].role || "player",
        tier: users[k].tier || null,
        editLevel: Number.isFinite(users[k].editLevel) ? users[k].editLevel : null,
      }))
      return json({ users: list, current: auth.viewAsBy ? auth.user : null, real: auth.viewAsBy || auth.user })
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}))
      const as = body && body.as ? String(body.as) : null
      const cookieBase = "AX_VIEW_AS=" + (as ? encodeURIComponent(as) : "") +
        "; Path=/; SameSite=Lax" +
        (as ? "; Max-Age=86400" : "; Max-Age=0")
      return new Response(JSON.stringify({ ok: true, viewingAs: as || null }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": cookieBase },
      })
    }
    return json({ error: "method not allowed" }, 405)
  }

  if (!isAdminRole(auth.role)) return json({ error: "forbidden — admin only" }, 403)
  if (!env.GITHUB_TOKEN) return json({ error: "editing not configured (GITHUB_TOKEN not set)" }, 501)

  // ---- Access log (admin panel) ----
  // GET /api/audit?date=YYYY-MM-DD → that day's log, newest first
  // GET /api/audit?days=7          → last N days aggregated (max 30)
  if (path === "/api/audit" && request.method === "GET") {
    if (!env.USERS_KV) return json({ error: "USERS_KV not configured — audit log needs KV" }, 501)
    const daysParam = url.searchParams.get("days")
    if (daysParam) {
      const days = Math.max(1, Math.min(30, parseInt(daysParam, 10) || 1))
      const now = Date.now()
      const out = []
      for (let i = 0; i < days; i++) {
        const iso = new Date(now - i * 86400000).toISOString().slice(0, 10)
        const raw = await env.USERS_KV.get("log:" + iso)
        if (raw) { try { out.push(...JSON.parse(raw)) } catch {} }
      }
      out.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
      return json({ days, entries: out })
    }
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10)
    const raw = await env.USERS_KV.get("log:" + date)
    const entries = raw ? JSON.parse(raw).slice().reverse() : []
    return json({ date, entries })
  }

  // ---- Users list (admin panel: no hashes, safe to hand to the browser) ----
  if (path === "/api/users" && request.method === "GET") {
    let users = {}
    try { users = JSON.parse(env.WIKI_USERS || "{}") } catch { return json({ error: "WIKI_USERS malformed" }, 500) }
    const list = Object.keys(users).map((k) => ({
      user: k,
      role: users[k].role || "player",
      tier: users[k].tier || null,
      editLevel: Number.isFinite(users[k].editLevel) ? users[k].editLevel : null,
    }))
    return json({ users: list, storage: "secret", note: "Editing WIKI_USERS from the wiki requires a Cloudflare API token or migrating to KV. Use the tool below to compute the updated JSON, then run: wrangler secret put WIKI_USERS" })
  }

  const url = new URL(request.url)
  const m = request.method

  // ---- Page CRUD (writes go to staging) ----
  if (path === "/api/page" && m === "GET") {
    const p = normPath(url.searchParams.get("path"))
    if (!p) return json({ error: "bad path" }, 400)
    // Sync staging↔main first so a page added to main via sync-vault push is
    // visible to the editor (otherwise staging would be stale and the editor
    // would treat the page as empty, which then overwrites main on save).
    await ensureStagingExists(env).catch(() => null)
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

  // ---- Image/asset upload (admin-only, staged) ----
  // Accepts:
  //   POST /api/upload   Content-Type: multipart/form-data
  //     fields: file (binary), path (content-relative dir), name (filename), overwrite ("true"|"false")
  //   POST /api/upload   Content-Type: application/json
  //     body: { url, path, name?, overwrite? }
  // Returns { ok, path, url, existed, sha } on success, { error, existing_sha } on conflict.
  if (path === "/api/upload" && m === "POST") {
    const ctype = (request.headers.get("Content-Type") || "").toLowerCase()
    let bytes, filename, targetDir, overwrite, fromUrl = null
    if (ctype.startsWith("multipart/form-data")) {
      const form = await request.formData().catch(() => null)
      if (!form) return json({ error: "bad multipart body" }, 400)
      const file = form.get("file")
      if (!file || typeof file === "string") return json({ error: "no file uploaded" }, 400)
      bytes = new Uint8Array(await file.arrayBuffer())
      filename = String(form.get("name") || file.name || "image").trim()
      targetDir = String(form.get("path") || "").trim()
      overwrite = String(form.get("overwrite") || "") === "true"
    } else if (ctype.startsWith("application/json")) {
      const body = await request.json().catch(() => null)
      if (!body || !body.url) return json({ error: "missing url in JSON body" }, 400)
      try {
        const u = new URL(body.url)
        if (u.protocol !== "https:" && u.protocol !== "http:") return json({ error: "url must be http(s)" }, 400)
      } catch { return json({ error: "invalid url" }, 400) }
      const upstream = await fetch(body.url, { redirect: "follow" })
      if (!upstream.ok) return json({ error: "fetch failed: " + upstream.status }, 502)
      const uct = (upstream.headers.get("Content-Type") || "").toLowerCase()
      if (!uct.startsWith("image/")) return json({ error: "URL did not return an image (Content-Type: " + uct + ")" }, 400)
      bytes = new Uint8Array(await upstream.arrayBuffer())
      filename = String(body.name || body.url.split("/").pop().split("?")[0] || "image").trim()
      targetDir = String(body.path || "").trim()
      overwrite = !!body.overwrite
      fromUrl = body.url
    } else {
      return json({ error: "expected multipart/form-data or application/json" }, 415)
    }
    // Validate extension
    const m2 = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.exec(filename)
    if (!m2) return json({ error: "unsupported image format (allowed: jpg, jpeg, png, gif, webp, svg, avif)" }, 400)
    const ext = m2[1].toLowerCase()
    // Slugify filename (keep extension)
    const stem = filename.slice(0, filename.length - m2[0].length)
    const slug = stem.toLowerCase().replace(/['"]+/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-") || "image"
    const safeName = slug + "." + ext
    // Validate/normalize target directory
    let dir = targetDir.replace(/^\/+|\/+$/g, "")
    if (!dir.startsWith("content/")) dir = "content/" + dir
    if (dir.indexOf("..") !== -1) return json({ error: "path traversal not allowed" }, 400)
    const fullPath = dir + "/" + safeName
    // Size sanity — reject > 25MB
    if (bytes.length > 25 * 1024 * 1024) return json({ error: "file too large (" + Math.round(bytes.length/1024/1024) + " MB > 25 MB max)" }, 400)
    // Check existence to detect conflict
    await ensureStagingExists(env).catch(() => null)
    const existingR = await ghContents(env, "GET", fullPath, null, STAGING_BRANCH)
    let existingSha = null
    if (existingR.status === 200) {
      const j = await existingR.json()
      existingSha = j.sha
      if (!overwrite) {
        return json({ error: "exists", path: fullPath, existing_sha: existingSha,
          message: "A file already exists at " + fullPath + ". Overwrite it or upload with a different name." }, 409)
      }
    } else if (existingR.status !== 404) {
      return json({ error: "github check: " + existingR.status }, 502)
    }
    // Base64-encode and commit via Contents API
    const b64 = bytesToBase64(bytes)
    const commitMsg = (fromUrl ? "web upload (url): " : "web upload: ") + fullPath + " (by " + auth.user + ")"
    const payload = { message: commitMsg.slice(0, 200), content: b64, branch: STAGING_BRANCH }
    if (existingSha) payload.sha = existingSha
    const putR = await ghContents(env, "PUT", fullPath, payload)
    if (!putR.ok) return json({ error: "github " + putR.status, detail: (await putR.text()).slice(0, 200) }, 502)
    const data = await putR.json()
    return json({
      ok: true, staged: true, existed: !!existingSha, path: fullPath,
      // Slugified public URL: content/foo/bar.png → /foo/bar.png (lowercased, spaces → -)
      url: "/" + dir.replace(/^content\//, "").toLowerCase().replace(/ /g, "-") + "/" + safeName,
      sha: data.content && data.content.sha,
    })
  }

  // ---- List all images in content/ (admin: for the "Browse wiki" picker) ----
  // Returns { images: [{ path, url, size }] } sorted by path. Uses a single
  // Git Trees API call so we don't hammer the Contents API for every folder.
  if (path === "/api/images" && m === "GET") {
    await ensureStagingExists(env).catch(() => null)
    const branch = (await stagingExists(env)) ? STAGING_BRANCH : MAIN_BRANCH
    const refR = await ghApi(env, "GET", "/git/ref/heads/" + branch)
    if (!refR.ok) return json({ error: "cannot read ref " + branch + ": github " + refR.status }, 502)
    const refD = await refR.json()
    const commitSha = refD.object && refD.object.sha
    if (!commitSha) return json({ error: "no commit sha on ref" }, 502)
    const commitR = await ghApi(env, "GET", "/git/commits/" + commitSha)
    if (!commitR.ok) return json({ error: "cannot read commit: github " + commitR.status }, 502)
    const commitD = await commitR.json()
    const treeSha = commitD.tree && commitD.tree.sha
    if (!treeSha) return json({ error: "no tree sha on commit" }, 502)
    const treeR = await ghApi(env, "GET", "/git/trees/" + treeSha + "?recursive=1")
    if (!treeR.ok) return json({ error: "cannot read tree: github " + treeR.status }, 502)
    const treeD = await treeR.json()
    const IMG_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i
    const images = (treeD.tree || [])
      .filter((n) => n.type === "blob" && n.path.startsWith("content/") && IMG_RE.test(n.path))
      .map((n) => {
        const rel = n.path.slice("content/".length)
        // Slugified public URL — matches how the upload endpoint constructs it
        const dir = rel.substring(0, rel.lastIndexOf("/"))
        const file = rel.substring(rel.lastIndexOf("/") + 1)
        const url = "/" + dir.toLowerCase().replace(/ /g, "-") + "/" + file
        return { path: n.path, url, size: n.size || 0 }
      })
      .sort((a, b) => a.path.localeCompare(b.path))
    return json({ images, truncated: !!treeD.truncated, branch })
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
// Create staging from main if missing; if it exists, also merge main into
// staging so the web editor sees files that landed on main via sync-vault
// pushes since staging was created. Returns null on success, or a JSON error
// Response if creation failed. If the main→staging merge conflicts, we log
// but don't fail — the admin will see it in the changes log / deploy modal.
async function ensureStagingExists(env) {
  if (!(await stagingExists(env))) {
    // First-time create: point staging at main's HEAD
    const headR = await ghApi(env, "GET", "/git/ref/heads/" + MAIN_BRANCH)
    if (!headR.ok) return json({ error: "cannot read main ref: github " + headR.status }, 502)
    const headData = await headR.json()
    const sha = headData.object && headData.object.sha
    if (!sha) return json({ error: "main ref has no sha" }, 502)
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
  // Fast-forward / auto-merge main INTO staging so it always reflects the
  // latest deployed state plus staging's pending edits. GitHub's /merges
  // endpoint returns 204 if nothing to merge, 201 on new merge commit,
  // 409 on unresolvable conflict (we tolerate — admin fixes manually).
  await ghApi(env, "POST", "/merges", null, {
    base: STAGING_BRANCH,
    head: MAIN_BRANCH,
    commit_message: "sync: fast-forward staging from main",
  }).catch(() => null)
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

// Encode a Uint8Array to base64. Chunked to avoid "Maximum call stack" on
// String.fromCharCode(...bytes) for large binaries (25MB uploads).
function bytesToBase64(bytes) {
  let bin = ""
  const chunk = 0x8000 // 32KB per chunk
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// ---- Users store: KV-first, secret fallback (during migration) ----------
// When USERS_KV is bound and has a `users` key, read it. If USERS_KV is
// bound but empty, auto-seed once from the legacy WIKI_USERS secret. When
// USERS_KV isn't bound at all, keep reading the secret directly (fully
// backwards-compatible with the pre-migration deploy).
async function getUsers(env) {
  if (env.USERS_KV) {
    const raw = await env.USERS_KV.get("users")
    if (raw) { try { return JSON.parse(raw) } catch { return {} } }
    // First read after migration: seed from the legacy secret if present.
    if (env.WIKI_USERS) {
      try {
        const seed = JSON.parse(env.WIKI_USERS)
        await env.USERS_KV.put("users", JSON.stringify(seed))
        return seed
      } catch { /* malformed secret — ignore */ }
    }
    return {}
  }
  try { return JSON.parse(env.WIKI_USERS || "{}") } catch { return {} }
}
async function saveUsers(env, users) {
  if (!env.USERS_KV) throw new Error("USERS_KV binding not configured — user edits require KV")
  await env.USERS_KV.put("users", JSON.stringify(users))
}

// ---- Access log (best-effort, fire-and-forget) ---------------------------
// Every meaningful HTML page view + logout is appended to a per-day array
// under USERS_KV. Assets, /whoami, and other /api/* traffic are skipped so
// the log stays about "who visited what page and when", not every HTTP call.
// Entries expire after 35 days. Log is admin-viewable via /api/audit.
const LOG_MAX_PER_DAY = 5000
const LOG_TTL_SECONDS = 60 * 60 * 24 * 35
function logDayKey(iso) { return "log:" + iso.slice(0, 10) }
function isLoggablePath(path, method) {
  if (path === "/logout") return true
  if (path === "/whoami") return false
  if (path.startsWith("/api/")) {
    // Log identity/deploy events, skip the chatty read APIs
    if (path === "/api/view-as" && method === "POST") return true
    if (path === "/api/deploy") return true
    if (path === "/api/page" && (method === "PUT" || method === "POST" || method === "DELETE")) return true
    if (path === "/api/upload" && method === "POST") return true
    if (path.startsWith("/api/users/")) return true
    return false
  }
  if (path.startsWith("/static/")) return false
  if (/\.(css|js|mjs|png|jpe?g|gif|webp|svg|avif|ico|woff2?|ttf|json|map|xml|txt)($|\?)/i.test(path)) return false
  return true
}
async function logAccess(env, request, auth) {
  if (!env.USERS_KV) return
  const path = new URL(request.url).pathname
  const method = request.method
  if (!isLoggablePath(path, method)) return
  const ts = new Date().toISOString()
  const key = logDayKey(ts)
  const entry = {
    ts,
    user: (auth && auth.user) || "-",
    role: (auth && auth.role) || null,
    tier: (auth && auth.tier) || null,
    viewAsBy: (auth && auth.viewAsBy) || null, // admin impersonating this identity
    path,
    method,
    ip: request.headers.get("CF-Connecting-IP") || null,
    ua: (request.headers.get("User-Agent") || "").slice(0, 120),
  }
  try {
    const raw = await env.USERS_KV.get(key)
    const arr = raw ? JSON.parse(raw) : []
    arr.push(entry)
    if (arr.length > LOG_MAX_PER_DAY) arr.splice(0, arr.length - LOG_MAX_PER_DAY)
    await env.USERS_KV.put(key, JSON.stringify(arr), { expirationTtl: LOG_TTL_SECONDS })
  } catch { /* best-effort — never break a page view over a logging failure */ }
}
// Validate a user record before writing (defense against a corrupted PUT).
function validateUserRecord(rec, name) {
  if (!rec || typeof rec !== "object") return "record must be an object"
  if (typeof rec.hash !== "string" || !/^[0-9a-fA-F]{64}$/.test(rec.hash)) return "hash must be a 64-char hex sha256"
  if (rec.role && !["admin", "dm", "player"].includes(rec.role)) return "role must be admin, dm, or player"
  if (rec.tier != null && typeof rec.tier !== "string") return "tier must be a string"
  if (rec.editLevel != null && !(Number.isInteger(rec.editLevel) && rec.editLevel >= 1 && rec.editLevel <= 999)) return "editLevel must be an integer 1..999"
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(name)) return "username must be 2-32 chars, letters/digits/._-"
  return null
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

  const users = await getUsers(env)

  // Case-insensitive username lookup. Stored key wins for canonical display;
  // any input casing matches. Passwords stay case-sensitive.
  const lookup = String(user).toLowerCase()
  let canonicalName = null, entry = null
  for (const k of Object.keys(users)) {
    if (k.toLowerCase() === lookup) { canonicalName = k; entry = users[k]; break }
  }
  if (!entry || typeof entry.hash !== "string") return { ok: false }
  const passHash = await sha256hex(pass)
  if (!timingSafeEqualHex(passHash, entry.hash.toLowerCase())) return { ok: false }

  const role = isAdminRole(entry.role) ? entry.role : "player"
  const realAuth = {
    ok: true,
    user: canonicalName,
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

  // View-as impersonation: only ADMIN-role callers can trigger this. After
  // the real password check succeeds, if the AX_VIEW_AS cookie names another
  // user (or "anonymous"), swap the returned role/tier so the site behaves
  // as if THAT user were logged in. Real admin identity is kept in viewAsBy
  // so the client can render a "Viewing as X" banner.
  if (isAdminRole(role)) {
    const cookieHdr = request.headers.get("Cookie") || ""
    const m = /(?:^|;\s*)AX_VIEW_AS=([^;]+)/.exec(cookieHdr)
    const asName = m ? decodeURIComponent(m[1]) : null
    if (asName && asName.toLowerCase() !== canonicalName.toLowerCase()) {
      if (asName.toLowerCase() === "anonymous") {
        return {
          ok: true, user: "anonymous", role: "player", tier: null,
          editLevel: 999, viewAsBy: canonicalName,
        }
      }
      const asLookup = asName.toLowerCase()
      for (const k of Object.keys(users)) {
        if (k.toLowerCase() !== asLookup) continue
        const e = users[k]
        const asRole = isAdminRole(e.role) ? e.role : "player"
        return {
          ok: true, user: k, role: asRole, tier: e.tier,
          editLevel: Number.isFinite(e.editLevel) ? e.editLevel : (isAdminRole(asRole) ? 1 : 3),
          viewAsBy: canonicalName,
        }
      }
      // Unknown impersonation target — fall through to real admin auth
    }
  }
  return realAuth
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
