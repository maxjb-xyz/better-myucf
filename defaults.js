/**
 * myUCF Frontend Overhaul — shared settings schema.
 *
 * Loaded by BOTH content.js (isolated world) and popup.js (extension page)
 * so the two can never drift apart. Single source of truth for defaults,
 * accents, and densities. Exposed on `self.MYUCF`.
 */
(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,          // master switch
    accent: "gold",         // "gold" | "blue" | "green" | "purple"
    density: "cozy",        // "compact" | "cozy" | "spacious"
    phase2Enabled: true,    // data-layer restructuring (default on)
    debug: false,           // console logging
    captureText: false,     // capture: include (redacted) text content
    redactTerms: "",        // capture: extra comma-separated terms to redact
  });

  const ACCENTS = ["gold", "blue", "green", "purple"];
  const DENSITIES = ["compact", "cozy", "spacious"];

  self.MYUCF = Object.assign({}, self.MYUCF, { DEFAULTS, ACCENTS, DENSITIES });
})();
