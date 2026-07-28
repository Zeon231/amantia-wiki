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
      "#amantia-admin-menu{position:fixed;right:16px;bottom:60px;z-index:950;background:var(--light);border:1px solid var(--gray);border-radius:8px;padding:5px;display:flex;flex-direction:column;gap:4px;min-width:190px;box-shadow:0 4px 14px rgba(0,0,0,.35)}",
      "#amantia-admin-menu button{background:transparent;color:var(--darkgray);border:0;text-align:left;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:14px}",
      "#amantia-admin-menu button:hover{background:var(--lightgray)}",
      ".ax-admin .ax-body{padding:1rem 1.2rem;overflow-y:auto;max-height:60vh}",
      ".ax-admin .ax-body p{margin:.4rem 0}",
      ".ax-admin .ax-body h4{margin:1rem 0 .4rem;font-size:14px;color:var(--secondary)}",
      ".ax-admin .ax-body h4.sub{color:var(--gray);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px}",
      ".ax-admin .ax-body hr{border:0;border-top:1px solid var(--lightgray);margin:1rem 0}",
      ".ax-admin .ax-body .hint{color:var(--gray);font-size:.85rem}",
      ".ax-admin .ax-body .empty{color:var(--gray);font-size:.85rem;font-style:italic}",
      ".ax-admin .ax-body code{background:var(--lightgray);padding:0 4px;border-radius:3px;font-size:12px}",
      ".ax-admin .ax-body ul.ax-commits,.ax-admin .ax-body ul.ax-files{list-style:none;padding:0;margin:.4rem 0;font-size:13px}",
      ".ax-admin .ax-body ul.ax-commits li{padding:4px 0;border-bottom:1px solid var(--lightgray);line-height:1.4}",
      ".ax-admin .ax-body ul.ax-commits small{color:var(--gray);display:block;font-size:11px}",
      ".ax-admin .ax-body ul.ax-files li{padding:3px 0;display:flex;gap:.5rem;align-items:baseline}",
      ".ax-admin .ax-body ul.ax-files .sym{display:inline-block;width:1.2em;text-align:center;font-weight:700}",
      ".ax-admin .ax-body ul.ax-files .sym.added{color:#3a8f3a}",
      ".ax-admin .ax-body ul.ax-files .sym.modified{color:#b0902a}",
      ".ax-admin .ax-body ul.ax-files .sym.removed{color:#a33}",
      ".ax-admin .ax-body ul.ax-files .sym.renamed{color:#5a7ab8}",
      ".ax-admin .ax-body .pm{font-family:ui-monospace,monospace;font-size:11px;color:var(--gray)}",
      ".ax-admin details{margin:.6rem 0}",
      ".ax-admin details summary{cursor:pointer;color:var(--secondary);font-size:13px}",
      ".ax-admin pre{background:#0d0d12;color:#eee;padding:8px;border-radius:6px;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto}",
      /* -- .location-map (generic map with clickable zone overlays; used by Map Snippet template) -- */
      ".location-map{position:relative;max-width:900px;margin:1rem auto;line-height:0;}",
      ".location-map img{width:100%;height:auto;display:block;border-radius:8px;}",
      ".location-map a.zone{box-sizing:border-box;border:2px solid rgba(232,176,75,.65);border-radius:6px;}",
      ".location-map a.zone .lbl{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:5px;white-space:nowrap;font-size:12px;background:rgba(20,20,25,.88);color:#fff;padding:2px 7px;border-radius:4px;opacity:0;transition:opacity .12s;pointer-events:none;line-height:1.3;}",
      ".location-map a.zone:hover{background:rgba(232,176,75,.25)!important;border-color:#e8b04b!important;}",
      ".location-map a.zone:hover .lbl{opacity:1;}",
      ".location-map .map-edit-btn{position:absolute;top:10px;right:10px;background:rgba(20,20,25,.85);color:#fff;text-decoration:none;padding:5px 10px;border-radius:6px;font:600 12px system-ui,sans-serif;line-height:1.2;opacity:.6;transition:opacity .12s;z-index:5;}",
      ".location-map:hover .map-edit-btn{opacity:1;}",
      /* -- portrait: floated headshot rendered from frontmatter -- */
      /* -- image uploader modal -- */
      ".ax-upload .tabs{display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--lightgray)}",
      ".ax-upload .tab{background:transparent;border:0;padding:8px 12px;cursor:pointer;color:var(--gray);font-size:13px;border-bottom:2px solid transparent;margin-bottom:-1px}",
      ".ax-upload .tab.on{color:var(--secondary);border-bottom-color:var(--secondary);font-weight:600}",
      ".ax-upload .row-mode{margin:8px 0}",
      ".ax-upload .row-mode input[type='url']{background:#0d0d12;color:#eee;border:1px solid #444;border-radius:6px;padding:8px 10px;font-size:13px}",
      ".ax-upload .row-mode input[type='file']{color:var(--darkgray);font-size:13px}",
      ".ax-upload #ax-preview{margin:12px 0;min-height:60px;display:flex;flex-direction:column;align-items:center;gap:6px}",
      ".ax-upload #ax-preview img{max-width:280px;max-height:180px;border-radius:6px;border:1px solid var(--lightgray)}",
      ".ax-upload #ax-preview .meta{color:var(--gray);font-size:12px;text-align:center}",
      ".ax-upload .fields{display:flex;flex-direction:column;gap:8px;margin-top:10px}",
      ".ax-upload .fields label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--gray);font-weight:600;text-transform:uppercase;letter-spacing:.4px}",
      ".ax-upload .fields label small{text-transform:none;color:var(--gray);opacity:.7;font-weight:400}",
      ".ax-upload .fields input[type='text'],.ax-upload .fields input:not([type]){background:#0d0d12;color:#eee;border:1px solid #444;border-radius:6px;padding:6px 9px;font:400 13px ui-monospace,monospace}",
      ".ax-upload .fields label.alt-row{flex-direction:row;align-items:flex-start;gap:8px;font-size:12px;text-transform:none;letter-spacing:normal;color:var(--darkgray);font-weight:400}",
      ".ax-upload .fields label.alt-row input{margin-top:2px}",
      ".ax-upload .fields label.alt-row code{background:var(--lightgray);padding:0 4px;border-radius:3px;font-size:11px}",
      ".ax-portrait{float:right;max-width:220px;width:35%;margin:0 0 1rem 1.2rem;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);object-fit:cover;}",
      "@media (max-width:640px){.ax-portrait{float:none;display:block;width:100%;max-width:none;margin:0 0 1rem;}}",
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
    // Re-run map decoration now that admin state is known (adds edit button)
    document.querySelectorAll(".location-map[data-ax-decorated]").forEach(function (m) { m.removeAttribute("data-ax-decorated") })
    decorateMaps()
  }
  function addAdminTools() {
    if (document.getElementById("amantia-admin-bar")) return
    var bar = document.createElement("div")
    bar.id = "amantia-admin-bar"
    var edit = document.createElement("button"); edit.textContent = "✏️ Edit page"
    var add = document.createElement("button"); add.textContent = "＋ New"
    var settings = document.createElement("button"); settings.textContent = "⚙ Admin"; settings.title = "Admin settings"
    bar.appendChild(edit); bar.appendChild(add); bar.appendChild(settings)
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
    settings.addEventListener("click", openAdminMenu)
  }

  // ---- Admin settings menu (deploy + changes log) ------------------------
  function openAdminMenu() {
    // If a menu is already open, toggle it off.
    var existing = document.getElementById("amantia-admin-menu")
    if (existing) { existing.remove(); return }
    var m = document.createElement("div")
    m.id = "amantia-admin-menu"
    m.innerHTML =
      '<button data-act="deploy">🚀 Deploy Changes</button>' +
      '<button data-act="log">📜 Changes Log</button>'
    document.body.appendChild(m)
    m.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return
      m.remove()
      if (b.dataset.act === "deploy") openDeployModal()
      else if (b.dataset.act === "log") openChangesModal()
    })
    // click-outside dismisses
    setTimeout(function () {
      document.addEventListener("mousedown", function once(ev) {
        if (!m.contains(ev.target)) { m.remove(); document.removeEventListener("mousedown", once) }
      })
    }, 0)
  }

  function openDeployModal() {
    var ov = mkOverlay("Deploy Changes")
    var body = ov.querySelector(".ax-body")
    body.innerHTML = '<p class="ax-status">Checking for pending changes…</p>'
    var footer = ov.querySelector("footer")
    footer.innerHTML =
      '<span class="status"></span>' +
      '<button class="ax-btn ax-cancel">Close</button>' +
      '<button class="ax-btn ax-save" disabled>Deploy</button>'
    ov.querySelector(".ax-cancel").addEventListener("click", function () { ov.remove() })

    fetch("/api/changes", { credentials: "same-origin" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.error) { body.innerHTML = '<p>Error: ' + esc(d.error) + '</p>'; return }
        var p = d.pending || {}
        if (!p.ahead) {
          body.innerHTML = '<p><b>Nothing to deploy.</b><br><small>Staging is not ahead of main. The live site already reflects the latest changes.</small></p>'
          return
        }
        body.innerHTML =
          '<p><b>' + p.ahead + ' commit' + (p.ahead === 1 ? "" : "s") + '</b> pending across <b>' + (p.files ? p.files.length : 0) + '</b> file' + (p.files && p.files.length === 1 ? "" : "s") + '.</p>' +
          '<p class="hint">Deploying will merge <code>staging</code> → <code>main</code> and trigger a Cloudflare rebuild (~1–2 min to go live).</p>' +
          '<details><summary>Preview</summary>' + renderFileList(p.files || []) + '</details>'
        var btn = ov.querySelector(".ax-save")
        btn.disabled = false
        btn.addEventListener("click", function () {
          btn.disabled = true; body.querySelector(".hint") && body.querySelector(".hint").remove()
          ov.querySelector(".status").textContent = "Deploying…"
          fetch("/api/deploy", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then(function (r) { return r.json() })
            .then(function (d) {
              if (d.ok) {
                ov.querySelector(".status").textContent = "✓ Deployed — Cloudflare rebuild starting."
                body.innerHTML = '<p>✓ <b>Deployed</b> ' + (d.count || "?") + ' commit(s).</p><p class="hint">The live site will reflect changes in ~1–2 minutes.</p>'
                setTimeout(function () { ov.remove() }, 3200)
              } else {
                ov.querySelector(".status").textContent = "Deploy failed."
                body.innerHTML = '<p>Deploy failed: <b>' + esc(d.error || "unknown") + '</b></p>' + (d.detail ? '<pre>' + esc(d.detail) + '</pre>' : "")
                btn.disabled = false
              }
            })
            .catch(function (e) { ov.querySelector(".status").textContent = "Deploy request failed: " + e.message; btn.disabled = false })
        })
      })
      .catch(function (e) { body.innerHTML = '<p>Load failed: ' + esc(e.message) + '</p>' })
  }

  function openChangesModal() {
    var ov = mkOverlay("Changes Log")
    var body = ov.querySelector(".ax-body")
    body.innerHTML = '<p class="ax-status">Loading…</p>'
    ov.querySelector("footer").innerHTML = '<span class="status"></span><button class="ax-btn ax-cancel">Close</button>'
    ov.querySelector(".ax-cancel").addEventListener("click", function () { ov.remove() })

    fetch("/api/changes", { credentials: "same-origin" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.error) { body.innerHTML = '<p>Error: ' + esc(d.error) + '</p>'; return }
        var p = d.pending || {}
        var pendingHtml = p.ahead
          ? '<h4>🟠 Pending — not yet deployed (' + p.ahead + ')</h4>' + renderCommitList(p.commits) + '<h4 class="sub">Files changed since last deploy</h4>' + renderFileList(p.files || [])
          : '<h4>🟢 Pending — none</h4><p class="empty">Staging matches the deployed version. No web edits waiting.</p>'
        var recentHtml = '<h4>✅ Recently deployed (last ' + ((d.recent_deployed || []).length) + ')</h4>' + renderCommitList(d.recent_deployed || [])
        body.innerHTML = pendingHtml + '<hr>' + recentHtml
      })
      .catch(function (e) { body.innerHTML = '<p>Load failed: ' + esc(e.message) + '</p>' })
  }

  function renderCommitList(commits) {
    if (!commits || !commits.length) return '<p class="empty">(none)</p>'
    return '<ul class="ax-commits">' + commits.map(function (c) {
      var when = c.date ? new Date(c.date).toLocaleString() : ""
      return '<li><code>' + esc(c.sha) + '</code> — ' + esc(c.message) + ' <small>' + esc(c.author) + (when ? " · " + esc(when) : "") + '</small></li>'
    }).join("") + '</ul>'
  }
  function renderFileList(files) {
    if (!files || !files.length) return '<p class="empty">(no file diffs)</p>'
    var symbols = { added: "＋", modified: "✎", removed: "－", renamed: "↦" }
    return '<ul class="ax-files">' + files.map(function (f) {
      var sym = symbols[f.status] || "·"
      var name = f.filename.replace(/^content\//, "")
      var line = '<code>' + esc(name) + '</code>'
      if (f.status === "renamed" && f.previous_filename) line = '<code>' + esc(f.previous_filename.replace(/^content\//, "")) + '</code> → ' + line
      var diffs = (f.additions || f.deletions) ? ' <span class="pm">+' + f.additions + '/-' + f.deletions + '</span>' : ""
      return '<li><span class="sym ' + esc(f.status) + '">' + sym + '</span> ' + line + diffs + '</li>'
    }).join("") + '</ul>'
  }

  function mkOverlay(title) {
    var ov = document.createElement("div")
    ov.className = "ax-overlay"
    ov.innerHTML =
      '<div class="ax-modal ax-admin"><header><b>' + esc(title) + '</b></header>' +
      '<div class="ax-body"></div>' +
      '<footer></footer></div>'
    document.body.appendChild(ov)
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove() })
    return ov
  }
  function openEditor(path, isNew) {
    var ov = document.createElement("div")
    ov.className = "ax-overlay"
    ov.innerHTML =
      '<div class="ax-modal"><header><b>' + (isNew ? "New page" : "Editing") + ':</b>' +
      '<span class="path">' + esc(path) + '</span></header>' +
      '<textarea spellcheck="false" placeholder="Loading…"></textarea>' +
      '<footer>' + (isNew ? "" : '<button class="ax-btn ax-del">Delete</button>') +
      '<button class="ax-btn ax-img">🖼 Insert image</button>' +
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
        if (d.ok) { status.textContent = "✓ Staged — click ⚙ Admin → Deploy Changes to publish."; setTimeout(close, 2400) }
        else { status.textContent = "Save failed: " + (d.error || "unknown") + (d.detail ? " — " + d.detail : "") }
      }).catch(function () { status.textContent = "Save request failed." })
    })

    // 🖼 Insert image — opens upload modal, inserts markdown at cursor on success
    ov.querySelector(".ax-img").addEventListener("click", function () {
      openImageUploader(path, function (mdSnippet) {
        var start = ta.selectionStart, end = ta.selectionEnd
        ta.value = ta.value.slice(0, start) + mdSnippet + ta.value.slice(end)
        ta.selectionStart = ta.selectionEnd = start + mdSnippet.length
        ta.focus()
        status.textContent = "✓ Image inserted at cursor. Save the page to commit both."
      })
    })

    var del = ov.querySelector(".ax-del")
    if (del) del.addEventListener("click", function () {
      if (!confirm("Delete this page? (Staged — takes effect on next deploy.)")) return
      status.textContent = "Deleting…"
      fetch("/api/page", {
        method: "DELETE", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path, sha: sha, message: "delete " + path }),
      }).then(function (r) { return r.json() }).then(function (d) {
        if (d.ok) { status.textContent = "✓ Deletion staged — deploy from ⚙ Admin."; setTimeout(close, 2200) }
        else { status.textContent = "Delete failed: " + (d.error || "unknown") }
      }).catch(function () { status.textContent = "Delete request failed." })
    })
  }

  // ---- Image uploader ------------------------------------------------------
  // Guess a sensible default destination folder based on the current note's path.
  function guessImageDir(notePath) {
    var p = (notePath || "").replace(/^content\//, "")
    if (/^02 - People\//i.test(p)) return "02 - People/Portraits"
    if (/^04 - Species\//i.test(p)) return "04 - Species/Species Images"
    if (/^07 - Items & Equipment\//i.test(p)) return "07 - Items & Equipment/Item Images"
    if (/Cities & Locations\//i.test(p) || /01 - World\//i.test(p)) return "01 - World/Maps"
    // Fallback: alongside the note, in an /images/ subfolder
    var dir = p.split("/").slice(0, -1).join("/") || "_media"
    return dir + "/images"
  }
  function slugifyName(filename) {
    var m = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.exec(filename || "")
    if (!m) return filename || ""
    var stem = filename.slice(0, filename.length - m[0].length)
    var slug = stem.toLowerCase().replace(/['"]+/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-") || "image"
    return slug + "." + m[1].toLowerCase()
  }

  function openImageUploader(notePath, onInsert) {
    var ov = document.createElement("div")
    ov.className = "ax-overlay"
    ov.innerHTML =
      '<div class="ax-modal ax-admin ax-upload"><header><b>🖼 Insert image</b></header>' +
      '<div class="ax-body">' +
        '<div class="tabs"><button class="tab tab-file on" data-mode="file">📁 From PC</button>' +
        '<button class="tab tab-url" data-mode="url">🔗 From URL</button></div>' +
        '<div class="row-mode row-mode-file"><input type="file" id="ax-file" accept="image/*"/></div>' +
        '<div class="row-mode row-mode-url" style="display:none"><input type="url" id="ax-url" placeholder="https://example.com/image.jpg" style="width:100%"/></div>' +
        '<div class="preview" id="ax-preview"></div>' +
        '<div class="fields">' +
          '<label>Destination folder<input id="ax-dir" placeholder="content-relative folder"/></label>' +
          '<label>File name <small>(auto-slugified)</small><input id="ax-name" placeholder="picture.jpg"/></label>' +
          '<label class="alt-row"><input type="checkbox" id="ax-portrait-set"/> Set as this page\'s portrait (updates <code>portrait:</code> frontmatter — for NPC/character/monster pages)</label>' +
        '</div>' +
        '<p class="hint">The upload commits to the <code>staging</code> branch. Deploy from ⚙ Admin → Deploy Changes to publish. Max 25 MB. Formats: jpg, png, gif, webp, svg, avif.</p>' +
      '</div>' +
      '<footer><span class="status"></span>' +
        '<button class="ax-btn ax-cancel">Cancel</button>' +
        '<button class="ax-btn ax-save" disabled>Upload</button>' +
      '</footer></div>'
    document.body.appendChild(ov)
    var body = ov.querySelector(".ax-body")
    var status = ov.querySelector(".status")
    var uploadBtn = ov.querySelector(".ax-save")
    var fileIn = body.querySelector("#ax-file")
    var urlIn = body.querySelector("#ax-url")
    var dirIn = body.querySelector("#ax-dir")
    var nameIn = body.querySelector("#ax-name")
    var portraitCk = body.querySelector("#ax-portrait-set")
    var preview = body.querySelector("#ax-preview")
    var mode = "file"

    dirIn.value = guessImageDir(notePath)

    function close() { ov.remove() }
    ov.querySelector(".ax-cancel").addEventListener("click", close)
    ov.addEventListener("click", function (e) { if (e.target === ov) close() })

    // Tab switching
    body.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        mode = t.dataset.mode
        body.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("on", x === t) })
        body.querySelector(".row-mode-file").style.display = mode === "file" ? "" : "none"
        body.querySelector(".row-mode-url").style.display = mode === "url" ? "" : "none"
        refreshReady()
      })
    })

    // File-picker preview
    fileIn.addEventListener("change", function () {
      var f = fileIn.files && fileIn.files[0]
      preview.innerHTML = ""
      if (f) {
        nameIn.value = f.name
        nameIn.placeholder = slugifyName(f.name)
        var img = document.createElement("img")
        img.src = URL.createObjectURL(f)
        preview.appendChild(img)
        var meta = document.createElement("div"); meta.className = "meta"
        meta.textContent = f.name + " · " + (f.size / 1024 < 1024 ? Math.round(f.size / 1024) + " KB" : (f.size / 1024 / 1024).toFixed(1) + " MB")
        preview.appendChild(meta)
      }
      refreshReady()
    })
    // URL preview (best-effort — will fail silently on CORS)
    urlIn.addEventListener("change", function () {
      preview.innerHTML = ""
      var u = urlIn.value.trim()
      if (u) {
        // Guess filename from URL
        try {
          var p = new URL(u).pathname.split("/").pop().split("?")[0]
          if (p) nameIn.value = p
        } catch (e) {}
        var img = document.createElement("img")
        img.src = u
        img.onerror = function () { preview.innerHTML = '<div class="meta">Preview blocked (usually OK — the server will fetch it directly)</div>' }
        preview.appendChild(img)
      }
      refreshReady()
    })

    function refreshReady() {
      var ready = mode === "file" ? !!(fileIn.files && fileIn.files[0]) : !!urlIn.value.trim()
      uploadBtn.disabled = !ready
    }
    refreshReady()

    function doUpload(overwrite) {
      status.textContent = overwrite ? "Overwriting…" : "Uploading…"
      uploadBtn.disabled = true
      var finalName = slugifyName(nameIn.value || (fileIn.files && fileIn.files[0] && fileIn.files[0].name) || "")
      var finalDir = (dirIn.value || guessImageDir(notePath)).trim()
      var req
      if (mode === "file") {
        var fd = new FormData()
        fd.append("file", fileIn.files[0])
        fd.append("name", finalName)
        fd.append("path", finalDir)
        fd.append("overwrite", overwrite ? "true" : "false")
        req = fetch("/api/upload", { method: "POST", credentials: "same-origin", body: fd })
      } else {
        req = fetch("/api/upload", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlIn.value.trim(), name: finalName, path: finalDir, overwrite: !!overwrite }),
        })
      }
      req.then(function (r) { return r.json().then(function (d) { d._status = r.status; return d }) })
        .then(function (d) {
          if (d._status === 409 && d.error === "exists") {
            // Ask user: overwrite, rename with suffix, or cancel
            var choice = window.confirm(
              "That file already exists at:\n\n  " + d.path + "\n\n" +
              "OK  = overwrite it\n" +
              "Cancel = auto-suffix (upload as a new name like -2)"
            )
            if (choice === true) return doUpload(true)
            // Suffix: bump filename with -2, -3, ... until we don't get 409
            var base = finalName.replace(/(\.[^.]+)$/, "")
            var ext = (finalName.match(/(\.[^.]+)$/) || [""])[0]
            var n = 2
            nameIn.value = base + "-" + n + ext
            uploadBtn.disabled = false
            status.textContent = "Renamed to " + nameIn.value + ". Click Upload again."
            return
          }
          if (d.ok) {
            status.textContent = "✓ Staged: " + d.path
            if (portraitCk.checked) {
              // DON'T touch the editor content. Just tell the user how to
              // wire up the portrait via frontmatter (safer than auto-edit).
              alert("✓ Uploaded to " + d.path + "\n\nThe portrait: frontmatter field was NOT auto-edited (frontmatter edits from the body editor can corrupt YAML). To wire this up, edit the frontmatter of this page and set:\n\n  portrait: \"" + d.path.replace(/^content\//, "") + "\"")
            } else {
              // Insert markdown at cursor
              var alt = nameIn.value.replace(/\.[^.]+$/, "").replace(/-/g, " ")
              onInsert("![" + alt + "](" + d.url + ")")
            }
            setTimeout(close, 1200)
          } else {
            status.textContent = "Upload failed: " + (d.error || "unknown") + (d.detail ? " — " + d.detail : "")
            uploadBtn.disabled = false
          }
        })
        .catch(function (e) { status.textContent = "Upload error: " + e.message; uploadBtn.disabled = false })
    }
    uploadBtn.addEventListener("click", function () { doUpload(false) })
  }

  // ---- Portrait: render <img> from the note's `portrait:` frontmatter field.
  //      Zero-config in the note itself — Head.tsx surfaces it as <meta name="portrait">.
  //      Missing/empty portrait -> nothing renders (no broken image).
  function renderPortrait() {
    var meta = document.querySelector('meta[name="portrait"]')
    if (!meta) return
    var raw = (meta.getAttribute("content") || "").trim()
    if (!raw) return
    // Vault path -> served URL: lowercase, spaces -> hyphens, absolute from root
    var url = "/" + raw.toLowerCase().replace(/ /g, "-").replace(/^\/+/, "")
    var article = document.querySelector("article")
    if (!article || article.querySelector(".ax-portrait")) return
    var img = document.createElement("img")
    img.className = "ax-portrait"
    img.src = encodeURI(url)
    img.alt = document.title.replace(/\s—.*$/, "")
    img.onerror = function () { img.remove() }
    // Insert before the first h1 or at the top of the article body
    var h1 = article.querySelector("h1")
    var target = h1 && h1.parentNode ? h1.parentNode : article
    ;(h1 || article.firstChild).parentNode.insertBefore(img, (h1 || article.firstChild).nextSibling)
  }

  // ---- Location maps: admin gets an "Edit zones" overlay on any .location-map
  function decorateMaps() {
    var maps = document.querySelectorAll(".location-map:not([data-ax-decorated])")
    if (!maps.length) return
    var sp = (document.querySelector('meta[name="source-path"]') || {}).content
    var isAdmin = WHO && WHO.canEdit
    maps.forEach(function (m) {
      m.setAttribute("data-ax-decorated", "1")
      if (!isAdmin || !sp) return
      var btn = document.createElement("a")
      btn.className = "map-edit-btn"
      btn.href = "/static/map-zone-editor?" + new URLSearchParams({ target: sp })
      btn.target = "_blank"
      btn.rel = "noopener"
      btn.textContent = "✏️ Edit zones"
      m.appendChild(btn)
    })
  }

  // ---- Explorer sidebar: Home button + hide duplicate folder-note entries ---
  // Rule: any file entry whose displayed name matches its parent folder's name
  // is a "folder-note stub" — hide it. Whitelist real folder-note pages that
  // carry meaningful content (Brindelvik.md is a full location page, not a stub).
  var EXPLORER_KEEP = /brindelvik|raudvatn|aldgrind/i
  function decorateExplorer() {
    var explorer = document.querySelector(".explorer")
    if (!explorer) return
    var ul = explorer.querySelector(".explorer-ul") || explorer.querySelector(".explorer-content ul")
    if (!ul) return
    // 1. Home link at the very top (idempotent)
    if (!ul.querySelector(".ax-home-link")) {
      var homeLi = document.createElement("li")
      homeLi.className = "ax-home-link"
      homeLi.innerHTML = '<a href="/" class="nav-file-title tree-item-self" style="font-weight:600">🏠 Home</a>'
      ul.insertBefore(homeLi, ul.firstChild)
    }
    // 2. Hide stub folder-note entries (displayed name == parent folder name)
    var folders = ul.querySelectorAll("li")
    folders.forEach(function (li) {
      var folderTitle = li.querySelector(":scope > .folder-container .folder-title, :scope > .nav-folder-title .folder-title")
      if (!folderTitle) return
      var folderName = (folderTitle.textContent || "").trim()
      if (!folderName) return
      var childAnchors = li.querySelectorAll(":scope > .folder-outer .nav-file-title, :scope > ul .nav-file-title")
      childAnchors.forEach(function (a) {
        var name = (a.textContent || "").trim()
        if (name !== folderName) return
        if (EXPLORER_KEEP.test(a.getAttribute("href") || "")) return
        var wrap = a.closest("li")
        if (wrap) wrap.style.display = "none"
      })
    })
  }
  // The explorer plugin populates its list from a client-side script, so the
  // list items may not exist when init() runs. Watch for the first population.
  function watchExplorer() {
    var explorer = document.querySelector(".explorer")
    if (!explorer) return
    decorateExplorer()
    var mo = new MutationObserver(function () { decorateExplorer() })
    mo.observe(explorer, { childList: true, subtree: true })
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
    renderPortrait()
    decorateMaps()
    watchExplorer()
    sessionInit()
  }
  if (document.readyState !== "loading") init()
  else document.addEventListener("DOMContentLoaded", init)
  document.addEventListener("nav", init)
})()
