/* ═══════════════════════════════════════════════════════════
   PORTFOLIO CONFIG — isolated endpoint reference
   ---------------------------------------------------------
   Per the approved Phase 2/3 security decision: preserve the existing
   Power Automate endpoint's behavior for this phase, but isolate it in
   ONE file rather than letting the signed URL get copy-pasted into
   render-portfolio.js or anywhere else.

   PRODUCTION HARDENING STILL REQUIRED (not done here, per that same
   decision — do not rotate/replace this URL without approval):
     - This URL is a signed Power Automate invoke endpoint sitting in
       plain client-side code, publicly readable by anyone who loads
       the dashboard.
     - Before production use, move this behind a server-side proxy or
       otherwise keep the signed URL out of shipped client code.
═══════════════════════════════════════════════════════════ */
window.PORTFOLIO_CONFIG = {
  DATA_URL: "https://default3016677c32d54346ba5e7dd46f6662.60.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/4bbf0259c9da4dce95d4358489cad7ee/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=vmIihrkhagLWJ2yAFwDGdqm74d5RgPATjWqXlinZwwc",
};
