/* ═══════════════════════════════════════════════════════════
   GLOBE CAMERA — reset / region / club flyTo, back navigation,
   moveend-gated popup timing
   ---------------------------------------------------------
   Mirrors the exact camera behaviors already proven in the current
   Leaflet map (js/render-portfolio.js's activateRegion/filterMacro/
   flyToClub) so switching renderers doesn't change what the user
   experiences: smooth eased flights, popups that open only after the
   camera finishes moving (map.once('moveend', ...) there → the same
   pattern here), and — restored in this pass — the same hub-cluster
   region context (computed centroid/radius, active-region panel
   state) the Leaflet map has always shown. Region geometry itself is
   never computed here: js/globe-data-adapter.js's getRegionGeometry()
   is the one canonical source (see that file's header note), and
   js/globe-regions.js is the one place the resulting perimeter/
   centroid/hub-ring overlay is drawn. This file only owns the
   camera + the sidebar panel text/active-state that goes with it.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  const DEFAULT_VIEW = { center: [-98, 39], zoom: 2.1, pitch: 0, bearing: 0 };
  const MACRO_LABELS = { WEST: "West Region", SOUTH: "South Region", NYC: "NYC Region", NORTHEAST: "Northeast Region", NORTH: "North Region" };

  // Close, street/neighborhood-level zoom for a single selected club —
  // matches the Leaflet map's own flyToClub(coords, 15, ...) (Mapbox and
  // Leaflet share the same Web Mercator zoom-level convention, so the
  // same numeric zoom reads the same "how close" on both renderers).
  const CLUB_ZOOM = 15;

  // Small camera-state history for "back to previous geographic level."
  // Each entry: { type: 'globe'|'macro'|'region'|'club', view: {...} }
  const _history = [];
  let _currentMacro = "ALL";
  let _activeRegionId = null;

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

  // The four cardinal points of a region's computed radius circle, so a
  // fitBounds() around a region always includes the FULL perimeter, not
  // just the club coordinates it was computed from (a wide region with
  // only 1-2 clubs would otherwise crop most of the drawn circle).
  function cardinalPointsOfCircle(centroid, radiusM) {
    const [lat, lng] = centroid;
    const R = 6371000;
    const dLat = (radiusM / R) * (180 / Math.PI);
    const dLng = (radiusM / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
    return [
      [lat + dLat, lng],
      [lat - dLat, lng],
      [lat, lng + dLng],
      [lat, lng - dLng],
    ];
  }

  // Right-side desktop panel (css/portfolio.css #panel, 320px) and the
  // mobile bottom sheet (collapsed peek height 108px) both cover part of
  // the map — padding must account for whichever is on screen so a
  // region's perimeter is never fit *underneath* either one.
  function mapPadding(extra) {
    extra = extra || {};
    const mobile = window.innerWidth <= 768;
    const base = mobile
      ? { top: 70, bottom: 150, left: 40, right: 40 }
      : { top: 70, bottom: 70, left: 60, right: 370 };
    return Object.assign({}, base, extra);
  }

  function pushHistory(entry) {
    _history.push(entry);
    if (_history.length > 20) _history.shift(); // bounded — this is UX history, not an audit trail
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

  // Mirrors render-portfolio.js's activateRegion(): highlight the region's
  // sidebar card, deactivate whichever was previously active, scroll the
  // new one into view, and write the same "NAME — X.X MI" active-cluster
  // text the Leaflet map has always shown (previously missing the
  // mileage entirely in the globe path).
  function setActiveRegionUI(geometry) {
    const prevId = _activeRegionId;
    if (prevId && (!geometry || geometry.region.id !== prevId)) {
      document.getElementById(`card-${prevId}`)?.classList.remove("active");
    }

    const radiusText = document.getElementById("radius-text");
    const mobText = document.getElementById("mob-cluster-text");

    if (!geometry) {
      _activeRegionId = null;
      if (radiusText) radiusText.textContent = "SELECT A REGION";
      if (mobText) mobText.textContent = "Select a Region";
      return;
    }

    _activeRegionId = geometry.region.id;
    const card = document.getElementById(`card-${geometry.region.id}`);
    if (card) {
      card.classList.add("active");
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    const mi = (geometry.radiusM / 1609.34).toFixed(1);
    if (radiusText) radiusText.textContent = `${geometry.region.name.toUpperCase()} — ${mi} MI`;
    if (mobText) mobText.textContent = `${geometry.region.name} — ${mi} mi`;
  }

  // ── PUBLIC: full reset ──────────────────────────────────────
  function reset() {
    _history.length = 0;
    _currentMacro = "ALL";
    root.GLOBE_MARKERS && root.GLOBE_MARKERS.setSelected(null);
    root.GLOBE_REGIONS && root.GLOBE_REGIONS.clear();
    setActiveRegionUI(null);
    root.GLOBE_RENDERER.reset(DEFAULT_VIEW); // also clears the auto-rotation pause latch, restarts rotation
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
      if (bounds) m.fitBounds(bounds, { padding: mapPadding(), duration: duration(850), maxZoom: 8 });
    }
    updateFilterButtonsUI(macro);
  }

  // ── PUBLIC: fly to one region's bounds (sidebar region-card click) —
  // restores the full hub-cluster model: fits the computed perimeter
  // (not just the club points), draws it via GLOBE_REGIONS, and updates
  // the panel's active-region state/radius text. ──
  function flyToRegion(regionId, opts) {
    opts = opts || {};
    const m = map();
    if (!m) return;
    const geometry = root.GLOBE_DATA.getRegionGeometry(regionId);
    if (!geometry) return;

    root.GLOBE_RENDERER.pauseRotation();
    pushHistory({ type: "region", regionId });

    root.GLOBE_REGIONS && root.GLOBE_REGIONS.showRegion(regionId);
    setActiveRegionUI(geometry);

    if (opts.fly !== false) {
      const coordsList = geometry.coordList.concat(cardinalPointsOfCircle(geometry.centroid, geometry.radiusM));
      const bounds = boundsFromCoordsList(coordsList);
      if (bounds) m.fitBounds(bounds, { padding: mapPadding(), duration: duration(900), maxZoom: 12 });
    }
  }

  // ── PUBLIC: fly to a single club, open its popup once movement ends.
  // The one canonical club-camera function — every selection entry point
  // (marker click, sidebar club tag, search, popup) is re-pointed at this
  // same function by render-portfolio.js's activateGlobeMode(). ──
  function flyToClub(clubName) {
    const m = map();
    if (!m) return;
    const coords = root.GLOBE_DATA.getCoords(clubName);
    if (!coords) return;
    const [lat, lng] = coords;

    root.GLOBE_RENDERER.pauseRotation();
    pushHistory({ type: "club", clubName });

    m.flyTo({ center: [lng, lat], zoom: CLUB_ZOOM, duration: duration(1300), essential: true });

    // Preserves the exact "popup opens only after the camera finishes
    // moving" behavior from js/render-portfolio.js's flyToClub()
    // (map.once('moveend', ...) there).
    m.once("moveend", () => {
      if (root.GLOBE_POPUPS) root.GLOBE_POPUPS.openForClub(m, clubName, [lng, lat]);
    });

    // Silently surface the club's owning hub region (perimeter + panel
    // state), the same way the Leaflet map's own marker-click handler
    // calls activateRegion(region.id, /*flyMap*/ false) — informational
    // only, does not fight the flyTo above with a second camera move.
    const found = root.GLOBE_DATA.findClubRegion(clubName);
    if (found) {
      const geometry = root.GLOBE_DATA.getRegionGeometry(found.region.id);
      if (geometry) {
        root.GLOBE_REGIONS && root.GLOBE_REGIONS.showRegion(found.region.id);
        setActiveRegionUI(geometry);
      }
    }

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

  root.GLOBE_CAMERA = {
    reset,
    filterMacro,
    flyToRegion,
    flyToClub,
    goBack,
  };
})(window);
