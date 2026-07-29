/* ═══════════════════════════════════════════════════════════
   GLOBE RENDERER — Mapbox GL JS map lifecycle only
   ---------------------------------------------------------
   Owns exactly one thing: the mapboxgl.Map instance and its globe
   projection / fog / auto-rotation / resize behavior. Nothing in
   this file knows about club data, markers, clustering, or popups —
   see globe-markers.js, globe-camera.js, globe-popups.js.

   UNVERIFIED WITHOUT A LIVE TOKEN: everything below is written
   against the documented Mapbox GL JS v3 API but has not been
   exercised in a real browser against a real style/token yet (see
   js/globe-config.js — ACCESS_TOKEN is null until supplied). The
   WebGL-support / init-failure path IS exercised today, because it
   fires unconditionally whenever globe mode is even attempted.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  let _map = null;
  let _rotating = false;
  let _rotateFrame = null;
  let _lastFrameTime = null;
  let _userInteracted = false;

  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function renderFallbackNotice(container, message) {
    // Only ever shown if activateGlobeMode() somehow left #globe-map
    // visible after a thrown init error, which it does not do today
    // (it returns before flipping visibility) — kept as defense in
    // depth, not part of the normal fallback path (that path is
    // simply "the Leaflet #map stays visible," handled entirely in
    // render-portfolio.js).
    container.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;' +
      'background:#0b0e14;color:#8892a4;font:13px \'Space Grotesk\',sans-serif;text-align:center;padding:24px;">' +
      String(message).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) +
      "</div>";
  }

  function stopRotation() {
    _rotating = false;
    if (_rotateFrame) {
      cancelAnimationFrame(_rotateFrame);
      _rotateFrame = null;
    }
  }

  function startRotation() {
    if (prefersReducedMotion() || _userInteracted || !_map) return;
    _rotating = true;
    _lastFrameTime = null;
    const degPerSec = root.GLOBE_CONFIG.AUTO_ROTATE_DEG_PER_SEC || 1.2;

    function step(ts) {
      if (!_rotating) return;
      if (_lastFrameTime == null) _lastFrameTime = ts;
      const dt = (ts - _lastFrameTime) / 1000;
      _lastFrameTime = ts;
      const center = _map.getCenter();
      _map.setCenter([center.lng + degPerSec * dt, center.lat]);
      _rotateFrame = requestAnimationFrame(step);
    }
    _rotateFrame = requestAnimationFrame(step);
  }

  function pauseOnInteraction() {
    // Spec: "pause rotation immediately on user interaction... do not
    // restart unless the user resets the globe." So this is a one-way
    // latch — only GLOBE_RENDERER.reset() clears _userInteracted.
    const events = ["mousedown", "wheel", "touchstart", "dragstart"];
    events.forEach((evt) => _map.on(evt, pauseRotation));
  }

  // Also called from globe-camera.js's filterMacro/flyToRegion/flyToClub —
  // confirmed live that without this, the rotation loop's per-frame
  // setCenter() fought and silently overrode every fitBounds()/flyTo()
  // camera move (rotation always won because it runs every animation
  // frame). Programmatic navigation counts as "interaction" for the
  // pause latch the same as a mouse drag does.
  function pauseRotation() {
    if (!_userInteracted) {
      _userInteracted = true;
      stopRotation();
    }
  }

  function init(containerId, opts) {
    opts = opts || {};
    if (_map) return _map; // idempotent — activateGlobeMode() only calls this once, but don't double-init if it ever doesn't

    if (typeof root.mapboxgl === "undefined") {
      throw new Error("Mapbox GL JS did not load (check js/data.js PIPELINE_SCRIPTS and network access to api.mapbox.com).");
    }
    if (typeof root.mapboxgl.supported === "function" && !root.mapboxgl.supported()) {
      throw new Error("WebGL is not supported in this browser — globe cannot render.");
    }
    if (!root.GLOBE_CONFIG || !root.GLOBE_CONFIG.isConfigured()) {
      throw new Error("GLOBE_CONFIG.ACCESS_TOKEN is not set — refusing to construct a mapboxgl.Map without one.");
    }

    const container = document.getElementById(containerId);
    if (!container) throw new Error(`#${containerId} not found in the DOM.`);

    root.mapboxgl.accessToken = root.GLOBE_CONFIG.ACCESS_TOKEN;

    _map = new root.mapboxgl.Map({
      container: containerId,
      style: root.GLOBE_CONFIG.STYLE_URL,
      projection: "globe",
      // Center roughly over North America per spec ("position North
      // America prominently" on initial view), full globe visible.
      center: opts.center || [-98, 39],
      zoom: opts.zoom != null ? opts.zoom : 2.1,
      pitch: 0,
      attributionControl: { compact: true }, // restyled via css/globe.css, never removed — Mapbox ToS requires attribution
      antialias: true,
      cooperativeGestures: false,
      respectPrefersReducedMotion: true, // Mapbox GL JS native support: disables its own internal animation easing
    });

    _map.on("style.load", () => {
      _map.setFog(root.GLOBE_CONFIG.FOG);
    });

    _map.on("load", () => {
      if (!prefersReducedMotion()) startRotation();
    });

    pauseOnInteraction();

    return _map;
  }

  function getMap() {
    return _map;
  }

  function resize() {
    if (_map) _map.resize();
  }

  function reset(defaultView) {
    _userInteracted = false;
    if (_map) {
      _map.easeTo(Object.assign({
        center: [-98, 39],
        zoom: 2.1,
        pitch: 0,
        bearing: 0,
        duration: prefersReducedMotion() ? 0 : 1200,
      }, defaultView || {}));
    }
    startRotation();
  }

  function destroy() {
    stopRotation();
    if (_map) {
      _map.remove();
      _map = null;
    }
  }

  root.GLOBE_RENDERER = {
    init,
    getMap,
    resize,
    reset,
    destroy,
    prefersReducedMotion,
    pauseRotation,
    _renderFallbackNotice: renderFallbackNotice, // exposed for globe-markers.js's own error paths, not called from here
  };
})(window);
