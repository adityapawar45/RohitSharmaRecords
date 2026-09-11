/* ============================================================================
 * search.js — Dedicated global search module
 * ----------------------------------------------------------------------------
 * Global search is rendered by app.js searchInit() and searches the
 * normalized JSON data corpus. This file is the extension point for search
 * enhancements: fuzzy matching, ranking, keyboard navigation, result
 * grouping, deep-linking, and any future search modules that need to run
 * after DATA has been loaded by app.js.
 *
 * Public API (attached to window.RSSearch):
 *   RSSearch.ready(fn)              — run fn once DATA is available
 *   RSSearch.init()                 — wire up search (idempotent)
 *   RSSearch.refresh()              — rebuild the search corpus
 *   RSSearch.query(text)            — run a programmatic search
 *   RSSearch.open()                 — open the search modal
 *   RSSearch.close()                — close the search modal
 *   RSSearch.corpus()               — returns the full corpus array
 *   RSSearch.categories()           — unique result types in the corpus
 *   RSSearch.setOptions(opts)       — override defaults at runtime
 * ========================================================================== */

(function (window, document) {
  "use strict";

  /* --------------------------------------------------------------------------
   * 0. GUARDS
   * ------------------------------------------------------------------------ */
  if (window.RSSearch) return; // module already installed

  /* --------------------------------------------------------------------------
   * 1. CONFIG
   * ------------------------------------------------------------------------ */
  var DEFAULTS = {
    modalId: "searchModal",
    inputId: "globalSearch",
    resultsId: "searchResults",
    openSelector: "[data-open-search]",
    minQueryLength: 1,
    maxResults: 12,
    debounceMs: 180,
    highlightClass: "rs-highlight",
    emptyMessage:
      "Search records, years, opponents, formats or IPL seasons.",
    noMatchMessage: "No matching result found.",
    keyboard: {
      escape: true,
      arrows: true,
      enter: true
    }
  };

  var options = Object.assign({}, DEFAULTS);

  /* --------------------------------------------------------------------------
   * 2. STATE
   * ------------------------------------------------------------------------ */
  var state = {
    corpus: [],           // normalized list of searchable entries
    results: [],          // last query results
    activeIndex: -1,      // highlighted result for keyboard nav
    initialized: false,
    modal: null           // Bootstrap Modal instance
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

  function dataReady() {
    try {
      return (
        typeof DATA !== "undefined" &&
        DATA &&
        (Array.isArray(DATA.records) ||
          Array.isArray(DATA.timeline) ||
          Array.isArray(DATA.achievements))
      );
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
   * 4. CORPUS BUILDER — mirrors app.js searchInit() corpus shape
   * ------------------------------------------------------------------------ */
  function buildCorpus() {
    var out = [];

    try {
      if (typeof DATA === "undefined" || !DATA) return out;

      (DATA.records || []).forEach(function (x) {
        out.push({
          type: "Record",
          title: x.title || "Record",
          body: [
            x.value,
            x.year,
            x.opponent,
            x.format,
            x.category,
            x.description
          ]
            .filter(Boolean)
            .join(" "),
          meta: {
            year: x.year,
            category: x.category,
            format: x.format
          }
        });
      });

      (DATA.timeline || []).forEach(function (x) {
        out.push({
          type: "Timeline",
          title: x.title || "Milestone",
          body: [x.year, x.description].filter(Boolean).join(" "),
          meta: { year: x.year }
        });
      });

      (DATA.achievements || []).forEach(function (x) {
        out.push({
          type: "Achievement",
          title: x.title || "Achievement",
          body: [x.year, x.category, x.description]
            .filter(Boolean)
            .join(" "),
          meta: { year: x.year, category: x.category }
        });
      });

      (DATA.worldcup || []).forEach(function (x) {
        out.push({
          type: "World Cup",
          title: (x.year || "") + " " + (x.edition || "World Cup"),
          body: [
            x.runs && x.runs + " runs",
            x.centuries && x.centuries + " centuries",
            x.highlight
          ]
            .filter(Boolean)
            .join(" "),
          meta: { year: x.year, edition: x.edition }
        });
      });

      if (DATA.ipl && Array.isArray(DATA.ipl.seasons)) {
        DATA.ipl.seasons.forEach(function (x) {
          out.push({
            type: "IPL",
            title: "IPL " + (x.season || "") + " · " + (x.team || ""),
            body: [
              x.runs && x.runs + " runs",
              x.highest,
              x.average,
              x.strikeRate
            ]
              .filter(Boolean)
              .join(" "),
            meta: { year: x.season, team: x.team }
          });
        });
      }
    } catch (err) {
      /* Defensive — never throw out of a search build. */
    }

    return out;
  }

  /* --------------------------------------------------------------------------
   * 5. MATCHING + RANKING
   * ------------------------------------------------------------------------ */
  function scoreEntry(entry, query) {
    var q = query.toLowerCase();
    var title = (entry.title || "").toLowerCase();
    var body = (entry.body || "").toLowerCase();

    var score = 0;

    if (title === q) score += 120;
    else if (title.indexOf(q) === 0) score += 90;
    else if (title.indexOf(q) !== -1) score += 60;

    if (body.indexOf(q) !== -1) score += 25;

    // Small bonus when the query looks like a year and matches the meta year.
    if (/^\d{4}$/.test(q) && String(entry.meta && entry.meta.year) === q) {
      score += 40;
    }

    return score;
  }

  function runSearch(query) {
    var q = String(query || "").trim();
    if (q.length < options.minQueryLength) return [];

    var scored = [];
    for (var i = 0; i < state.corpus.length; i++) {
      var entry = state.corpus[i];
      var score = scoreEntry(entry, q);
      if (score > 0) {
        scored.push({ entry: entry, score: score });
      }
    }

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.entry.title).localeCompare(String(b.entry.title));
    });

    return scored.slice(0, options.maxResults).map(function (s) {
      return s.entry;
    });
  }

  /* --------------------------------------------------------------------------
   * 6. RENDERING
   * ------------------------------------------------------------------------ */
  function highlight(value, query) {
    var safe = escapeHtml(value);
    if (!query) return safe;
    var pattern = new RegExp("(" + escapeRegex(query) + ")", "ig");
    return safe.replace(
      pattern,
      '<mark class="' + options.highlightClass + '">$1</mark>'
    );
  }

  function renderResults(results, query) {
    var container = document.getElementById(options.resultsId);
    if (!container) return;

    if (!results.length) {
      container.innerHTML =
        '<div class="p-4 text-muted">' +
        escapeHtml(options.noMatchMessage) +
        "</div>";
      return;
    }

    container.innerHTML = results
      .map(function (entry, index) {
        return (
          '<div class="search-result" ' +
            'role="option" ' +
            'tabindex="-1" ' +
            'data-search-index="' + index + '" ' +
            'aria-selected="' + (index === state.activeIndex ? "true" : "false") + '">' +
            '<span class="record-tag">' +
              escapeHtml(entry.type) +
            "</span>" +
            '<div class="fw-bold mt-1">' +
              highlight(entry.title, query) +
            "</div>" +
            '<div class="text-muted small">' +
              highlight(entry.body, query) +
            "</div>" +
          "</div>"
        );
      })
      .join("");

    bindResultClicks();
  }

  function bindResultClicks() {
    var container = document.getElementById(options.resultsId);
    if (!container) return;

    qsa("[data-search-index]", container).forEach(function (el) {
      el.addEventListener("click", function () {
        var index = Number(el.getAttribute("data-search-index"));
        activateResult(index);
      });
    });
  }

  function activateResult(index) {
    if (index < 0 || index >= state.results.length) return;
    state.activeIndex = index;
    updateActiveHighlight();
    // The corpus has no URL field; activation is a no-op unless a page
    // wires up `RSSearch.onSelect(fn)`. This keeps the module decoupled
    // from routing concerns.
    if (typeof state.onSelect === "function") {
      state.onSelect(state.results[index]);
    }
  }

  function updateActiveHighlight() {
    var container = document.getElementById(options.resultsId);
    if (!container) return;

    qsa("[data-search-index]", container).forEach(function (el) {
      var i = Number(el.getAttribute("data-search-index"));
      var active = i === state.activeIndex;
      el.setAttribute("aria-selected", active ? "true" : "false");
      el.classList.toggle("is-active", active);
      if (active && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 7. INPUT + KEYBOARD HANDLING
   * ------------------------------------------------------------------------ */
  function onInput(event) {
    var input = event.target;
    var query = input.value;

    clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      state.results = runSearch(query);
      state.activeIndex = state.results.length ? 0 : -1;
      renderResults(state.results, query.trim());
    }, options.debounceMs);
  }

  function onKeydown(event) {
    if (!state.results.length) return;
    var k = options.keyboard;

    if (k.arrows && event.key === "ArrowDown") {
      event.preventDefault();
      state.activeIndex = (state.activeIndex + 1) % state.results.length;
      updateActiveHighlight();
    } else if (k.arrows && event.key === "ArrowUp") {
      event.preventDefault();
      state.activeIndex =
        (state.activeIndex - 1 + state.results.length) %
        state.results.length;
      updateActiveHighlight();
    } else if (k.enter && event.key === "Enter") {
      event.preventDefault();
      if (state.activeIndex >= 0) activateResult(state.activeIndex);
    } else if (k.escape && event.key === "Escape") {
      // Bootstrap handles Escape for the modal itself; this branch is
      // for inputs that are not inside a Bootstrap modal.
      if (!event.target.closest(".modal")) {
        close();
      }
    }
  }

  /* --------------------------------------------------------------------------
   * 8. MODAL PLUMBING
   * ------------------------------------------------------------------------ */
  function ensureModal() {
    if (state.modal) return state.modal;

    var modalEl = document.getElementById(options.modalId);
    if (!modalEl || typeof window.bootstrap === "undefined" || !bootstrap.Modal) {
      return null;
    }

    state.modal = bootstrap.Modal.getOrCreateInstance
      ? bootstrap.Modal.getOrCreateInstance(modalEl)
      : new bootstrap.Modal(modalEl);

    modalEl.addEventListener("shown.bs.modal", function () {
      var input = document.getElementById(options.inputId);
      if (input) input.focus();
    });

    modalEl.addEventListener("hidden.bs.modal", function () {
      state.activeIndex = -1;
    });

    return state.modal;
  }

  function open() {
    var modal = ensureModal();
    if (!modal) return;

    var input = document.getElementById(options.inputId);
    if (input && !input.value) {
      var container = document.getElementById(options.resultsId);
      if (container) {
        container.innerHTML =
          '<div class="p-4 text-muted">' +
          escapeHtml(options.emptyMessage) +
          "</div>";
      }
    }

    modal.show();
  }

  function close() {
    var modal = ensureModal();
    if (modal) modal.hide();
  }

  /* --------------------------------------------------------------------------
   * 9. PUBLIC API
   * ------------------------------------------------------------------------ */
  function uniqueTypes() {
    var seen = Object.create(null);
    var list = [];
    state.corpus.forEach(function (entry) {
      if (entry.type && !seen[entry.type]) {
        seen[entry.type] = true;
        list.push(entry.type);
      }
    });
    return list.sort();
  }

  function init() {
    if (state.initialized) return;

    state.corpus = buildCorpus();
    if (!state.corpus.length) return;

    var input = document.getElementById(options.inputId);
    if (!input) return;

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeydown);

    qsa(options.openSelector).forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        open();
      });
    });

    state.initialized = true;
  }

  function refresh() {
    state.initialized = false;
    state.corpus = [];
    state.results = [];
    state.activeIndex = -1;
    init();
  }

  function setOptions(overrides) {
    options = Object.assign({}, options, overrides || {});
  }

  function onSelect(fn) {
    state.onSelect = typeof fn === "function" ? fn : null;
  }

  var api = {
    init: init,
    refresh: refresh,
    query: function (text) {
      var results = runSearch(text);
      state.results = results;
      state.activeIndex = results.length ? 0 : -1;
      renderResults(results, String(text || "").trim());
      return results;
    },
    open: open,
    close: close,
    corpus: function () { return state.corpus.slice(); },
    categories: uniqueTypes,
    onSelect: onSelect,
    setOptions: setOptions,
    ready: whenDataReady,
    state: state,
    options: function () { return options; }
  };

  window.RSSearch = api;

  /* --------------------------------------------------------------------------
   * 10. AUTO-INIT
   * --------------------------------------------------------------------------
   * Pages that want manual control can set
   *   window.RSSearch.autoInit = false
   * before this script runs. Otherwise the module waits for app.js to
   * finish loading the JSON data and then wires itself up.
   * ------------------------------------------------------------------------ */
  if (window.RSSearch.autoInit !== false) {
    whenDataReady(function () {
      init();
    });

    document.addEventListener("stats:changed", function () {
      if (!state.initialized) init();
    });
  }
})(window, document);