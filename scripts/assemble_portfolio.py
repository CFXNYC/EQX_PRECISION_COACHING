#!/usr/bin/env python3
"""
Phase 4 assembly — applies the minimal necessary patches on top of the
extracted MASTER_MAP_UI.html CSS/HTML/JS (folding in the 4 index.html-only
behaviors + the dashboard-embedding adaptations) and writes:
  css/portfolio.css
  /tmp/_final_js_body.txt   (consumed by the final render-portfolio.js write)
  /tmp/_final_html_body.txt
Every replacement is done via an exact-match .replace(old, new, 1) with a
count assertion first, so a silent no-op (source text not found / already
changed) fails loudly instead of producing a subtly wrong file.
"""
import re

ROOT = "/Users/Carlos.Arana/Desktop/Claude/APPS/10 Club PIlot 2.0"

css = open("/tmp/_css.txt", encoding="utf-8").read()
html_body = open("/tmp/_html_body.txt", encoding="utf-8").read()
js = open("/tmp/_js_body.txt", encoding="utf-8").read()
coach_x_icon = open("/tmp/_coach_x_icon.txt", encoding="utf-8").read()
coach_x_icon_white = open("/tmp/_coach_x_icon_white.txt", encoding="utf-8").read()
panel_metrics_html = open("/tmp/_panel_metrics_html.txt", encoding="utf-8").read()

def replace_once(text, old, new, label):
    n = text.count(old)
    assert n == 1, f"[{label}] expected exactly 1 match, found {n}"
    return text.replace(old, new, 1)

def replace_all(text, old, new, label, expect=None):
    n = text.count(old)
    if expect is not None:
        assert n == expect, f"[{label}] expected {expect} matches, found {n}"
    else:
        assert n > 0, f"[{label}] expected at least 1 match, found 0"
    return text.replace(old, new)

# ═══════════════════════════════════════════════════════════
# CSS PATCHES
# ═══════════════════════════════════════════════════════════
css = replace_once(
    css,
    "body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f0f0f0; overflow: hidden; color: #1a1a1a; }",
    "#view-portfolio { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f0f0f0; overflow: hidden; color: #1a1a1a; }",
    "scope body-> #view-portfolio",
)
n_dark = css.count("body.dark")
css = css.replace("body.dark", "#view-portfolio.dark")
print(f"CSS: retargeted {n_dark} 'body.dark' occurrences to '#view-portfolio.dark'")

extra_css = (
    "\n\n/* ── CoachX tier stats (from EQX CLUB PORTFOLIO/index.html) ── */\n"
    "#panel-metrics { text-align: center; margin-top: 4px; }\n"
    ".metric-row { font-size: 10px; color: #999; line-height: 1.7; letter-spacing: 0.04em; }\n"
    ".metric-row img { display: inline; vertical-align: text-bottom; margin: 0 1px; }\n"
    ".club-tag:not(.is-hub):hover .coachx-icon { filter: invert(1); }\n"
    "#view-portfolio.dark .metric-row { color: #555; }\n"
)
css = css + extra_css

open(f"{ROOT}/css/portfolio.css", "w", encoding="utf-8").write(css.strip() + "\n")
print("Wrote css/portfolio.css —", len(css), "chars")

# ═══════════════════════════════════════════════════════════
# HTML BODY PATCHES
# ═══════════════════════════════════════════════════════════
html_body = replace_once(
    html_body,
    "<p>EFTI development workshop locations and regional deployment planning.</p>",
    panel_metrics_html,
    "panel-metrics swap-in",
)
html_body = replace_all(
    html_body,
    "<span>Satellite Club</span>",
    "<span>EQX Club</span>",
    "static legend label -> EQX Club",
    expect=2,
)
html_body = replace_once(
    html_body,
    '<div id="topbar-meta">EFTI Education Rollout &nbsp;|&nbsp; Strategic Visualization</div>',
    '<div id="topbar-meta">EFTI Education Rollout &nbsp;|&nbsp; Strategic Visualization &nbsp;|&nbsp; <span id="portfolio-data-status">Loading…</span></div>',
    "add portfolio-data-status element",
)
# No extra wrapper needed — this becomes the innerHTML of the dashboard's own
# #view-portfolio container (which is what PORTFOLIO_ROOT / the CSS ".dark"
# scoping targets), and #app already provides the real top-level layout box.

