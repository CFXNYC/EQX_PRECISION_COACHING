/* ═══════════════════════════════════════════════════════════
   GLOBE CAMERA — reset / region / club flyTo, back navigation,
   moveend-gated popup timing
   ---------------------------------------------------------
   Mirrors the exact camera behaviors already proven in the current
   Leaflet map (js/render-portfolio.js's activateRegion/filterMacro/
   flyToClub) so switching renderers doesn't change what the user
   experiences: smooth eased flights, and popups that open only
   after the camera finishes moving (map.once('moveend', ...) there
   → the same pattern here).

   UNVERIFIED WITHOUT A LIVE TOKEN — see globe-renderer.js's header.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  const DEFAULT_VIEW = { center: [-98, 39], zoom: 2.1, pitch: 0, bearing: 0 };
  const MACRO_LABELS = { WEST: "West Region", SOUTH: "South Region", NYC: "NYC Region", NORTHEAST: "Northeast Region", NORTH: "North Region" };

  // Small camera-state history for "back to previous geographic level."
  // Each entry: { type: 'globe'|'macro'|'region'|'club', view: {...} }
  const _history = [];
  let _currentMacro = "ALL";

  function map() {
    return root.GLOBE_RENDERER.getMap();
  }

  function duration(ms) {
    return root.GLOBE_RENDERER.prefersReducedMotion() ? 0 : ms;
  }

  function boundsFromCoordsList(coordsList) {
    // coordsList entries are [lat, lng] (COORDS' own convention).
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    coordsList.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
    if (!isFinite(minLat)) return null;
    return [[minLng, minLat], [maxLng, maxLat]]; // Mapbox LngLatBoundsLike: [sw, ne]
  }

  function pushHistory(entry) {
    _history.push(entry);
    if (_history.length > 20) _history.shift(); // bounded — this is UX history, not an audit trail
  }

  // ── PUBLIC: full reset ──────────────────────────────────────
  function reset() {
    _history.length = 0;
    _currentMacro = "ALL";
    root.GLOBE_MARKERS && root.GLOBE_MARKERS.setSelected(null);
    root.GLOBE_RENDERER.reset(DEFAULT_VIEW); // also clears the auto-rotation pause latch, restarts rotation
    updateRegionUI(null);
  }

  // ── PUBLIC: macro-region filter (West/South/NYC/Northeast/North/All) ──
  function filterMacro(macro) {
    const m = map();
    if (!m) return;
    root.GLOBE_RENDERER.pauseRotation(); // otherwise the rotation loop's per-frame setCenter() fights this fitBounds/easeTo — confirmed live
    pushHistory({ type: "macro", macro: _currentMacro });
    _currentMacro = macro;

    if (macro === "ALL") {
      m.easeTo(Object.assign({}, DEFAULT_VIEW, { duration: duration(850) }));
    } else {
      const regions = root.GLOBE_DATA.getRegions().filter((r) => r.macro === macro);
      const coordsList = regions.flatMap((r) => r.clubs.map((c) => root.GLOBE_DATA.getCoords(c)).filter(Boolean));
      const bounds = boundsFromCoordsList(coordsList);
      if (bounds) m.fitBounds(bounds, { padding: 80, duration: duration(850), maxZoom: 8 });
    }
    updateFilterButtonsUI(macro);
  }

  // ── PUBLIC: fly to one region's bounds (sidebar region-card click) ──
  function flyToRegion(regionId, opts) {
    opts = opts || {};
    const m = map();
    if (!m) return;
    const region = root.GLOBE_DATA.getRegions().find((r) => r.id === regionId);
    if (!region) return;

    root.GLOBE_RENDERER.pauseRotation();
    pushHistory({ type: "region", regionId });

    const coordsList = region.clubs.map((c) => root.GLOBE_DATA.getCoords(c)).filter(Boolean);
    const bounds = boundsFromCoordsList(coordsList);
    if (bounds && opts.fly !== false) {
      m.fitBounds(bounds, { padding: 90, duration: duration(900), maxZoom: 9 });
    }
    updateRegionUI(region);
  }

  // ── PUBLIC: fly to a single club, open its popup once movement ends ──
  function flyToClub(clubName) {
    const m = map();
    if (!m) return;
    const coords = root.GLOBE_DATA.getCoords(clubName);
    if (!coords) return;
    const [lat, lng] = coords;

    root.GLOBE_RENDERER.pauseRotation();
    pushHistory({ type: "club", clubName });

    m.flyTo({ center: [lng, lat], zoom: 6.2, duration: duration(1100), essential: true });

    // Preserves the exact "popup opens only after the camera finishes
    // moving" behavior from js/render-portfolio.js's flyToClub()
    // (map.once('moveend', ...) there).
    m.once("moveend", () => {
      if (root.GLOBE_POPUPS) root.GLOBE_POPUPS.openForClub(m, clubName, [lng, lat]);
    });

    // Preserve the Phase 4 cross-source resolution + shared-state write,
    // pilot clubs only — identical condition to the Leaflet path.
    const norm = root.CLUB_NORM ? root.CLUB_NORM.normalize(clubName) : null;
    if (norm && norm.isPilotClub && root.STATE) {
      root.STATE.setSelectedClub(norm.clubId, norm.canonicalName);
    }
  }

  // ── PUBLIC: back to the previous geographic level ──────────
  function goBack() {
    const prev = _history.pop();
    if (!prev) { reset(); return; }
    if (prev.type === "macro") filterMacro(prev.macro);
    else if (prev.type === "region") flyToRegion(prev.regionId);
    else reset();
  }

  // ── UI plumbing shared with the existing sidebar DOM (unchanged ids —
  // render-portfolio.js's PORTFOLIO_HTML already defines these elements;
  // this only updates their text/classes, same as the Leaflet path did). ──
  function updateFilterButtonsUI(macro) {
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      const on = btn.dataset.macro === macro;
      btn.classList.toggle("active", on);
    });
  }

  function updateRegionUI(region) {
    const radiusText = document.getElementById("radius-text");
    const mobText = document.getElementById("mob-cluster-text");
    if (!region) {
      if (radiusText) radiusText.textContent = "SELECT A REGION";
      if (mobText) mobText.textContent = "Select a Region";
      return;
    }
    if (radiusText) radiusText.textContent = `${region.name.toUpperCase()}`;
    if (mobText) mobText.textContent = region.name;
  }

  root.GLOBE_CAMERA = {
    reset,
    filterMacro,
    flyToRegion,
    flyToClub,
    goBack,
  };
})(window);
