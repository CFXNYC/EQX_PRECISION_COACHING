#!/usr/bin/env python3
"""Final wrap: writes js/render-portfolio.js and js/portfolio-config.js to disk
directly (never routing the multi-hundred-KB base64 icon strings through the
conversation/tool-call layer)."""

ROOT = "/Users/Carlos.Arana/Desktop/Claude/APPS/10 Club PIlot 2.0"

final_js = open("/tmp/_final_js_body.txt", encoding="utf-8").read()
final_html = open("/tmp/_final_html_body.txt", encoding="utf-8").read()

# Indent the extracted JS by 2 spaces so it reads as the body of renderPortfolio().
indented_js = "\n".join(("  " + line if line.strip() else line) for line in final_js.split("\n"))

# Escape backticks/${ in the HTML so it's safe as a JS template literal.
# The extracted HTML is static markup (no need for template interpolation),
# so escape any literal backtick or ${ sequence that would otherwise break
# out of the template string.
escaped_html = final_html.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

header = '''/* ═══════════════════════════════════════════════════════════
   RENDER — CLUB PORTFOLIO (Phase 4 extraction)
   ---------------------------------------------------------
   Extracted from EQX CLUB PORTFOLIO/MASTER_MAP_UI.html by
   scripts/extract_portfolio.py + scripts/assemble_portfolio.py (see git
   history for those scripts) — CSS/HTML/JS pulled via exact string
   slicing, not retyped, to preserve fidelity on a 2,300+ line source.

   Folded in from EQX CLUB PORTFOLIO/index.html (the only behaviors that
   existed there and not in MASTER_MAP_UI.html — see
   AUDIT_CLUB_PORTFOLIO_INTEGRATION.md Section 6 and the Phase 4 report):
     - CoachX tier stats footer (Total Coaches / Coach / Coach+ / Coach X /
       EFTI Educators)
     - Embedded base64 CoachX logo constants (self-contained, no external
       PNG file dependency)
     - flyToClub's popup deferred until map 'moveend' (was opening mid-flight)
     - "EQX Club" legend label (was "Satellite Club")

   Adaptations made ONLY to embed this as a dashboard tab rather than a
   standalone page (documented in the Phase 4 report — not a
   reinterpretation of any interactive behavior):
     - `body` / `body.dark` CSS selectors rescoped to `#view-portfolio` /
       `#view-portfolio.dark` so dark mode and base layout stay contained
       to this tab instead of leaking into the rest of the dashboard.
     - `document.body.classList.toggle('dark', ...)` retargeted to the
       `#view-portfolio` element (PORTFOLIO_ROOT) for the same reason.
     - The whole script now runs inside render(), called once by app.js
       at boot (matching every other render-*.js page), instead of
       executing immediately as the page's only script.
     - onShow() added — calls map.invalidateSize(), since Leaflet is
       initialized while this tab is display:none (see styles.css
       ".view { display:none }") and needs that call once it becomes
       visible or tiles render blank/mispositioned.
     - DATA_URL isolated into js/portfolio-config.js (one file, per the
       approved Phase 2/3 security decision — not duplicated here).
     - fetchLiveData() gained a 10s AbortController timeout; initMapData()
       now also updates a visible #portfolio-data-status indicator
       ("Live data" / "Cached data — live source unreachable") instead of
       only console.error — the other approved security-decision item
       (loading/timeout/error/fallback states). Production hardening
       (moving the signed URL off the client entirely) is still required
       and NOT done here — see the Phase 4 report.
     - Cross-source resolution wired in (Phase 4 requirement 4): clicking
       any club (marker, flyToClub/search, sidebar tag) resolves it via
       CLUB_NORM.normalize(); if it's a pilot club, STATE.setSelectedClub()
       is called. Non-pilot clubs are left exactly as before — no
       Precision Coaching data is fabricated for them. This is the only
       state/normalization wiring Phase 4 does; connecting that selection
       to filter Overview/Growth/Behavior/Coach is Phase 6, not this file.

   Everything else — CLUB_IDS, COORDS, REGIONS, region/cluster/popup/
   search/dark-mode/style-panel/mobile-bottom-sheet logic — is the
   original source, unchanged in behavior.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const PORTFOLIO_HTML = `''' + escaped_html + '''`;

  let _rendered = false;
  let _mapInstance = null; // set inside render(); used by onShow()

  function render() {
    if (_rendered) return;
    _rendered = true;

    const container = document.getElementById("view-portfolio");
    if (!container) {
      console.error("[render-portfolio] #view-portfolio container not found in index.html");
      return;
    }
    container.innerHTML = PORTFOLIO_HTML;

    const PORTFOLIO_ROOT = container; // dark-mode toggle target (see header note)

'''

footer = '''

    _mapInstance = map; // captured for onShow()'s invalidateSize()
  }

  function onShow() {
    if (_mapInstance) _mapInstance.invalidateSize();
  }

  window.PAGE_PORTFOLIO = { render, onShow };
})();
'''

full = header + indented_js + footer
open(f"{ROOT}/js/render-portfolio.js", "w", encoding="utf-8").write(full)
print("Wrote js/render-portfolio.js —", len(full), "chars")

# ── portfolio-config.js — isolated DATA_URL (approved security decision) ──
config_js = '''/* ═══════════════════════════════════════════════════════════
   PORTFOLIO CONFIG — isolated endpoint reference
   ---------------------------------------------------------
   Per the approved Phase 2/3 security decision: preserve the existing
   Power Automate endpoint's behavior for this phase, but isolate it in
   ONE file rather than letting the signed URL get copy-pasted into
   render-portfolio.js or anywhere else.

   PRODUCTION HARDENING STILL REQUIRED (not done here, per that same
   decision — do not rotate/replace this URL without approval):
     - This URL is a signed Power Automate invoke endpoint sitting in
       plain client-side code, publicly readable by anyone who loads
       the dashboard.
     - Before production use, move this behind a server-side proxy or
       otherwise keep the signed URL out of shipped client code.
═══════════════════════════════════════════════════════════ */
window.PORTFOLIO_CONFIG = {
  DATA_URL: "https://default3016677c32d54346ba5e7dd46f6662.60.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/4bbf0259c9da4dce95d4358489cad7ee/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=vmIihrkhagLWJ2yAFwDGdqm74d5RgPATjWqXlinZwwc",
};
'''
open(f"{ROOT}/js/portfolio-config.js", "w", encoding="utf-8").write(config_js)
print("Wrote js/portfolio-config.js")