open("/tmp/_final_html_body.txt", "w", encoding="utf-8").write(html_body)
print("Final HTML body length:", len(html_body))

# ═══════════════════════════════════════════════════════════
# JS PATCHES
# ═══════════════════════════════════════════════════════════

# 1. Add the two CoachX icon constants right after CLUB_ICON's declaration.
#    (Located via regex, not a hand-copied base64 literal, to avoid
#    transcription risk on a >30k-char string.)
club_icon_pattern = re.compile(r"const CLUB_ICON\s*=\s*'data:[^']+';")
m = club_icon_pattern.search(js)
assert m, "CLUB_ICON declaration not found"
assert len(club_icon_pattern.findall(js)) == 1, "CLUB_ICON declaration found more than once"
coachx_consts = (
    f"\nconst COACH_X_ICON = '{coach_x_icon}';\n"
    f"const COACH_X_ICON_WHITE = '{coach_x_icon_white}';"
)
js = js[:m.end()] + coachx_consts + js[m.end():]
print("Added COACH_X_ICON + COACH_X_ICON_WHITE constants after CLUB_ICON at offset", m.end())

# 2. Region-marker-click popup: swap PNG file refs for the embedded constants
js = replace_once(
    js,
    '<img src="${isDark ? \'Coach X Logo - White.png\' : \'Coach X Logo - Black.png\'}" style="height:14px;opacity:0.85">',
    '<img src="${isDark ? COACH_X_ICON_WHITE : COACH_X_ICON}" style="height:14px;opacity:0.85">',
    "region-click popup coachx img",
)
js = replace_once(
    js,
    '<img src="${isDark ? \'Coach X Logo - White.png\' : \'Coach X Logo - Black.png\'}" style="height:13px;opacity:0.85">',
    '<img src="${isDark ? COACH_X_ICON_WHITE : COACH_X_ICON}" style="height:13px;opacity:0.85">',
    "flyToClub popup coachx img",
)

# 3. Coach-stat line in region-click popup: add inline CoachX icon + Coach<sup>+</sup>
js = replace_once(
    js,
    '${hasCoachData ? `Coach: <strong>${cd.coach||0}</strong> &nbsp;&middot;&nbsp; Coach+: <strong>${cd.coach_plus||0}</strong> &nbsp;&middot;&nbsp; Coach X: <strong>${cd.coach_x||0}</strong><br/>Total Coaches: <strong>${cd.total_coaches||0}</strong><br/>` : \'\'}',
    '${hasCoachData ? `Coach: <strong>${cd.coach||0}</strong> &nbsp;&middot;&nbsp; Coach<sup>+</sup>: <strong>${cd.coach_plus||0}</strong> &nbsp;&middot;&nbsp; COACH<img src="${isDark ? COACH_X_ICON_WHITE : COACH_X_ICON}" class="coachx-icon" style="height:11px;vertical-align:text-bottom;display:inline;margin:0 0 0 2px;">:<strong>${cd.coach_x||0}</strong><br/>Total Coaches: <strong>${cd.total_coaches||0}</strong><br/>` : \'\'}',
    "coach-stat line enhancement",
)

