// Chart rendering lives in app.js; this file is kept as a dedicated extension point for future chart modules.
/* ============================================================================
 * chart.js — Dedicated Chart.js extension module
 * ----------------------------------------------------------------------------
 * Chart rendering for the core stats grid lives in app.js renderCharts().
 * This file is the extension point for additional chart modules that need
 * to run after DATA has been loaded by app.js.
 *
 * Public API (attached to window.RSCharts):
 *   RSCharts.ready(fn)          — run fn once DATA is available
 *   RSCharts.register(name, fn) — register a named chart builder
 *   RSCharts.build(name)        — build one registered chart on demand
 *   RSCharts.buildAll()         — build every registered chart
 *   RSCharts.destroy(name)      — destroy one chart (or all with no args)
 *   RSCharts.theme()            — current theme tokens
 *   RSCharts.refreshTheme()     — repaint every live chart for the theme
 *   RSCharts.colors             — shared format colour palette
 *   RSCharts.labels             — shared format display labels
 *   RSCharts.helpers            — num / dec / formatOf utilities
 * ========================================================================== */

(function (window, document) {
  "use strict";

  /* --------------------------------------------------------------------------
   * 0. GUARDS
   * ------------------------------------------------------------------------ */
  if (window.RSCharts) return; // module already installed

  if (typeof window.Chart === "undefined") {
    // Chart.js is loaded from a CDN in the page markup. If it failed to load
    // we register a no-op shim so callers do not throw.
    window.RSCharts = {
      ready: function () {},
      register: function () {},
      build: function () { return null; },
      buildAll: function () {},
      destroy: function () {},
      refreshTheme: function () {},
      theme: function () { return {}; },
      colors: {},
      labels: {},
      helpers: {},
      unavailable: true
    };
    return;
  }

  /* --------------------------------------------------------------------------
   * 1. SHARED CONSTANTS
   * ------------------------------------------------------------------------ */
  var FORMAT_KEYS = ["test", "odi", "t20i", "ipl"];

  var LABELS = {
    test: "Test",
    odi: "ODI",
    t20i: "T20I",
    ipl: "IPL"
  };

  var COLORS = {
    test: "#dc2626",
    odi: "#2563eb",
    t20i: "#16a34a",
    ipl: "#f59e0b"
  };

  var FONT_FAMILY =
    "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  /* --------------------------------------------------------------------------
   * 2. HELPERS
   * ------------------------------------------------------------------------ */
  var NUMBER = new Intl.NumberFormat("en-IN");
  var DASH = "—";

  function num(v) {
    return v === null || v === undefined || v === "" ? DASH : NUMBER.format(v);
  }

  function dec(v) {
    if (v === null || v === undefined || !isFinite(v)) return DASH;
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  function formatOf(key) {
    if (typeof DATA === "undefined" || !DATA) return {};
    if (key === "ipl") return (DATA.ipl && DATA.ipl.career) || {};
    return DATA[key] || {};
  }

  function isLight() {
    return document.documentElement.classList.contains("mode-light");
  }

  function themeTokens() {
    var light = isLight();
    return {
      light: light,
      tick: light ? "#475569" : "#7f8ca3",
      grid: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.05)",
      legend: light ? "#334155" : "#b9c4d6",
      tooltipBg: "rgba(15,23,42,0.94)",
      tooltipTitle: "#f8fafc",
      tooltipBody: "#e2e8f0"
    };
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function tooltipStyle(t) {
    return {
      backgroundColor: t.tooltipBg,
      titleColor: t.tooltipTitle,
      bodyColor: t.tooltipBody,
      padding: 12,
      cornerRadius: 10,
      displayColors: false
    };
  }

  /* --------------------------------------------------------------------------
   * 3. DATA READINESS — app.js loads DATA asynchronously via fetch().
   * ------------------------------------------------------------------------ */
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
        // Silent timeout — pages that never receive DATA should not throw.
      }
    }, 100);
  }

  /* --------------------------------------------------------------------------
   * 4. LIVE CHART REGISTRY
   * ------------------------------------------------------------------------ */
  var live = Object.create(null);   // name -> Chart instance
  var builders = Object.create(null); // name -> build function

  function existingChart(canvas) {
    if (typeof Chart.getChart === "function") {
      return Chart.getChart(canvas);
    }
    return null;
  }

  /**
   * Create (or replace) a Chart.js instance bound to a canvas id.
   * Returns the Chart instance, or null when the canvas / Chart.js is missing.
   */
  function createChart(name, canvasId, config) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    // Tear down any instance already bound to this canvas so we do not leak.
    var stale = existingChart(canvas);
    if (stale) stale.destroy();

    var chart = new Chart(canvas, config);
    live[name] = chart;
    return chart;
  }

  /* --------------------------------------------------------------------------
   * 5. SHARED CHART CONFIG BUILDERS
   * ------------------------------------------------------------------------ */

  /** Vertical bar — runs by format. */
  function buildRunsByFormat(canvasId) {
    var t = themeTokens();
    var labels = FORMAT_KEYS.map(function (k) { return LABELS[k]; });
    var colors = FORMAT_KEYS.map(function (k) { return COLORS[k]; });
    var runs = FORMAT_KEYS.map(function (k) { return formatOf(k).runs || 0; });

    return {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Runs",
            data: runs,
            backgroundColor: colors,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 68
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: prefersReducedMotion() ? 0 : 700 },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, tooltipStyle(t), {
            callbacks: {
              label: function (ctx) {
                return NUMBER.format(ctx.parsed.y) + " runs";
              }
            }
          })
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: t.tick, font: { family: FONT_FAMILY, size: 12 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: t.grid },
            border: { display: false },
            ticks: {
              color: t.tick,
              font: { family: FONT_FAMILY, size: 12 },
              callback: function (value) {
                return value >= 1000 ? value / 1000 + "k" : value;
              }
            }
          }
        }
      }
    };
  }

  /** Doughnut — centuries by format. */
  function buildCenturiesDoughnut(canvasId) {
    var t = themeTokens();
    var labels = FORMAT_KEYS.map(function (k) { return LABELS[k]; });
    var colors = FORMAT_KEYS.map(function (k) { return COLORS[k]; });
    var data = FORMAT_KEYS.map(function (k) {
      return formatOf(k).hundreds || 0;
    });

    return {
      type: "doughnut",
      data: {
        labels: labels.map(function (label, i) {
          return label + " " + data[i];
        }),
        datasets: [
          {
            data: data,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        animation: { duration: prefersReducedMotion() ? 0 : 700 },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: t.legend,
              font: { family: FONT_FAMILY, size: 12 },
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: "circle",
              padding: 14
            }
          },
          tooltip: Object.assign({}, tooltipStyle(t), {
            callbacks: {
              label: function (ctx) {
                return ctx.parsed + " centuries";
              }
            }
          })
        }
      }
    };
  }

  /** Horizontal bar — fifties by format. */
  function buildFiftiesBar(canvasId) {
    var t = themeTokens();
    var labels = FORMAT_KEYS.map(function (k) { return LABELS[k]; });
    var colors = FORMAT_KEYS.map(function (k) { return COLORS[k]; });
    var data = FORMAT_KEYS.map(function (k) {
      return formatOf(k).fifties || 0;
    });

    return {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Fifties",
            data: data,
            backgroundColor: colors,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 34
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: prefersReducedMotion() ? 0 : 700 },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, tooltipStyle(t), {
            callbacks: {
              label: function (ctx) {
                return ctx.parsed.x + " fifties";
              }
            }
          })
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: t.grid },
            border: { display: false },
            ticks: {
              color: t.tick,
              font: { family: FONT_FAMILY, size: 12 },
              precision: 0
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: t.tick, font: { family: FONT_FAMILY, size: 12 } }
          }
        }
      }
    };
  }

  /** Line — IPL runs by season (optional, only when #iplRunsChart exists). */
  function buildIplRunsLine(canvasId) {
    var t = themeTokens();
    var seasons =
      (typeof DATA !== "undefined" && DATA.ipl && DATA.ipl.seasons) || [];
    if (!seasons.length) return null;

    return {
      type: "line",
      data: {
        labels: seasons.map(function (s) { return s.season; }),
        datasets: [
          {
            label: "IPL runs",
            data: seasons.map(function (s) { return s.runs; }),
            borderColor: COLORS.ipl,
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: prefersReducedMotion() ? 0 : 700 },
        plugins: {
          legend: {
            labels: {
              color: t.legend,
              font: { family: FONT_FAMILY, size: 12 }
            }
          },
          tooltip: Object.assign({}, tooltipStyle(t), {
            callbacks: {
              label: function (ctx) {
                return NUMBER.format(ctx.parsed.y) + " runs";
              }
            }
          })
        },
        scales: {
          x: {
            grid: { color: t.grid },
            ticks: { color: t.tick, font: { family: FONT_FAMILY, size: 12 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: t.grid },
            ticks: {
              color: t.tick,
              font: { family: FONT_FAMILY, size: 12 },
              callback: function (value) {
                return value >= 1000 ? value / 1000 + "k" : value;
              }
            }
          }
        }
      }
    };
  }

  /** Doughnut — international win/loss record (only when #captaincyChart exists). */
  function buildCaptaincyDoughnut(canvasId) {
    var t = themeTokens();
    var c =
      (typeof DATA !== "undefined" && DATA.captaincy && DATA.captaincy.international) ||
      null;
    if (!c) return null;

    var other = (c.matches || 0) - (c.wins || 0) - (c.losses || 0);

    return {
      type: "doughnut",
      data: {
        labels: ["Wins", "Losses", "Other"],
        datasets: [
          {
            data: [c.wins || 0, c.losses || 0, other > 0 ? other : 0],
            backgroundColor: ["#16a34a", "#dc2626", "#64748b"],
            borderWidth: 0,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        animation: { duration: prefersReducedMotion() ? 0 : 700 },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: t.legend,
              font: { family: FONT_FAMILY, size: 12 },
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: "circle",
              padding: 14
            }
          },
          tooltip: Object.assign({}, tooltipStyle(t), {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ": " + ctx.parsed;
              }
            }
          })
        }
      }
    };
  }

  /* --------------------------------------------------------------------------
   * 6. REGISTRY — map chart names to builder functions
   * ------------------------------------------------------------------------ */
  var buildersByCanvas = {
    formatChart: buildRunsByFormat,
    centuryChart: buildCenturiesDoughnut,
    fiftyChart: buildFiftiesBar,
    iplRunsChart: buildIplRunsLine,
    captaincyChart: buildCaptaincyDoughnut
  };

  /* --------------------------------------------------------------------------
   * 7. THEME REFRESH
   * ------------------------------------------------------------------------ */
  function refreshTheme() {
    var t = themeTokens();

    Object.keys(live).forEach(function (name) {
      var chart = live[name];
      if (!chart) return;

      var options = chart.options || {};

      if (options.scales) {
        Object.keys(options.scales).forEach(function (sk) {
          var scale = options.scales[sk];
          if (scale.grid && scale.grid.color) scale.grid.color = t.grid;
          if (scale.ticks) scale.ticks.color = t.tick;
        });
      }

      var plugins = options.plugins || {};
      if (plugins.legend && plugins.legend.labels) {
        plugins.legend.labels.color = t.legend;
      }
      if (plugins.tooltip) {
        plugins.tooltip.backgroundColor = t.tooltipBg;
        plugins.tooltip.titleColor = t.tooltipTitle;
        plugins.tooltip.bodyColor = t.tooltipBody;
      }

      chart.update("none");
    });
  }

  function watchTheme() {
    if (typeof MutationObserver === "function") {
      new MutationObserver(refreshTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "data-bs-theme"]
      });
    }

    if (typeof window.matchMedia === "function") {
      var query = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", refreshTheme);
      } else if (typeof query.addListener === "function") {
        query.addListener(refreshTheme);
      }
    }
  }

  /* --------------------------------------------------------------------------
   * 8. PUBLIC API
   * ------------------------------------------------------------------------ */
  var api = {
    colors: COLORS,
    labels: LABELS,
    formatKeys: FORMAT_KEYS,

    helpers: {
      num: num,
      dec: dec,
      formatOf: formatOf
    },

    theme: themeTokens,

    ready: whenDataReady,

    register: function (name, builder) {
      builders[name] = builder;
    },

    build: function (name) {
      if (name) {
        var builder = builders[name] || buildersByCanvas[name];
        if (!builder) return null;
        var config = builder(name);
        if (!config) return null;
        return createChart(name, name, config);
      }

      // Build every chart whose canvas is present in the DOM.
      Object.keys(buildersByCanvas).forEach(function (canvasId) {
        if (!document.getElementById(canvasId)) return;
        var cfg = buildersByCanvas[canvasId](canvasId);
        if (cfg) createChart(canvasId, canvasId, cfg);
      });

      Object.keys(builders).forEach(function (customName) {
        var cfg = builders[customName](customName);
        if (cfg) createChart(customName, customName, cfg);
      });

      return Object.keys(live).length;
    },

    buildAll: function () {
      return api.build();
    },

    destroy: function (name) {
      if (name) {
        if (live[name]) {
          live[name].destroy();
          delete live[name];
        }
        return;
      }
      Object.keys(live).forEach(function (key) {
        live[key].destroy();
        delete live[key];
      });
    },

    refreshTheme: refreshTheme,

    /** Expose the raw builders for callers that want to extend them. */
    builders: buildersByCanvas
  };

  window.RSCharts = api;

  /* --------------------------------------------------------------------------
   * 9. AUTO-BUILD
   * --------------------------------------------------------------------------
   * If a page renders its own charts and wants to opt out, set
   *   window.RSCharts.autoBuild = false
   * before this script runs. Otherwise the module waits for DATA and
   * paints every recognised canvas found on the page.
   * ------------------------------------------------------------------------ */
  if (window.RSCharts.autoBuild !== false) {
    whenDataReady(function () {
      api.buildAll();
      watchTheme();
    });
  }
})(window, document);