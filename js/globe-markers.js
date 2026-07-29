/* ═══════════════════════════════════════════════════════════
   GLOBE MARKERS — GeoJSON source, clustering, marker layers,
   hover/selected states, click wiring
   ---------------------------------------------------------
   Two visual tiers, per approved direction:
     - Precision-coaching clubs (9, exact allowlist in
       globe-data-adapter.js): EQX P logo, primary emphasis.
     - Every other club (~106, full existing national footprint):
       the closest faithful equivalent of the current Leaflet
       treatment's neutral white/steel dot — visible, not hidden,
       not redesigned into a second branded system, just quieter.

   KNOWN LIMITATION (flag, not silently glossed over): Mapbox GL JS
   renders markers on a WebGL <canvas>, so individual globe markers
   are not keyboard-focusable or screen-reader-addressable the way
   real DOM elements are — a fundamental constraint of canvas-based
   map rendering, not something fixable inside this file. The
   existing sidebar club list (js/render-portfolio.js's
   renderSidebar(), untouched by this upgrade) remains a fully
   keyboard-accessible path to every club and already drives the
   same flyToClub()/selectClub() entry points this file's click
   handlers use — so no club becomes keyboard-unreachable, but the
   globe markers themselves are pointer-only. See the checkpoint
   report for the same note.

   UNVERIFIED WITHOUT A LIVE TOKEN — see globe-renderer.js's header.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  const SOURCE_ID = "clubs";
  const CLUSTER_CIRCLE_LAYER = "clubs-cluster-circle";
  const CLUSTER_COUNT_LAYER = "clubs-cluster-count";
  const NEUTRAL_LAYER = "clubs-neutral";
  const PRECISION_LAYER = "clubs-precision";
  const PRECISION_HALO_LAYER = "clubs-precision-halo";
  const PRECISION_HOVER_LAYER = "clubs-precision-hover";
  const PRECISION_SELECTED_LAYER = "clubs-precision-selected";
  const PRECISION_ICON_ID = "eqx-p-logo-white";

  // Restrained scale bump — selected (1.2x) is deliberately close to
  // hover (1.12x) per spec ("restrained scale... do not use aggressive
  // pulsing"). Shared by both the neutral circle layer and the P-logo
  // symbol layer so hover/selected feel consistent across tiers.
  const HOVER_SELECT_MULTIPLIER = [
    "case",
    ["boolean", ["feature-state", "selected"], false], 1.2,
    ["boolean", ["feature-state", "hover"], false], 1.12,
    1,
  ];

  let _map = null;
  let _hoveredId = null;
  let _selectedId = null;

  // Source PNG is 3000×3000px (full brand-kit resolution) but the marker
  // only ever displays at ~40-70px on screen. Handing Mapbox the raw
  // 3000px texture and shrinking it via icon-size made the logo nearly
  // invisible in live testing — a ~50-70x GPU minification made the
  // ring/P geometry wash out almost completely (worse under this
  // session's software-rendered WebGL, but not exclusive to it).
  // Pre-downsampling to a real sprite resolution before addImage() fixes
  // the legibility problem and is also lighter on GPU memory — confirmed
  // live after this change (see the checkpoint report for the before/after).
  const PRECISION_ICON_SPRITE_SIZE = 256;

  function addClubIcon(map) {
    return new Promise((resolve, reject) => {
      map.loadImage("img/eqx-p-logo-white-transparent.png", (err, image) => {
        if (err) { reject(err); return; }
        if (!map.hasImage(PRECISION_ICON_ID)) {
          const canvas = document.createElement("canvas");
          canvas.width = PRECISION_ICON_SPRITE_SIZE;
          canvas.height = PRECISION_ICON_SPRITE_SIZE;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(image, 0, 0, PRECISION_ICON_SPRITE_SIZE, PRECISION_ICON_SPRITE_SIZE);
          map.addImage(PRECISION_ICON_ID, ctx.getImageData(0, 0, PRECISION_ICON_SPRITE_SIZE, PRECISION_ICON_SPRITE_SIZE), { sdf: false });
        }
        resolve();
      });
    });
  }

  function addSourceAndLayers(map, geojson) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: geojson,
      cluster: true,
      clusterRadius: 60,   // matches the existing Leaflet.markercluster maxClusterRadius (js/render-portfolio.js)
      clusterMaxZoom: 13,
      // REQUIRED with cluster:true — confirmed live (setFeatureState threw
      // "feature id parameter must be provided" without this): Mapbox's
      // internal supercluster reprocessing does not reliably carry a
      // GeoJSON Feature.id through onto unclustered points, so
      // setFeatureState/getFeatureState silently can't find them unless
      // told which *property* to promote to the feature id instead.
      promoteId: "name",
    });

    // ── Clusters — neutral treatment, count only, never the P logo ──
    map.addLayer({
      id: CLUSTER_CIRCLE_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#546E7A",
        "circle-opacity": 0.88,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.75)",
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 24],
      },
    });
    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 11,
      },
      paint: { "text-color": "#ffffff" },
    });

    // ── Non-precision clubs — quiet neutral dot, full footprint preserved ──
    map.addLayer({
      id: NEUTRAL_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "isPrecisionClub"], false]],
      paint: {
        "circle-color": "#ffffff",
        "circle-opacity": 0.9,
        "circle-stroke-width": ["case", ["==", ["get", "isHub"], true], 2.5, 1.5],
        "circle-stroke-color": "#8892a4",
        // A "zoom" expression is only valid as the direct input to a
        // top-level "step"/"interpolate" (Mapbox GL JS rejects it if
        // wrapped in an outer "*" — confirmed live, see commit history).
        // So the hover/selected multiplier is applied inside each stop's
        // *output* value instead of wrapping the whole interpolate.
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          2, ["*", HOVER_SELECT_MULTIPLIER, ["case", ["==", ["get", "isHub"], true], 3, 2]],
          8, ["*", HOVER_SELECT_MULTIPLIER, ["case", ["==", ["get", "isHub"], true], 7, 5]],
        ],
      },
    });

    // ── Precision-coaching clubs — EQX P logo, primary emphasis ──
    // icon-size is a LAYOUT property, and Mapbox GL JS layout properties
    // do not support feature-state expressions at all (confirmed live —
    // "feature-state data expressions are not supported with layout
    // properties" — unlike circle-radius above, which is a PAINT
    // property and feature-state works there). So the base layer stays
    // a fixed size, and hover/selected scale-up is done with two thin
    // filtered "highlight" layers on top instead (see below).
    // icon-size is a scale factor against the SOURCE IMAGE's native pixel
    // dimensions (eqx-p-logo-white-transparent.png is 3000×3000px), not
    // an abstract small multiplier — confirmed live: 0.30 here rendered
    // a ~900px marker that filled a third of the screen; a first-pass fix
    // to ~24-36px was technically correct but confirmed live (via a
    // deliberately oversized test render, then a size ramp-down) to be
    // too small to read reliably against detailed satellite imagery — a
    // real contrast problem, not just conservative styling. Settled on
    // ~40-56px (closer to the reference image's own marker proportions),
    // plus a solid dark halo (below) for "marker contrast works across
    // land and ocean" per spec — the halo is the "subtle shadow or halo
    // if needed" the spec explicitly allows. No circle-blur — dropped
    // after it made the halo unreliable to confirm under this session's
    // software-rendered WebGL (SwiftShader); a crisp low-opacity disc
    // is simpler and verifies correctly.
    const PRECISION_BASE_SIZE = ["interpolate", ["linear"], ["zoom"], 2, 40 / PRECISION_ICON_SPRITE_SIZE, 8, 48 / PRECISION_ICON_SPRITE_SIZE, 14, 56 / PRECISION_ICON_SPRITE_SIZE];

    // Dark halo beneath the icon — a plain circle layer, not a true
    // drop-shadow (Mapbox symbol layers have no native shadow support).
    // Kept restrained (moderate opacity, tight radius) so it reads as
    // contrast help, not a "second border" or a generic map-pin background.
    map.addLayer({
      id: PRECISION_HALO_LAYER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "isPrecisionClub"], true]],
      paint: {
        "circle-color": "#0b0e14",
        "circle-opacity": 0.45,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 19, 8, 23, 14, 27],
      },
    });

    map.addLayer({
      id: PRECISION_LAYER,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "isPrecisionClub"], true]],
      layout: {
        "icon-image": PRECISION_ICON_ID,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": PRECISION_BASE_SIZE,
      },
    });

    // Hover (~12% larger) and selected (~20% larger) — each starts with
    // an empty filter (matches nothing) and is updated via setFilter()
    // in updateHighlightFilters() whenever _hoveredId/_selectedId change.
    // Selected is added last so it renders on top if a marker is both
    // hovered and selected at once.
    [
      { id: PRECISION_HOVER_LAYER, scale: 1.12 },
      { id: PRECISION_SELECTED_LAYER, scale: 1.2 },
    ].forEach(({ id, scale }) => {
      map.addLayer({
        id,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "isPrecisionClub"], true], ["in", ["get", "name"], ["literal", []]]],
        layout: {
          "icon-image": PRECISION_ICON_ID,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 2, (40 / PRECISION_ICON_SPRITE_SIZE) * scale, 8, (48 / PRECISION_ICON_SPRITE_SIZE) * scale, 14, (56 / PRECISION_ICON_SPRITE_SIZE) * scale],
        },
      });
    });
  }

  function updateHighlightFilters(map) {
    const hoverNames = _hoveredId != null ? [_hoveredId] : [];
    const selectedNames = _selectedId != null ? [_selectedId] : [];
    map.setFilter(PRECISION_HOVER_LAYER, ["all", ["!", ["has", "point_count"]], ["==", ["get", "isPrecisionClub"], true], ["in", ["get", "name"], ["literal", hoverNames]]]);
    map.setFilter(PRECISION_SELECTED_LAYER, ["all", ["!", ["has", "point_count"]], ["==", ["get", "isPrecisionClub"], true], ["in", ["get", "name"], ["literal", selectedNames]]]);
  }

  function wireHoverAndSelection(map) {
    [NEUTRAL_LAYER, PRECISION_LAYER].forEach((layerId) => {
      map.on("mouseenter", layerId, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features && e.features[0];
        if (!f) return;
        if (_hoveredId !== null) map.setFeatureState({ source: SOURCE_ID, id: _hoveredId }, { hover: false });
        _hoveredId = f.id;
        map.setFeatureState({ source: SOURCE_ID, id: _hoveredId }, { hover: true });
        updateHighlightFilters(map);
        root.GLOBE_MARKERS._showHoverTooltip(map, f);
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        if (_hoveredId !== null) map.setFeatureState({ source: SOURCE_ID, id: _hoveredId }, { hover: false });
        _hoveredId = null;
        updateHighlightFilters(map);
        root.GLOBE_MARKERS._hideHoverTooltip();
      });
    });
  }

  function setSelected(map, featureId) {
    if (_selectedId !== null) map.setFeatureState({ source: SOURCE_ID, id: _selectedId }, { selected: false });
    _selectedId = featureId;
    if (featureId !== null) map.setFeatureState({ source: SOURCE_ID, id: featureId }, { selected: true });
    updateHighlightFilters(map);
  }

  function wireClusterClicks(map) {
    map.on("click", CLUSTER_CIRCLE_LAYER, (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_CIRCLE_LAYER] });
      const clusterId = features[0].properties.cluster_id;
      map.getSource(SOURCE_ID).getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({ center: features[0].geometry.coordinates, zoom, duration: root.GLOBE_RENDERER.prefersReducedMotion() ? 0 : 700 });
      });
    });
    map.on("mouseenter", CLUSTER_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", CLUSTER_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = ""; });
  }

  function wireMarkerClicks(map) {
    [NEUTRAL_LAYER, PRECISION_LAYER].forEach((layerId) => {
      map.on("click", layerId, (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        setSelected(map, f.id);
        // GLOBE_CAMERA owns the flyTo + moveend-gated popup + STATE/CLUB_NORM
        // write, mirroring the existing flyToClub()'s "move completion
        // before popup" behavior in render-portfolio.js.
        if (root.GLOBE_CAMERA) root.GLOBE_CAMERA.flyToClub(f.properties.name);
      });
    });
  }

  let _hoverPopup = null;
  function showHoverTooltip(map, feature) {
    if (!root.mapboxgl) return;
    if (!_hoverPopup) {
      _hoverPopup = new root.mapboxgl.Popup({
        closeButton: false, closeOnClick: false, className: "globe-hover-tooltip", offset: 10,
      });
    }
    _hoverPopup.setLngLat(feature.geometry.coordinates).setText(feature.properties.name).addTo(map);
  }
  function hideHoverTooltip() {
    if (_hoverPopup) _hoverPopup.remove();
  }

  function updateSource(geojson) {
    if (_map && _map.getSource(SOURCE_ID)) _map.getSource(SOURCE_ID).setData(geojson);
  }

  function init(map, geojson) {
    _map = map;
    const mount = () => {
      addSourceAndLayers(map, geojson);
      wireHoverAndSelection(map);
      wireClusterClicks(map);
      wireMarkerClicks(map);
      if (root.GLOBE_DATA) root.GLOBE_DATA.onUpdate(updateSource);
    };
    if (map.isStyleLoaded()) {
      addClubIcon(map).then(mount);
    } else {
      map.once("style.load", () => { addClubIcon(map).then(mount); });
    }
  }

  root.GLOBE_MARKERS = {
    init,
    updateSource,
    setSelected: (featureId) => { if (_map) setSelected(_map, featureId); },
    _showHoverTooltip: showHoverTooltip,
    _hideHoverTooltip: hideHoverTooltip,
  };
})(window);
