#!/usr/bin/env python3
"""
Extraction script for Phase 4 — pulls CSS/HTML/JS out of
EQX CLUB PORTFOLIO/MASTER_MAP_UI.html byte-for-byte (via string
slicing, not manual retyping) and folds in the four index.html-only
behaviors. Writes intermediate files for inspection before final
assembly into js/render-portfolio.js / css/portfolio.css.
"""
import re

ROOT = "/Users/Carlos.Arana/Desktop/Claude/APPS/10 Club PIlot 2.0"
master = open(f"{ROOT}/EQX CLUB PORTFOLIO/MASTER_MAP_UI.html", encoding="utf-8").read()
idx = open(f"{ROOT}/EQX CLUB PORTFOLIO/index.html", encoding="utf-8").read()

# ── 1. Slice CSS ──────────────────────────────────────────────
css_start = master.index("<style>") + len("<style>")
css_end = master.index("</style>")
css = master[css_start:css_end]

# ── 2. Slice HTML body (between <body> and the first CDN script tag) ──
body_start = master.index("<body>") + len("<body>")
body_end = master.index('<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js">')
html_body = master[body_start:body_end]

# ── 3. Slice inline JS (between the inline <script> and </script>/</body>) ──
js_marker = '<script>\n// ── API DATA LAYER CONFIG'
js_start = master.index(js_marker) + len("<script>\n")
js_end = master.index("</script>\n</body>")
js_body = master[js_start:js_end]

print("CSS length:", len(css))
print("HTML body length:", len(html_body))
print("JS length:", len(js_body))

# ── 4. Extract the two CoachX base64 constants from index.html ──
coach_x_icon = re.search(r"const COACH_X_ICON = '(data:[^']+)';", idx).group(1)
coach_x_icon_white = re.search(r"const COACH_X_ICON_WHITE = '(data:[^']+)';", idx).group(1)
print("COACH_X_ICON length:", len(coach_x_icon))
print("COACH_X_ICON_WHITE length:", len(coach_x_icon_white))

# ── 5. Extract the panel-metrics HTML block from index.html ──
metrics_match = re.search(
    r'(<div id="panel-metrics">.*?</div>\s*\n)',
    idx, re.S
)
panel_metrics_html = metrics_match.group(1)
print("\npanel_metrics_html:\n", panel_metrics_html)

# ── 6. Extract the extra CSS rules only present in index.html ──
extra_css_rules = re.search(
    r'(#panel-metrics \{[^}]+\}\s*\n\.metric-row \{[^}]+\}\s*\n\.metric-row img \{[^}]+\})',
    idx
)
print("\nextra_css_rules:\n", extra_css_rules.group(1) if extra_css_rules else "NOT FOUND")

coachx_hover_rule = re.search(r'(\.club-tag:not\(\.is-hub\):hover \.coachx-icon \{[^}]+\})', idx)
print("\ncoachx_hover_rule:\n", coachx_hover_rule.group(1) if coachx_hover_rule else "NOT FOUND")

# Save intermediates for the next script to consume
with open("/tmp/_css.txt", "w") as f: f.write(css)
with open("/tmp/_html_body.txt", "w") as f: f.write(html_body)
with open("/tmp/_js_body.txt", "w") as f: f.write(js_body)
with open("/tmp/_coach_x_icon.txt", "w") as f: f.write(coach_x_icon)
with open("/tmp/_coach_x_icon_white.txt", "w") as f: f.write(coach_x_icon_white)
with open("/tmp/_panel_metrics_html.txt", "w") as f: f.write(panel_metrics_html)
