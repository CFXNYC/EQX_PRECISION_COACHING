/* ═══════════════════════════════════════════════════════════
   GLOBE POPUPS — club info popup content, opened only after the
   camera finishes moving (see globe-camera.js's flyToClub)
   ---------------------------------------------------------
   Content is the same information the existing Leaflet popup shows
   (js/render-portfolio.js's flyToClub/marker-click popup templates):
   club name + id, region, hub badge, distance to hub, coach-tier
   counts (Coach / Coach+ / Coach X, using the existing CoachX icon
   constants — not redrawn, not duplicated as a second asset, read
   via window.PORTFOLIO_DATA.COACH_X_ICON[_WHITE]), and educator
   count. Intentionally the same fields, same order, same wording —
   this upgrade changes the renderer, not the information shown.

   UNVERIFIED WITHOUT A LIVE TOKEN — see globe-renderer.js's header.
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  let _popup = null;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  }

  function haversineMiles([lat1, lng1], [lat2, lng2]) {
    const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function buildClubPopupHTML(clubName) {
    const pd = window.PORTFOLIO_DATA;
    const cd = (pd.getClubDataIndex()[clubName]) || {};
    const found = root.GLOBE_DATA.findClubRegion(clubName);
    const region = found ? found.region : null;
    const isHub = found ? found.isHub : false;
    const isDark = pd.getIsDark();

    let distToHubLine = "";
    if (region && !isHub && region.hub) {
      const hubCoords = root.GLOBE_DATA.getCoords(region.hub);
      const clubCoords = root.GLOBE_DATA.getCoords(clubName);
      if (hubCoords && clubCoords) {
        const mi = haversineMiles(clubCoords, hubCoords).toFixed(1);
        distToHubLine = `<div class="popup-meta" style="margin-top:6px">Distance to <strong>${escapeHtml(region.hub)}</strong>: <strong>${mi} mi</strong></div>`;
      }
    }

    const hasCoachData = cd.total_coaches || cd.coach || cd.coach_plus || cd.coach_x;
    const coachXIcon = isDark ? pd.COACH_X_ICON_WHITE : pd.COACH_X_ICON;

    return `<div class="popup-inner" style="padding:10px 14px">
      <div class="popup-club" style="font-size:12px">${escapeHtml(clubName)}${cd.club_id ? `<span style="font-weight:400;opacity:0.45;font-size:10px"> | ${escapeHtml(cd.club_id)}</span>` : ""}</div>
      ${region ? `<div class="popup-region">${escapeHtml(region.name.replace(/^.*? - /, ""))}</div>` : ""}
      ${(cd.coach_x > 0 || cd.educator_count > 0) ? `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0">${cd.coach_x > 0 ? `<img src="${coachXIcon}" style="height:13px;opacity:0.85">` : ""}${cd.educator_count > 0 ? `<span style="font-size:13px;line-height:1">\u{1F9E0}</span>` : ""}</div>` : ""}
      ${isHub ? '<div class="popup-hub-badge">Hub Club</div>' : ""}
      ${distToHubLine}
      ${hasCoachData ? `<div class="popup-meta" style="margin-top:6px">Coach: <strong>${cd.coach || 0}</strong> &middot; Coach<sup>+</sup>: <strong>${cd.coach_plus || 0}</strong> &middot; COACH<img src="${coachXIcon}" style="height:11px;vertical-align:text-bottom;margin:0 0 0 2px;">:<strong>${cd.coach_x || 0}</strong><br/>Total Coaches: <strong>${cd.total_coaches || 0}</strong></div>` : ""}
      ${(cd.educator_count > 0) ? `<div class="popup-meta" style="margin-top:4px">Educators: <strong>${cd.educator_count}</strong> \u{1F9E0}</div>` : ""}
    </div>`;
  }

  function openForClub(map, clubName, lngLat) {
    if (!root.mapboxgl) return;
    if (_popup) _popup.remove();
    _popup = new root.mapboxgl.Popup({ maxWidth: "280px", closeButton: true, offset: 14 })
      .setLngLat(lngLat)
      .setHTML(buildClubPopupHTML(clubName))
      .addTo(map);
  }

  root.GLOBE_POPUPS = { openForClub, buildClubPopupHTML };
})(window);
