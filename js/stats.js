/* ============================================================================
 * stats.js — Dedicated statistics UI module
 * ----------------------------------------------------------------------------
 * Statistics UI is rendered by app.js from /data/*.json. This file is the
 * extension point for stats enhancements: KPI ribbon hydration, the full
 * career table, supplemental charts, format tab accessibility, and any
 * future stats modules that need to run after DATA has been loaded by
 * app.js.
 *
 * Public API (attached to window.RSStats):
 *   RSStats.ready(fn)              — run fn once DATA is available
 *   RSStats.init()                 — wire up the page (idempotent)
 *   RSStats.refresh()              — recompute every derived value
 *   RSStats.totals()               — Test + ODI + T20I aggregates
 *   RSStats.format(key)            — read one format record (ipl -> career)
 *   RSStats.formats()              — list of supported format keys
 *   RSStats.setFormat(key)         — programmatically select a tab
 *   RSStats.setOptions(opts)       — override defaults at runtime
 * ========================================================================== */

(function (window, document) {
  "use strict";

  /* --------------------------------------------------------------------------
   * 0. GUARDS
   * ------------------------------------------------------------------------ */
  if (window.RSStats) return; // module already installed

  /* --------------------------------------------------------------------------
   * 1. CONFIG
   * ------------------------------------------------------------------------ */
  var DEFAULTS = {
    gridId: "statsGrid",
    captionId: "gridCaption",
    tableBodyId: "careerTableBody",
    tableFootId: "careerTableFoot",
    tableLegendId: "tableLegend",
    tabSelector: "[data-format]",
    tablistSelector: ".dashboard-tabs",
    formatKeys: ["test", "odi", "t20i", "ipl"],
    internationalKeys: ["test", "odi", "t20i"],
    labels: { test: "Test", odi: "ODI", t20i: "T20I", ipl: "IPL" },
    colors: {
      test: "#dc2626",
      odi: "#2563eb",
      t20i: "#16a34a",
      ipl: "#f59e0b"
    },
    captions: {
      all:
        "Test + ODI + T20I only. Franchise (IPL) numbers are excluded from this aggregate.",
      test:
        "Test career — debut November 2013 vs West Indies, Kolkata (177 on debut).",
      odi:
        "ODI career — debut June 2007 vs Ireland. Holds the world record for the highest individual score.",
      t20i:
        "T20I career — retired as the format's leading run-scorer and six-hitter.",
      ipl:
        "IPL career — Mumbai Indians captain for five title-winning campaigns."
    },
    iccTrophies: 5
  };

  var options = Object.assign({}, DEFAULTS);

  /* --------------------------------------------------------------------------
   * 2. STATE
   * ------------------------------------------------------------------------ */
  var state = {
    activeFormat: "all",
    initialized: false,
    centuryNote: null
  };

  /* --------------------------------------------------------------------------
   * 3. HELPERS
   * ------------------------------------------------------------------------ */
  var qs = function (s, r) { return (r || document).querySelector(s); };
  var qsa = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  var NUMBER = new Intl.NumberFormat("en-IN");
  var DASH = "—";

  function num(v) {
    return v === null || v === undefined || v === "" ? DASH : NUMBER.format(v);
  }

  function dec(v) {
    if (v === null || v === undefined || !isFinite(v)) return DASH;
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  function dataReady() {
    try {
      return typeof DATA !== "undefined" && DATA && DATA.test;
    } catch (err) {
      return false;
    }
  }

  function whenDataReady(fn, timeoutMs) {
    var limit = timeoutMs || 15000;
    if (dataReady()) {
      fn();
      return;
    }
    var start = Date.now();
    var iv = setInterval(function () {
      if (dataReady()) {
        clearInterval(iv);
        fn();
      } else if (Date.now() - start > limit) {
        clearInterval(iv);
        // Silent timeout — pages without data should not throw.
      }
    }, 100);
  }

  /* --------------------------------------------------------------------------
   * 4. FORMAT ACCESSORS
   * ------------------------------------------------------------------------ */
  function format(key) {
    try {
      if (typeof DATA === "undefined" || !DATA) return {};
      if (key === "ipl") return (DATA.ipl && DATA.ipl.career) || {};
      return DATA[key] || {};
    } catch (err) {
      return {};
    }
  }

  function highestValue(record) {
    var parsed = parseInt(String(record && record.highestScore).replace(/\D/g, ""), 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /* --------------------------------------------------------------------------
   * 5. AGGREGATE — Test + ODI + T20I, computed rather than stored
   * ------------------------------------------------------------------------ */
  function computeTotals() {
    var totals = {
      matches: 0,
      innings: 0,
      notOuts: 0,
      runs: 0,
      hundreds: 0,
      fifties: 0,
      fours: 0,
      sixes: 0,
      highestScore: DASH,
      highestValue: -1
    };

    options.internationalKeys.forEach(function (key) {
      var f = format(key);
      if (!f || !Object.keys(f).length) return;

      totals.matches += f.matches || 0;
      totals.innings += f.innings || 0;
      totals.notOuts += f.notOuts || 0;
      totals.runs += f.runs || 0;
      totals.hundreds += f.hundreds || 0;
      totals.fifties += f.fifties || 0;
      totals.fours += f.fours || 0;
      totals.sixes += f.sixes || 0;

      var hv = highestValue(f);
      if (hv > totals.highestValue) {
        totals.highestValue = hv;
        totals.highestScore = f.highestScore != null ? f.highestScore : DASH;
      }
    });

    var outs = totals.innings - totals.notOuts;
    totals.average = outs > 0 ? totals.runs / outs : null;

    return totals;
  }

  /* --------------------------------------------------------------------------
   * 6. STAT LIST FOR THE INTERACTIVE GRID
   * ------------------------------------------------------------------------ */
  function statsFor(key) {
    var f = key === "all" ? computeTotals() : format(key);
    var out = [];

    var push = function (label, value) {
      out.push({ k: label, v: value });
    };

    push("Matches", num(f.matches));
    if (f.innings) push("Innings", num(f.innings));
    if (key === "all") push("Not outs", num(f.notOuts));
    push("Runs", num(f.runs));
    push("Average", dec(f.average));
    if (f.strikeRate !== undefined) push("Strike rate", dec(f.strikeRate));
    push("Highest score", f.highestScore != null ? String(f.highestScore) : DASH);
    push("Centuries", num(f.hundreds));
    push("Fifties", num(f.fifties));
    push("Centuries + fifties", num((f.hundreds || 0) + (f.fifties || 0)));
    if (f.innings) push("Runs per innings", dec(f.runs / f.innings));
    if (f.fours !== undefined) push("Fours", num(f.fours));
    if (f.sixes !== undefined) push("Sixes", num(f.sixes));
    if (f.titles !== undefined) push("Titles as captain", num(f.titles));

    return out;
  }

  /* --------------------------------------------------------------------------
   * 7. GRID RENDERING — only if app.js has not already filled it
   * ------------------------------------------------------------------------ */
  function gridHasContent() {
    var grid = document.getElementById(options.gridId);
    return !!(grid && grid.children.length);
  }

  function renderGrid(key) {
    var grid = document.getElementById(options.gridId);
    if (!grid) return;

    grid.innerHTML = statsFor(key)
      .map(function (stat) {
        return (
          '<div class="col-6 col-md-4 col-xl-3">' +
            '<div class="glass stat-card fade-up in">' +
              '<div class="stat-label">' + stat.k + "</div>" +
              '<div class="stat-value">' + stat.v + "</div>" +
            "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderCaption(key) {
    var el = document.getElementById(options.captionId);
    if (!el) return;
    el.textContent = options.captions[key] || "";
  }

  /* --------------------------------------------------------------------------
   * 8. KPI RIBBON
   * ------------------------------------------------------------------------ */
  function setKpi(name, value) {
    var el = document.querySelector('[data-kpi="' + name + '"]');
    if (el) el.textContent = value;
  }

  function renderKpis() {
    var t = computeTotals();
    var odi = format("odi");
    var ipl = format("ipl");

    setKpi("intlMatches", num(t.matches));
    setKpi("intlRuns", num(t.runs));
    setKpi("intlHundreds", num(t.hundreds));
    setKpi(
      "highestScore",
      odi.highestScore != null ? String(odi.highestScore) : "264"
    );
    setKpi("iplTitles", ipl.titles != null ? num(ipl.titles) : "5");
    setKpi("iccTrophies", num(options.iccTrophies));

    var note = document.getElementById("centuryNote");
    if (note) {
      state.centuryNote = note;
      note.textContent =
        num(t.hundreds) + " international hundreds · " +
        num(ipl.hundreds || 0) + " IPL hundreds";
    }
  }

  /* --------------------------------------------------------------------------
   * 9. FULL CAREER TABLE
   * ------------------------------------------------------------------------ */
  function tableRow(label, f) {
    return (
      "<tr>" +
        '<th scope="row">' + label + "</th>" +
        "<td>" + num(f.matches) + "</td>" +
        "<td>" + (f.innings != null ? num(f.innings) : DASH) + "</td>" +
        "<td>" + num(f.runs) + "</td>" +
        "<td>" + dec(f.average) + "</td>" +
        "<td>" + dec(f.strikeRate) + "</td>" +
        "<td>" + num(f.hundreds) + "</td>" +
        "<td>" + num(f.fifties) + "</td>" +
        "<td>" + (f.highestScore != null ? String(f.highestScore) : DASH) + "</td>" +
      "</tr>"
    );
  }

  function renderTable() {
    var tbody = document.getElementById(options.tableBodyId);
    var tfoot = document.getElementById(options.tableFootId);
    if (!tbody || !tfoot) return;

    tbody.innerHTML = options.formatKeys
      .map(function (key) {
        return tableRow(options.labels[key] || key, format(key));
      })
      .join("");

    var t = computeTotals();
    tfoot.innerHTML =
      "<tr>" +
        '<th scope="row">Internationals</th>' +
        "<td>" + num(t.matches) + "</td>" +
        "<td>" + num(t.innings) + "</td>" +
        "<td>" + num(t.runs) + "</td>" +
        // Blended average / strike rate need not-outs, which the JSON does
        // not expose on every format — show a dash rather than guess.
        "<td>" + DASH + "</td>" +
        "<td>" + DASH + "</td>" +
        "<td>" + num(t.hundreds) + "</td>" +
        "<td>" + num(t.fifties) + "</td>" +
        "<td>" + t.highestScore + "</td>" +
      "</tr>";
  }

  function renderTableLegend() {
    var el = document.getElementById(options.tableLegendId);
    if (!el) return;

    el.innerHTML = options.formatKeys
      .map(function (key) {
        var f = format(key);
        var hs = f.highestScore != null ? f.highestScore : DASH;
        return (
          '<div class="col-6 col-md-3">' +
            '<div class="mini-note">' +
              '<span class="legend-dot" style="background:' +
                options.colors[key] + '"></span>' +
              (options.labels[key] || key) + " · " +
              num(f.hundreds) + " hundreds, HS " + hs +
            "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  /* --------------------------------------------------------------------------
   * 10. TAB WIRING — accessibility only, app.js owns the click behaviour
   * ------------------------------------------------------------------------ */
  function wireTabs() {
    var list = document.querySelector(options.tablistSelector);
    if (!list) return;

    var buttons = qsa(options.tabSelector, list);
    if (!buttons.length) return;

    var panel = document.getElementById(options.gridId);

    function activate(button) {
      buttons.forEach(function (b) {
        var active = b === button;
        b.setAttribute("aria-selected", active ? "true" : "false");
        b.tabIndex = active ? 0 : -1;
      });
      if (panel && button.id) {
        panel.setAttribute("aria-labelledby", button.id);
      }
      state.activeFormat = button.getAttribute("data-format") || "all";
      renderCaption(state.activeFormat);
    }

    list.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-format]");
      if (button) activate(button);
    });

    list.addEventListener("keydown", function (event) {
      var index = buttons.indexOf(document.activeElement);
      if (index < 0) return;

      var target = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        target = buttons[(index + 1) % buttons.length];
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        target = buttons[(index - 1 + buttons.length) % buttons.length];
      } else if (event.key === "Home") {
        target = buttons[0];
      } else if (event.key === "End") {
        target = buttons[buttons.length - 1];
      }

      if (target) {
        event.preventDefault();
        target.focus();
        target.click();
      }
    });

    // Reflect the initially active tab in state.
    var initial = buttons.filter(function (b) {
      return b.classList.contains("active");
    })[0];
    if (initial) {
      state.activeFormat = initial.getAttribute("data-format") || "all";
    }
  }

  /* --------------------------------------------------------------------------
   * 11. EVENTS FROM app.js
   * ------------------------------------------------------------------------ */
  function wireEvents() {
    document.addEventListener("stats:changed", function (event) {
      var key = event && event.detail && event.detail.key;
      if (key) renderCaption(key);
    });
  }

  /* --------------------------------------------------------------------------
   * 12. PUBLIC API
   * ------------------------------------------------------------------------ */
  function setFormat(key) {
    var button = document.querySelector(
      '[data-format="' + key + '"]'
    );
    if (button) button.click();
  }

  function init() {
    if (state.initialized) return;
    if (!dataReady()) return;

    state.initialized = true;

    // app.js owns the grid and the formatChart. We only fill the pieces
    // it does not: the KPI ribbon, the career table, the legend, and the
    // accessibility wiring on the tabs.
    renderKpis();
    renderTable();
    renderTableLegend();
    wireTabs();
    wireEvents();

    // If app.js has not populated the grid yet (for example, its own
    // renderStats() failed or was removed), fill it here so the page is
    // still usable.
    if (!gridHasContent()) {
      renderGrid(state.activeFormat);
    }
    renderCaption(state.activeFormat);

    // If app.js has not wired the tab clicks, do it now so the tabs
    // still switch content.
    var list = document.querySelector(options.tablistSelector);
    if (list && !list.dataset.rsStatsWired) {
      list.dataset.rsStatsWired = "1";
      qsa(options.tabSelector, list).forEach(function (button) {
        button.addEventListener("click", function () {
          renderGrid(button.getAttribute("data-format") || "all");
        });
      });
    }
  }

  function refresh() {
    state.initialized = false;
    init();
  }

  function setOptions(overrides) {
    options = Object.assign({}, options, overrides || {});
  }

  var api = {
    init: init,
    refresh: refresh,
    totals: computeTotals,
    format: format,
    formats: function () { return options.formatKeys.slice(); },
    setFormat: setFormat,
    setOptions: setOptions,
    ready: whenDataReady,
    state: state,
    options: function () { return options; }
  };

  window.RSStats = api;

  /* --------------------------------------------------------------------------
   * 13. AUTO-INIT
   * --------------------------------------------------------------------------
   * Pages that want manual control can set
   *   window.RSStats.autoInit = false
   * before this script runs. Otherwise the module waits for app.js to
   * finish loading the JSON files and then wires itself up.
   * ------------------------------------------------------------------------ */
  if (window.RSStats.autoInit !== false) {
    whenDataReady(function () {
      init();
    });

    document.addEventListener("stats:changed", function () {
      if (!state.initialized) init();
    });
  }
})(window, document);