/* ═══════════════════════════════════════════════════════════
   GLOBE DATA ADAPTER
   ---------------------------------------------------------
   Turns the Club Portfolio's existing club tables into a GeoJSON
   FeatureCollection for the (optional) Mapbox globe renderer.

   Deliberately reads — never duplicates — the same live data the
   existing Leaflet map already renders: js/render-portfolio.js
   exposes window.PORTFOLIO_DATA (live references to its CLUB_IDS /
   COORDS / REGIONS / HUB_CLUBS, plus a getClubDataIndex() getter)
   purely so this file and any other optional module can consume
   them without a second copy of the club tables existing anywhere
   (see js/club-normalization.js's header note on that rule, and
   PROJECT_AUDIT_2026-07-29.md §3's "never hard-code the pilot club
   list... in more than one place").

   window.PORTFOLIO_DATA only exists once js/render-portfolio.js's
   render() has run (app.js calls that at boot, after every
   PIPELINE_SCRIPTS file — including this one — has already loaded).
   So nothing here reads it at load time; every method below reads
   it lazily, at call time, when render-portfolio.js's export
   wrapper actually invokes GLOBE_DATA (see activateGlobeMode() in
   render-portfolio.js).
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  // Approved P-marker allowlist — exactly as specified. NOT derived by
  // filtering club-normalization.js's PILOT_CLUBS (which has 10 entries,
  // including "254" Anthem Row) precisely so a future roster change can
  // never silently re-include Anthem Row here without a separate,
  // explicit decision.
  const PRECISION_COACHING_CLUB_IDS = [
    "105",
    "109",
    "112",
    "128",
    "713",
    "720",
    "203",
    "206",
    "252",
  ];

  let _connected = false;
  const _updateListeners = [];

  function data() {
    if (!root.PORTFOLIO_DATA) {
      throw new Error("[globe-data-adapter] window.PORTFOLIO_DATA not ready — " +
        "activateGlobeMode() must run after render-portfolio.js's render(), never before.");
    }
    return root.PORTFOLIO_DATA;
  }

  // Resolves a portfolio club name to { clubId, isPrecisionClub, isPilotClub }.
  // Returns isPrecisionClub:false / isPilotClub:false (never throws) for the
  // ~100+ clubs with no directory/pilot record — that's the expected,
  // normal case for most of the national footprint, not an error.
  function resolveClub(clubName) {
    const norm = root.CLUB_NORM ? root.CLUB_NORM.normalize(clubName) : null;
    const clubId = norm ? norm.clubId : null;
    return {
      clubId,
      isPilotClub: !!(norm && norm.isPilotClub),
      isPrecisionClub: !!(clubId && PRECISION_COACHING_CLUB_IDS.indexOf(clubId) !== -1),
    };
  }

  function toGeoJSON() {
    const d = data();
    const clubDataIndex = d.getClubDataIndex();
    const features = [];

    Object.keys(d.COORDS).forEach((name) => {
      const coords = d.COORDS[name];
      if (!coords || coords.length !== 2) return;
      const [lat, lng] = coords;
      if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) return;

      const cd = clubDataIndex[name] || {};
      const resolved = resolveClub(name);

      features.push({
        type: "Feature",
        id: name, // Mapbox feature-state requires a stable id; club names are already unique keys in COORDS
        geometry: { type: "Point", coordinates: [lng, lat] }, // GeoJSON is [lng, lat]; COORDS is stored [lat, lng]
        properties: {
          name,
          clubId: resolved.clubId || cd.club_id || "",
          isHub: d.HUB_CLUBS.has(name),
          isPilotClub: resolved.isPilotClub,
          isPrecisionClub: resolved.isPrecisionClub,
          region: cd.region || "",
          macroRegion: cd.macro_region || "",
          coach: cd.coach || 0,
          coachPlus: cd.coach_plus || 0,
          coachX: cd.coach_x || 0,
          totalCoaches: cd.total_coaches || 0,
          educatorCount: cd.educator_count || 0,
        },
      });
    });

    return { type: "FeatureCollection", features };
  }

  function connect() {
    if (_connected) return;
    _connected = true;
    // Wire into render-portfolio.js's additive notify hook (see hydrateMap()
    // there). Overwrites the null placeholder it ships with — safe because
    // connect() is only ever called once, from activateGlobeMode(), and
    // render-portfolio.js's own code never reads _notifyUpdate itself, only
    // invokes it if present.
    data()._notifyUpdate = function () {
      const fresh = toGeoJSON();
      _updateListeners.forEach((cb) => {
        try { cb(fresh); } catch (err) { console.error("[globe-data-adapter] onUpdate listener failed:", err); }
      });
    };
  }

  function onUpdate(callback) {
    if (typeof callback === "function") _updateListeners.push(callback);
  }

  // ── Small read helpers so globe-camera.js / globe-popups.js never have
  // to reach into window.PORTFOLIO_DATA directly — one point of contact. ──
  function getRegions() {
    return data().REGIONS;
  }

  function getCoords(clubName) {
    return data().COORDS[clubName] || null; // [lat, lng] or null
  }

  // Mirrors the CLUB_REGION lookup built by render-portfolio.js's
  // buildRegionLayers() (Leaflet-only, not exposed) — recomputed here from
  // the same live REGIONS array so both renderers agree without either
  // exposing internal state to the other.
  function findClubRegion(clubName) {
    const regions = getRegions();
    for (let i = 0; i < regions.length; i++) {
      if (regions[i].clubs.indexOf(clubName) !== -1) {
        return { region: regions[i], isHub: data().HUB_CLUBS.has(clubName) };
      }
    }
    return null;
  }

  root.GLOBE_DATA = {
    PRECISION_COACHING_CLUB_IDS,
    resolveClub,
    toGeoJSON,
    connect,
    getRegions,
    getCoords,
    findClubRegion,
    onUpdate,
  };
})(window);
