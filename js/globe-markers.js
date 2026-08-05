/* ═══════════════════════════════════════════════════════════
   GLOBE MARKERS — GeoJSON source, clustering, marker layers,
   hover/selected states, click wiring
   ---------------------------------------------------------
   Three visual tiers — the approved P/H/O marker hierarchy, restored
   to match the Leaflet map's own hub/pilot treatment:
     - Precision-coaching (pilot) clubs — every club whose
       data/club_map_data.json club_type is "Pilot Club", resolved by
       js/globe-data-adapter.js from the JSON, not a hardcoded ID
       allowlist: EQX P logo, primary emphasis. A
       precision club that is also a hub keeps the P logo — hub
       status never downgrades or replaces it — and is surfaced via
       the existing "Hub Club" popup badge (js/globe-popups.js) plus
       the region-overlay hub ring (js/globe-regions.js) when its
       region is active, rather than a second on-marker asset.
     - Non-pilot hub clubs: EQX H logo (the same HUB_ICON asset the
       Leaflet map's makeHubIcon() already uses — see
       window.PORTFOLIO_DATA.HUB_ICON in render-portfolio.js — reused
       byte-for-byte, never redrawn).
     - Every other club (full existing national footprint): EQX O
       logo (img/eqx-o-logo-white.png, the same mark already used as
       the dashboard's topbar brand image), kept visually quieter
       than P/H so the hierarchy still reads at a glance, but always
       a real marker — never a generic dot, even once a cluster
       expands down to individual clubs.

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
  const PRECISION_ICON_ID = "eqx-p-logo-white";
  const HUB_ICON_ID = "eqx-h-logo";
  const STANDARD_ICON_ID = "eqx-o-logo";

  let _map = null;
  let _hoveredId = null;
  let _selectedId = null;

  // ── Marker tier config — one entry per rung of the approved P/H/O
  // hierarchy. `match` partitions every non-cluster feature into exactly
  // one tier (precision → hub → everything else), so no club can ever
  // fall through to a generic dot once a cluster expands (rule: "every
  // individual club must resolve into a P, H, or O marker"). H and O are
  // deliberately smaller/quieter than P (sizePx, haloOpacity) — same
  // "primary emphasis vs. quieter footprint" restraint the original
  // neutral-dot tier used, just resolved into real logos instead of dots
  // now that O must be legible on its own instead of a plain circle.
  const TIERS = [
    {
      key: "precision",
      iconId: PRECISION_ICON_ID,
      // Source PNG is 3000×3000px (full brand-kit resolution) but the
      // marker only ever displays at ~40-70px on screen. Handing Mapbox
      // the raw 3000px texture and shrinking it via icon-size made the
      // logo nearly invisible in live testing — a ~50-70x GPU
      // minification made the ring/P geometry wash out almost
      // completely. Pre-downsampling to a real sprite resolution before
      // addImage() fixes legibility and is lighter on GPU memory.
      spriteSize: 256,
      match: ["==", ["get", "isPrecisionClub"], true],
      haloLayer: "clubs-precision-halo",
      haloColor: "#0b0e14",
      haloOpacity: 0.45,
      // Ramped from near-zero at the whole-globe default view (zoom ~2.1)
      // up to the original close-zoom values (unchanged from zoom 8
      // onward — the 8/14 stops below are the exact values this was
      // tuned to live). Fixes markers reading as oversized blobs at the
      // default zoomed-out view: the old 2-stop floor (19px at zoom 2)
      // never shrank further no matter how far out the globe was — a
      // logo should only become legible once the user has actually
      // zoomed toward that area, not be visible at a whole-continent
      // or whole-globe scale.
      haloRadius: [0, 1, 2, 4, 4, 9, 6, 15, 8, 23, 14, 27],
      symbolLayer: "clubs-precision",
      hoverLayer: "clubs-precision-hover",
      selectedLayer: "clubs-precision-selected",
      // icon-size is a scale factor against the SOURCE IMAGE's native
      // pixel dimensions, not an abstract small multiplier — confirmed
      // live: 0.30 here rendered a ~900px marker that filled a third of
      // the screen. Settled on ~40-56px (closer to the reference
      // image's own marker proportions), plus a solid dark halo for
      // "marker contrast works across land and ocean" per spec.
      // This is also the sizing standard every other tier matches —
      // H and O reuse this exact sizePx array so all three read at the
      // same visual footprint at any given zoom (icon-size is computed
      // per-tier as sizePx / that tier's own spriteSize, so an identical
      // sizePx array yields an identical on-screen pixel size regardless
      // of how large each source sprite is).
      // Ramped from near-zero at the default whole-globe view (zoom ~2.1)
      // up to the original close-zoom values — see haloRadius above for
      // why (same fix, same rationale). 8/14 stops are unchanged from
      // the original tuning.
      sizePx: [0, 3, 2, 8, 4, 18, 6, 30, 8, 44, 14, 56],
    },
    {
      key: "hub",
      iconId: HUB_ICON_ID,
      // Native 80×80 asset (window.PORTFOLIO_DATA.HUB_ICON — the same
      // mark render-portfolio.js's makeHubIcon() already uses) shown at
      // well under 80px on screen, so no downsampling pass is needed —
      // unlike the 3000px P source above.
      spriteSize: 80,
      match: ["all", ["==", ["get", "isPrecisionClub"], false], ["==", ["get", "isHub"], true]],
      // No halo — HUB_ICON must render as only the O+H glyph, nothing
      // behind it (confirmed live: the source PNG is actually a fully
      // opaque black-on-white square, not black-on-transparent — see
      // dematteToColor() below — so a halo here would reproduce
      // exactly the white-box look that was removed).
      symbolLayer: "clubs-hub",
      hoverLayer: "clubs-hub-hover",
      selectedLayer: "clubs-hub-selected",
      // Ramped from near-zero at the default whole-globe view (zoom ~2.1)
      // up to the original close-zoom values — see haloRadius above for
      // why (same fix, same rationale). 8/14 stops are unchanged from
      // the original tuning.
      sizePx: [0, 3, 2, 8, 4, 18, 6, 30, 8, 44, 14, 56], // matches precision — same visual footprint as P at every zoom
    },
    {
      key: "standard",
      iconId: STANDARD_ICON_ID,
      // img/eqx-o-logo-white.png is 411×411px — smaller than the P
      // source but still downsampled to a fixed sprite for the same
      // crispness/GPU-memory reasons as the precision tier.
      spriteSize: 256,
      match: ["all", ["==", ["get", "isPrecisionClub"], false], ["==", ["get", "isHub"], false]],
      haloLayer: "clubs-standard-halo",
      haloColor: "#0b0e14",
      haloOpacity: 0.28,
      // Ramped from near-zero at the whole-globe default view (zoom ~2.1)
      // up to the original close-zoom values (unchanged from zoom 8
      // onward — the 8/14 stops below are the exact values this was
      // tuned to live). Fixes markers reading as oversized blobs at the
      // default zoomed-out view: the old 2-stop floor (19px at zoom 2)
      // never shrank further no matter how far out the globe was — a
      // logo should only become legible once the user has actually
      // zoomed toward that area, not be visible at a whole-continent
      // or whole-globe scale.
      haloRadius: [0, 1, 2, 4, 4, 9, 6, 15, 8, 23, 14, 27], // matches precision's halo radius — same footprint as P
      symbolLayer: "clubs-standard",
      hoverLayer: "clubs-standard-hover",
      selectedLayer: "clubs-standard-selected",
      // Ramped from near-zero at the default whole-globe view (zoom ~2.1)
      // up to the original close-zoom values — see haloRadius above for
      // why (same fix, same rationale). 8/14 stops are unchanged from
      // the original tuning.
      sizePx: [0, 3, 2, 8, 4, 18, 6, 30, 8, 44, 14, 56], // matches precision — same visual footprint as P at every zoom
    },
  ];

  function tierFilter(tier, extra) {
    const parts = ["all", ["!", ["has", "point_count"]], tier.match];
    if (extra) parts.push(extra);
    return parts;
  }

  function tierSizeExpr(tier, scale) {
    const s = scale || 1;
    const expr = ["interpolate", ["linear"], ["zoom"]];
    for (let i = 0; i < tier.sizePx.length; i += 2) {
      expr.push(tier.sizePx[i], (tier.sizePx[i + 1] / tier.spriteSize) * s);
    }
    return expr;
  }

  // Generic zoom-interpolation builder for a flat [zoom, value, zoom,
  // value, ...] stops array — any number of stops, not just a fixed
  // count. Used for halo circle-radius (tierSizeExpr above is the
  // icon-size equivalent, kept separate since it also divides by
  // spriteSize).
  function radiusExpr(stops) {
    const expr = ["interpolate", ["linear"], ["zoom"]];
    for (let i = 0; i < stops.length; i += 2) expr.push(stops[i], stops[i + 1]);
    return expr;
  }

  // HUB_ICON ships as a fully opaque black-glyph-on-white-square PNG, not
  // black-on-transparent — confirmed live by sampling its pixels (every
  // corner reads exactly rgba(255,255,255,255); 100% of pixels are fully
  // opaque). Mapbox has no "color to alpha" primitive, so the only way to
  // get a transparent-background H marker without redrawing the glyph is
  // to de-matte it here: this is the standard invert of "opaque = alpha·FG
  // + (1-alpha)·white", recovering alpha = 255 - luminance, then painting
  // the glyph back in the given solid color (white, to match P/O) instead
  // of the source's original black. Anti-aliased edge pixels (mid-gray in
  // the source) come out as partially transparent, exactly as if the
  // asset had shipped with real alpha — only the O+H shape's color and
  // the presence of a background differ from the source; the glyph's
  // geometry itself is untouched.
  function dematteToColor(ctx, spriteSize, rgb) {
    const imageData = ctx.getImageData(0, 0, spriteSize, spriteSize);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const luminance = (d[i] + d[i + 1] + d[i + 2]) / 3;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
      d[i + 3] = 255 - luminance;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function drawSprite(map, iconId, image, spriteSize, postProcess) {
    if (map.hasImage(iconId)) return;
    const canvas = document.createElement("canvas");
    canvas.width = spriteSize;
    canvas.height = spriteSize;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, spriteSize, spriteSize);
    if (postProcess) postProcess(ctx, spriteSize);
    map.addImage(iconId, ctx.getImageData(0, 0, spriteSize, spriteSize), { sdf: false });
  }

  // P and O are real file assets (img/eqx-*.png) — loaded via Mapbox's
  // own loadImage, same as before.
  function loadFileIcon(map, url, iconId, spriteSize, postProcess) {
    return new Promise((resolve, reject) => {
      map.loadImage(url, (err, image) => {
        if (err) { reject(err); return; }
        drawSprite(map, iconId, image, spriteSize, postProcess);
        resolve();
      });
    });
  }

  // H is the existing HUB_ICON base64 data URI (window.PORTFOLIO_DATA.HUB_ICON,
  // the same asset the Leaflet map's makeHubIcon() already renders) — loaded
  // via a plain Image element rather than map.loadImage, since Mapbox's
  // internal image fetcher targets http(s) URLs, not data: URIs.
  function loadDataUriIcon(map, dataUri, iconId, spriteSize, postProcess) {
    return new Promise((resolve, reject) => {
      if (!dataUri) { reject(new Error("[globe-markers] window.PORTFOLIO_DATA.HUB_ICON not available")); return; }
      const img = new Image();
      img.onload = () => { drawSprite(map, iconId, img, spriteSize, postProcess); resolve(); };
      img.onerror = reject;
      img.src = dataUri;
    });
  }

  function addClubIcons(map) {
    const precision = TIERS[0], hub = TIERS[1], standard = TIERS[2];
    return Promise.all([
      loadFileIcon(map, "img/eqx-p-logo-white-transparent.png", precision.iconId, precision.spriteSize),
      loadDataUriIcon(map, window.PORTFOLIO_DATA && window.PORTFOLIO_DATA.HUB_ICON, hub.iconId, hub.spriteSize, (ctx, size) => dematteToColor(ctx, size, [255, 255, 255])),
      loadFileIcon(map, "img/eqx-o-logo-white.png", standard.iconId, standard.spriteSize),
    ]);
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

    // ── P / H / O marker tiers — every non-cluster club resolves into
    // exactly one of these (TIERS' filters partition isPrecisionClub ×
    // isHub with no gap), so nothing ever falls back to a generic dot.
    // icon-size is a LAYOUT property, and Mapbox GL JS layout properties
    // do not support feature-state expressions at all (confirmed live —
    // "feature-state data expressions are not supported with layout
    // properties"). So each tier's base symbol layer stays a fixed size,
    // and hover/selected scale-up is done with two thin filtered
    // "highlight" layers on top instead (updated via setFilter() in
    // updateHighlightFilters()). Halo (where present) is a plain circle
    // layer beneath the icon, not a true drop-shadow (Mapbox symbol
    // layers have no native shadow support) — kept restrained per tier
    // so it reads as contrast help, not a "second border". The hub tier
    // deliberately has no halo at all — only the O+H glyph itself may
    // render, per spec ("no white square, white box, or opaque
    // background... only the O and H are visible").
    TIERS.forEach((tier) => {
      if (tier.haloLayer) {
        map.addLayer({
          id: tier.haloLayer,
          type: "circle",
          source: SOURCE_ID,
          filter: tierFilter(tier),
          paint: {
            "circle-color": tier.haloColor,
            "circle-opacity": tier.haloOpacity,
            "circle-radius": radiusExpr(tier.haloRadius),
          },
        });
      }

      map.addLayer({
        id: tier.symbolLayer,
        type: "symbol",
        source: SOURCE_ID,
        filter: tierFilter(tier),
        layout: {
          "icon-image": tier.iconId,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": tierSizeExpr(tier),
        },
      });

      // Hover (~12% larger) and selected (~20% larger) — each starts
      // with an empty filter (matches nothing) and is updated via
      // setFilter() in updateHighlightFilters() whenever
      // _hoveredId/_selectedId change. Selected is added last so it
      // renders on top if a marker is both hovered and selected at once.
      [
        { id: tier.hoverLayer, scale: 1.12 },
        { id: tier.selectedLayer, scale: 1.2 },
      ].forEach(({ id, scale }) => {
        map.addLayer({
          id,
          type: "symbol",
          source: SOURCE_ID,
          filter: tierFilter(tier, ["in", ["get", "name"], ["literal", []]]),
          layout: {
            "icon-image": tier.iconId,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-size": tierSizeExpr(tier, scale),
          },
        });
      });
    });
  }

  function updateHighlightFilters(map) {
    const hoverNames = _hoveredId != null ? [_hoveredId] : [];
    const selectedNames = _selectedId != null ? [_selectedId] : [];
    TIERS.forEach((tier) => {
      map.setFilter(tier.hoverLayer, tierFilter(tier, ["in", ["get", "name"], ["literal", hoverNames]]));
      map.setFilter(tier.selectedLayer, tierFilter(tier, ["in", ["get", "name"], ["literal", selectedNames]]));
    });
  }

  function wireHoverAndSelection(map) {
    TIERS.map((tier) => tier.symbolLayer).forEach((layerId) => {
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

  // One click must fully resolve a cluster — not just step to its
  // immediate child level. getClusterExpansionZoom() alone (the previous
  // implementation) only zooms to where THIS cluster first splits, which
  // for a supercluster can still be into smaller sub-clusters, forcing
  // repeated clicks to actually reach individual clubs. Instead, pull
  // every leaf (actual club point, recursively, never a sub-cluster) this
  // cluster contains via getClusterLeaves() and fitBounds() around all of
  // them in one deterministic transition — the underlying clubs are
  // guaranteed visible after the single completed transition regardless
  // of how many supercluster levels separated them from this click.
  function wireClusterClicks(map) {
    map.on("click", CLUSTER_CIRCLE_LAYER, (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_CIRCLE_LAYER] });
      const cluster = features[0];
      const clusterId = cluster.properties.cluster_id;
      const pointCount = cluster.properties.point_count || 0;
      const source = map.getSource(SOURCE_ID);

      root.GLOBE_RENDERER.pauseRotation(); // matches every other programmatic camera move — see globe-camera.js

      source.getClusterLeaves(clusterId, Math.max(pointCount, 1), 0, (err, leaves) => {
        const duration = root.GLOBE_RENDERER.prefersReducedMotion() ? 0 : 800;
        if (err || !leaves || !leaves.length) {
          // Fallback: still resolve on one click via the immediate
          // expansion zoom, rather than doing nothing.
          source.getClusterExpansionZoom(clusterId, (zErr, zoom) => {
            if (zErr) return;
            map.easeTo({ center: cluster.geometry.coordinates, zoom, duration });
          });
          return;
        }

        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        leaves.forEach((leaf) => {
          const [lng, lat] = leaf.geometry.coordinates;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        });

        if (leaves.length === 1) {
          map.easeTo({ center: [minLng, minLat], zoom: 14, duration });
        } else {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 90, duration, maxZoom: 15 });
        }
      });
    });
    map.on("mouseenter", CLUSTER_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", CLUSTER_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = ""; });
  }

  function wireMarkerClicks(map) {
    TIERS.map((tier) => tier.symbolLayer).forEach((layerId) => {
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
    // `geojson` is a snapshot captured by the caller (activateGlobeMode())
    // at init() call time. mount() itself only runs after style.load AND
    // addClubIcons() resolve — both async — so if the club data (data/
    // club_map_data.json) finishes loading during that gap, the snapshot
    // above goes stale AND the onUpdate listener below isn't registered
    // yet to catch that update's notification, silently dropping it
    // forever (confirmed live: the map source got stuck at its initial
    // ~1-feature bootstrap state while window.GLOBE_DATA already had all
    // 119). Fix: re-read GLOBE_DATA.toGeoJSON() fresh right here, at the
    // moment mount() actually executes, instead of trusting the
    // possibly-stale argument — closes the race regardless of which
    // async operation (style load, icon load, or the data fetch) finishes
    // last.
    const mount = () => {
      const freshGeojson = root.GLOBE_DATA ? root.GLOBE_DATA.toGeoJSON() : geojson;
      addSourceAndLayers(map, freshGeojson);
      wireHoverAndSelection(map);
      wireClusterClicks(map);
      wireMarkerClicks(map);
      if (root.GLOBE_DATA) root.GLOBE_DATA.onUpdate(updateSource);
    };
    if (map.isStyleLoaded()) {
      addClubIcons(map).then(mount);
    } else {
      map.once("style.load", () => { addClubIcons(map).then(mount); });
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
