/* ═══════════════════════════════════════════════════════════
   GLOBE REGIONS — business-defined hub-cluster overlay
   ---------------------------------------------------------
   Restores the operational cluster model the Leaflet map has always
   shown (js/render-portfolio.js's buildRegionLayers(): a computed
   centroid + computed radius circle per business region, drawn from
   REGIONS/COORDS/HUB_CLUBS) as a SEPARATE layer system from Mapbox's
   own point clustering (js/globe-markers.js's CLUSTER_CIRCLE_LAYER).
   Those are two different things that must coexist:
     - Mapbox point clustering: marker-density management, changes
       with zoom, no business meaning.
     - This module: the approved hub + assigned-club region, with a
       geographic radius computed the same way the Leaflet map always
       computed it (js/globe-data-adapter.js's getRegionGeometry(),
       itself a straight port of render-portfolio.js's private
       haversineM/computeCentroid/computeRadius — not re-derived here).

   Shows at most ONE active region at a time (the currently selected
   region card / globe region click) — not all 30 regions permanently,
   which would clutter the high-fidelity globe's approved look at
   rest. Kept visually restrained per spec ("do not make the cluster
   perimeter visually heavy"): a thin dashed outline, low-opacity
   fill, and a small centroid dot — the same restraint level as the
   Leaflet circle's own default (inactive) style.

   Layer order: init() is called from render-portfolio.js's
   activateGlobeMode() BEFORE globe-markers.js's init(), and this
   module's mount() has no async gate (no icon image to load, unlike
   globe-markers.js's addClubIcon()), so its layers are always added,
   and therefore always painted, underneath every marker/cluster
   layer — the fill and perimeter sit behind club markers, never over
   them.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  const SOURCE_ID = "region-overlay";
  const FILL_LAYER = "region-overlay-fill";
  const LINE_LAYER = "region-overlay-line";
  const CENTROID_LAYER = "region-overlay-centroid";
  const HUB_RING_LAYER = "region-overlay-hub-ring";

  const FALLBACK_COLOR = "#8892a4";

  let _map = null;
  let _activeRegionId = null;

  function emptyCollection() {
    return { type: "FeatureCollection", features: [] };
  }

  // Equirectangular approximation of a geodesic circle — accurate enough
  // at the few-to-few-dozen-mile radii every region here uses (matches
  // the Leaflet map's own L.circle, which is likewise not a true
  // ellipsoidal geodesic at this scale). GeoJSON coordinate order [lng, lat].
  function circlePolygonCoords(centroidLatLng, radiusMeters, steps) {
    const [lat, lng] = centroidLatLng;
    const R = 6371000;
    const latRad = (lat * Math.PI) / 180;
    const coords = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const dLat = (radiusMeters * Math.cos(angle)) / R;
      const dLng = (radiusMeters * Math.sin(angle)) / (R * Math.cos(latRad));
      coords.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
    }
    return coords;
  }

  function addSourceAndLayers(map) {
    map.addSource(SOURCE_ID, { type: "geojson", data: emptyCollection() });

    map.addLayer({
      id: FILL_LAYER,
      type: "fill",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "perimeter"],
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.09 },
    });

    map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "perimeter"],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 1.5,
        "line-opacity": 0.55,
        "line-dasharray": [2, 2],
      },
    });

    // Hub ring — a distinct, restrained highlight drawn around the
    // active region's designated hub club, independent of whether that
    // club also carries the Precision Coaching P marker (globe-markers.js
    // owns marker treatment; this is region-overlay-only emphasis, so hub
    // status and Precision status never overwrite one another — see the
    // marker-tier note in globe-markers.js).
    map.addLayer({
      id: HUB_RING_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "hub"],
      paint: {
        "circle-radius": 16,
        "circle-color": "transparent",
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0.9,
      },
    });

    map.addLayer({
      id: CENTROID_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "centroid"],
      paint: {
        "circle-radius": 4,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.9,
      },
    });
  }

  function setData(geojson) {
    if (_map && _map.getSource(SOURCE_ID)) _map.getSource(SOURCE_ID).setData(geojson);
  }

  // ── PUBLIC: draw the active region's perimeter + centroid + hub ring ──
  function showRegion(regionId) {
    if (!_map || !root.GLOBE_DATA) return;
    const geometry = root.GLOBE_DATA.getRegionGeometry(regionId);
    if (!geometry) { clear(); return; }

    _activeRegionId = regionId;
    const colors = root.GLOBE_DATA.getColors();
    const color = colors[geometry.region.macro] || FALLBACK_COLOR;

    const features = [
      {
        type: "Feature",
        properties: { kind: "perimeter", color },
        geometry: { type: "Polygon", coordinates: [circlePolygonCoords(geometry.centroid, geometry.radiusM, 72)] },
      },
      {
        type: "Feature",
        properties: { kind: "centroid", color },
        geometry: { type: "Point", coordinates: [geometry.centroid[1], geometry.centroid[0]] },
      },
    ];

    const hubCoords = root.GLOBE_DATA.getCoords(geometry.region.hub);
    if (hubCoords) {
      features.push({
        type: "Feature",
        properties: { kind: "hub", color },
        geometry: { type: "Point", coordinates: [hubCoords[1], hubCoords[0]] },
      });
    }

    setData({ type: "FeatureCollection", features });
  }

  // ── PUBLIC: remove the overlay (reset / deselect) ──
  function clear() {
    _activeRegionId = null;
    setData(emptyCollection());
  }

  function getActiveRegionId() {
    return _activeRegionId;
  }

  function init(map) {
    _map = map;
    const mount = () => addSourceAndLayers(map);
    if (map.isStyleLoaded()) {
      mount();
    } else {
      map.once("style.load", mount);
    }
  }

  root.GLOBE_REGIONS = {
    init,
    showRegion,
    clear,
    getActiveRegionId,
  };
})(window);
