/* ═══════════════════════════════════════════════════════════
   GLOBE LEGEND — click-to-navigate club lists for the P and H
   (and optionally O) legend rows
   ---------------------------------------------------------
   Purely additive UI on top of the existing static legend
   (js/render-portfolio.js's PORTFOLIO_HTML + buildLegendIcons()):
   clicking a legend row opens a small flyout listing every club
   in that tier, and clicking a club in the flyout reuses the
   exact same navigation GLOBE_CAMERA.flyToClub() already provides
   everywhere else (sidebar chips, search results, marker clicks)
   — direct flyTo to the club at CLUB_ZOOM, popup opened only after
   the camera finishes moving. No new navigation logic exists here.

   Globe-only by design: the P marker tier (isPrecisionClub) has no
   equivalent on the legacy Leaflet map, so this module is wired up
   from activateGlobeMode() only (render-portfolio.js) — on the
   Leaflet map the same legend rows remain exactly as inert as
   they were before this file existed.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  let _flyout = null;
  let _flyoutForId = null;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  }

  // Every list is built from GLOBE_DATA.toGeoJSON() — the same source of
  // truth the map's own P/H/O marker layers filter against (js/globe-markers.js),
  // so a club always appears in the same tier's list as the marker it
  // actually renders on the map.
  function clubsWhere(predicate) {
    if (!root.GLOBE_DATA) return [];
    const fc = root.GLOBE_DATA.toGeoJSON();
    return fc.features
      .filter((f) => predicate(f.properties))
      .map((f) => ({ name: f.properties.name, clubId: f.properties.clubId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const getPrecisionClubs = () => clubsWhere((p) => p.isPrecisionClub);
  const getHubClubs = () => clubsWhere((p) => p.isHub);
  const getStandardClubs = () => clubsWhere((p) => !p.isPrecisionClub && !p.isHub);

  function closeFlyout() {
    if (_flyout) { _flyout.remove(); _flyout = null; }
    _flyoutForId = null;
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.removeEventListener("keydown", onDocKeyDown, true);
  }

  function onDocMouseDown(e) {
    if (_flyout && !_flyout.contains(e.target)) closeFlyout();
  }
  function onDocKeyDown(e) {
    if (e.key === "Escape") closeFlyout();
  }

  // Anchored under (or above, if there's no room below) the clicked
  // legend row — position:fixed + viewport-relative coordinates so it
  // renders correctly regardless of any ancestor's CSS filter (the
  // panel-brightness style slider applies a live `filter` to #panel,
  // which would otherwise re-anchor a `position:fixed` descendant).
  function positionFlyout(panel, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const width = 224;
    const maxHeight = 260;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    panel.style.left = left + "px";
    panel.style.width = width + "px";
    panel.style.maxHeight = maxHeight + "px";

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove > maxHeight || spaceAbove > spaceBelow) {
      panel.style.bottom = window.innerHeight - rect.top + 6 + "px";
      panel.style.top = "auto";
    } else {
      panel.style.top = rect.bottom + 6 + "px";
      panel.style.bottom = "auto";
    }
  }

  function openFlyout(anchorEl, forId, title, clubs) {
    closeFlyout();
    if (!clubs.length) return;

    const panel = document.createElement("div");
    panel.className = "legend-flyout" + (window.PORTFOLIO_DATA && window.PORTFOLIO_DATA.getIsDark() ? " dark" : "");
    panel.innerHTML =
      `<div class="legend-flyout-header">${escapeHtml(title)}<span class="legend-flyout-count">${clubs.length}</span></div>` +
      `<div class="legend-flyout-list">${clubs.map((c) =>
        `<div class="legend-flyout-item" data-name="${escapeHtml(c.name)}">` +
          `<span>${escapeHtml(c.name)}</span>` +
          (c.clubId ? `<span class="legend-flyout-id">${escapeHtml(c.clubId)}</span>` : "") +
        `</div>`
      ).join("")}</div>`;

    panel.addEventListener("click", (e) => {
      const item = e.target.closest(".legend-flyout-item");
      if (!item) return;
      const name = item.dataset.name;
      closeFlyout();
      // Same direct-navigation entry point every other club click in this
      // app uses — no intermediate region stop, club-level zoom, popup
      // gated on moveend (js/globe-camera.js's flyToClub).
      if (root.GLOBE_CAMERA) root.GLOBE_CAMERA.flyToClub(name);
    });

    document.body.appendChild(panel);
    positionFlyout(panel, anchorEl);

    _flyout = panel;
    _flyoutForId = forId;
    // Deferred so the click that opened this flyout doesn't immediately
    // close it via the same event bubbling to document.
    setTimeout(() => {
      document.addEventListener("mousedown", onDocMouseDown, true);
      document.addEventListener("keydown", onDocKeyDown, true);
    }, 0);
  }

  function wireLegendItem(id, getClubs, title) {
    const el = document.getElementById(id);
    if (!el || el.dataset.legendWired) return;
    el.dataset.legendWired = "1";
    el.classList.add("is-clickable");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", title);
    const activate = (e) => {
      e.stopPropagation();
      if (_flyoutForId === id) { closeFlyout(); return; }
      openFlyout(el, id, title, getClubs());
    };
    el.addEventListener("click", activate);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(e); }
    });
  }

  function init() {
    wireLegendItem("legend-p", getPrecisionClubs, "Precision Coaching Clubs");
    wireLegendItem("mob-legend-p", getPrecisionClubs, "Precision Coaching Clubs");
    wireLegendItem("legend-hub", getHubClubs, "Hub Clubs");
    wireLegendItem("mob-legend-hub", getHubClubs, "Hub Clubs");
    // Optional per spec ("if clean to implement") — same pattern, EQX/O tier.
    wireLegendItem("legend-sat", getStandardClubs, "Standard Clubs");
    wireLegendItem("mob-legend-sat", getStandardClubs, "Standard Clubs");
  }

  root.GLOBE_LEGEND = { init, closeFlyout };
})(window);
