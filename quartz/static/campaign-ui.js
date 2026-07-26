/* Amantia campaign UI — banners, per-reader bookmarks & view history, home widgets.
 * Loaded site-wide from Head.tsx. Runs on full load and on Quartz's `nav` event.
 * Bookmarks and "most viewed" are stored per-browser in localStorage. */
(function () {
  var LS_VIEWS = "amantia-views"
  var LS_MARKS = "amantia-bookmarks"
  var CI_CACHE = null

  function curSlug() {
    var p = location.pathname.replace(/\/+$/, "")
    p = p.replace(/^\//, "")
    return p === "" ? "index" : p
  }
  function isHome() {
    var s = curSlug()
    return s === "index" || s === ""
  }
  function loadObj(k) { try { return JSON.parse(localStorage.getItem(k) || "{}") } catch (e) { return {} } }
  function loadArr(k) { try { return JSON.parse(localStorage.getItem(k) || "[]") } catch (e) { return [] } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

  function injectStyles() {
    if (document.getElementById("amantia-ui-css")) return
    var s = document.createElement("style")
    s.id = "amantia-ui-css"
    s.textContent = [
      ".amantia-banner{width:100%;height:clamp(150px,28vh,290px);background-size:cover;background-position:center 30%;border-radius:10px;margin:0 0 1.2rem;position:relative;box-shadow:0 2px 10px rgba(0,0,0,.25)}",
      ".amantia-banner::after{content:'';position:absolute;inset:0;border-radius:10px;background:linear-gradient(to bottom,transparent 55%,var(--light))}",
      ".amantia-bookmark{background:none;border:0;cursor:pointer;font-size:1.15rem;line-height:1;color:var(--tertiary);margin-left:.5rem;vertical-align:middle;opacity:.7;transition:opacity .12s,transform .12s}",
      ".amantia-bookmark:hover{opacity:1;transform:scale(1.15)}",
      ".amantia-bookmark.on{color:var(--tertiary);opacity:1}",
      ".amantia-home{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem;margin:1.5rem 0}",
      ".amantia-card{background:var(--lightgray);border:1px solid var(--gray);border-radius:10px;padding:.9rem 1rem}",
      ".amantia-card h3{margin:.1rem 0 .6rem;font-size:1rem;color:var(--secondary);display:flex;align-items:center;gap:.4rem}",
      ".amantia-card ol,.amantia-card ul{margin:0;padding-left:1.1rem}",
      ".amantia-card li{margin:.28rem 0;line-height:1.35}",
      ".amantia-card a{text-decoration:none}",
      ".amantia-card .empty{color:var(--gray);font-size:.86rem;font-style:italic;padding-left:.1rem}",
      ".amantia-card .cnt{color:var(--gray);font-size:.78rem}",
      "#amantia-admin-bar{position:fixed;right:16px;bottom:16px;z-index:900;display:flex;gap:8px}",
      "#amantia-admin-bar button{background:var(--secondary);color:#fff;border:0;border-radius:8px;padding:8px 13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}",
      ".ax-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}",
      ".ax-modal{background:var(--light);color:var(--darkgray);width:min(900px,96vw);max-height:92vh;display:flex;flex-direction:column;border-radius:12px;border:1px solid var(--gray);overflow:hidden}",
      ".ax-modal header{padding:.7rem 1rem;border-bottom:1px solid var(--lightgray);display:flex;align-items:center;gap:.6rem;font-size:.9rem}",
      ".ax-modal header .path{font-family:ui-monospace,monospace;color:var(--secondary);flex:1;word-break:break-all}",
      ".ax-modal textarea{flex:1;min-height:45vh;border:0;outline:0;resize:none;padding:1rem;font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;background:var(--light);color:var(--darkgray)}",
      ".ax-modal footer{padding:.7rem 1rem;border-top:1px solid var(--lightgray);display:flex;align-items:center;gap:.6rem}",
      ".ax-modal footer .status{flex:1;font-size:.82rem;color:var(--gray)}",
      ".ax-btn{border:0;border-radius:7px;padding:7px 14px;font-weight:600;cursor:pointer}",
      ".ax-save{background:var(--secondary);color:#fff}.ax-cancel{background:var(--lightgray);color:var(--darkgray)}.ax-del{background:#8a2020;color:#fff;margin-right:auto}",
      "#amantia-session-bar{position:fixed;left:14px;bottom:14px;z-index:900;display:flex;gap:8px;align-items:center;background:rgba(20,20,25,.85);color:#eee;padding:6px 10px;border-radius:8px;font:12px/1.2 system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.35)}",
      "#amantia-session-bar .who{opacity:.85}",
      "#amantia-session-bar .role{opacity:.55;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-left:.2rem}",
      "#amantia-session-bar button{background:#3a3a44;color:#eee;border:0;border-radius:5px;padding:4px 9px;cursor:pointer;font-size:12px}",
      "#amantia-session-bar button:hover{background:#4b4b58}",
    ].join("\n")
    document.head.appendChild(s)
  }

  // ---- Banner ---------------------------------------------------------------
  function renderBanner() {
    document.querySelectorAll(".amantia-banner").forEach(function (e) { e.remove() })
    var meta = document.querySelector('meta[name="banner-image"]')
    if (!meta) return
    var raw = (meta.getAttribute("content") || "").trim()
    if (!raw) return
    // vault path -> served URL: lowercase, spaces -> hyphens, absolute from root
    var url = "/" + raw.toLowerCase().replace(/ /g, "-").replace(/^\/+/, "")
    var ym = document.querySelector('meta[name="banner-y"]')
    var y = ym ? parseFloat(ym.getAttribute("content")) : NaN
    var mount = document.querySelector(".center") || document.querySelector("article")
    if (!mount) return
    var b = document.createElement("div")
    b.className = "amantia-banner"
    b.style.backgroundImage = 'url("' + encodeURI(url) + '")'
    if (isFinite(y)) b.style.backgroundPositionY = Math.max(0, Math.min(1, y)) * 100 + "%"
    mount.insertBefore(b, mount.firstChild)
  }

  // ---- View tracking --------------------------------------------------------
  function trackView() {
    var s = curSlug()
    if (isHome() || s.indexOf("tags/") === 0 || /\/404$/.test(s)) return
    var v = loadObj(LS_VIEWS)
    v[s] = (v[s] || 0) + 1
    save(LS_VIEWS, v)
  }

  // ---- Bookmark toggle ------------------------------------------------------
  function addBookmarkButton() {
    if (isHome()) return
    var h1 = document.querySelector("article h1, .page-title, article .page-title")
    if (!h1 || h1.querySelector(".amantia-bookmark")) return
    var s = curSlug()
    var marks = loadArr(LS_MARKS)
    var btn = document.createElement("button")
    btn.className = "amantia-bookmark" + (marks.indexOf(s) >= 0 ? " on" : "")
    btn.title = "Bookmark this page"
    btn.textContent = marks.indexOf(s) >= 0 ? "★" : "☆"
    btn.addEventListener("click", function () {
      var m = loadArr(LS_MARKS)
      var i = m.indexOf(s)
      if (i >= 0) { m.splice(i, 1); btn.textContent = "☆"; btn.classList.remove("on") }
      else { m.push(s); btn.textContent = "★"; btn.classList.add("on") }
      save(LS_MARKS, m)
    })
    h1.appendChild(btn)
  }

  // ---- Home widgets ---------------------------------------------------------
  function contentIndex() {
    if (CI_CACHE) return Promise.resolve(CI_CACHE)
    return fetch("/static/contentIndex.json", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : {} })
      .then(function (j) { CI_CACHE = j; return j })
      .catch(function () { return {} })
  }
  function titleFor(ci, slug) {
    var e = ci[slug] || ci[slug + "/index"]
    return (e && e.title) || slug.split("/").pop().replace(/-/g, " ")
  }
  function isContentPage(slug, e) {
    if (!e) return false
    if (slug.indexOf("tags/") === 0 || slug.indexOf("private/") === 0) return false
    if (slug.indexOf("00---dashboard") === 0) return false
    if (slug === "index" || /\/index$/.test(slug)) return false
    return true
  }
  function li(slug, label, extra) {
    return '<li><a href="/' + slug + '" data-no-popover="false">' + esc(label) + "</a>" + (extra || "") + "</li>"
  }

  function renderHome() {
    if (!isHome()) return
    var mount = document.getElementById("campaign-home")
    if (!mount) return
    contentIndex().then(function (ci) {
      // Recent — by page date, newest first
      var recent = Object.keys(ci)
        .filter(function (s) { return isContentPage(s, ci[s]) })
        .map(function (s) { return { s: s, d: ci[s].date ? new Date(ci[s].date).getTime() : 0 } })
        .sort(function (a, b) { return b.d - a.d })
        .slice(0, 5)
        .map(function (x) { return li(x.s, titleFor(ci, x.s)) })

      // Most viewed (this browser)
      var views = loadObj(LS_VIEWS)
      var viewed = Object.keys(views)
        .sort(function (a, b) { return views[b] - views[a] })
        .slice(0, 5)
        .map(function (s) { return li(s, titleFor(ci, s), ' <span class="cnt">(' + views[s] + ")</span>") })

      // Bookmarks (this browser)
      var marks = loadArr(LS_MARKS)
      var marked = marks.map(function (s) { return li(s, titleFor(ci, s)) })

      function card(icon, title, items) {
        return '<div class="amantia-card"><h3>' + icon + " " + title + "</h3>" +
          (items.length ? "<ol>" + items.join("") + "</ol>" : '<div class="empty">Nothing yet.</div>') +
          "</div>"
      }
      mount.innerHTML =
        card("🕘", "Most Recent", recent) +
        card("⭐", "Bookmarks", marked) +
        card("🔥", "Most Viewed", viewed)
    })
  }

  // ---- Session (logout) + admin editor -----------------------------------
  var WHO = null
  function sessionInit() {
    if (WHO !== null) { paintSession(); return }
    fetch("/whoami", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (w) { WHO = w || false; paintSession() })
      .catch(function () { WHO = false })
  }
  function logout() {
    // HTTP Basic Auth has no true logout — the browser caches credentials per
    // origin/realm. All we can safely do is navigate to /logout, which returns
    // 401 in a NEW realm ("logged out"). The browser has no cached creds for
    // that realm, so it prompts; the user cancels the prompt and sees the
    // "signed out" page. To fully sign out they must close the tab.
    //
    // (An earlier version poked the auth cache with a bogus-creds fetch to try
    // to force invalidation — but modern browsers cache those bogus creds
    // instead, breaking subsequent login attempts. Never do that.)
    location.href = "/logout"
  }
  function paintSession() {
    if (document.getElementById("amantia-session-bar")) return
    if (!WHO || !WHO.user) return
    var bar = document.createElement("div")
    bar.id = "amantia-session-bar"
    bar.innerHTML =
      '<span class="who">' + esc(WHO.user) + ' <span class="role">' + esc(WHO.role) + '</span></span>' +
      '<button type="button" id="ax-logout">Sign out</button>'
    document.body.appendChild(bar)
    document.getElementById("ax-logout").addEventListener("click", logout)
    if (WHO.canEdit) addAdminTools()
  }
  function addAdminTools() {
    if (document.getElementById("amantia-admin-bar")) return
    var bar = document.createElement("div")
    bar.id = "amantia-admin-bar"
    var edit = document.createElement("button"); edit.textContent = "✏️ Edit page"
    var add = document.createElement("button"); add.textContent = "＋ New"
    bar.appendChild(edit); bar.appendChild(add)
    document.body.appendChild(bar)
    edit.addEventListener("click", function () {
      var sp = (document.querySelector('meta[name="source-path"]') || {}).content
      if (sp) openEditor(sp, false)
      else alert("This page has no editable source file.")
    })
    add.addEventListener("click", function () {
      var p = prompt("New page path, relative to content/ — e.g.\n01 - World/Cities & Locations/New Place.md")
      if (p && /\.md$/.test(p)) openEditor(p, true)
      else if (p) alert("Path must end in .md")
    })
  }
  function openEditor(path, isNew) {
    var ov = document.createElement("div")
    ov.className = "ax-overlay"
    ov.innerHTML =
      '<div class="ax-modal"><header><b>' + (isNew ? "New page" : "Editing") + ':</b>' +
      '<span class="path">' + esc(path) + '</span></header>' +
      '<textarea spellcheck="false" placeholder="Loading…"></textarea>' +
      '<footer>' + (isNew ? "" : '<button class="ax-btn ax-del">Delete</button>') +
      '<span class="status"></span><button class="ax-btn ax-cancel">Cancel</button>' +
      '<button class="ax-btn ax-save">Save</button></footer></div>'
    document.body.appendChild(ov)
    var ta = ov.querySelector("textarea")
    var status = ov.querySelector(".status")
    var sha = null
    function close() { ov.remove() }
    ov.querySelector(".ax-cancel").addEventListener("click", close)
    ov.addEventListener("click", function (e) { if (e.target === ov) close() })

    if (isNew) { ta.value = "---\ntitle: " + path.split("/").pop().replace(/\.md$/, "") + "\n---\n\n"; ta.placeholder = "" }
    else {
      fetch("/api/page?path=" + encodeURIComponent(path), { credentials: "same-origin" })
        .then(function (r) { return r.json() })
        .then(function (d) { if (d.error) { status.textContent = "Load error: " + d.error; return } sha = d.sha; ta.value = d.content || ""; ta.placeholder = "" })
        .catch(function () { status.textContent = "Failed to load source." })
    }

    ov.querySelector(".ax-save").addEventListener("click", function () {
      status.textContent = "Saving…"
      fetch("/api/page", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path, content: ta.value, sha: sha, message: (isNew ? "create " : "edit ") + path }),
      }).then(function (r) { return r.json() }).then(function (d) {
        if (d.ok) { status.textContent = "✓ Committed — site rebuilds in ~1–2 min."; setTimeout(close, 1800) }
        else { status.textContent = "Save failed: " + (d.error || "unknown") + (d.detail ? " — " + d.detail : "") }
      }).catch(function () { status.textContent = "Save request failed." })
    })

    var del = ov.querySelector(".ax-del")
    if (del) del.addEventListener("click", function () {
      if (!confirm("Delete this page permanently?")) return
      status.textContent = "Deleting…"
      fetch("/api/page", {
        method: "DELETE", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path, sha: sha, message: "delete " + path }),
      }).then(function (r) { return r.json() }).then(function (d) {
        if (d.ok) { status.textContent = "✓ Deleted — rebuilding."; setTimeout(close, 1500) }
        else { status.textContent = "Delete failed: " + (d.error || "unknown") }
      }).catch(function () { status.textContent = "Delete request failed." })
    })
  }

  // ---- Template placeholders: hide "[?]" tokens so partial notes look clean --
  function tidyPlaceholders() {
    var mount = document.querySelector("article")
    if (!mount || mount.dataset.axTidied) return
    mount.dataset.axTidied = "1"
    // Callout rows like "**Species:** [?]" → dim + tag "unknown"
    mount.querySelectorAll(".callout p").forEach(function (p) {
      if (/\[\?\]/.test(p.innerHTML)) {
        p.innerHTML = p.innerHTML.replace(/\[\?\]/g, '<span style="opacity:.55;font-style:italic">unknown</span>')
      }
    })
    // Body paragraphs / list items that are just "[?]" → hide entirely
    mount.querySelectorAll("p, li").forEach(function (el) {
      var t = (el.textContent || "").trim()
      if (t === "[?]" || t === "" || t === "-") el.style.display = "none"
      else if (/\[\?\]/.test(t)) el.innerHTML = el.innerHTML.replace(/\[\?\]/g, '<span style="opacity:.55;font-style:italic">unknown</span>')
    })
  }

  function init() {
    injectStyles()
    renderBanner()
    trackView()
    addBookmarkButton()
    renderHome()
    tidyPlaceholders()
    sessionInit()
  }
  if (document.readyState !== "loading") init()
  else document.addEventListener("DOMContentLoaded", init)
  document.addEventListener("nav", init)
})()
