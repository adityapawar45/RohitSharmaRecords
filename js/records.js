/* ============================================================================
 * records.js — Dedicated records UI module
 * ----------------------------------------------------------------------------
 * Records rendering for the core grid lives in app.js renderRecords().
 * This file is the extension point for records enhancements: sorting,
 * grouping, deep-linking, search highlighting, and any future records
 * modules that need to run after DATA has been loaded by app.js.
 *
 * Public API (attached to window.RSRecords):
 *   RSRecords.ready(fn)              — run fn once DATA is available
 *   RSRecords.init()                 — wire up the grid (idempotent)
 *   RSRecords.refresh()              — re-render the grid from DATA
 *   RSRecords.filter(category)       — apply a category filter
 *   RSRecords.sort(key)              — sort by year | category | format
 *   RSRecords.find(query)            — search records, returns matching list
 *   RSRecords.highlight(query)       — highlight matches in the grid
 *   RSRecords.categories()           — unique category list from records.json
 *   RSRecords.formats()              — unique format list from records.json
 *   RSRecords.setOptions(opts)       — override defaults at runtime
 * ========================================================================== */

(function (window, document) {
  "use strict";

  /* --------------------------------------------------------------------------
   * 0. GUARDS
   * ------------------------------------------------------------------------ */
  if (window.RSRecords) return; // module already installed

  /* --------------------------------------------------------------------------
   * 1. CONFIG
   * ------------------------------------------------------------------------ */
  var DEFAULTS = {
    gridId: "recordsGrid",
    filterSelector: "[data-record-filter]",
    sortSelector: "[data-record-sort]",
    searchSelector: "[data-record-search]",
    itemClass: "record-card",
    emptyMessage: "No records match this filter.",
    columns: {
      base: "col-12",
      md: "col-md-6",
      xl: "col-xl-4"
    }
  };

  var options = Object.assign({}, DEFAULTS);

  /* --------------------------------------------------------------------------
   * 2. STATE
   * ------------------------------------------------------------------------ */
  var state = {
    items: [],           // full list from DATA.records
    filtered: [],        // currently visible items
    filter: "All",       // active category filter
    sort: "year-desc",   // active sort key
    query: "",           // active search query
    initialized: false
  };

  /* --------------------------------------------------------------------------
   * 3. HELPERS
   * ------------------------------------------------------------------------ */
  var qs = function (s, r) { return (r || document).querySelector(s); };
  var qsa = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function recordsData() {
    try {
      if (typeof DATA !== "undefined" && DATA && Array.isArray(DATA.records)) {
        return DATA.records;
      }
    } catch (err) {
      /* DATA not yet defined by app.js */
    }
    return [];
  }

  function dataReady() {
    return recordsData().length > 0;
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
        // Silent timeout — pages without records should not throw.
      }
    }, 100);
  }

  function yearOf(item) {
    var parsed = parseInt(item && item.year, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /* --------------------------------------------------------------------------
   * 4. SEARCH + HIGHLIGHT
   * ------------------------------------------------------------------------ */
  function matchesQuery(item, query) {
    if (!query) return true;
    var haystack = [
      item.title,
      item.description,
      item.category,
      item.format,
      item.year,
      item.opponent,
      item.venue,
      item.value
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
  }

  function highlightText(value, query) {
    var safe = escapeHtml(value);
    if (!query) return safe;
    var pattern = new RegExp("(" + escapeRegex(query) + ")", "ig");
    return safe.replace(pattern, '<mark class="rs-highlight">$1</mark>');
  }

  /* --------------------------------------------------------------------------
   * 5. SORTING
   * ------------------------------------------------------------------------ */
  var SORTERS = {
    "year-desc": function (a, b) { return yearOf(b) - yearOf(a); },
    "year-asc": function (a, b) { return yearOf(a) - yearOf(b); },
    category: function (a, b) {
      var x = String(a.category || "").localeCompare(String(b.category || ""));
      return x !== 0 ? x : yearOf(b) - yearOf(a);
    },
    format: function (a, b) {
      var x = String(a.format || "").localeCompare(String(b.format || ""));
      return x !== 0 ? x : yearOf(b) - yearOf(a);
    }
  };

  function sortItems(list) {
    var fn = SORTERS[state.sort] || SORTERS["year-desc"];
    return list.slice().sort(fn);
  }

  /* --------------------------------------------------------------------------
   * 6. RENDERING
   * ------------------------------------------------------------------------ */
  function itemMarkup(item) {
    var q = state.query;
    var year = item.year ? escapeHtml(item.year) : "—";
    var opponent = item.opponent ? escapeHtml(item.opponent) : "—";
    var venue = item.venue ? escapeHtml(item.venue) : "—";

    return (
      '<div class="' +
        options.columns.base + " " +
        options.columns.md + " " +
        options.columns.xl +
      '">' +
        '<article class="glass ' + options.itemClass + ' fade-up in">' +
          '<div class="d-flex justify-content-between align-items-center mb-3">' +
            '<span class="record-tag">' +
              highlightText(item.category || "Record", q) +
            "</span>" +
            '<span class="mini-note">' +
              highlightText(item.format || "—", q) +
            "</span>" +
          "</div>" +
          '<div class="record-value">' +
            highlightText(item.value || "—", q) +
          "</div>" +
          '<h3 class="h5 mt-2">' +
            highlightText(item.title || "Untitled record", q) +
          "</h3>" +
          '<p class="text-muted mb-2">' +
            highlightText(item.description || "", q) +
          "</p>" +
          '<div class="source-note">' +
            year + " · " + opponent + " · " + venue +
          "</div>" +
        "</article>" +
      "</div>"
    );
  }

  function renderGrid() {
    var grid = document.getElementById(options.gridId);
    if (!grid) return;

    if (!state.filtered.length) {
      grid.innerHTML =
        '<div class="col-12"><p class="text-muted mb-0">' +
        escapeHtml(options.emptyMessage) +
        "</p></div>";
      return;
    }

    grid.innerHTML = state.filtered.map(itemMarkup).join("");
  }

  /* --------------------------------------------------------------------------
   * 7. FILTER / SORT / SEARCH PIPELINE
   * ------------------------------------------------------------------------ */
  function applyPipeline() {
    var list = state.items.slice();

    if (state.filter && state.filter !== "All") {
      list = list.filter(function (item) {
        return item.category === state.filter;
      });
    }

    if (state.query) {
      list = list.filter(function (item) {
        return matchesQuery(item, state.query);
      });
    }

    state.filtered = sortItems(list);
    renderGrid();
    syncFilterButtons();
    syncSortButtons();
  }

  function applyFilter(filter) {
    state.filter = filter || "All";
    applyPipeline();
  }

  function applySort(sortKey) {
    state.sort = sortKey || "year-desc";
    applyPipeline();
  }

  function applyQuery(query) {
    state.query = String(query || "").trim();
    applyPipeline();
  }

  function syncFilterButtons() {
    qsa(options.filterSelector).forEach(function (button) {
      var active = button.getAttribute("data-record-filter") === state.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncSortButtons() {
    qsa(options.sortSelector).forEach(function (button) {
      var active = button.getAttribute("data-record-sort") === state.sort;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function wireFilters() {
    qsa(options.filterSelector).forEach(function (button) {
      button.addEventListener("click", function () {
        applyFilter(button.getAttribute("data-record-filter"));
      });
    });
  }

  function wireSorters() {
    qsa(options.sortSelector).forEach(function (button) {
      button.addEventListener("click", function () {
        applySort(button.getAttribute("data-record-sort"));
      });
    });
  }

  function wireSearch() {
    qsa(options.searchSelector).forEach(function (input) {
      var timer;
      input.addEventListener("input", function () {
        clearTimeout(timer);
        var value = input.value;
        timer = setTimeout(function () {
          applyQuery(value);
        }, 180);
      });
    });
  }

  /* --------------------------------------------------------------------------
   * 8. PUBLIC API
   * ------------------------------------------------------------------------ */
  function uniqueBy(key) {
    var seen = Object.create(null);
    var list = [];
    state.items.forEach(function (item) {
      var value = item && item[key];
      if (value && !seen[value]) {
        seen[value] = true;
        list.push(value);
      }
    });
    return list.sort();
  }

  function find(query) {
    var q = String(query || "").trim();
    if (!q) return state.items.slice();
    return state.items.filter(function (item) {
      return matchesQuery(item, q);
    });
  }

  function init() {
    if (state.initialized) return;
    var items = recordsData();
    if (!items.length) return;

    state.items = items.slice();
    state.initialized = true;

    wireFilters();
    wireSorters();
    wireSearch();
    applyPipeline();
  }

  function refresh() {
    state.initialized = false;
    state.items = [];
    state.filtered = [];
    state.filter = "All";
    state.query = "";
    init();
  }

  function setOptions(overrides) {
    options = Object.assign({}, options, overrides || {});
  }

  var api = {
    init: init,
    refresh: refresh,
    filter: applyFilter,
    sort: applySort,
    search: applyQuery,
    find: find,
    categories: function () { return uniqueBy("category"); },
    formats: function () { return uniqueBy("format"); },
    setOptions: setOptions,
    ready: whenDataReady,
    state: state,
    options: function () { return options; }
  };

  window.RSRecords = api;

  /* --------------------------------------------------------------------------
   * 9. AUTO-INIT
   * --------------------------------------------------------------------------
   * Pages that want manual control can set
   *   window.RSRecords.autoInit = false
   * before this script runs. Otherwise the module waits for app.js to
   * finish loading records.json and then wires itself up.
   * ------------------------------------------------------------------------ */
  if (window.RSRecords.autoInit !== false) {
    whenDataReady(function () {
      init();
    });

    document.addEventListener("stats:changed", function () {
      if (!state.initialized) init();
    });
  }
})(window, document);