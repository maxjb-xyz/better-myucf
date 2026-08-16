/**
 * myUCF — capture utilities (pure functions, no DOM/browser deps beyond an
 * optional URL base). Shared by content.js and the test harness so the
 * redaction logic can be verified independently of a live page.
 *
 * Exposed as `self.MYUCF.redact` / `self.MYUCF.scrubHref` in the browser, and
 * via CommonJS `module.exports` under Node (for the test suite).
 */
(function (root) {
  "use strict";

  /**
   * Replace personal-data patterns with labelled placeholders. Regex-based, so
   * it cannot detect bare names — pass those explicitly via `extraTerms`.
   */
  function redact(text, extraTerms) {
    if (typeof text !== "string") return text;
    let s = text;
    for (const t of (extraTerms || [])) {
      if (t) s = s.split(t).join("[redacted]");
    }
    return s
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]")
      .replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]\d{4}\b/g, "[phone]")
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "[date]")
      .replace(/\$\s?\d[\d,]*\.?\d*/g, "[amount]")
      .replace(/\b\d{7,}\b/g, "[id]")
      .replace(/\b\d{1,3}\.\d{2,3}\b/g, "[gpa]");
  }

  /**
   * De-identify a URL: drop query strings (where PeopleSoft puts identifiers
   * like EMPLID) and the fragment, keeping only origin + path.
   */
  function scrubHref(href, base) {
    if (!href) return "";
    if (/^javascript:/i.test(href)) return "javascript:\u2026";
    try {
      const b = base || (typeof document !== "undefined" ? document.baseURI : "https://csprod-ss.net.ucf.edu/");
      const u = new URL(href, b);
      u.search = "";
      u.hash = "";
      return u.href;
    } catch (_) { return ""; }
  }

  const API = { redact, scrubHref };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.MYUCF = Object.assign({}, root.MYUCF, API);
})(typeof self !== "undefined" ? self : globalThis);
