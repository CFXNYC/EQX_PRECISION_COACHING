/* ═══════════════════════════════════════════════════════════
   APP SHELL — nav, routing, init
   ---------------------------------------------------------
   This is the LAST script in the pipeline (see js/data.js for the
   full load-order rationale). By the time this file executes, the
   document has been parsed for a while and DOMContentLoaded has
   already fired — so init() runs immediately at the bottom of this
   file rather than waiting on that event.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  function hydrateTopbar() {
    const D = window.PRECISION_DATA;
    document.getElementById("topbar-coach-count").textContent = `${D.coaches.length} coaches`;
    document.getElementById("topbar-club-count").textContent = `${D.clubs.length} pilot clubs`;
    document.getElementById("topbar-asof").textContent = D.meta.as_of_date || "Not available";
    const loadedEl = document.getElementById("topbar-loaded");
    if (loadedEl) loadedEl.textContent = new Date(D.meta.loaded_at).toLocaleString();
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById("view-" + name);
    if (target) target.classList.add("active");
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    window.scrollTo(0, 0);
  }

  function showCoach(coachId) {
    window.PAGE_COACH.select(coachId);
    showView("coach");
  }

  function init() {
    hydrateTopbar();
    window.PAGE_OVERVIEW.render();
    window.PAGE_GROWTH.render();
    window.PAGE_BEHAVIOR.render();
    window.PAGE_COACH.render();
    showView("overview");
    if (window.PRECISION_HIDE_LOADING) window.PRECISION_HIDE_LOADING();
  }

  window.App = { init, showView, showCoach };
  init();
})();