# 4. renderSidebar club-tag line: add coachx icon inline
old_tag_line = "        return `<span class=\"club-tag${HUB_CLUBS.has(c)?' is-hub':''}\" onclick=\"flyToClub('${c.replace(/'/g,\"\\\\'\")}',event)\" title=\"Zoom to ${c}\">${c}${idStr}${brain}</span>`;"
new_tag_block = (
    "        const isHub = HUB_CLUBS.has(c);\n"
    "        const cxSrc = isDark ? (isHub ? COACH_X_ICON : COACH_X_ICON_WHITE) : (isHub ? COACH_X_ICON_WHITE : COACH_X_ICON);\n"
    "        const cxLogo = (cd.coach_x > 0) ? `<img src=\"${cxSrc}\" class=\"coachx-icon\" style=\"height:10px;vertical-align:middle;display:inline;margin-left:4px;opacity:0.75;\">` : '';\n"
    "        return `<span class=\"club-tag${isHub?' is-hub':''}\" onclick=\"flyToClub('${c.replace(/'/g,\"\\\\'\")}',event)\" title=\"Zoom to ${c}\">${c}${idStr}${brain}${cxLogo}</span>`;"
)
js = replace_once(js, old_tag_line, new_tag_block, "renderSidebar club-tag coachx icon")

# 5. flyToClub: defer popup open until moveend
old_flyto = """  map.flyTo(coords, 15, { animate: true, duration: 0.8 });
  const _flyEd = _clubDataIndex[clubName];
  L.popup({ maxWidth: 240, closeButton: false, autoClose: true, closeOnClick: true })
    .setLatLng(coords)
    .setContent(`<div class="popup-inner" style="padding:10px 14px">
      <div class="popup-club" style="font-size:12px">${clubName}${_flyEd?.club_id ? `<span style="font-weight:400;opacity:0.45;font-size:10px"> | ${_flyEd.club_id}</span>` : ''}</div>
      ${region ? `<div class="popup-region">${region.name.replace(/^.*? - /, '')}</div>` : ''}
      ${(_flyEd?.coach_x > 0 || _flyEd?.educator_count > 0) ? `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">${_flyEd?.coach_x > 0 ? `<img src="${isDark ? COACH_X_ICON_WHITE : COACH_X_ICON}" style="height:13px;opacity:0.85">` : ''}${_flyEd?.educator_count > 0 ? `<span style="font-size:13px;line-height:1">🧠</span>` : ''}</div>` : ''}
      ${isHub ? '<div class="popup-hub-badge">Hub Club</div>' : ''}
      ${distToHub ? `<div class="popup-meta" style="margin-top:6px">Distance to <strong>${region.hub}</strong>: <strong>${distToHub} mi</strong></div>` : ''}
      ${(_flyEd?.educator_count > 0) ? `<div class="popup-meta" style="margin-top:4px">Educators: <strong>${_flyEd.educator_count}</strong> 🧠</div>` : ''}
    </div>`)
    .openOn(map);
};"""
new_flyto = """  map.flyTo(coords, 15, { animate: true, duration: 0.8 });
  const _flyEd = _clubDataIndex[clubName];
  const _popupContent = `<div class="popup-inner" style="padding:10px 14px">
      <div class="popup-club" style="font-size:12px">${clubName}${_flyEd?.club_id ? `<span style="font-weight:400;opacity:0.45;font-size:10px"> | ${_flyEd.club_id}</span>` : ''}</div>
      ${region ? `<div class="popup-region">${region.name.replace(/^.*? - /, '')}</div>` : ''}
      ${(_flyEd?.coach_x > 0 || _flyEd?.educator_count > 0) ? `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">${_flyEd?.coach_x > 0 ? `<img src="${isDark ? COACH_X_ICON_WHITE : COACH_X_ICON}" style="height:13px;opacity:0.85">` : ''}${_flyEd?.educator_count > 0 ? `<span style="font-size:13px;line-height:1">🧠</span>` : ''}</div>` : ''}
      ${isHub ? '<div class="popup-hub-badge">Hub Club</div>' : ''}
      ${distToHub ? `<div class="popup-meta" style="margin-top:6px">Distance to <strong>${region.hub}</strong>: <strong>${distToHub} mi</strong></div>` : ''}
      ${(_flyEd?.educator_count > 0) ? `<div class="popup-meta" style="margin-top:4px">Educators: <strong>${_flyEd.educator_count}</strong> 🧠</div>` : ''}
    </div>`;
  map.once('moveend', () => {
    L.popup({ maxWidth: 240, closeButton: false, autoClose: true, closeOnClick: true })
      .setLatLng(coords)
      .setContent(_popupContent)
      .openOn(map);
  });

  // Phase 4: cross-source resolution + shared-state write (pilot clubs only)
  const _norm = window.CLUB_NORM ? window.CLUB_NORM.normalize(clubName) : null;
  if (_norm && _norm.isPilotClub && window.STATE) {
    window.STATE.setSelectedClub(_norm.clubId, _norm.canonicalName);
  }
};"""
js = replace_once(js, old_flyto, new_flyto, "flyToClub moveend deferral + state wiring")

