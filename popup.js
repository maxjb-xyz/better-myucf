/**
 * myUCF Frontend Overhaul — popup controller.
 * Reads settings from chrome.storage.sync, renders the controls, and writes
 * changes back immediately (no Save button). The content script picks them up
 * live via chrome.storage.onChanged.
 */
(() => {
  "use strict";

  const { DEFAULTS, ACCENTS, DENSITIES } = self.MYUCF;
  const $ = (sel) => document.querySelector(sel);

  // Boolean settings backed by a switch with a data-key attribute.
  const BOOL_KEYS = [
    "phase2Enabled",
    "debug",
    "captureText",
  ];

  const save = (patch) => chrome.storage.sync.set(patch);

  function renderAccent(active) {
    const wrap = $("#accent");
    wrap.innerHTML = "";
    ACCENTS.forEach((a) => {
      const b = document.createElement("button");
      b.className = "swatch " + a + (a === active ? " active" : "");
      b.title = a;
      b.setAttribute("aria-label", a);
      b.dataset.accent = a;
      b.addEventListener("click", () => { save({ accent: a }); renderAccent(a); });
      wrap.appendChild(b);
    });
  }

  function renderDensity(active) {
    const wrap = $("#density");
    wrap.innerHTML = "";
    DENSITIES.forEach((d) => {
      const b = document.createElement("button");
      b.className = "seg" + (d === active ? " active" : "");
      b.textContent = d.charAt(0).toUpperCase() + d.slice(1);
      b.dataset.density = d;
      b.addEventListener("click", () => { save({ density: d }); renderDensity(d); });
      wrap.appendChild(b);
    });
  }

  function render(settings) {
    $("#enabled").checked = !!settings.enabled;
    BOOL_KEYS.forEach((k) => {
      const el = $('[data-key="' + k + '"]');
      if (el) el.checked = !!settings[k];
    });
    renderAccent(settings.accent);
    renderDensity(settings.density);
    const rt = $("#redactTerms");
    if (rt) rt.value = settings.redactTerms || "";
  }

  function capture() {
    const status = $("#captureStatus");
    if (status) status.textContent = "Capturing…";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) { if (status) status.textContent = "No active tab."; return; }
      chrome.tabs.sendMessage(tab.id, { type: "MYUCF_CAPTURE" }, { frameId: 0 }, (resp) => {
        if (chrome.runtime.lastError) {
          if (status) status.textContent = "Not on a myUCF page.";
          return;
        }
        if (status) status.textContent = (resp && resp.summary) || "Done.";
        setTimeout(() => { if (status) status.textContent = ""; }, 4000);
      });
    });
  }

  function wire() {
    $("#enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
    BOOL_KEYS.forEach((k) => {
      const el = $('[data-key="' + k + '"]');
      if (el) el.addEventListener("change", (e) => save({ [k]: e.target.checked }));
    });
    const rt = $("#redactTerms");
    if (rt) rt.addEventListener("change", (e) => save({ redactTerms: e.target.value }));
    const cap = $("#capture");
    if (cap) cap.addEventListener("click", capture);
  }

  chrome.storage.sync.get(DEFAULTS, (settings) => {
    render(settings);
    wire();
  });
})();
