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

    // TEMPORARY diagnostic — reports only the SHAPE of WIKI_USERS (no usernames,
    // no hashes, no passwords). Remove once login is confirmed working again.
    if (path === "/diag/secret") {
      const raw = env.WIKI_USERS
      const out = {
        secret_defined: raw !== undefined && raw !== null,
        secret_length: typeof raw === "string" ? raw.length : 0,
        secret_first_char: typeof raw === "string" && raw.length ? raw.charCodeAt(0) : null,
        secret_last_char: typeof raw === "string" && raw.length ? raw.charCodeAt(raw.length - 1) : null,
        parses_as_json: false,
        parsed_type: null,
        user_count: 0,
        entries_with_valid_hash: 0,
      }
      try {
        const users = JSON.parse(raw || "{}")
        out.parses_as_json = true
        out.parsed_type = typeof users
        if (users && typeof users === "object") {
          const keys = Object.keys(users)
          out.user_count = keys.length
          out.entries_with_valid_hash = keys.filter(
            (k) => users[k] && typeof users[k].hash === "string" && /^[0-9a-f]{64}$/i.test(users[k].hash),
          ).length
        }
      } catch (e) {
        out.parse_error = String(e).slice(0, 120)
      }
      return json(out)
    }

    // Logout: always 401 so the browser drops its cached Basic-Auth credentials.
    // Any subsequent request re-prompts. The URL is documented as the logout
    // trigger; nothing to protect here.
    if (path === "/logout") {
      return new Response(
        "<!doctype html><meta charset=utf-8><title>Logged out</title>" +
        "<style>body{font:15px/1.5 system-ui;background:#15151a;color:#eee;text-align:center;padding:20vh 1rem}a{color:#e8b04b}</style>" +
        "<h2>Signed out.</h2><p><a href=\"/\">Sign back in →</a></p>",
        {
          status: 401,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "WWW-Authenticate": 'Basic realm="Amantia Wiki — logged out", charset="UTF-8"',
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
// Reads/commits page files in the GitHub `content/` tree (the source of truth).
// A commit to `main` triggers Cloudflare's build, so edits go live in ~1–2 min.
// Requires secret GITHUB_TOKEN (fine-grained, Contents: read+write on the repo).
async function handleApi(path, request, env, auth) {
  if (!isAdminRole(auth.role)) return json({ error: "forbidden — admin only" }, 403)
  if (!env.GITHUB_TOKEN) return json({ error: "editing not configured (GITHUB_TOKEN not set)" }, 501)

  const url = new URL(request.url)
  const m = request.method

  if (path === "/api/page" && m === "GET") {
    const p = normPath(url.searchParams.get("path"))
    if (!p) return json({ error: "bad path" }, 400)
    const r = await gh(env, "GET", p)
    if (r.status === 404) return json({ exists: false, path: p, content: "", sha: null })
    if (!r.ok) return json({ error: "github " + r.status }, 502)
    const data = await r.json()
    return json({ exists: true, path: p, sha: data.sha, content: b64decode(data.content) })
  }

  if (path === "/api/page" && (m === "PUT" || m === "POST")) {
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: "bad json" }, 400)
    const p = normPath(body.path)
    if (!p) return json({ error: "bad path (must be content/…/*.md)" }, 400)
    const payload = {
      message: (body.message || "web edit: " + p).slice(0, 200) + " (by " + auth.user + ")",
      content: b64encode(body.content == null ? "" : String(body.content)),
      branch: "main",
    }
    if (body.sha) payload.sha = body.sha
    const r = await gh(env, "PUT", p, payload)
    if (!r.ok) return json({ error: "github " + r.status, detail: (await r.text()).slice(0, 200) }, 502)
    const data = await r.json()
    return json({ ok: true, path: p, sha: data.content && data.content.sha, commit: data.commit && data.commit.sha })
  }

  if (path === "/api/page" && m === "DELETE") {
    const body = await request.json().catch(() => null)
    if (!body || !body.sha) return json({ error: "sha required to delete" }, 400)
    const p = normPath(body.path)
    if (!p) return json({ error: "bad path" }, 400)
    const r = await gh(env, "DELETE", p, {
      message: ("web delete: " + p + " (by " + auth.user + ")").slice(0, 200),
      sha: body.sha,
      branch: "main",
    })
    if (!r.ok) return json({ error: "github " + r.status, detail: (await r.text()).slice(0, 200) }, 502)
    return json({ ok: true, deleted: p })
  }

  return json({ error: "unknown endpoint" }, 404)
}

function normPath(p) {
  if (!p) return null
  p = String(p).replace(/^\/+/, "")
  if (!p.startsWith("content/")) p = "content/" + p
  if (p.indexOf("..") !== -1 || !p.endsWith(".md")) return null
  return p
}

function gh(env, method, repoPath, body) {
  const repo = env.GITHUB_REPO || "Zeon231/amantia-wiki"
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/")
  return fetch("https://api.github.com/repos/" + repo + "/contents/" + encoded, {
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
