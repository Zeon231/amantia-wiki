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
 * SHARED_REQUIRES_LOGIN="true" gates the whole site (otherwise only /private/*).
 * Fail-closed: anything protected without valid creds → 401.
 *
 * Requires wrangler.jsonc: main = worker/index.js, assets.binding = ASSETS,
 * assets.run_worker_first = true (so no asset is served before this runs).
 */

const PRIVATE_PREFIX = "/private/"

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    const isPrivate = path.startsWith(PRIVATE_PREFIX)
    const shareGate = env.SHARED_REQUIRES_LOGIN === "true"

    // Public shared content — straight from assets, no login.
    if (!isPrivate && !shareGate && path !== "/whoami") {
      return env.ASSETS.fetch(request)
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
        canSeeAllTiers: auth.role === "admin",
      })
    }

    if (isPrivate && !canAccessTier(auth, path)) {
      return unauthorized("You are signed in, but this section isn't yours.")
    }

    return env.ASSETS.fetch(request)
  },
}

// /private/<tier>/... — admins see all tiers; players only their own.
function canAccessTier(auth, path) {
  if (auth.role === "admin") return true
  const tier = path.slice(PRIVATE_PREFIX.length).split("/")[0]
  return !!tier && tier === auth.tier
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

  return {
    ok: true,
    user,
    role: entry.role === "admin" ? "admin" : "player",
    tier: entry.tier,
    // Default players to a mid level so they can edit their own player-editable pages
    // but not admin-only ones. Admins default to 1 (can edit anything).
    editLevel: Number.isFinite(entry.editLevel)
      ? entry.editLevel
      : entry.role === "admin"
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
