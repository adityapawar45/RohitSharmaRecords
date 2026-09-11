/* ============================================================================
 * gallery.js — Dedicated gallery UI module
 * ----------------------------------------------------------------------------
 * Gallery rendering for the core grid lives in app.js renderGallery().
 * This file is the extension point for gallery enhancements: lightbox
 * navigation, keyboard control, lazy loading, filtering, and any future
 * gallery modules that need to run after DATA has been loaded by app.js.
 *
 * Public API (attached to window.RSGallery):
 *   RSGallery.ready(fn)             — run fn once DATA is available
 *   RSGallery.init()                — wire up the gallery (idempotent)
 *   RSGallery.refresh()             — re-render the grid from DATA
 *   RSGallery.filter(category)      — apply a category filter programmatically
 *   RSGallery.open(index)           — open the lightbox at a given index
 *   RSGallery.close()               — close the lightbox
 *   RSGallery.next() / .prev()      — navigate the lightbox
 *   RSGallery.current()             — returns the active image object or null
 *   RSGallery.categories()          — returns the list of unique categories
 *   RSGallery.setOptions(opts)      — override defaults at runtime
 * ========================================================================== */

(function (window, document) {
  "use strict";

  /* --------------------------------------------------------------------------
   * 0. GUARDS
   * ------------------------------------------------------------------------ */
  if (window.RSGallery) return; // module already installed

  /* --------------------------------------------------------------------------
   * 1. CONFIG
   * ------------------------------------------------------------------------ */
  var DEFAULTS = {
    gridId: "galleryGrid",
    filterSelector: "[data-gallery-filter]",
    lightboxId: "lightbox",
    lightboxImageId: "lightboxImage",
    lightboxCaptionId: "lightboxCaption",
    lightboxCloseSelector: '[data-bs-dismiss="modal"]',
    itemIndexAttr: "data-gallery-index",
    columns: {
      base: "col-6",
      md: "col-md-6",
      lg: "col-lg-4"
    },
    imageLoading: "lazy",
    imageDecoding: "async"
  };

  var options = Object.assign({}, DEFAULTS);

  /* --------------------------------------------------------------------------
   * 2. STATE
   * ------------------------------------------------------------------------ */
  var state = {
    items: [],           // full list from DATA.gallery
    filtered: [],        // currently visible items
    filter: "All",       // active category filter
    activeIndex: -1,     // index into `filtered`
    initialized: false,
    lightboxModal: null  // Bootstrap Modal instance
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

  function galleryData() {
    try {
      if (typeof DATA !== "undefined" && DATA && Array.isArray(DATA.gallery)) {
        return DATA.gallery;
      }
    } catch (err) {
      /* DATA not yet defined by app.js */
    }
    return [];
  }

  function dataReady() {
    return galleryData().length > 0;
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
        // Silent timeout — pages without gallery data should not throw.
      }
    }, 100);
  }

  /* --------------------------------------------------------------------------
   * 4. RENDERING
   * ------------------------------------------------------------------------ */
  function itemMarkup(item, index) {
    var title = escapeHtml(item.title || "Untitled");
    var category = escapeHtml(item.category || "Gallery");
    var alt = escapeHtml(item.alt || title);

    return (
      '<div class="' +
        options.columns.base + " " +
        options.columns.md + " " +
        options.columns.lg +
      '">' +
        '<button class="gallery-item border-0 p-0 w-100" ' +
          'type="button" ' +
          options.itemIndexAttr + '="' + index + '" ' +
          'aria-label="Open ' + title + '">' +
          '<img ' +
            'loading="' + options.imageLoading + '" ' +
            'decoding="' + options.imageDecoding + '" ' +
            'src="' + escapeHtml(item.src) + '" ' +
            'alt="' + alt + '">' +
          '<span class="gallery-overlay text-start">' +
            '<small>' + category + '</small>' +
            '<strong class="d-block">' + title + '</strong>' +
          '</span>' +
        '</button>' +
      '</div>'
    );
  }

  function renderGrid() {
    var grid = document.getElementById(options.gridId);
    if (!grid) return;

    if (!state.filtered.length) {
      grid.innerHTML =
        '<div class="col-12"><p class="text-muted mb-0">' +
        "No images match this filter." +
        "</p></div>";
      return;
    }

    grid.innerHTML = state.filtered.map(itemMarkup).join("");
    bindItems();
  }

  function bindItems() {
    var grid = document.getElementById(options.gridId);
    if (!grid) return;

    qsa("[" + options.itemIndexAttr + "]", grid).forEach(function (button) {
      button.addEventListener("click", function () {
        var index = Number(button.getAttribute(options.itemIndexAttr));
        if (Number.isFinite(index)) open(index);
      });
    });
  }

  /* --------------------------------------------------------------------------
   * 5. FILTERING
   * ------------------------------------------------------------------------ */
  function applyFilter(filter) {
    state.filter = filter || "All";
    state.filtered =
      state.filter === "All"
        ? state.items.slice()
        : state.items.filter(function (item) {
            return item.category === state.filter;
          });
    renderGrid();
    syncFilterButtons();
  }

  function syncFilterButtons() {
    qsa(options.filterSelector).forEach(function (button) {
      var active = button.getAttribute("data-gallery-filter") === state.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function wireFilters() {
    qsa(options.filterSelector).forEach(function (button) {
      button.addEventListener("click", function () {
        applyFilter(button.getAttribute("data-gallery-filter"));
      });
    });
  }

  /* --------------------------------------------------------------------------
   * 6. LIGHTBOX
   * ------------------------------------------------------------------------ */
  function ensureLightbox() {
    if (state.lightboxModal) return state.lightboxModal;

    var modalEl = document.getElementById(options.lightboxId);
    if (!modalEl || typeof window.bootstrap === "undefined" || !bootstrap.Modal) {
      return null;
    }

    state.lightboxModal = bootstrap.Modal.getOrCreateInstance
      ? bootstrap.Modal.getOrCreateInstance(modalEl)
      : new bootstrap.Modal(modalEl);

    // Keyboard navigation while the lightbox is open.
    modalEl.addEventListener("keydown", onLightboxKeydown);

    // Reset state when the modal closes.
    modalEl.addEventListener("hidden.bs.modal", function () {
      state.activeIndex = -1;
    });

    return state.lightboxModal;
  }

  function onLightboxKeydown(event) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    }
  }

  function paintLightbox() {
    var imageEl = document.getElementById(options.lightboxImageId);
    var captionEl = document.getElementById(options.lightboxCaptionId);
    if (!imageEl) return;

    var item = state.filtered[state.activeIndex];
    if (!item) return;

    imageEl.src = item.src || "";
    imageEl.alt = item.alt || item.title || "";
    if (captionEl) {
      var parts = [item.title, item.credit].filter(Boolean);
      captionEl.textContent = parts.join(" · ");
    }
  }

  function open(index) {
    if (!state.filtered.length) return;
    var modal = ensureLightbox();
    if (!modal) return;

    var safeIndex = ((index % state.filtered.length) + state.filtered.length) %
      state.filtered.length;
    state.activeIndex = safeIndex;
    paintLightbox();
    modal.show();
  }

  function close() {
    var modal = ensureLightbox();
    if (modal) modal.hide();
    state.activeIndex = -1;
  }

  function next() {
    if (!state.filtered.length) return;
    var modal = ensureLightbox();
    if (!modal) return;
    state.activeIndex = (state.activeIndex + 1) % state.filtered.length;
    paintLightbox();
  }

  function prev() {
    if (!state.filtered.length) return;
    var modal = ensureLightbox();
    if (!modal) return;
    state.activeIndex =
      (state.activeIndex - 1 + state.filtered.length) % state.filtered.length;
    paintLightbox();
  }

  function current() {
    return state.activeIndex >= 0 ? state.filtered[state.activeIndex] : null;
  }

  /* --------------------------------------------------------------------------
   * 7. PUBLIC API
   * ------------------------------------------------------------------------ */
  function categories() {
    var seen = Object.create(null);
    var list = [];
    state.items.forEach(function (item) {
      var cat = item.category || "Uncategorised";
      if (!seen[cat]) {
        seen[cat] = true;
        list.push(cat);
      }
    });
    return list;
  }

  function init() {
    if (state.initialized) return;
    var items = galleryData();
    if (!items.length) return;

    state.items = items.slice();
    state.initialized = true;

    wireFilters();
    applyFilter("All");
  }

  function refresh() {
    state.initialized = false;
    state.items = [];
    state.filtered = [];
    state.activeIndex = -1;
    state.filter = "All";
    init();
  }

  function setOptions(overrides) {
    options = Object.assign({}, options, overrides || {});
  }

  var api = {
    init: init,
    refresh: refresh,
    filter: applyFilter,
    open: open,
    close: close,
    next: next,
    prev: prev,
    current: current,
    categories: categories,
    setOptions: setOptions,
    ready: whenDataReady,
    state: state,
    options: function () { return options; }
  };

  window.RSGallery = api;

  /* --------------------------------------------------------------------------
   * 8. AUTO-INIT
   * --------------------------------------------------------------------------
   * Pages that want manual control can set
   *   window.RSGallery.autoInit = false
   * before this script runs. Otherwise the module waits for app.js to
   * finish loading gallery.json and then wires itself up.
   * ------------------------------------------------------------------------ */
  if (window.RSGallery.autoInit !== false) {
    whenDataReady(function () {
      init();
    });

    // Listen for the event app.js fires when the stats grid repaints —
    // useful signal that DATA is fully hydrated on any page.
    document.addEventListener("stats:changed", function () {
      if (!state.initialized) init();
    });
  }
})(window, document);