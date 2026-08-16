/**
 * myUCF Frontend Overhaul — page-context hook (Phase 2, opt-in)
 *
 * Runs in the PAGE's main world (not the isolated content-script world),
 * injected by content.js via a <script> tag. This lets us observe the same
 * fetch/XHR responses PeopleSoft's own JavaScript already receives — without
 * re-issuing requests, scraping anything server-side, or touching auth.
 *
 * Captured payloads are forwarded to the content script via same-origin
 * window.postMessage. Nothing is persisted, nothing leaves the tab.
 *
 * Schema-drift guard: every emitted message carries a HOOK_VERSION. The
 * content script ignores versions it doesn't understand, and every parser
 * on the receiving side validates the version before touching the DOM.
 */
(() => {
  "use strict";

  // Injection marker — lets DevTools/tests confirm the hook loaded into the
  // page's main world. Harmless boolean, never read by any network path.
  window.__myucfPageHook = true;

  const SOURCE = "myucf-overhaul";
  const HOOK_VERSION = 1;

  // Best-effort endpoint signatures. PeopleSoft Fluid URL strings differ per
  // institution and PeopleTools version — these substrings are GUESSES that
  // will drift. Capture real URLs in DevTools → Network and extend this list.
  const ENDPOINT_SIGNATURES = [
    { type: "grades",       match: /(SSR_SSENRL_GRADE|GRADES|GRADEBOOK|SS_GRADES|TERM_GPA|ACADEMIC_HISTORY)/i },
    { type: "schedule",     match: /(WEEKLY_SCHEDULE|SS_TERM_DETAIL|ENROLLMENT|CLASS_SCHEDULE|SSR_SSENRL_LIST|ACADEMICS)/i },
    { type: "financialAid", match: /(FINANCIAL_AID|SSR_SSFANL|AWARD|AID_YEAR|FAN_|FINAID)/i },
  ];

  // Ignore payloads larger than this (page blobs, huge grids) before work.
  const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

  function emit(type, url, payload) {
    try {
      window.postMessage(
        { source: SOURCE, version: HOOK_VERSION, type, url, payload },
        window.location.origin
      );
    } catch (_) {
      // Non-cloneable payload — ignore silently.
    }
  }

  function inspect(url, data) {
    if (!data || typeof data !== "object") return;

    // Size guard.
    try {
      if (JSON.stringify(data).length > MAX_PAYLOAD_BYTES) return;
    } catch (_) { return; }

    for (const sig of ENDPOINT_SIGNATURES) {
      if (sig.match.test(url)) {
        emit(sig.type, url, data);
        return;
      }
    }

    // No URL match. Deep key-scanning is a possible fallback but is
    // intentionally disabled — it's expensive and prone to false positives.
    // deepScan(url, data);
  }

  // --- fetch hook ---
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = async function (...args) {
      const result = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        const ct = (result.headers && result.headers.get && result.headers.get("content-type")) || "";
        if (/\bjson\b/i.test(ct)) {
          result.clone().json().then((data) => inspect(url, data)).catch(() => {});
        }
      } catch (_) {}
      return result;
    };
  }

  // --- XHR hook ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__myucfUrl = url; } catch (_) {}
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try {
      this.addEventListener("load", () => {
        try {
          const ct = this.getResponseHeader("content-type") || "";
          if (/\bjson\b/i.test(ct)) {
            inspect(this.__myucfUrl || "", JSON.parse(this.responseText));
          }
        } catch (_) {}
      });
    } catch (_) {}
    return origSend.apply(this, arguments);
  };

  // Tab activation from the sidebar: the content script (isolated world) cannot
  // click PeopleSoft's `javascript:` links — the extension CSP blocks javascript:
  // navigations. Do the click here, in the page's own context.
  // PeopleSoft nav links use a "newwin" portal token (e.g. /psc/CSPROD_newwin/).
  // Resolve it to the current portal so the navigation stays in this session.
  function normalizePsUrl(url) {
    const cur = (location.pathname.match(/\/psc\/([^/]+)/) || [])[1] || "";
    if (cur && /\/psc\/[^/]*newwin[^/]*\//i.test(url)) {
      return url.replace(/\/psc\/[^/]+/, "/psc/" + cur);
    }
    return url;
  }

  function findAndClickTab(component, label) {
    let row = null;
    let foundVia = "none";
    if (component) {
      row = document.querySelector(".psa_tab_" + component);
      if (row) foundVia = "component";
    }
    if (!row && label) {
      const links = document.querySelectorAll(".psa_vtab a.ps-link, .psa_vsubtab a.ps-link");
      for (const a of links) {
        const t = a.querySelector(".ps-text");
        if (t && t.textContent.replace(/\s+/g, " ").trim() === label) { row = a; foundVia = "label"; break; }
      }
    }

    // The real target URL lives in an ancestor's onclick:
    //   onclick="javascript:LaunchURL(null,'https://…/COMPONENT.PAGE.GBL?…')"
    // The inner <a href="javascript:void(0)"> is decoration. Walk up to the
    // element that carries the onclick and navigate via LaunchURL (exactly
    // what a real click does), avoiding synthetic-click/isTrusted issues.
    let ocEl = row;
    while (ocEl && !(ocEl.getAttribute && ocEl.getAttribute("onclick"))) ocEl = ocEl.parentElement;

    const result = {
      ok: false, reason: "not found",
      component: component || "", label: label || "",
      tag: "", url: "", foundVia: foundVia, linkCount: 0,
    };

    if (ocEl) {
      const oc = ocEl.getAttribute("onclick") || "";
      const m = oc.match(/['"](https?:\/\/[^'"]+)['"]/);
      result.tag = ocEl.tagName;
      if (m) {
        result.url = m[1];
        try {
          const nav = normalizePsUrl(m[1]);
          result.url = nav;
          window.location.href = nav;
          result.reason = "location.href navigate";
          result.ok = true;
        } catch (e) {
          result.reason = "error: " + (e && e.message ? e.message : e);
        }
      } else {
        result.reason = "no URL in onclick: " + oc.slice(0, 120);
      }
    } else {
      result.reason = "no onclick ancestor";
      try {
        result.linkCount = document.querySelectorAll(".psa_vtab a.ps-link, .psa_vsubtab a.ps-link").length;
      } catch (_) {}
    }

    try {
      window.postMessage(
        { source: SOURCE, action: "tabActivationResult",
          ok: result.ok, reason: result.reason,
          component: result.component, label: result.label,
          tag: result.tag, url: result.url,
          foundVia: result.foundVia, linkCount: result.linkCount },
        window.location.origin
      );
    } catch (_) {}
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== SOURCE) return;
    if (msg.action === "activateTab") findAndClickTab(msg.component, msg.label);
  });

  // Signal readiness to the content script. It runs in the isolated world and
  // cannot read the main-world `window.__myucfPageHook`, but it can read the DOM.
  document.documentElement.setAttribute("data-myucf-pagehook", "1");
})();
