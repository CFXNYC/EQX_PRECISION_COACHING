/* ═══════════════════════════════════════════════════════════
   GLOBE POPUPS — club info popup content, opened only after the
   camera finishes moving (see globe-camera.js's flyToClub)
   ---------------------------------------------------------
   buildClubPopupHTML() is the SINGLE shared template for every club
   popup in the app — the Leaflet map's two popup call sites
   (js/render-portfolio.js's marker-click handler and flyToClub())
   call this same function instead of hand-rolling their own HTML,
   so a club's popup is structurally identical (width, padding,
   spacing, typography, badge, close button) no matter which
   renderer or which entry point opened it. Only content presence
   varies (region, hub badge, distance-to-hub, coach counts,
   educator count, plus an optional cluster-size/radius line the
   Leaflet marker-click path passes via `extra` — see opts below),
   never the structure. This was consolidated from three near-
   duplicate templates (each with its own slightly different inline
   padding/font-size/margins) into one, per the UI consistency pass.

   UNVERIFIED WITHOUT A LIVE TOKEN — see globe-renderer.js's header.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  let _popup = null;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  }

  // Meters (GLOBE_DATA.haversineM — the same formula render-portfolio.js's
  // Leaflet map uses) converted to miles here, rather than a second
  // haversine implementation living in this file.
  function haversineMiles(a, b) {
    return root.GLOBE_DATA.haversineM(a, b) / 1609.34;
  }

  // extra: optional { clusterClubCount, clusterRadiusMi } — only the
  // Leaflet marker-click path (which has a resolved region-cluster in
  // scope already) passes this; every other call site omits it and the
  // line simply doesn't render, rather than existing as a second template.
  function buildClubPopupHTML(clubName, extra) {
    extra = extra || {};
    const pd = window.PORTFOLIO_DATA;
    const cd = (pd.getClubDataIndex()[clubName]) || {};
    const found = root.GLOBE_DATA.findClubRegion(clubName);
    const region = found ? found.region : null;
    const isHub = found ? found.isHub : false;
    const isDark = pd.getIsDark();
    const coachXIcon = isDark ? pd.COACH_X_ICON_WHITE : pd.COACH_X_ICON;

    let distToHubMi = null;
    if (region && !isHub && region.hub) {
      const hubCoords = root.GLOBE_DATA.getCoords(region.hub);
      const clubCoords = root.GLOBE_DATA.getCoords(clubName);
      if (hubCoords && clubCoords) distToHubMi = haversineMiles(clubCoords, hubCoords).toFixed(1);
    }

    const hasCoachData = !!(cd.total_coaches || cd.coach || cd.coach_plus || cd.coach_x);
    const hasIconRow = cd.coach_x > 0 || cd.educator_count > 0;

    // Status band ALWAYS renders (even with nothing inside) so a club with
    // no coach-X/educator data and no hub status still reserves the same
    // vertical space that a hub badge or icon row would occupy — otherwise
    // a "sparse" club's card collapses shorter and reads as a visually
    // different component instead of the same one with less to show.
    const statusBandInner =
      (hasIconRow ? `<div class="popup-icon-row">${cd.coach_x > 0 ? `<img src="${coachXIcon}" class="popup-coachx-icon">` : ""}${cd.educator_count > 0 ? `<span class="popup-emoji">\u{1F9E0}</span>` : ""}</div>` : "") +
      (isHub ? '<div class="popup-hub-badge">Hub Club</div>' : "");

    // KPI row and total-count row are each their OWN always-rendered row
    // (reserved min-height in CSS), not folded into the same variable-
    // length block as distance-to-hub/cluster/educator context — those
    // context lines render in the trailing .popup-meta block below, so
    // however many of them are present, they can never push the KPI row
    // or the total-count row out of their fixed position. Left blank
    // (never a "0" or placeholder) when a club has no coach record at
    // all, per spec — a blank reserved row, not fabricated data.
    const kpiRowHtml = hasCoachData
      ? `Coach: <strong>${cd.coach || 0}</strong> &middot; Coach<sup>+</sup>: <strong>${cd.coach_plus || 0}</strong> &middot; COACH<img src="${coachXIcon}" class="popup-coachx-inline">:<strong>${cd.coach_x || 0}</strong>`
      : "";
    const totalRowHtml = hasCoachData ? `Total Coaches: <strong>${cd.total_coaches || 0}</strong>` : "";

    // Trailing, genuinely variable context — length differs club to club,
    // but it only ever affects the card's total height, never the
    // position of anything above it (title/region/band/KPI/total are all
    // already fixed by the time this renders).
    const extraLines = [];
    if (extra.clusterClubCount != null) extraLines.push(`Cluster: <strong>${extra.clusterClubCount} clubs</strong>`);
    if (extra.clusterRadiusMi != null) extraLines.push(`Cluster radius: <strong>${extra.clusterRadiusMi} mi</strong>`);
    if (distToHubMi != null) extraLines.push(`Distance to <strong>${escapeHtml(region.hub)}</strong>: <strong>${distToHubMi} mi</strong>`);
    if (cd.educator) extraLines.push(`Educator: <strong>${escapeHtml(cd.educator)}</strong>${cd.job_title ? ` &mdash; ${escapeHtml(cd.job_title)}` : ""}`);
    if (cd.educator_count > 0) extraLines.push(`Educators: <strong>${cd.educator_count}</strong> \u{1F9E0}`);

    return `<div class="popup-inner">
      <div class="popup-club">${escapeHtml(clubName)}${cd.club_id ? `<span class="popup-club-id"> | ${escapeHtml(cd.club_id)}</span>` : ""}</div>
      <div class="popup-region">${region ? escapeHtml(region.name.replace(/^.*? - /, "")) : ""}</div>
      <div class="popup-status-band">${statusBandInner}</div>
      <div class="popup-kpi-row">${kpiRowHtml}</div>
      <div class="popup-total-row">${totalRowHtml}</div>
      ${extraLines.length ? `<div class="popup-meta">${extraLines.join("<br/>")}</div>` : ""}
    </div>`;
  }

  // Standardized bounds shared with the Leaflet popups (js/render-portfolio.js) —
  // one maxWidth/minWidth pair everywhere instead of three different values.
  const POPUP_MAX_WIDTH = "280px";

  function openForClub(map, clubName, lngLat) {
    if (!root.mapboxgl) return;
    if (_popup) _popup.remove();
    _popup = new root.mapboxgl.Popup({ maxWidth: POPUP_MAX_WIDTH, closeButton: true, offset: 14 })
      .setLngLat(lngLat)
      .setHTML(buildClubPopupHTML(clubName))
      .addTo(map);
  }

  root.GLOBE_POPUPS = { openForClub, buildClubPopupHTML };
})(window);
