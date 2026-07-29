/* ═══════════════════════════════════════════════════════════
   GLOBE CONFIG — isolated Mapbox credential + style reference
   ---------------------------------------------------------
   Mirrors the isolation pattern already established in
   js/portfolio-config.js for the Power Automate DATA_URL: one
   file, nothing else references Mapbox credentials directly.

   STATUS: PENDING — no token has been supplied yet. ACCESS_TOKEN
   is intentionally left null (never a fake/placeholder string).
   Every consumer of this module MUST call GLOBE_CONFIG.isConfigured()
   before attempting to use Mapbox GL JS; when it returns false, the
   globe renderer must not attempt to construct a mapboxgl.Map and
   the dashboard falls back to the existing, fully-working Leaflet
   Club Portfolio map (see js/render-portfolio.js) instead. That
   fallback is not a stub — it is the current production map, so
   the tab stays 100% functional with or without a token.

   WHERE TO PUT THE REAL TOKEN (when supplied):
     Set ACCESS_TOKEN below to a Mapbox PUBLIC token (starts "pk.").
     Never put a secret token ("sk.") here — this file ships to
     every browser that loads the dashboard, same exposure profile
     as portfolio-config.js's DATA_URL. A public token is *designed*
     to be used client-side; Mapbox's own security model for public
     tokens is URL/referrer restriction, configured on mapbox.com
     (Account → Tokens → your token → "URL restrictions"), not
     secrecy. Recommended before shipping this to real users:
       - Restrict the token to this dashboard's actual deploy
         origin(s) (e.g. the GitHub Pages URL once configured).
       - Do not reuse a token that also has secret/admin scopes.
       - Set a monthly map-load budget alert in the Mapbox account
         if one isn't already configured.
   ═══════════════════════════════════════════════════════════ */
window.GLOBE_CONFIG = {
  // Public Mapbox token (pk.*) — supplied 2026-07-29 for live validation
  // on feature/high-fidelity-globe. Public tokens are designed for
  // client-side exposure (see this file's header note); the security
  // model is URL restriction on mapbox.com, not secrecy.
  ACCESS_TOKEN: "pk.eyJ1IjoiY2FyYW5hIiwiYSI6ImNtczZhMTZ0MjA1YjkzMXEzNmVuMGlwZTgifQ.THNpaOmDMvRHNojeB1pNbA",

  // Satellite-imagery style with label/road detail retained, matching
  // the "high-resolution satellite... realistic land and oceans...
  // no cartoon styling" visual requirement. Swappable later without
  // touching any other globe-*.js file.
  STYLE_URL: "mapbox://styles/mapbox/satellite-streets-v12",

  // Globe visual system — see globe-renderer.js for where these are
  // applied via map.setFog(). Kept here so the "deep black / thin
  // atmosphere / no neon / no bloom" tuning lives in one place.
  FOG: {
    range: [0.8, 8],
    color: "#0b0e14",
    "high-color": "#1b2a4a",
    "horizon-blend": 0.03,
    "space-color": "#000000",
    "star-intensity": 0.35,
  },

  // Slow, controlled auto-rotation of the idle globe, per spec
  // ("slow, controlled auto-rotation... pause immediately on user
  // interaction... do not restart unless the user resets the globe").
  AUTO_ROTATE_DEG_PER_SEC: 1.2,

  isConfigured() {
    return typeof this.ACCESS_TOKEN === "string" && this.ACCESS_TOKEN.trim().length > 0;
  },
};