# 5b. Marker click handler (region-marker popup path) — same state wiring as flyToClub
old_marker_click_tail = """          </div>`)
          .openOn(map);
        activateRegion(region.id, false);
      });
      clusterGroup.addLayer(marker);"""
new_marker_click_tail = """          </div>`)
          .openOn(map);
        activateRegion(region.id, false);

        // Phase 4: cross-source resolution + shared-state write (pilot clubs only)
        const _norm = window.CLUB_NORM ? window.CLUB_NORM.normalize(name) : null;
        if (_norm && _norm.isPilotClub && window.STATE) {
          window.STATE.setSelectedClub(_norm.clubId, _norm.canonicalName);
        }
      });
      clusterGroup.addLayer(marker);"""
js = replace_once(js, old_marker_click_tail, new_marker_click_tail, "marker-click state wiring")

# 6. Dark-mode toggle: add coachx-icon refresh in both branches, and retarget document.body
old_light_branch_tail = """    btn.textContent = '☀ Light';
    btn.style.background = '#f0f0f0';"""
new_light_branch_tail = """    btn.textContent = '☀ Light';
    document.querySelectorAll('img.coachx-icon').forEach(el => {
      const chip = el.closest('.club-tag');
      el.src = (chip && chip.classList.contains('is-hub')) ? COACH_X_ICON : COACH_X_ICON_WHITE;
    });
    btn.style.background = '#f0f0f0';"""
js = replace_once(js, old_light_branch_tail, new_light_branch_tail, "dark-toggle light-branch icon refresh")

old_dark_branch_tail = """    btn.textContent = '☾ Dark';
    btn.style.background = '#fff';"""
new_dark_branch_tail = """    btn.textContent = '☾ Dark';
    document.querySelectorAll('img.coachx-icon').forEach(el => {
      const chip = el.closest('.club-tag');
      el.src = (chip && chip.classList.contains('is-hub')) ? COACH_X_ICON_WHITE : COACH_X_ICON;
    });
    btn.style.background = '#fff';"""
js = replace_once(js, old_dark_branch_tail, new_dark_branch_tail, "dark-toggle dark-branch icon refresh")

js = replace_once(
    js,
    "document.body.classList.toggle('dark', isDark);",
    "PORTFOLIO_ROOT.classList.toggle('dark', isDark);",
    "scope dark-mode toggle to portfolio root, not document.body",
)

