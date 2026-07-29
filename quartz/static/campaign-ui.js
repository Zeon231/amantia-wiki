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
      /* view-as impersonation banner + user tables + tools */
      "#ax-viewas-banner{position:fixed;top:0;left:0;right:0;z-index:9500;background:#7cc47a;color:#111;padding:6px 14px;font:600 13px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.25)}",
      "#ax-viewas-banner a{color:#111;text-decoration:underline;margin-left:.5em}",
      ".ax-table{width:100%;border-collapse:collapse;font-size:13px;margin:.5rem 0}",
      ".ax-table th,.ax-table td{padding:6px 8px;border-bottom:1px solid var(--lightgray);text-align:left;vertical-align:middle}",
      ".ax-table th{font-weight:600;color:var(--gray);font-size:11px;text-transform:uppercase;letter-spacing:.5px}",
      ".ax-table tr.row-current{background:rgba(124,196,122,.15)}",
      ".ax-table .badge{display:inline-block;background:var(--lightgray);color:var(--darkgray);padding:1px 6px;border-radius:3px;font-size:11px;margin-right:3px}",
      ".ax-table .badge-admin{background:#e8b04b;color:#111}",
      ".ax-table .badge-player{background:#7cc47a;color:#111}",
      ".ax-tool{background:var(--lightgray);padding:12px;border-radius:6px;margin-top:8px}",
      ".ax-tool h3{margin:0 0 8px 0;font-size:14px;color:var(--darkgray)}",
      ".ax-tool label{display:block;margin:6px 0}",
      ".ax-tool label input{width:100%;padding:5px 8px;border:1px solid var(--gray);border-radius:4px;background:var(--light);color:var(--darkgray);margin-top:2px;box-sizing:border-box}",
      ".ax-btn.ax-small{padding:3px 9px;font-size:11px;font-weight:500}",
      ".ax-btn.ax-primary{background:#e8b04b;color:#111}",
      ".ax-btn.ax-danger{background:#c0392b;color:#fff}",
      ".ax-tool select{width:100%;padding:5px 8px;border:1px solid var(--gray);border-radius:4px;background:var(--light);color:var(--darkgray);margin-top:2px;box-sizing:border-box}",
      ".ax-tool small{color:var(--gray);font-weight:normal;margin-left:.3em}",
      /* audit log */
      ".ax-log-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:end;padding-bottom:6px;border-bottom:1px solid var(--lightgray);margin-bottom:6px}",
      ".ax-log-controls label{display:flex;flex-direction:column;font-size:11px;color:var(--gray);text-transform:uppercase;letter-spacing:.5px;gap:2px}",
      ".ax-log-controls select,.ax-log-controls input[type=search]{padding:4px 6px;border:1px solid var(--gray);border-radius:4px;background:var(--light);color:var(--darkgray);font-size:12px;text-transform:none;letter-spacing:normal}",
      ".ax-log-controls label:has(input[type=checkbox]){flex-direction:row;align-items:center;text-transform:none;font-size:12px;letter-spacing:normal;color:var(--darkgray);gap:4px}",
      ".ax-log-body{max-height:60vh;overflow-y:auto;font-size:12px}",
      ".ax-log-table td.ts{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--gray)}",
      ".ax-log-table td.path a{color:var(--secondary);text-decoration:none;word-break:break-all}",
      ".ax-log-table td.path a:hover{text-decoration:underline}",
      ".ax-log-table tr.row-session-start td{border-top:2px solid #7cc47a;padding-top:8px}",
      ".ax-log-table .badge-session{background:#7cc47a;color:#111}",
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
      ".location-map{position:relative;max-width:900px;margin:1rem auto;line-height:0;overflow:hidden;border-radius:8px;}",
      ".location-map-inner{position:relative;transform-origin:center center;will-change:transform;}",
      ".location-map img{width:100%;height:auto;display:block;border-radius:8px;user-select:none;-webkit-user-drag:none;}",
      ".location-map.map-zoomed{cursor:grab;}",
      ".location-map a.zone{box-sizing:border-box;border:none!important;background:rgba(232,176,75,.10);border-radius:6px;transition:background .12s;}",
      ".location-map a.zone .lbl{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:5px;white-space:nowrap;font-size:12px;background:rgba(20,20,25,.88);color:#fff;padding:2px 7px;border-radius:4px;opacity:0;transition:opacity .12s;pointer-events:none;line-height:1.3;}",
      ".location-map a.zone:hover{background:rgba(232,176,75,.30)!important;}",
      ".location-map a.zone:hover .lbl{opacity:1;}",
      /* Polygon zones: cover the whole map, clip-path defines hit shape. Label sits at polygon centroid. */
      ".location-map a.zone-poly .lbl{top:auto;transform:translate(-50%,-50%);margin:0!important;}",
      ".location-map .map-edit-btn{position:absolute;top:10px;right:10px;background:rgba(20,20,25,.85);color:#fff;text-decoration:none;padding:5px 10px;border-radius:6px;font:600 12px system-ui,sans-serif;line-height:1.2;opacity:.6;transition:opacity .12s;z-index:5;}",
      ".location-map:hover .map-edit-btn{opacity:1;}",
      ".location-map .map-reset-btn{position:absolute;bottom:10px;right:10px;background:rgba(20,20,25,.85);color:#fff;border:none;width:32px;height:32px;border-radius:50%;font:600 18px system-ui,sans-serif;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;z-index:5;padding:0;}",
      ".location-map.map-zoomed .map-reset-btn{opacity:.9;}",
      ".location-map .map-hint{position:absolute;bottom:10px;left:10px;background:rgba(20,20,25,.75);color:#fff;font:500 11px system-ui,sans-serif;padding:3px 8px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity .12s;z-index:5;}",
      ".location-map:hover .map-hint{opacity:.7;}",
      ".location-map.map-zoomed .map-hint{opacity:0;}",
      "@media (hover:none){.location-map .map-hint{content:'pinch to zoom · drag to pan';}}",
      /* -- .zoom-image (opt-in pan/zoom wrapper for regular content images) -- */
      ".zoom-image{position:relative;max-width:100%;margin:1rem 0;line-height:0;overflow:hidden;border-radius:6px;}",
      ".zoom-image-inner{position:relative;transform-origin:center center;will-change:transform;}",
      ".zoom-image img{width:100%;height:auto;display:block;user-select:none;-webkit-user-drag:none;}",
      ".zoom-image.map-zoomed{cursor:grab;}",
      ".zoom-image .map-reset-btn{position:absolute;bottom:8px;right:8px;background:rgba(20,20,25,.85);color:#fff;border:none;width:28px;height:28px;border-radius:50%;font:600 16px system-ui,sans-serif;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;z-index:5;padding:0;}",
      ".zoom-image.map-zoomed .map-reset-btn{opacity:.9;}",
      ".zoom-image .map-hint{position:absolute;bottom:8px;left:8px;background:rgba(20,20,25,.75);color:#fff;font:500 11px system-ui,sans-serif;padding:3px 8px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity .12s;z-index:5;}",
      ".zoom-image:hover .map-hint{opacity:.7;}",
      ".zoom-image.map-zoomed .map-hint{opacity:0;}",
      /* -- Lightbox: click any content image to open full-screen w/ pan+zoom -- */
      ".ax-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;cursor:zoom-out;}",
      ".ax-lightbox-inner{position:relative;max-width:100%;max-height:100%;overflow:hidden;cursor:auto;}",
      ".ax-lightbox img{max-width:90vw;max-height:90vh;width:auto;height:auto;display:block;user-select:none;-webkit-user-drag:none;transform-origin:center center;will-change:transform;transition:transform .05s ease-out;}",
      ".ax-lightbox.panning img{cursor:grabbing;}",
      ".ax-lightbox-close{position:fixed;top:16px;right:20px;background:rgba(20,20,25,.85);color:#fff;border:none;width:36px;height:36px;border-radius:50%;font:600 22px system-ui,sans-serif;line-height:1;cursor:pointer;padding:0;z-index:9999;}",
      ".ax-lightbox-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(20,20,25,.85);color:#fff;font:500 12px system-ui,sans-serif;padding:5px 12px;border-radius:4px;pointer-events:none;z-index:9999;}",
      /* Regular content images become clickable when the lightbox is enabled */
      "article img:not(.ax-portrait):not(.map-edit-btn):not([data-no-lightbox]){cursor:zoom-in;}",
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
    renderViewAsBanner()
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
      '<button data-act="log">📜 Changes Log</button>' +
      '<button data-act="viewas">👤 View as…</button>' +
      '<button data-act="users">🔑 Manage users</button>' +
      '<button data-act="audit">📋 Access log</button>'
    document.body.appendChild(m)
    m.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return
      m.remove()
      if (b.dataset.act === "deploy") openDeployModal()
      else if (b.dataset.act === "log") openChangesModal()
      else if (b.dataset.act === "viewas") openViewAsModal()
      else if (b.dataset.act === "users") openUsersModal()
      else if (b.dataset.act === "audit") openAuditModal()
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

  // ---- Access log (admin) -----------------------------------------------
  // Reads /api/audit. Supports single-day and last-N-days views, filtering
  // by user and by path substring. Groups consecutive requests by the same
  // user within 30 min as a "session" so login/session-start moments are
  // obvious at a glance without the Worker having to track sessions.
  function openAuditModal() {
    var ov = mkOverlay("Access log")
    var body = ov.querySelector(".ax-body")
    var footer = ov.querySelector("footer")
    footer.innerHTML = '<button class="ax-btn ax-cancel">Close</button>'
    footer.querySelector(".ax-cancel").addEventListener("click", function () { ov.remove() })
    body.innerHTML =
      '<div class="ax-log-controls">' +
        '<label>Range <select id="ax-log-range">' +
          '<option value="1">Today</option>' +
          '<option value="2">Last 2 days</option>' +
          '<option value="7" selected>Last 7 days</option>' +
          '<option value="30">Last 30 days</option>' +
        '</select></label>' +
        '<label>User <select id="ax-log-user"><option value="">All</option></select></label>' +
        '<label>Path contains <input type="search" id="ax-log-path" placeholder="e.g. brindelvik"/></label>' +
        '<label><input type="checkbox" id="ax-log-sessions" checked/> Group sessions</label>' +
        '<button class="ax-btn ax-small" id="ax-log-refresh">↻ Refresh</button>' +
      '</div>' +
      '<div id="ax-log-summary" class="hint" style="margin:6px 0"></div>' +
      '<div id="ax-log-body" class="ax-log-body">Loading…</div>'
    var rangeSel = body.querySelector("#ax-log-range")
    var userSel = body.querySelector("#ax-log-user")
    var pathIn = body.querySelector("#ax-log-path")
    var sessionsCk = body.querySelector("#ax-log-sessions")
    var refreshBtn = body.querySelector("#ax-log-refresh")
    var out = body.querySelector("#ax-log-body")
    var summary = body.querySelector("#ax-log-summary")
    var allEntries = []
    function fmtTs(iso) {
      var d = new Date(iso)
      return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    }
    function renderList() {
      var filterUser = (userSel.value || "").toLowerCase()
      var filterPath = (pathIn.value || "").toLowerCase()
      var group = sessionsCk.checked
      var filtered = allEntries.filter(function (e) {
        if (filterUser && (e.user || "").toLowerCase() !== filterUser) return false
        if (filterPath && (e.path || "").toLowerCase().indexOf(filterPath) === -1) return false
        return true
      })
      summary.textContent = filtered.length + " event" + (filtered.length === 1 ? "" : "s") + " · " +
        new Set(filtered.map(function (e) { return e.user })).size + " user" +
        (new Set(filtered.map(function (e) { return e.user })).size === 1 ? "" : "s")
      if (!filtered.length) { out.innerHTML = '<p class="hint">No entries match.</p>'; return }
      var html = '<table class="ax-table ax-log-table"><thead><tr><th>When</th><th>User</th><th>Path</th><th>Method</th></tr></thead><tbody>'
      var lastByUser = {}
      var SESSION_GAP_MS = 30 * 60 * 1000
      for (var i = 0; i < filtered.length; i++) {
        var e = filtered[i]
        var t = new Date(e.ts).getTime()
        var prev = lastByUser[e.user]
        var isSessionStart = group && (!prev || (prev - t) > SESSION_GAP_MS)
        lastByUser[e.user] = t
        var userTag = e.viewAsBy
          ? esc(e.user) + ' <span class="badge">via ' + esc(e.viewAsBy) + '</span>'
          : esc(e.user)
        var method = (e.method === "GET" || !e.method) ? '' : '<span class="badge">' + esc(e.method) + '</span>'
        html += '<tr' + (isSessionStart ? ' class="row-session-start"' : '') + '>' +
          '<td class="ts">' + esc(fmtTs(e.ts)) + (isSessionStart ? ' <span class="badge badge-session">session</span>' : '') + '</td>' +
          '<td>' + userTag + '</td>' +
          '<td class="path"><a href="' + esc(e.path) + '" target="_blank" rel="noopener">' + esc(e.path) + '</a></td>' +
          '<td>' + method + '</td>' +
          '</tr>'
      }
      html += '</tbody></table>'
      out.innerHTML = html
    }
    function load() {
      out.innerHTML = '<p class="hint">Loading…</p>'
      var days = parseInt(rangeSel.value, 10) || 1
      fetch("/api/audit?days=" + days, { credentials: "same-origin" })
        .then(function (r) {
          return r.text().then(function (text) {
            var d
            try { d = JSON.parse(text) }
            catch (e) {
              // Not JSON — most commonly means the Worker didn't run and
              // Cloudflare Pages served a static-asset 404 HTML for /api/*.
              // The USERS_KV binding hasn't been picked up yet — either the
              // build is mid-flight, or the binding isn't configured in the
              // Cloudflare dashboard for this Pages project.
              throw new Error(
                "Response was " + r.status + " " + r.statusText + " but not JSON:\n\n" +
                text.slice(0, 300) +
                (text.length > 300 ? "…" : "")
              )
            }
            return d
          })
        })
        .then(function (d) {
          if (!d || (!d.entries && !d.error)) { out.innerHTML = '<p class="ax-status">No data.</p>'; return }
          if (d.error) { out.innerHTML = '<p class="ax-status" style="white-space:pre-wrap;font:11px ui-monospace,monospace">Error: ' + esc(d.error) + (d.message ? "\n\n" + esc(d.message) : "") + (d.detail ? "\n\n" + esc(d.detail) : "") + '</p>'; return }
          allEntries = d.entries || []
          var users = Array.from(new Set(allEntries.map(function (e) { return e.user }))).sort()
          var prev = userSel.value
          userSel.innerHTML = '<option value="">All</option>' + users.map(function (u) { return '<option value="' + esc(u) + '"' + (u === prev ? ' selected' : '') + '>' + esc(u) + '</option>' }).join("")
          renderList()
        })
        .catch(function (e) { out.innerHTML = '<p class="ax-status" style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:11px">Fetch failed: ' + esc(e.message) + '</p>' })
    }
    rangeSel.addEventListener("change", load)
    userSel.addEventListener("change", renderList)
    pathIn.addEventListener("input", renderList)
    sessionsCk.addEventListener("change", renderList)
    refreshBtn.addEventListener("click", load)
    load()
  }

  // ---- View-as impersonation --------------------------------------------
  function openViewAsModal() {
    var ov = mkOverlay("View site as…")
    var body = ov.querySelector(".ax-body")
    body.innerHTML = '<p class="ax-status">Loading users…</p>'
    var footer = ov.querySelector("footer")
    footer.innerHTML = '<button class="ax-btn ax-cancel">Close</button>'
    footer.querySelector(".ax-cancel").addEventListener("click", function () { ov.remove() })
    fetch("/api/view-as", { credentials: "same-origin" })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (!d || !d.users) { body.innerHTML = '<p class="ax-status">Failed to load: ' + esc((d && d.error) || "unknown") + '</p>'; return }
        var current = d.current // null if not impersonating
        var real = d.real
        var rows = d.users.map(function (u) {
          var isCurrent = current && u.user.toLowerCase() === current.toLowerCase()
          var isReal = u.user.toLowerCase() === real.toLowerCase()
          var badge = u.role === "admin" || u.role === "dm" ? '<span class="badge badge-admin">' + esc(u.role) + '</span>'
            : '<span class="badge badge-player">player</span>' + (u.tier ? ' <span class="badge">tier: ' + esc(u.tier) + '</span>' : '')
          return '<tr' + (isCurrent ? ' class="row-current"' : '') + '>' +
            '<td>' + esc(u.user) + (isReal ? ' <span class="badge">you</span>' : '') + '</td>' +
            '<td>' + badge + '</td>' +
            '<td><button class="ax-btn" data-as="' + esc(u.user) + '"' + (isCurrent || isReal ? ' disabled' : '') + '>' + (isCurrent ? 'viewing' : 'View as') + '</button></td>' +
            '</tr>'
        }).join("")
        body.innerHTML =
          '<p class="hint">Simulate what each user actually sees. Your real login stays as <b>' + esc(real) + '</b> for audit.</p>' +
          '<table class="ax-table"><thead><tr><th>User</th><th>Role</th><th></th></tr></thead><tbody>' + rows +
          '<tr><td colspan="2"><em>Anonymous</em> — what a signed-out visitor would see (only meaningful with <code>PUBLIC_SHARED=true</code>)</td>' +
          '<td><button class="ax-btn" data-as="anonymous"' + (current === "anonymous" ? ' disabled' : '') + '>' + (current === "anonymous" ? 'viewing' : 'View as') + '</button></td></tr>' +
          '</tbody></table>' +
          (current ? '<p><button class="ax-btn ax-primary" data-as="">↩ Return to your real view</button></p>' : '')
        body.addEventListener("click", function (e) {
          var b = e.target.closest("button[data-as]"); if (!b) return
          var as = b.getAttribute("data-as") || null
          b.disabled = true; b.textContent = "…"
          fetch("/api/view-as", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ as: as }),
          }).then(function (r) { return r.json() }).then(function () {
            location.reload()
          }).catch(function () { b.disabled = false; b.textContent = "Retry" })
        })
      })
      .catch(function (e) { body.innerHTML = '<p class="ax-status">Failed to load: ' + esc(e.message) + '</p>' })
  }
  // Persistent banner when impersonating — makes it obvious the view is fake.
  function renderViewAsBanner() {
    if (!WHO || !WHO.viewAsBy) return
    if (document.getElementById("ax-viewas-banner")) return
    var bar = document.createElement("div")
    bar.id = "ax-viewas-banner"
    bar.innerHTML = '👁 Viewing as <b>' + esc(WHO.user) + '</b> (real: ' + esc(WHO.viewAsBy) + ') — <a href="#" id="ax-viewas-off">Return to your view</a>'
    document.body.appendChild(bar)
    document.getElementById("ax-viewas-off").addEventListener("click", function (e) {
      e.preventDefault()
      fetch("/api/view-as", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as: null }),
      }).then(function () { location.reload() })
    })
  }

  // ---- User management (live edits via KV API) --------------------------
  async function sha256hex(str) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0") }).join("")
  }
  function openUsersModal() {
    var ov = mkOverlay("Manage users")
    var body = ov.querySelector(".ax-body")
    var footer = ov.querySelector("footer")
    footer.innerHTML = '<button class="ax-btn ax-cancel">Close</button>'
    footer.querySelector(".ax-cancel").addEventListener("click", function () { ov.remove() })
    function reload() {
      body.innerHTML = '<p class="ax-status">Loading users…</p>'
      fetch("/api/users", { credentials: "same-origin" })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (!d || !d.users) { body.innerHTML = '<p class="ax-status">Failed to load: ' + esc((d && d.error) || "unknown") + '</p>'; return }
          var readonly = d.storage !== "kv"
          var rows = d.users.map(function (u) {
            var btns = readonly ? '' :
              '<button class="ax-btn ax-small" data-op="rename" data-user="' + esc(u.user) + '">Rename</button> ' +
              '<button class="ax-btn ax-small" data-op="pw"     data-user="' + esc(u.user) + '">Change password</button> ' +
              '<button class="ax-btn ax-small ax-danger" data-op="delete" data-user="' + esc(u.user) + '">Delete</button>'
            return '<tr>' +
              '<td>' + esc(u.user) + '</td>' +
              '<td>' + esc(u.role) + (u.tier ? ' · tier ' + esc(u.tier) : '') + '</td>' +
              '<td>' + (u.editLevel != null ? esc(String(u.editLevel)) : '—') + '</td>' +
              '<td>' + btns + '</td>' +
              '</tr>'
          }).join("")
          body.innerHTML =
            (readonly ? '<p class="ax-status">' + esc(d.note || "USERS_KV not bound — read-only mode.") + '</p>' : '') +
            '<table class="ax-table"><thead><tr><th>User</th><th>Role</th><th>Edit lvl</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (readonly ? '' :
              '<div style="margin-top:10px"><button class="ax-btn ax-primary" data-op="create">＋ Add user</button></div>' +
              '<div id="ax-user-tool" style="margin-top:12px"></div>')
          if (readonly) return
          body.addEventListener("click", function (e) {
            var b = e.target.closest("button[data-op]"); if (!b) return
            var user = b.getAttribute("data-user"), op = b.getAttribute("data-op")
            if (op === "pw") openPasswordTool(user)
            else if (op === "rename") openRenameTool(user)
            else if (op === "delete") deleteUser(user)
            else if (op === "create") openCreateTool(d.users)
          })
        })
        .catch(function (e) { body.innerHTML = '<p class="ax-status">Failed to load: ' + esc(e.message) + '</p>' })
    }
    reload()
    // Expose reload to child tools
    ov._reloadUsers = reload
  }
  function toolHost() { return document.getElementById("ax-user-tool") }
  function openPasswordTool(user) {
    toolHost().innerHTML =
      '<div class="ax-tool"><h3>🔑 Reset password for <code>' + esc(user) + '</code></h3>' +
      '<label>New password<input type="password" id="ax-pw-new" autocomplete="new-password"/></label>' +
      '<label>Confirm <input type="password" id="ax-pw-cnf" autocomplete="new-password"/></label>' +
      '<p class="hint">Password is hashed locally with SHA-256. Only the hash is sent — the plaintext never leaves your browser.</p>' +
      '<button class="ax-btn ax-primary" id="ax-pw-go">Save new password</button>' +
      '<div id="ax-pw-status" class="ax-status" style="margin-top:6px"></div></div>'
    document.getElementById("ax-pw-go").addEventListener("click", async function () {
      var pw = document.getElementById("ax-pw-new").value
      var cnf = document.getElementById("ax-pw-cnf").value
      var st = document.getElementById("ax-pw-status")
      if (!pw || pw.length < 6) { st.textContent = "Password too short (min 6 chars)."; return }
      if (pw !== cnf) { st.textContent = "Passwords don't match."; return }
      st.textContent = "Saving…"
      var hash = await sha256hex(pw)
      var r = await fetch("/api/users/password", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user, hash: hash }),
      }).then(function (x) { return x.json() })
      if (r.ok) { st.textContent = "✓ Password updated for " + r.user + "."; setTimeout(function () { toolHost().innerHTML = "" }, 1500) }
      else st.textContent = "Failed: " + (r.error || "unknown")
    })
  }
  function openRenameTool(user) {
    toolHost().innerHTML =
      '<div class="ax-tool"><h3>✏ Rename <code>' + esc(user) + '</code></h3>' +
      '<label>New username <input type="text" id="ax-rn-new" value="' + esc(user) + '"/></label>' +
      '<p class="hint">Case-insensitive. Keeps the same password, role, and tier. That user must sign in with the new name next time.</p>' +
      '<button class="ax-btn ax-primary" id="ax-rn-go">Save rename</button>' +
      '<div id="ax-rn-status" class="ax-status" style="margin-top:6px"></div></div>'
    document.getElementById("ax-rn-go").addEventListener("click", function () {
      var to = document.getElementById("ax-rn-new").value.trim()
      var st = document.getElementById("ax-rn-status")
      if (!to || to.toLowerCase() === user.toLowerCase()) { st.textContent = "Enter a different name."; return }
      st.textContent = "Saving…"
      fetch("/api/users/rename", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: user, to: to }),
      }).then(function (x) { return x.json() })
        .then(function (r) {
          if (r.ok) {
            st.textContent = "✓ Renamed " + r.from + " → " + r.to
            var ov = document.querySelector(".ax-overlay"); if (ov && ov._reloadUsers) setTimeout(ov._reloadUsers, 800)
          } else st.textContent = "Failed: " + (r.error || "unknown")
        })
    })
  }
  function openCreateTool(existing) {
    toolHost().innerHTML =
      '<div class="ax-tool"><h3>＋ Add new user</h3>' +
      '<label>Username <input type="text" id="ax-cr-user" placeholder="e.g. lucas"/></label>' +
      '<label>Role <select id="ax-cr-role">' +
        '<option value="player" selected>player</option>' +
        '<option value="dm">dm</option>' +
        '<option value="admin">admin</option>' +
      '</select></label>' +
      '<label>Tier <small>(private-page tier for players — e.g. "aphelia", leave blank for admin/dm)</small><input type="text" id="ax-cr-tier"/></label>' +
      '<label>Edit level <small>(1=most restricted … 5=most permissive; leave blank for role default)</small><input type="number" id="ax-cr-lvl" min="1" max="5"/></label>' +
      '<label>Password <input type="password" id="ax-cr-pw" autocomplete="new-password"/></label>' +
      '<button class="ax-btn ax-primary" id="ax-cr-go">Create user</button>' +
      '<div id="ax-cr-status" class="ax-status" style="margin-top:6px"></div></div>'
    document.getElementById("ax-cr-go").addEventListener("click", async function () {
      var st = document.getElementById("ax-cr-status")
      var name = document.getElementById("ax-cr-user").value.trim()
      var role = document.getElementById("ax-cr-role").value
      var tier = document.getElementById("ax-cr-tier").value.trim() || null
      var lvlRaw = document.getElementById("ax-cr-lvl").value.trim()
      var editLevel = lvlRaw ? parseInt(lvlRaw, 10) : null
      var pw = document.getElementById("ax-cr-pw").value
      if (!name) { st.textContent = "Username required."; return }
      if (!pw || pw.length < 6) { st.textContent = "Password too short (min 6 chars)."; return }
      if (existing.some(function (u) { return u.user.toLowerCase() === name.toLowerCase() })) {
        st.textContent = "User already exists (case-insensitive)."; return
      }
      st.textContent = "Saving…"
      var hash = await sha256hex(pw)
      var payload = { user: name, hash: hash, role: role }
      if (tier) payload.tier = tier
      if (editLevel != null) payload.editLevel = editLevel
      fetch("/api/users/create", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (x) { return x.json() })
        .then(function (r) {
          if (r.ok) {
            st.textContent = "✓ Created " + r.user
            var ov = document.querySelector(".ax-overlay"); if (ov && ov._reloadUsers) setTimeout(ov._reloadUsers, 800)
          } else st.textContent = "Failed: " + (r.error || "unknown")
        })
    })
  }
  function deleteUser(user) {
    if (!confirm("Delete user " + user + "? This cannot be undone.\n\nThey'll be unable to sign in immediately.")) return
    fetch("/api/users/delete", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: user }),
    }).then(function (x) { return x.json() })
      .then(function (r) {
        if (r.ok) {
          var ov = document.querySelector(".ax-overlay"); if (ov && ov._reloadUsers) ov._reloadUsers()
        } else alert("Delete failed: " + (r.error || "unknown"))
      })
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
        '<button class="tab tab-url" data-mode="url">🔗 From URL</button>' +
        '<button class="tab tab-wiki" data-mode="wiki">🗂 Browse wiki</button></div>' +
        '<div class="row-mode row-mode-file"><input type="file" id="ax-file" accept="image/*"/></div>' +
        '<div class="row-mode row-mode-url" style="display:none"><input type="url" id="ax-url" placeholder="https://example.com/image.jpg" style="width:100%"/></div>' +
        '<div class="row-mode row-mode-wiki" style="display:none">' +
          '<input type="search" id="ax-wiki-filter" placeholder="filter by filename or folder…" style="width:100%;margin-bottom:6px"/>' +
          '<div id="ax-wiki-grid" style="max-height:280px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;background:var(--light,#111);padding:6px;border-radius:6px;">Loading…</div>' +
        '</div>' +
        '<div class="preview" id="ax-preview"></div>' +
        '<div class="fields">' +
          '<label>Destination folder<input id="ax-dir" placeholder="content-relative folder"/></label>' +
          '<label>File name <small>(auto-slugified)</small><input id="ax-name" placeholder="picture.jpg"/></label>' +
          '<label class="alt-row"><input type="checkbox" id="ax-portrait-set"/> Set as this page\'s portrait (updates <code>portrait:</code> frontmatter — for NPC/character/monster pages)</label>' +
          '<label class="alt-row"><input type="checkbox" id="ax-zoompan"/> Enable zoom &amp; pan on the inserted image (readers can Ctrl+scroll to zoom, drag to pan — off by default, even for maps)</label>' +
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
    var zoomPanCk = body.querySelector("#ax-zoompan")

    function wrapInsert(mdOrPath, alt) {
      // If zoom/pan is on, insert a raw HTML div so the site-side script
      // attaches pan-zoom to it. Otherwise fall back to plain markdown.
      if (zoomPanCk.checked) {
        return '\n<div class="zoom-image">\n  <img src="' + mdOrPath + '" alt="' + esc(alt) + '" />\n</div>\n'
      }
      return "![" + alt + "](" + mdOrPath + ")"
    }
    function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
    var preview = body.querySelector("#ax-preview")
    var wikiGrid = body.querySelector("#ax-wiki-grid")
    var wikiFilter = body.querySelector("#ax-wiki-filter")
    var mode = "file"
    var pickedWikiImg = null // { url, path } when a wiki image is selected
    var wikiImages = null

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
        body.querySelector(".row-mode-wiki").style.display = mode === "wiki" ? "" : "none"
        uploadBtn.textContent = mode === "wiki" ? "Insert" : "Upload"
        if (mode === "wiki" && !wikiImages) loadWikiImages()
        refreshReady()
      })
    })

    function loadWikiImages() {
      fetch("/api/images", { credentials: "same-origin" })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (!d || !d.images) { wikiGrid.textContent = "Failed to load: " + ((d && d.error) || "unknown"); return }
          wikiImages = d.images
          renderWikiGrid()
        })
        .catch(function (e) { wikiGrid.textContent = "Failed to load: " + e.message })
    }
    function renderWikiGrid() {
      var q = (wikiFilter.value || "").toLowerCase()
      var matches = wikiImages.filter(function (im) { return !q || im.path.toLowerCase().indexOf(q) !== -1 })
      wikiGrid.innerHTML = ""
      if (!matches.length) { wikiGrid.textContent = "No images match."; return }
      matches.slice(0, 200).forEach(function (im) {
        var cell = document.createElement("button")
        cell.type = "button"
        cell.style.cssText = "position:relative;padding:0;border:2px solid transparent;border-radius:4px;background:#0d0d12;cursor:pointer;aspect-ratio:1;overflow:hidden;"
        cell.title = im.path.replace(/^content\//, "") + "\n" + Math.round(im.size / 1024) + " KB"
        cell.innerHTML = '<img src="' + im.url + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"/>' +
                         '<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.75);color:#fff;font:500 10px system-ui;padding:2px 4px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;text-align:left">' +
                         im.path.split("/").pop() + '</span>'
        cell.addEventListener("click", function () {
          wikiGrid.querySelectorAll("button").forEach(function (b) { b.style.borderColor = "transparent" })
          cell.style.borderColor = "#e8b04b"
          pickedWikiImg = im
          preview.innerHTML = '<img src="' + im.url + '"/><div class="meta">' + im.path.replace(/^content\//, "") + " · " + Math.round(im.size / 1024) + " KB</div>"
          nameIn.value = im.path.split("/").pop()
          refreshReady()
        })
        wikiGrid.appendChild(cell)
      })
      if (matches.length > 200) {
        var more = document.createElement("div")
        more.style.cssText = "grid-column:1/-1;color:#aaa;font-size:11px;padding:4px 2px;text-align:center"
        more.textContent = "…and " + (matches.length - 200) + " more — refine your filter"
        wikiGrid.appendChild(more)
      }
    }
    wikiFilter.addEventListener("input", function () { if (wikiImages) renderWikiGrid() })

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
      var ready = mode === "file" ? !!(fileIn.files && fileIn.files[0])
                : mode === "url"  ? !!urlIn.value.trim()
                : /* wiki */       !!pickedWikiImg
      uploadBtn.disabled = !ready
    }
    refreshReady()

    function doUpload(overwrite) {
      // "Browse wiki" mode: nothing to upload, just insert the reference.
      if (mode === "wiki" && pickedWikiImg) {
        var im = pickedWikiImg
        if (portraitCk.checked) {
          alert("✓ Selected " + im.path + "\n\nThe portrait: frontmatter field was NOT auto-edited. To wire this up, edit the frontmatter of this page and set:\n\n  portrait: \"" + im.path.replace(/^content\//, "") + "\"")
        } else {
          var alt2 = (nameIn.value || im.path.split("/").pop()).replace(/\.[^.]+$/, "").replace(/-/g, " ")
          onInsert(wrapInsert(im.url, alt2))
        }
        setTimeout(close, 400)
        return
      }
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
              onInsert(wrapInsert(d.url, alt))
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

  // ---- Location maps: pan/zoom + admin "Edit zones" overlay on .location-map -
  function decorateMaps() {
    var maps = document.querySelectorAll(".location-map:not([data-ax-decorated])")
    if (!maps.length) return
    var sp = (document.querySelector('meta[name="source-path"]') || {}).content
    var isAdmin = WHO && WHO.canEdit
    maps.forEach(function (m) {
      m.setAttribute("data-ax-decorated", "1")
      // Wrap children (img + zones) in an inner div we can transform for zoom.
      var inner = document.createElement("div")
      inner.className = "location-map-inner"
      while (m.firstChild) inner.appendChild(m.firstChild)
      m.appendChild(inner)
      attachPanZoom(m, inner)
      // Reset-zoom control (visible on hover; hidden on touch via CSS)
      var reset = document.createElement("button")
      reset.className = "map-reset-btn"
      reset.type = "button"
      reset.title = "Reset zoom (or double-click the map)"
      reset.textContent = "⟲"
      reset.addEventListener("click", function (e) { e.stopPropagation(); resetZoom(m) })
      m.appendChild(reset)
      // Hint text (fades in on hover, hides on first zoom)
      var hint = document.createElement("div")
      hint.className = "map-hint"
      hint.textContent = "Ctrl + scroll to zoom · drag to pan"
      m.appendChild(hint)
      // Admin edit-zones button
      if (isAdmin && sp) {
        var btn = document.createElement("a")
        btn.className = "map-edit-btn"
        btn.href = "/static/map-zone-editor?" + new URLSearchParams({ target: sp })
        btn.target = "_blank"
        btn.rel = "noopener"
        btn.textContent = "✏️ Edit zones"
        m.appendChild(btn)
      }
    })
  }
  function attachPanZoom(container, inner) {
    var s = { scale: 1, x: 0, y: 0, min: 1, max: 8 }
    container._panzoom = { state: s, inner: inner }
    function apply() {
      inner.style.transform = "translate(" + s.x + "px," + s.y + "px) scale(" + s.scale + ")"
      container.classList.toggle("map-zoomed", s.scale > 1.01)
    }
    function clamp() {
      var rect = container.getBoundingClientRect()
      var mx = rect.width * (s.scale - 1) / 2
      var my = rect.height * (s.scale - 1) / 2
      s.x = Math.max(-mx, Math.min(mx, s.x))
      s.y = Math.max(-my, Math.min(my, s.y))
    }
    // Wheel zoom (Ctrl/Cmd+wheel only, so plain page scroll still works)
    container.addEventListener("wheel", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      var rect = container.getBoundingClientRect()
      var cx = e.clientX - rect.left - rect.width / 2
      var cy = e.clientY - rect.top - rect.height / 2
      var delta = -e.deltaY * 0.001
      var next = Math.max(s.min, Math.min(s.max, s.scale * (1 + delta)))
      var f = next / s.scale
      s.x = cx + (s.x - cx) * f
      s.y = cy + (s.y - cy) * f
      s.scale = next
      if (s.scale <= 1.01) { s.scale = 1; s.x = 0; s.y = 0 }
      clamp(); apply()
    }, { passive: false })
    // Mouse drag pan (only when zoomed in)
    var drag = null
    container.addEventListener("mousedown", function (e) {
      if (e.target.closest("a, button")) return
      if (s.scale <= 1) return
      drag = { sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y }
      container.style.cursor = "grabbing"
      e.preventDefault()
    })
    window.addEventListener("mousemove", function (e) {
      if (!drag) return
      s.x = drag.ox + (e.clientX - drag.sx)
      s.y = drag.oy + (e.clientY - drag.sy)
      clamp(); apply()
    })
    window.addEventListener("mouseup", function () {
      if (!drag) return
      drag = null; container.style.cursor = ""
    })
    // Touch: 1-finger pan, 2-finger pinch
    var t = null
    function td(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) }
    container.addEventListener("touchstart", function (e) { t = e.touches }, { passive: true })
    container.addEventListener("touchmove", function (e) {
      if (!t) return
      if (e.touches.length === 1 && t.length === 1 && s.scale > 1) {
        s.x += e.touches[0].clientX - t[0].clientX
        s.y += e.touches[0].clientY - t[0].clientY
        clamp(); apply(); e.preventDefault()
      } else if (e.touches.length === 2 && t.length === 2) {
        var next = Math.max(s.min, Math.min(s.max, s.scale * td(e.touches[0], e.touches[1]) / td(t[0], t[1])))
        s.scale = next
        if (s.scale <= 1.02) { s.scale = 1; s.x = 0; s.y = 0 }
        clamp(); apply(); e.preventDefault()
      }
      t = e.touches
    }, { passive: false })
    container.addEventListener("touchend", function () { t = null })
    // Double-click resets
    container.addEventListener("dblclick", function (e) {
      if (e.target.closest("a, button")) return
      e.preventDefault(); resetZoom(container)
    })
  }
  function resetZoom(container) {
    var pz = container._panzoom
    if (!pz) return
    pz.state.scale = 1; pz.state.x = 0; pz.state.y = 0
    pz.inner.style.transform = ""
    container.classList.remove("map-zoomed")
  }

  // ---- .zoom-image opt-in wrapper: attach pan/zoom to any such container --
  function decorateZoomImages() {
    var els = document.querySelectorAll(".zoom-image:not([data-ax-decorated])")
    els.forEach(function (el) {
      el.setAttribute("data-ax-decorated", "1")
      var inner = document.createElement("div")
      inner.className = "zoom-image-inner"
      while (el.firstChild) inner.appendChild(el.firstChild)
      el.appendChild(inner)
      attachPanZoom(el, inner)
      var reset = document.createElement("button")
      reset.className = "map-reset-btn"; reset.type = "button"; reset.textContent = "⟲"
      reset.title = "Reset zoom (or double-click)"
      reset.addEventListener("click", function (e) { e.stopPropagation(); resetZoom(el) })
      el.appendChild(reset)
      var hint = document.createElement("div")
      hint.className = "map-hint"; hint.textContent = "Ctrl + scroll to zoom · drag to pan"
      el.appendChild(hint)
      // Stop lightbox from opening when the user just wants to interact
      inner.querySelectorAll("img").forEach(function (img) { img.setAttribute("data-no-lightbox", "1") })
    })
  }

  // ---- Lightbox: click any content image → full-screen pan/zoom overlay ----
  function openLightbox(srcUrl, altText) {
    var ov = document.createElement("div")
    ov.className = "ax-lightbox"
    ov.innerHTML =
      '<div class="ax-lightbox-inner"><img src="' + srcUrl + '" alt="' + (altText || "") + '"/></div>' +
      '<button class="ax-lightbox-close" title="Close (Esc)">×</button>' +
      '<div class="ax-lightbox-hint">Ctrl + scroll to zoom · drag to pan · Esc to close</div>'
    document.body.appendChild(ov)
    var img = ov.querySelector("img")
    var inner = ov.querySelector(".ax-lightbox-inner")
    var s = { scale: 1, x: 0, y: 0, min: 1, max: 12 }
    function apply() { img.style.transform = "translate(" + s.x + "px," + s.y + "px) scale(" + s.scale + ")" }
    function close() { ov.remove(); document.removeEventListener("keydown", onKey) }
    function onKey(e) { if (e.key === "Escape") close() }
    document.addEventListener("keydown", onKey)
    ov.addEventListener("click", function (e) { if (e.target === ov) close() })
    ov.querySelector(".ax-lightbox-close").addEventListener("click", close)
    ov.addEventListener("wheel", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      var rect = img.getBoundingClientRect()
      var cx = e.clientX - rect.left - rect.width / 2
      var cy = e.clientY - rect.top - rect.height / 2
      var delta = -e.deltaY * 0.001 // finer zoom (matches maps)
      var next = Math.max(s.min, Math.min(s.max, s.scale * (1 + delta)))
      var f = next / s.scale
      s.x = cx + (s.x - cx) * f
      s.y = cy + (s.y - cy) * f
      s.scale = next
      if (s.scale <= 1.01) { s.scale = 1; s.x = 0; s.y = 0 }
      apply()
    }, { passive: false })
    var drag = null
    img.addEventListener("mousedown", function (e) {
      if (s.scale <= 1) return
      drag = { sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y }
      ov.classList.add("panning")
      e.preventDefault(); e.stopPropagation()
    })
    window.addEventListener("mousemove", function (e) {
      if (!drag) return
      s.x = drag.ox + (e.clientX - drag.sx); s.y = drag.oy + (e.clientY - drag.sy); apply()
    })
    window.addEventListener("mouseup", function () {
      if (!drag) return
      drag = null; ov.classList.remove("panning")
    })
    img.addEventListener("dblclick", function (e) {
      e.preventDefault(); e.stopPropagation()
      s.scale = 1; s.x = 0; s.y = 0; apply()
    })
    img.addEventListener("click", function (e) { e.stopPropagation() }) // don't close on image click
  }
  function setupLightbox() {
    var article = document.querySelector("article")
    if (!article || article.dataset.axLightbox) return
    article.dataset.axLightbox = "1"
    article.addEventListener("click", function (e) {
      var t = e.target
      if (!(t instanceof HTMLImageElement)) return
      if (t.classList.contains("ax-portrait")) return
      if (t.hasAttribute("data-no-lightbox")) return
      if (t.closest("a")) return               // clicks on linked images follow the link
      if (t.closest(".location-map")) return   // maps have their own pan/zoom
      e.preventDefault()
      openLightbox(t.currentSrc || t.src, t.alt)
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
    decorateZoomImages()
    setupLightbox()
    watchExplorer()
    sessionInit()
  }
  if (document.readyState !== "loading") init()
  else document.addEventListener("DOMContentLoaded", init)
  document.addEventListener("nav", init)
})()
