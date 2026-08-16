/**
 * myUCF Frontend Overhaul — content script (all my.ucf.edu frames)
 *
 * Phase 1 (default): cosmetic only — applies themed CSS via root classes and
 * data attributes, and attaches a MutationObserver so restyles survive Fluid's
 * SPA re-renders. Phase 2 (opt-in): injects the page-context hook and renders
 * custom UI from PeopleSoft's own JSON payloads.
 *
 * Settings are read from chrome.storage.sync (managed by the popup) and
 * applied live via chrome.storage.onChanged — no reload needed.
 *
 * Design rules:
 *  - Fail silently: every call is wrapped; an exception can never break the
 *    page or the rest of the extension.
 *  - Feature-detect before restyling: classes are added only after PeopleSoft
 *    markup is recognized.
 *  - Defensive against Fluid re-renders via a MutationObserver.
 */
(() => {
  "use strict";

  const DEFAULTS = (self.MYUCF && self.MYUCF.DEFAULTS) || { enabled: true };
  const redact = (self.MYUCF && self.MYUCF.redact) || ((t) => t);
  const scrubHref = (self.MYUCF && self.MYUCF.scrubHref) || ((h) => (h || ""));

  const LOG_PREFIX = "[myUCF]";
  let current = { ...DEFAULTS };
  let detected = false;
  let detecting = false;
  let detectionObserver = null;

  const log = (...a) => { if (current.debug) console.log(LOG_PREFIX, ...a); };
  const warn = (...a) => { if (current.debug) console.warn(LOG_PREFIX, ...a); };
  const safe = (fn, fb) => { try { return fn(); } catch (e) { warn("error:", e); return fb; } };

  // ======================= FEATURE DETECTION =========================
  const PEOPLESOFT_MARKERS = [
    '[class*="ps_"]',
    '[id*="win0"]',
    '[id*="ptifrm"]',
    'form[name="win0"]',
  ];

  function detectPeopleSoft() {
    return PEOPLESOFT_MARKERS.some((sel) => {
      try { return !!document.querySelector(sel); } catch (_) { return false; }
    });
  }

  const isTopFrame = (() => {
    try { return window.self === window.top; } catch (_) { return false; }
  })();

  // ==================== SETTINGS APPLICATION =========================
  function applySettings(s) {
    current = { ...DEFAULTS, ...s };
    if (!detected) return;
    const root = document.documentElement;
    if (!root) return;
    const on = !!current.enabled;

    root.classList.toggle("myucf-overhaul", on);

    if (on) {
      root.dataset.accent = current.accent;
      root.dataset.density = current.density;
    } else {
      delete root.dataset.accent;
      delete root.dataset.density;
    }
  }

  // ==================== DETECTION / BOOT =============================
  function observeForPeopleSoft(onDetected) {
    if (detected || detecting) return;
    if (detectPeopleSoft()) {
      detected = true;
      onDetected();
      return;
    }
    if (!document.documentElement) return;
    detecting = true;
    detectionObserver = new MutationObserver(() => {
      if (detectPeopleSoft()) {
        safe(() => detectionObserver.disconnect());
        detecting = false;
        detected = true;
        onDetected();
      }
    });
    safe(() => detectionObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    }));
  }

  function onDetected() {
    applySettings(current);
    observeDom();
    injectSidebar();
    injectDashboardHeader();
    if (isTopFrame) {
      injectPageHook();
      installPhase2();
    }
    applyPendingTab();
    probeDom();
    log("installed (phase2:", current.phase2Enabled, ")");
  }

  function loadAndInit() {
    chrome.storage.sync.get(DEFAULTS, (settings) => {
      if (chrome.runtime.lastError) {
        warn("storage read failed:", chrome.runtime.lastError);
        settings = { ...DEFAULTS };
      }
      current = { ...DEFAULTS, ...(settings || {}) };
      if (!current.enabled) { log("disabled — idle"); return; }
      observeForPeopleSoft(onDetected);
    });
  }

  // Live settings updates from the popup.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const next = { ...current };
    for (const k in changes) next[k] = changes[k].newValue;
    safe(() => applySettings(next));

    if (current.enabled && !detected) observeForPeopleSoft(onDetected);
    if (current.enabled && detected && current.phase2Enabled && isTopFrame) installPhase2();
  });

  // ================== MUTATION OBSERVER (Fluid SPA) ==================
  let pending = false;
  function observeDom() {
    if (window.__myucfObserver) return;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; safe(onDomChanged); });
    });
    safe(() => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "aria-hidden", "hidden"],
      });
      window.__myucfObserver = observer;
      log("mutation observer attached");
    });
  }

  function onDomChanged() {
    if (current.enabled) {
      // Re-inject the sidebar/dashboard if Fluid wiped them on a re-render.
      if (!document.getElementById("myucf-sidebar")) safe(injectSidebar);
      if (!document.getElementById("myucf-dashboard-header")) safe(injectDashboardHeader);
      safe(refreshActive);
    }
    if (current.enabled && current.phase2Enabled && isTopFrame) safe(renderCustomUi);
  }

  // ============================ PHASE 2 ==============================
  function installPhase2() {
    if (window.__myucfPhase2Listener) return;
    window.__myucfPhase2Listener = true;
    safe(() => window.addEventListener("message", onPageMessage, false));
    log("phase 2 listener installed");
  }

  function injectPageHook() {
    if (document.getElementById("__myucf_pagehook")) return;
    safe(() => {
      const s = document.createElement("script");
      s.id = "__myucf_pagehook";
      s.src = chrome.runtime.getURL("page-hook.js");
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
      log("page-hook injected");
    });
  }

  function onPageMessage(event) {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== "myucf-overhaul") return;
    if (msg.action === "tabActivationResult") {
      log("tab activation:", msg.ok ? "OK" : "FAILED",
        "| reason:", msg.reason, "| label:", msg.label,
        "| component:", msg.component, "| tag:", msg.tag,
        "| url:", msg.url, "| foundVia:", msg.foundVia, "| linkCount:", msg.linkCount);
      return;
    }
    safe(() => dispatchCapturedData(msg));
  }

  function dispatchCapturedData(msg) {
    if (!current.phase2Enabled) return;
    const handlers = {
      grades: renderGrades,
      schedule: renderSchedule,
      financialAid: renderFinancialAid,
    };
    const handler = handlers[msg.type];
    if (typeof handler !== "function") return; // unknown type → ignore
    log("dispatch:", msg.type, "v" + msg.version);
    safe(() => handler(msg.version, msg.payload, msg.url));
  }

  // Versioned renderer stubs — validate msg.version before touching the DOM,
  // and fall back to Phase 1 styling on any mismatch. Implement against
  // captured live payloads; see README "Phase 2 — capturing the schema".
  function renderGrades(version, payload) { if (version !== 1) return; /* TODO */ }
  function renderSchedule(version, payload) { if (version !== 1) return; /* TODO */ }
  function renderFinancialAid(version, payload) { if (version !== 1) return; /* TODO */ }
  function renderCustomUi() { /* re-mount custom UI after Fluid wipes the DOM */ }

  // Debug-only: dump an inventory of the page's PeopleSoft classes so the
  // theme can be tuned against the real DOM. Enable "Debug logging" in the
  // popup, reload, then copy the console block and send it back.
  function probeDom() {
    if (!current.debug) return;
    const tokens = new Set();
    safe(() => {
      document.querySelectorAll("[class]").forEach((el) => {
        String(el.className).split(/\s+/).forEach((c) => {
          if (c && /^(psc?|nui|nbar|persmode)/i.test(c)) tokens.add(c);
        });
      });
    });
    const report = {
      url: location.href,
      peopleSoftClassTokens: [...tokens].sort(),
      counts: {
        headerBar: document.querySelectorAll(".ps_header_bar").length,
        tileGrid: document.querySelectorAll(".nuitilegrid").length,
        tiles: document.querySelectorAll(".nuitile, .ps_box-grouplet").length,
        navbar: document.querySelectorAll(".nbar").length,
        grids: document.querySelectorAll(".ps_grid-body").length,
        modals: document.querySelectorAll(".ps_mod_wrap, .ps_modal_container").length,
      },
    };
    console.log("[myUCF] DOM inventory:", JSON.stringify(report, null, 2));
  }

  // ================== DASHBOARD + SIDEBAR (rebuild layer) ============
  // Persistent left sidebar + homepage dashboard header. The sidebar is now a
  // hierarchical nav (area → page → sub-page tabs) sourced from nav.js, which
  // mirrors the live PeopleSoft layout: homepage tiles + each component's left
  // vertical tab rail (psa_vtab). Sub-page links route by clicking the matching
  // tab in-place when possible, else navigate to the parent page first.
  // Matching is LABEL-based (see nav.js): UCF-custom tabs carry unstable
  // hashed component IDs, so the visible label is the stable key.
  const NAV = (self.MYUCF && self.MYUCF.NAV) || [];
  const NAV_FOOTER = (self.MYUCF && self.MYUCF.NAV_FOOTER) || [];
  const PENDING_TAB_KEY = "myucf:pendingTab";

  const GITHUB_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  const LINKEDIN_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
  function makeIconLink(href, title, svg) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = title;
    a.innerHTML = svg;
    return a;
  }

  // Find the clickable element for a sub-page tab: by stable component id
  // first, then by visible label (covers UCF hashed tabs).
  function findTab(component, label) {
    try {
      if (component) {
        const li = document.querySelector(".psa_tab_" + component);
        if (li) return li.querySelector("a.ps-link") || li;
      }
      if (label) {
        const links = document.querySelectorAll(".psa_vtab a.ps-link, .psa_vsubtab a.ps-link");
        for (const a of links) {
          const t = a.querySelector(".ps-text");
          if (t && t.textContent.replace(/\s+/g, " ").trim() === label) return a;
        }
      }
    } catch (_) {}
    return null;
  }

  // Route a sub-page click: activate the tab in-place if its rail is already
  // mounted, otherwise navigate to the parent page and re-apply on load.
  // Ask the page context to activate a tab. PeopleSoft's tab links use
  // `javascript:` hrefs, which the extension CSP blocks from the isolated
  // world — the page-hook runs in the page's own context and can click them.
  function pageHookReady() {
    return safe(() => document.documentElement.hasAttribute("data-myucf-pagehook"), false);
  }

  // Post the activateTab message only once page-hook.js has loaded into the
  // page's main world (it sets a DOM marker when ready). page-hook is injected
  // asynchronously, so a naive post right after navigation is lost.
  function requestTabActivation(component, label) {
    let tries = 0;
    const attempt = () => {
      if (!pageHookReady()) {
        if (++tries < 50) { setTimeout(attempt, 100); return; }
        warn("page-hook not ready; tab activation aborted:", label);
        return;
      }
      safe(() => {
        window.postMessage(
          { source: "myucf-overhaul", action: "activateTab", component, label },
          window.location.origin
        );
      });
    };
    attempt();
  }

  function routeToTab(component, label, parentUrl) {
    const tab = findTab(component, label);
    if (tab) { requestTabActivation(component, label); log("tab activation requested:", label); return; }
    safe(() => sessionStorage.setItem(PENDING_TAB_KEY, JSON.stringify({ component, label, url: parentUrl })));
    log("navigating to parent page for tab:", label);
    if (parentUrl) location.href = parentUrl;
  }

  // After a navigation, activate the pending sub-page tab once its rail mounts.
  function applyPendingTab() {
    let raw = null, pending = null;
    try { raw = sessionStorage.getItem(PENDING_TAB_KEY); } catch (_) {}
    if (!raw) return;
    try { pending = JSON.parse(raw); } catch (_) {}
    if (!pending) return;
    let tries = 0;
    const attempt = () => {
      const tab = findTab(pending.component, pending.label);
      if (tab) {
        safe(() => sessionStorage.removeItem(PENDING_TAB_KEY));
        requestTabActivation(pending.component, pending.label);
        log("routed to tab:", pending.label);
        return;
      }
      if (++tries < 40) { setTimeout(attempt, 250); return; }
      warn("pending tab NOT FOUND after retries — label:", pending.label, "| component:", pending.component);
    };
    attempt();
  }

  // Expand the sub-list matching the current page and highlight its page link.
  // Keyed on the page's PeopleSoft component (present in the live URL), so it
  // survives SPA navigation. Pages without a component have no sub-list.
  function markActive() {
    const href = location.href;
    const sidebar = document.getElementById("myucf-sidebar");
    if (!sidebar) return;

    let key = "";
    for (const sec of NAV) {
      for (const page of sec.pages || []) {
        if (page.component && href.includes(page.component)) { key = page.component; break; }
      }
      if (key) break;
    }
    if (!key) return;

    const sub = sidebar.querySelector('.myucf-sb-sub[data-page-key="' + key + '"]');
    if (sub) {
      sub.classList.add("myucf-open");
      const row = sub.previousElementSibling;
      const caret = row && row.querySelector(".myucf-sb-caret");
      if (caret) caret.setAttribute("aria-expanded", "true");
    }
    const pageLink = sidebar.querySelector('.myucf-sb-page[data-page-key="' + key + '"]');
    if (pageLink) pageLink.classList.add("myucf-active");
  }

  // Clear stale highlight and re-apply for the current page — runs on SPA
  // navigation (URL change), not on every DOM mutation, so it never collapses
  // a group the user expanded manually while staying on the same page.
  let lastMarkedUrl = "";
  function refreshActive() {
    if (location.href === lastMarkedUrl) return;
    lastMarkedUrl = location.href;
    const sidebar = document.getElementById("myucf-sidebar");
    if (!sidebar) return;
    sidebar.querySelectorAll(".myucf-active").forEach((el) => el.classList.remove("myucf-active"));
    sidebar.querySelectorAll(".myucf-sb-sub.myucf-open").forEach((el) => {
      el.classList.remove("myucf-open");
      const row = el.previousElementSibling;
      const caret = row && row.querySelector(".myucf-sb-caret");
      if (caret) caret.setAttribute("aria-expanded", "false");
    });
    markActive();
  }

  function injectSidebar() {
    if (!current.enabled || !isTopFrame) return;
    if (document.getElementById("myucf-sidebar")) return;
    const body = document.body;
    if (!body) return;

    const aside = document.createElement("aside");
    aside.id = "myucf-sidebar";
    aside.setAttribute("aria-label", "myUCF navigation");

    const homeUrl = (NAV_FOOTER.find((it) => it.label === "Home") || {}).url || "#";
    const brand = document.createElement("div");
    brand.className = "myucf-sb-brand";

    const brandTop = document.createElement("div");
    brandTop.className = "myucf-sb-brandtop";

    const logo = document.createElement("a");
    logo.className = "myucf-sb-logo";
    logo.href = homeUrl;
    logo.title = "Go to homepage";
    logo.textContent = "myUCF";

    const gh = makeIconLink("https://github.com/maxjb-xyz/better-myucf", "View source on GitHub", GITHUB_SVG);
    gh.className = "myucf-sb-gh";

    const sub = document.createElement("a");
    sub.className = "myucf-sb-sub";
    sub.href = homeUrl;
    sub.textContent = "Student Center";

    brandTop.appendChild(logo);
    brandTop.appendChild(gh);
    brand.appendChild(brandTop);
    brand.appendChild(sub);

    const nav = document.createElement("nav");
    nav.className = "myucf-sb-nav";

    NAV.forEach((sec) => {
      const h = document.createElement("div");
      h.className = "myucf-sb-section";
      h.textContent = sec.section;
      nav.appendChild(h);

      (sec.pages || []).forEach((page) => {
        const pageKey = page.component || "";
        const row = document.createElement("div");
        row.className = "myucf-sb-pagerow";

        const pageLink = document.createElement("a");
        pageLink.className = "myucf-sb-page";
        pageLink.href = page.url || "#";
        pageLink.textContent = page.label;
        if (pageKey) pageLink.dataset.pageKey = pageKey;
        row.appendChild(pageLink);

        const hasTabs = Array.isArray(page.tabs) && page.tabs.length > 0;
        if (hasTabs) {
          const caret = document.createElement("button");
          caret.type = "button";
          caret.className = "myucf-sb-caret";
          caret.setAttribute("aria-expanded", "false");
          caret.setAttribute("aria-label", "Expand " + page.label);
          caret.textContent = "\u25B8";
          row.appendChild(caret);

          const sub = document.createElement("div");
          sub.className = "myucf-sb-sub";
          if (pageKey) sub.dataset.pageKey = pageKey;
          page.tabs.forEach((tab) => {
            const a = document.createElement("a");
            a.className = "myucf-sb-sublink";
            a.href = page.url || "#";
            a.textContent = tab.label;
            a.dataset.tabLabel = tab.label;
            if (tab.component) a.dataset.tabComp = tab.component;
            a.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              routeToTab(tab.component || "", tab.label, page.url);
            });
            sub.appendChild(a);
          });

          caret.addEventListener("click", () => {
            const open = sub.classList.toggle("myucf-open");
            caret.setAttribute("aria-expanded", String(open));
          });

          nav.appendChild(row);
          nav.appendChild(sub);
        } else {
          nav.appendChild(row);
        }
      });
    });

    const footer = document.createElement("div");
    footer.className = "myucf-sb-footer";
    NAV_FOOTER.forEach((it) => {
      const a = document.createElement("a");
      a.className = "myucf-sb-link";
      a.href = it.url;
      a.textContent = it.label;
      footer.appendChild(a);
    });

    const dev = document.createElement("div");
    dev.className = "myucf-sb-dev";
    const devText = document.createElement("span");
    devText.className = "myucf-sb-dev-text";
    devText.textContent = "Developed by Maximus Barbare";
    const devLinks = document.createElement("span");
    devLinks.className = "myucf-sb-dev-links";
    devLinks.appendChild(makeIconLink("https://github.com/maxjb-xyz", "GitHub", GITHUB_SVG));
    devLinks.appendChild(makeIconLink("https://linkedin.com/in/max-barbare", "LinkedIn", LINKEDIN_SVG));
    dev.appendChild(devText);
    dev.appendChild(devLinks);

    aside.appendChild(brand);
    aside.appendChild(nav);
    aside.appendChild(footer);
    aside.appendChild(dev);
    body.appendChild(aside);
    document.documentElement.classList.add("myucf-has-sidebar");
    markActive();
    log("sidebar injected");
  }

  function injectDashboardHeader() {
    if (!current.enabled || !isTopFrame) return;
    if (document.getElementById("myucf-dashboard-header")) return;
    if (!document.querySelector(".nuitilegrid")) return; // homepage only
    const main = document.querySelector(".ps_main") || document.querySelector("#PT_MAIN");
    if (!main) return;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    const h = document.createElement("div");
    h.id = "myucf-dashboard-header";
    h.className = "myucf-dashboard-header";
    h.innerHTML = '<span class="myucf-dash-greeting">' + greeting + '</span><span class="myucf-dash-date">' + date + '</span>';
    main.insertBefore(h, main.firstChild);
    log("dashboard header injected");
  }

  // ============================ CAPTURE ===============================
  // On-demand developer capture: builds a PII-safe JSON snapshot of the
  // current page (DOM skeleton + NavBar menu tree) and downloads it as a
  // local file for the user to attach. Nothing is uploaded; text is excluded
  // by default and redacted (regex + user terms) when opted in. Redaction
  // and URL scrubbing live in capture-utils.js (shared with the test suite).
  const CAPTURE_VERSION = "0.6.0";
  const CAPTURE_MAX_NODES = 2500;
  const CAPTURE_MAX_DEPTH = 40;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "MYUCF_CAPTURE") return false;
    const extraTerms = parseTerms(current.redactTerms);
    let summary;
    let data = null;
    try {
      data = buildCapture({ includeText: !!current.captureText, extraTerms });
      downloadJson(data, "myucf-capture.json");
      summary = captureSummary(data);
    } catch (err) {
      summary = "capture failed: " + (err && err.message ? err.message : err);
    }
    sendResponse({ ok: true, summary, data });
    return false;
  });

  function parseTerms(csv) {
    if (!csv) return [];
    return String(csv).split(",").map((t) => t.trim()).filter(Boolean);
  }

  function countAncestors(el, tag) {
    let n = 0, p = el.parentElement;
    while (p) { if (p.tagName === tag) n++; p = p.parentElement; }
    return n;
  }

  function findNavbar() {
    const selectors = [
      "#pthdr2navbarcollapse", '[id*="navbar" i]', '[class*="navbar" i]',
      '[class*="NavBar" i]', ".ps_navbar", "#PT_NAVBAR",
    ];
    let best = null, bestLinks = -1;
    for (const sel of selectors) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const n = el.querySelectorAll("a").length;
          if (n > bestLinks) { bestLinks = n; best = el; }
        }
      } catch (_) {}
    }
    return best && bestLinks > 0 ? best : null;
  }

  function extractNavTree(extraTerms) {
    const root = findNavbar();
    if (!root) {
      return { found: false, note: "NavBar not found in DOM — open it (compass/NavBar icon), wait, then Capture again." };
    }
    const seen = new Set();
    const items = [];
    root.querySelectorAll("a").forEach((a) => {
      const label = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!label) return;
      const href = scrubHref(a.getAttribute("href") || "");
      const key = label + "|" + href;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label: redact(label, extraTerms), href, depth: countAncestors(a, "LI") });
    });
    return { found: true, total: items.length, items };
  }

  // Attributes that can carry navigation targets PeopleSoft hides from the
  // visible href (onclick, ptlinktgt, data-*). Captured so captures reveal
  // where the real page URLs live. Values are truncated; javascript: hrefs are
  // captured raw (submitAction/void calls carry no PII).
  const CAPTURE_ATTRS = ["onclick", "ptlinktgt", "name"];
  function captureAttrs(node, out) {
    const attrs = {};
    for (const name of CAPTURE_ATTRS) {
      const v = node.getAttribute && node.getAttribute(name);
      if (v) attrs[name] = v.length > 220 ? v.slice(0, 220) : v;
    }
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i++) {
        const at = node.attributes[i];
        if (at.name.indexOf("data-") === 0 && at.value) {
          attrs[at.name] = at.value.length > 220 ? at.value.slice(0, 220) : at.value;
        }
      }
    }
    if (Object.keys(attrs).length) out.attrs = attrs;
  }

  function buildSkeleton(root, includeText, extraTerms) {
    let budget = CAPTURE_MAX_NODES;
    let truncated = false;
    function walk(node, depth) {
      if (!node) return null;
      if (budget <= 0) { truncated = true; return null; }
      budget--;
      const out = { tag: node.tagName ? node.tagName.toLowerCase() : "#text" };
      if (node.id) out.id = node.id;
      if (node.className && typeof node.className === "string") {
        const c = node.className.trim();
        if (c) out.class = c;
      }
      if (node.tagName === "A") {
        const h = node.getAttribute("href");
        if (h) {
          out.href = scrubHref(h);
          if (/^javascript:/i.test(h)) out.hrefRaw = h.slice(0, 200);
        }
      }
      captureAttrs(node, out);
      if (includeText) {
        let txt = "";
        for (const n of node.childNodes) if (n.nodeType === 3) txt += n.textContent;
        txt = txt.replace(/\s+/g, " ").trim();
        if (txt) out.text = redact(txt, extraTerms);
      }
      if (depth >= CAPTURE_MAX_DEPTH) return out;
      const kids = [];
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        const tag = children[i].tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript" || tag === "svg") continue;
        const s = walk(children[i], depth + 1);
        if (s) kids.push(s);
      }
      if (kids.length) out.children = kids;
      return out;
    }
    const tree = walk(root, 0);
    return { truncated, tree };
  }

  function buildCapture(opts) {
    const extraTerms = opts.extraTerms || [];
    const includeText = !!opts.includeText;
    const dom = safe(() => buildSkeleton(document.body, includeText, extraTerms), { truncated: true, tree: null });
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        host: safe(() => location.hostname, ""),
        url: redact(scrubHref(location.href), extraTerms),
        title: redact(safe(() => document.title, ""), extraTerms),
        captureVersion: CAPTURE_VERSION,
        textIncluded: includeText,
        redactTermsApplied: extraTerms.length,
      },
      navbar: extractNavTree(extraTerms),
      dom,
    };
  }

  function captureSummary(result) {
    const nav = result.navbar && result.navbar.found ? result.navbar.total + " nav links" : "navbar not found";
    return "captured " + nav + "; text " + (result.meta.textIncluded ? "included (redacted)" : "excluded");
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // ============================== GO =================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndInit, { once: true });
  } else {
    loadAndInit();
  }
})();
