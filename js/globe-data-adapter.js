/* ═══════════════════════════════════════════════════════════
   GLOBE DATA ADAPTER
   ---------------------------------------------------------
   Turns the Club Portfolio's existing club tables into a GeoJSON
   FeatureCollection for the (optional) Mapbox globe renderer.

   Deliberately reads — never duplicates — the same live data the
   existing Leaflet map already renders: js/render-portfolio.js
   exposes window.PORTFOLIO_DATA (live references to its COORDS /
   REGIONS / HUB_CLUBS, plus a getClubDataIndex() getter)
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

   CLASSIFICATION (data/club_map_data.json integration): the 9-entry
   PRECISION_COACHING_CLUB_IDS allowlist formerly here — and its
   deliberate divergence from club-normalization.js's 10-club
   PILOT_CLUBS (Finding H-1: Anthem Row/254 was excluded from the
   P-marker allowlist but still showed the "Pilot Club" popup banner
   and legend entry) — is removed. Both `isPilotClub` and
   `isPrecisionClub` below now derive from the SAME source, the JSON's
   own `club_type` field (via render-portfolio.js's clubDataIndex,
   itself sourced from window.CLUB_MAP_DATA) — so the two properties
   can no longer disagree, and Anthem Row (club_type: "Pilot Club" in
   the JSON) now gets the P marker like every other pilot club.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  let _connected = false;
  const _updateListeners = [];

  function data() {
    if (!root.PORTFOLIO_DATA) {
      throw new Error("[globe-data-adapter] window.PORTFOLIO_DATA not ready — " +
        "activateGlobeMode() must run after render-portfolio.js's render(), never before.");
    }
    return root.PORTFOLIO_DATA;
  }

  // Resolves a portfolio club name to { clubId, isPrecisionClub, isPilotClub }
  // using the JSON-sourced clubDataIndex entry (club_type is authoritative —
  // requirement 4: Pilot Club > Hub Club > Standard Club priority, no more
  // hardcoded allowlist). Returns all-false (never throws) for a name with
  // no clubDataIndex entry — not expected in practice since toGeoJSON()
  // only ever calls this for names already present in COORDS, which is
  // itself built from the same clubDataIndex.
  function resolveClub(clubName) {
    const cd = data().getClubDataIndex()[clubName] || {};
    const isPilot = cd.clubType === "Pilot Club";
    return {
      clubId: cd.clubId || cd.club_id || null,
      isPilotClub: isPilot,
      isPrecisionClub: isPilot, // same source as isPilotClub now — see header note
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
      const isHub = d.HUB_CLUBS.has(name);

      features.push({
        type: "Feature",
        id: name, // Mapbox feature-state requires a stable id; club names are already unique keys in COORDS
        geometry: { type: "Point", coordinates: [lng, lat] }, // GeoJSON is [lng, lat]; COORDS is stored [lat, lng]
        properties: {
          name,
          clubId: resolved.clubId || "",
          isHub,
          isPilotClub: resolved.isPilotClub,
          isPrecisionClub: resolved.isPrecisionClub,
          // Legacy short property names — kept for anything already reading
          // these (region here is the raw JSON `region`, macroRegion is the
          // JSON_REGION_TO_MACRO-mapped compatibility value).
          region: cd.region || "",
          macroRegion: cd.macro_region || "",
          coach: cd.coach || 0,
          coachPlus: cd.coach_plus || 0,
          coachX: cd.coach_x || 0,
          totalCoaches: cd.total_coaches || 0,
          educatorCount: cd.educator_count || 0,
          // Full data/club_map_data.json-sourced field set (requirement 12).
          sourceClubName: cd.sourceClubName || "",
          displayClubName: cd.displayClubName || name,
          latitude: lat,
          longitude: lng,
          market: cd.market || "",
          country: cd.country || "",
          locationStatus: cd.locationStatus || "",
          dashboardIncluded: cd.dashboardIncluded !== false,
          clubType: cd.clubType || "",
          mapStage: cd.mapStage || "",
          isPreview: !!cd.isPreview,
          coachCount: cd.coachCount || 0,
          coachPlusCount: cd.coachPlusCount || 0,
          coachXCount: cd.coachXCount || 0,
          advantageCoachCount: cd.advantageCoachCount || 0,
          totalCoachCount: cd.totalCoachCount || 0,
          eftiEducatorCount: cd.eftiEducatorCount || 0,
          eftiEducatorNames: cd.eftiEducatorNames || "",
          eftiEducatorEmails: cd.eftiEducatorEmails || "",
          ptmCount: cd.ptmCount || 0,
          ptmNames: cd.ptmNames || "",
          ptmEmails: cd.ptmEmails || "",
          aptmCount: cd.aptmCount || 0,
          aptmNames: cd.aptmNames || "",
          aptmEmails: cd.aptmEmails || "",
          totalManagementCount: cd.totalManagementCount || 0,
          validationStatus: cd.validationStatus || "",
          sourceMatchStatus: cd.sourceMatchStatus || "",
          headcountMatchMethod: cd.headcountMatchMethod || "",
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

  function getColors() {
    return data().COLORS || {};
  }

  // ── Canonical region geometry math — identical formulas to
  // render-portfolio.js's haversineM/computeCentroid/computeRadius (the
  // Leaflet map's own hub-cluster circle math), reused here rather than
  // re-derived so the globe's region overlay (js/globe-regions.js) and
  // the Leaflet map always agree on centroid/radius for the same region.
  // Not read from render-portfolio.js directly because those functions
  // are private to its render() IIFE and never exposed on window; this is
  // the one place outside that IIFE the formulas exist, and every other
  // globe module reads them only through GLOBE_DATA. ──
  function haversineM(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function computeCentroid(list) {
    if (!list.length) return null;
    return [list.reduce((s, c) => s + c[0], 0) / list.length, list.reduce((s, c) => s + c[1], 0) / list.length];
  }

  function computeRadiusM(centroid, list) {
    if (!list.length) return 0;
    if (list.length === 1) return 2000;
    return Math.max(...list.map((c) => haversineM(centroid, c))) * 1.075;
  }

  // Returns the same shape as render-portfolio.js's regionLayers[region.id]
  // (region, matched clubs w/ coords, centroid, radiusM) so the globe's
  // region overlay and camera fitting read one shared computation.
  function getRegionGeometry(regionId) {
    const region = getRegions().find((r) => r.id === regionId);
    if (!region) return null;
    const matched = region.clubs.map((name) => ({ name, coords: getCoords(name) })).filter((c) => c.coords);
    const coordList = matched.map((c) => c.coords);
    const centroid = computeCentroid(coordList);
    if (!centroid) return null;
    const radiusM = computeRadiusM(centroid, coordList);
    return { region, matched, coordList, centroid, radiusM };
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
    resolveClub,
    toGeoJSON,
    connect,
    getRegions,
    getCoords,
    getColors,
    findClubRegion,
    haversineM,
    computeCentroid,
    computeRadiusM,
    getRegionGeometry,
    onUpdate,
  };
})(window);