# 7. hydrateMap: add CoachX tier stats footer update
old_hydrate_tail = """  const sv = document.querySelectorAll('.stat-val');
  if (sv[0]) sv[0].textContent = Object.keys(COORDS).length;
  if (sv[1]) sv[1].textContent = HUB_CLUBS.size;
  if (sv[2]) sv[2].textContent = new Set(REGIONS.map(r => r.macro)).size;
}"""
new_hydrate_tail = """  const sv = document.querySelectorAll('.stat-val');
  if (sv[0]) sv[0].textContent = Object.keys(COORDS).length;
  if (sv[1]) sv[1].textContent = HUB_CLUBS.size;
  if (sv[2]) sv[2].textContent = new Set(REGIONS.map(r => r.macro)).size;

  const allClubs     = Object.values(clubIdx);
  const totalCoaches = allClubs.reduce((s, c) => s + (c.total_coaches  || 0), 0);
  const totalCoach   = allClubs.reduce((s, c) => s + (c.coach          || 0), 0);
  const totalCoachP  = allClubs.reduce((s, c) => s + (c.coach_plus     || 0), 0);
  const totalCoachX  = allClubs.reduce((s, c) => s + (c.coach_x        || 0), 0);
  const totalPTE     = allClubs.reduce((s, c) => s + (c.educator_count || 0), 0);
  const elTC  = document.getElementById('stat-total-coaches');
  const elC   = document.getElementById('stat-coach');
  const elCP  = document.getElementById('stat-coach-plus');
  const elCX  = document.getElementById('stat-coach-x');
  const elPTE = document.getElementById('stat-pte');
  if (elTC)  elTC.textContent  = `TOTAL COACHES: ${totalCoaches}`;
  if (elC)   elC.textContent   = `COACH:${totalCoach}`;
  if (elCP)  elCP.innerHTML    = `COACH<sup>+</sup>:${totalCoachP}`;
  if (elCX)  elCX.innerHTML    = `COACH<img src="${isDark ? COACH_X_ICON_WHITE : COACH_X_ICON}" class="coachx-icon" style="height:11px;vertical-align:text-bottom;display:inline;margin:0 0 0 2px;">:${totalCoachX}`;
  if (elPTE) elPTE.textContent = `EFTI EDUCATORS 🧠: ${totalPTE}`;
}"""
js = replace_once(js, old_hydrate_tail, new_hydrate_tail, "hydrateMap coachx stats footer")

# 8. Legend label text -> "EQX Club"
js = replace_once(
    js,
    "<span>Satellite Club</span>`;\n  ['legend-hub','mob-legend-hub']",
    "<span>EQX Club</span>`;\n  ['legend-hub','mob-legend-hub']",
    "buildLegendIcons EQX Club label",
)

# 9. Isolate DATA_URL into window.PORTFOLIO_CONFIG (approved security decision)
old_data_url_line = '''const DATA_URL = "https://default3016677c32d54346ba5e7dd46f6662.60.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/4bbf0259c9da4dce95d4358489cad7ee/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=vmIihrkhagLWJ2yAFwDGdqm74d5RgPATjWqXlinZwwc";'''
new_data_url_line = '''const DATA_URL = window.PORTFOLIO_CONFIG.DATA_URL; // isolated per approved Phase 2/3 security decision — see js/portfolio-config.js'''
js = replace_once(js, old_data_url_line, new_data_url_line, "isolate DATA_URL into config")

# 10. Fetch timeout + visible fallback/error state (approved security decision item)
old_fetch = """async function fetchLiveData() {
  const res = await fetch(DATA_URL, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}"""
new_fetch = """async function fetchLiveData() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout — approved security decision item
  try {
    const res = await fetch(DATA_URL, { method: 'POST', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}"""
js = replace_once(js, old_fetch, new_fetch, "fetch timeout")

old_init_map_data = """async function initMapData() {
  try {
    const raw        = await fetchLiveData();
    const structured = transformApiData(raw);
    hydrateMap(structured);
  } catch (err) {
    console.error('[EQX Map] API fetch failed, map running on cached data:', err);
  }
}"""
new_init_map_data = """async function initMapData() {
  const statusEl = document.getElementById('portfolio-data-status');
  try {
    const raw        = await fetchLiveData();
    const structured = transformApiData(raw);
    hydrateMap(structured);
    if (statusEl) statusEl.textContent = 'Live data';
  } catch (err) {
    console.error('[EQX Map] API fetch failed, map running on cached/static data:', err);
    if (statusEl) statusEl.textContent = 'Cached data — live source unreachable';
  }
}"""
js = replace_once(js, old_init_map_data, new_init_map_data, "visible fallback/error status")

open("/tmp/_final_js_body.txt", "w", encoding="utf-8").write(js)
print("\nFinal JS length:", len(js))
print("\nALL PATCHES APPLIED SUCCESSFULLY")
