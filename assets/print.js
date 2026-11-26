/* Revisian — Print mode
 *
 * Turns the note you have open into something a printer is happy with:
 * choose paper size and orientation, margins (with an extra binding edge for
 * hole-punching or stapling), text size, one or two columns, ink saver, an
 * optional project cover page, page numbers, link addresses written out in
 * full, and page breaks before each section. Then print it or save a PDF.
 *
 * Self-contained, like Presentation mode: no build step and no app internals.
 * It reads the rendered note (main article .prose).
 */
(function () {
  "use strict";

  if (window.__revisianPrint) return;
  window.__revisianPrint = true;

  var STYLE_ACTION = "style:print";
  var STORE_KEY = "revisian.print.settings.v1";

  var PAPERS = {
    A4: { label: "A4", css: "A4" },
    A3: { label: "A3", css: "A3" },
    A5: { label: "A5", css: "A5" },
    Letter: { label: "US Letter", css: "letter" }
  };

  var DEFAULTS = {
    paper: "A4",
    orientation: "portrait",
    margin: "normal",
    binding: false,
    fontSize: 11,
    columns: 1,
    inkSaver: true,
    images: true,
    showUrls: true,
    pageNumbers: true,
    header: true,
    sectionBreaks: false,
    stampSpace: true,
    cover: false,
    keyTerms: false,
    coverName: "",
    coverClass: "",
    coverTeacher: "",
    coverDate: ""
  };

  var MARGINS = { narrow: 10, normal: 18, wide: 25 };

  var state = { settings: load(), root: null, sheet: null, data: null, packData: [], packInfo: null };

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function load() {
    var s = {};
    try {
      s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (e) {
      s = {};
    }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = typeof s[k] === typeof DEFAULTS[k] ? s[k] : DEFAULTS[k];
    });
    if (!PAPERS[out.paper]) out.paper = DEFAULTS.paper;
    if (!MARGINS[out.margin]) out.margin = DEFAULTS.margin;
    return out;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.settings));
    } catch (e) {
      /* storage can be unavailable; settings simply won't persist */
    }
  }

  function clean(text) {
    return String(text || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function youtubeId(href) {
    var m = String(href || "").match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
    );
    return m ? m[1] : null;
  }

  function isImageHref(href) {
    return /Special:FilePath|\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(String(href || ""));
  }

  function shortUrl(href) {
    return String(href).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  }

  /* ------------------------------------------------------------------ *
   * Read the open note into printable HTML
   * ------------------------------------------------------------------ */

  function captionOf(el) {
    var text = clean(el.innerText || el.textContent);
    text = text.replace(/^(Image|GIF|Diagram|YouTube video|Video)\s*/i, "");
    text = text.replace(/\s*[·|]?\s*(Watch video|Watch on YouTube|Show image|Show GIF|Show diagram|Load video player)\s*$/i, "");
    var half = Math.floor(text.length / 2);
    if (text.length > 24) {
      var a = text.slice(0, half).trim();
      var b = text.slice(half).trim();
      if (b.indexOf(a) === 0 || a.indexOf(b) === 0) text = a.length > b.length ? a : b;
    }
    return text;
  }

  function mediaOf(el) {
    var found = [];
    var seen = {};
    Array.prototype.forEach.call(el.querySelectorAll("a[href]"), function (a) {
      var href = a.getAttribute("href") || "";
      var id = youtubeId(href);
      var key = id || href;
      if (seen[key]) return;
      if (id) {
        seen[key] = 1;
        found.push({ kind: "video", url: href });
      } else if (isImageHref(href) && href.indexOf("http") === 0) {
        seen[key] = 1;
        found.push({ kind: "image", url: href });
      }
    });
    Array.prototype.forEach.call(el.querySelectorAll("img[src]"), function (img) {
      var src = img.getAttribute("src");
      if (src && !seen[src] && src.indexOf("data:image/svg") !== 0) {
        seen[src] = 1;
        found.push({ kind: "image", url: img.src });
      }
    });
    return found;
  }

  function mediaHtml(el) {
    var media = mediaOf(el);
    if (!media.length) return "";
    var caption = captionOf(el);
    var out = "";
    var s = state.settings;
    media.forEach(function (m, i) {
      if (m.kind === "image" && s.images) {
        out +=
          '<figure class="rpr-fig"><img src="' + esc(m.url) + '" alt="" loading="eager" referrerpolicy="no-referrer">' +
          (i === 0 && caption ? "<figcaption>" + esc(caption) + "</figcaption>" : "") +
          "</figure>";
      } else if (m.kind === "video") {
        out +=
          '<p class="rpr-video"><strong>Video:</strong> ' +
          (i === 0 && caption ? esc(caption) + " — " : "") +
          '<span class="rpr-url">' + esc(shortUrl(m.url)) + "</span></p>";
      }
    });
    return out;
  }

  /* Copy a node, keeping meaning and dropping anything interactive. */
  function sanitise(node) {
    var tag = node.tagName.toLowerCase();
    if (/^(button|svg|script|style|iframe|video|audio|input|select|textarea|canvas|noscript)$/.test(tag)) return "";
    if (node.hidden || node.getAttribute("aria-hidden") === "true") return "";
    if (node.matches && node.matches(".media-actions, .media-error, [data-video-id], .video-activate")) return "";

    var inner = "";
    node.childNodes.forEach(function (child) {
      if (child.nodeType === 3) inner += esc(child.nodeValue);
      else if (child.nodeType === 1) inner += sanitise(child);
    });

    if (tag === "a") {
      var href = node.getAttribute("href") || "";
      var text = clean(node.textContent);
      if (!text) return "";
      if (state.settings.showUrls && /^https?:/i.test(href) && shortUrl(href) !== text) {
        return inner + ' <span class="rpr-url">(' + esc(shortUrl(href)) + ")</span>";
      }
      return inner;
    }

    var keep = /^(p|h1|h2|h3|h4|h5|h6|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|blockquote|pre|code|strong|b|em|i|u|sub|sup|br|hr|mark|small|del|ins)$/;
    if (!keep.test(tag)) return inner;
    if (tag === "br" || tag === "hr") return "<" + tag + ">";
    var attrs = "";
    if ((tag === "td" || tag === "th") && node.getAttribute("colspan")) attrs += ' colspan="' + esc(node.getAttribute("colspan")) + '"';
    if ((tag === "td" || tag === "th") && node.getAttribute("rowspan")) attrs += ' rowspan="' + esc(node.getAttribute("rowspan")) + '"';
    if (tag === "ol" && node.getAttribute("start")) attrs += ' start="' + esc(node.getAttribute("start")) + '"';
    return "<" + tag + attrs + ">" + inner + "</" + tag + ">";
  }

  function readNote() {
    var article = document.querySelector("main article");
    if (!article) return null;
    var prose = article.querySelector(".prose");
    if (!prose) return null;

    var titleEl = article.querySelector("h1");
    var pill = article.querySelector(".doc-meta .pill");
    var terms = [];
    var seen = {};
    Array.prototype.forEach.call(prose.querySelectorAll("strong, b"), function (b) {
      var t = clean(b.textContent);
      if (!t || t.length > 28 || t.split(" ").length > 4) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      terms.push(t);
    });

    return {
      title: clean(titleEl ? titleEl.textContent : "Untitled note"),
      subject: pill ? clean(pill.textContent) : "",
      prose: prose,
      terms: terms.slice(0, 24)
    };
  }

  function bodyHtml(data) {
    var out = "";
    var firstH1 = true;
    var sectionOpen = false;
    Array.prototype.forEach.call(data.prose.children, function (el) {
      var tag = el.tagName.toLowerCase();
      if (tag === "h1" && firstH1) {
        firstH1 = false;
        return;
      }
      var hasMedia = !!el.querySelector("a.media-card, .media-card, .media-actions, img") ||
        (el.matches && el.matches(".media-card"));
      if (hasMedia) {
        var m = mediaHtml(el);
        if (m) {
          out += m;
          return;
        }
      }
      if (tag === "h2" && state.settings.sectionBreaks && sectionOpen) {
        out += '<div class="rpr-break"></div>';
      }
      if (tag === "h2") sectionOpen = true;
      out += sanitise(el);
    });
    return out;
  }

  /* Read every member through Revisian's own delegated pack navigation. */
  function dispatchAppAction(action) {
    var button = document.createElement("button");
    button.type = "button";
    button.hidden = true;
    button.setAttribute("data-action", action);
    document.body.appendChild(button);
    button.click();
    button.remove();
  }

  function collectPack() {
    var article = document.querySelector("main article");
    if (!article) return [];
    var buttons = article.querySelectorAll('.pack-contents button[data-action^="pack-item:"]');
    var restoreTitle = "";
    if (!buttons.length) {
      var backToPack = article.querySelector('.field-back button[data-action^="open:"]');
      var openPackAction = backToPack && backToPack.getAttribute("data-action");
      var openNote = article.querySelector("h1");
      if (!openPackAction || !openNote) return [];
      restoreTitle = clean(openNote.textContent);
      dispatchAppAction(openPackAction);
      article = document.querySelector("main article");
      buttons = article && article.querySelectorAll('.pack-contents button[data-action^="pack-item:"]');
    }
    if (!buttons || !buttons.length) return [];
    var packHeading = article.querySelector("h1");
    state.packInfo = packHeading ? { title: clean(packHeading.textContent), subject: (article.querySelector(".doc-meta .pill") || {}).textContent || "" } : null;
    var actions = Array.prototype.map.call(buttons, function (button) {
      return button.getAttribute("data-action");
    });
    var items = [];
    actions.forEach(function (action) {
      dispatchAppAction(action);
      var note = readNote();
      if (note) {
        items.push({ title: note.title, subject: note.subject, html: bodyHtml(note), terms: note.terms.slice() });
      } else {
        var memberArticle = document.querySelector("main article");
        var memberTitle = memberArticle && memberArticle.querySelector("h1");
        if (!memberArticle || !memberTitle) throw new Error("A pack member could not be rendered for printing.");
        var memberCopy = memberArticle.cloneNode(true);
        Array.prototype.forEach.call(memberCopy.querySelectorAll("h1, button, svg, script, style, input, textarea"), function (el) { el.remove(); });
        items.push({ title: clean(memberTitle.textContent), subject: "", html: sanitise(memberCopy), terms: [] });
      }
      var back = document.querySelector('main article .field-back button[data-action^="open:"]');
      if (!back) throw new Error("Pack navigation could not return to the pack.");
      dispatchAppAction(back.getAttribute("data-action"));
    });
    if (restoreTitle) {
      var packButtons = document.querySelectorAll('main article .pack-contents button[data-action^="pack-item:"]');
      var restoreButton = Array.prototype.find.call(packButtons, function (button) {
        var title = button.querySelector("strong");
        return title && clean(title.textContent) === restoreTitle;
      });
      if (restoreButton) dispatchAppAction(restoreButton.getAttribute("data-action"));
    }
    return items;
  }

  /* ------------------------------------------------------------------ *
   * Build the printable sheet
   * ------------------------------------------------------------------ */

  function today() {
    try {
      return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return new Date().toDateString();
    }
  }

  function coverHtml(data) {
    var s = state.settings;
    var rows = [
      ["Name", s.coverName],
      ["Class", s.coverClass],
      ["Teacher", s.coverTeacher],
      ["Date", s.coverDate || today()]
    ].filter(function (r) { return clean(r[1]); });
    return (
      '<section class="rpr-cover">' +
      (data.subject ? '<p class="rpr-kicker">' + esc(data.subject) + "</p>" : "") +
      "<h1>" + esc(data.title) + "</h1>" +
      '<div class="rpr-rule"></div>' +
      (rows.length
        ? '<dl class="rpr-meta">' +
          rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") +
          "</dl>"
        : "") +
      "</section>"
    );
  }

  function termsHtml(data) {
    if (!data.terms.length) return "";
    return (
      '<aside class="rpr-terms"><h2>Key terms</h2><ul>' +
      data.terms.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") +
      "</ul></aside>"
    );
  }

  function buildSheet() {
    var s = state.settings;
    var data = (state.data = readNote());
    if (!data) return null;
    if (state.packData.length && state.packInfo) {
      data.title = state.packInfo.title;
      data.subject = clean(state.packInfo.subject);
    }
    var html = "";
    if (s.cover) html += coverHtml(data);
    if (state.packData.length) {
      html += '<article class="rpr-doc rpr-pack-doc"><header class="rpr-title">';
      if (!s.cover) {
        if (data.subject) html += '<p class="rpr-kicker">' + esc(data.subject) + "</p>";
        html += "<h1>" + esc(data.title) + "</h1>";
      }
      html += "</header><div class=\"rpr-pack-contents\">";
      state.packData.forEach(function (item, index) {
        html += '<section class="rpr-pack-item' + (index ? " rpr-pack-page" : "") + '">';
        if (item.subject) html += '<p class="rpr-kicker">' + esc(item.subject) + "</p>";
        html += "<h2>" + esc(item.title) + "</h2><div class=\"rpr-body\">" + item.html + "</div>";
        if (s.keyTerms && item.terms.length) html += termsHtml({ terms: item.terms });
        if (s.stampSpace) html += '<div class="rpr-stamp-space"><span>Teacher stamp / feedback</span></div>';
        html += "</section>";
      });
      html += "</div></article>";
      return html;
    }
    html += '<article class="rpr-doc"><header class="rpr-title">';
    if (!s.cover) {
      if (data.subject) html += '<p class="rpr-kicker">' + esc(data.subject) + "</p>";
      html += "<h1>" + esc(data.title) + "</h1>";
    }
    html += "</header>";
    html += '<div class="rpr-body">' + bodyHtml(data) + "</div>";
    if (s.keyTerms) html += termsHtml(data);
    html += "</article>";
    return html;
  }

  /* ------------------------------------------------------------------ *
   * Apply settings: page rule, CSS variables, classes
   * ------------------------------------------------------------------ */

  function pageRule() {
    var s = state.settings;
    var paper = PAPERS[s.paper];
    var m = MARGINS[s.margin];
    var left = m + (s.binding ? 12 : 0);
    var running = s.header ? "'" + state.data.title.replace(/['\\\n]/g, " ").slice(0, 70) + "'" : "''";
    return (
      "@page { size: " + paper.css + " " + s.orientation + "; margin: " + m + "mm " + m + "mm " + (m + 4) + "mm " + left + "mm; " +
      (s.pageNumbers
        ? "@bottom-center { content: counter(page) ' / ' counter(pages); font: 9pt sans-serif; color: #555; } "
        : "") +
      (s.header ? "@top-right { content: " + running + "; font: 8.5pt sans-serif; color: #777; } " : "") +
      "}"
    );
  }

  function paperSizeMm() {
    var s = state.settings;
    var dims = { A3: [297, 420], A4: [210, 297], A5: [148, 210], Letter: [216, 279] }[s.paper];
    return s.orientation === "landscape" ? [dims[1], dims[0]] : dims;
  }

  function apply() {
    if (!state.root) return;
    var s = state.settings;
    var m = MARGINS[s.margin];
    var left = m + (s.binding ? 12 : 0);
    var size = paperSizeMm();
    var sheet = state.root.querySelector(".rpr-sheet");
    var paper = state.root.querySelector(".rpr-paper");
    var pageStyle = document.getElementById("rpr-page-style");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "rpr-page-style";
      document.head.appendChild(pageStyle);
    }
    if (state.data) pageStyle.textContent = pageRule();

    paper.style.setProperty("--rpr-w", size[0] + "mm");
    paper.style.setProperty("--rpr-h", size[1] + "mm");
    paper.style.setProperty("--rpr-mt", m + "mm");
    paper.style.setProperty("--rpr-mr", m + "mm");
    paper.style.setProperty("--rpr-mb", m + 4 + "mm");
    paper.style.setProperty("--rpr-ml", left + "mm");
    paper.style.setProperty("--rpr-fs", s.fontSize + "pt");
    paper.style.setProperty("--rpr-cols", String(s.columns));
    sheet.classList.toggle("rpr-ink", s.inkSaver);
    sheet.classList.toggle("rpr-cover-on", s.cover);
    state.root.setAttribute("data-landscape", s.orientation === "landscape" ? "1" : "0");

    var out = state.root.querySelector("[data-fs-out]");
    if (out) out.textContent = s.fontSize + " pt";
    state.root.querySelector(".rpr-cover-fields").hidden = !s.cover;
  }

  function rebuild() {
    var html = buildSheet();
    if (html == null) return;
    state.root.querySelector(".rpr-sheet").innerHTML = html;
    apply();
  }

  /* ------------------------------------------------------------------ *
   * UI
   * ------------------------------------------------------------------ */

  function field(label, control) {
    return '<label class="rpr-field"><span>' + label + "</span>" + control + "</label>";
  }

  function select(key, options) {
    return (
      '<select data-key="' + key + '">' +
      options
        .map(function (o) {
          return '<option value="' + o[0] + '"' + (String(state.settings[key]) === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>";
        })
        .join("") +
      "</select>"
    );
  }

  function toggle(key, label, hint) {
    return (
      '<label class="rpr-toggle"><input type="checkbox" data-key="' + key + '"' + (state.settings[key] ? " checked" : "") + ">" +
      "<span><strong>" + label + "</strong>" + (hint ? "<small>" + hint + "</small>" : "") + "</span></label>"
    );
  }

  function text(key, label) {
    return field(label, '<input type="text" data-key="' + key + '" value="' + esc(state.settings[key]) + '" maxlength="60">');
  }

  function panelHtml() {
    var s = state.settings;
    return (
      '<div class="rpr-top">' +
      '<div><strong>Print mode</strong><small>Set it up once, then print or save a PDF.</small></div>' +
      '<div class="rpr-actions">' +
      '<button type="button" class="rpr-btn" data-act="close">Close</button>' +
      '<button type="button" class="rpr-btn rpr-primary" data-act="print">Print / Save PDF</button>' +
      "</div></div>" +
      '<div class="rpr-body-wrap">' +
      '<aside class="rpr-panel" aria-label="Print settings">' +
      "<h3>Page</h3>" +
      '<div class="rpr-row">' +
      field("Paper", select("paper", Object.keys(PAPERS).map(function (k) { return [k, PAPERS[k].label]; }))) +
      field("Orientation", select("orientation", [["portrait", "Portrait"], ["landscape", "Landscape"]])) +
      "</div>" +
      '<div class="rpr-row">' +
      field("Margins", select("margin", [["narrow", "Narrow (10 mm)"], ["normal", "Normal (18 mm)"], ["wide", "Wide (25 mm)"]])) +
      field("Columns", select("columns", [[1, "One"], [2, "Two"]])) +
      "</div>" +
      toggle("binding", "Binding edge", "Adds 12 mm on the left for hole punching or stapling.") +
      '<label class="rpr-field"><span>Text size <b data-fs-out>' + s.fontSize + ' pt</b></span>' +
      '<input type="range" min="9" max="16" step="0.5" data-key="fontSize" value="' + s.fontSize + '"></label>' +
      "<h3>Printer friendly</h3>" +
      toggle("inkSaver", "Ink saver", "Black text on white, greyscale images, no coloured backgrounds.") +
      toggle("images", "Include images", "Turn off to save ink and paper.") +
      toggle("showUrls", "Write out link addresses", "Links stay readable on paper.") +
      toggle("stampSpace", "Stamp / feedback space", "Leaves a labelled area at the end of every pack item.") +
      "<h3>Project layout</h3>" +
      toggle("cover", "Cover page", "Title, name, class, teacher and date.") +
      '<div class="rpr-cover-fields" hidden>' +
      text("coverName", "Your name") + text("coverClass", "Class / subject") + text("coverTeacher", "Teacher") +
      field("Date (blank = today)", '<input type="text" data-key="coverDate" value="' + esc(s.coverDate) + '" maxlength="40" placeholder="' + esc(today()) + '">') +
      "</div>" +
      toggle("header", "Running title", "Note title at the top of every page." ) +
      toggle("pageNumbers", "Page numbers", "Shown as 1 / 4 in Chrome and Edge.") +
      toggle("sectionBreaks", "New page for each section", "Starts every main heading on a fresh page.") +
      toggle("keyTerms", "Key terms list", "Adds the note’s bold terms at the end.") +
      '<p class="rpr-tip">In the print dialog, turn on <em>Background graphics</em> only if you want colours, and set <em>Margins</em> to <em>Default</em>.</p>' +
      "</aside>" +
      '<div class="rpr-stage"><div class="rpr-paper"><div class="rpr-sheet"></div></div></div>' +
      "</div>"
    );
  }

  function openPrint() {
    if (state.root) return;
    if (!readNote()) {
      var toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = "Open a note first, then choose Print mode.";
        toast.setAttribute("data-show", "1");
        setTimeout(function () { toast.removeAttribute("data-show"); }, 3000);
      }
      return;
    }
    state.packInfo = null;
    try {
      state.packData = collectPack();
    } catch (err) {
      state.packData = [];
      state.packInfo = null;
      var toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = "Could not load every pack item. Open the pack overview and try again.";
        toast.setAttribute("data-show", "1");
        setTimeout(function () { toast.removeAttribute("data-show"); }, 4000);
      }
      return;
    }
    var root = document.createElement("div");
    root.className = "rpr-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Print mode");
    root.innerHTML = panelHtml();
    document.body.appendChild(root);
    document.body.classList.add("rpr-open");
    state.root = root;

    root.addEventListener("input", onChange);
    root.addEventListener("change", onChange);
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.getAttribute("data-act") === "close") closePrint();
      if (b.getAttribute("data-act") === "print") doPrint();
    });
    document.addEventListener("keydown", onKey, true);
    rebuild();
  }

  function onChange(e) {
    var el = e.target;
    var key = el.getAttribute && el.getAttribute("data-key");
    if (!key) return;
    var def = DEFAULTS[key];
    var val;
    if (el.type === "checkbox") val = el.checked;
    else if (typeof def === "number") val = parseFloat(el.value) || def;
    else val = el.value;
    state.settings[key] = val;
    save();
    /* Text fields only need the cover re-rendered; everything else rebuilds. */
    rebuild();
  }

  function onKey(e) {
    if (e.key === "Escape" && state.root) {
      e.preventDefault();
      closePrint();
    }
  }

  function doPrint() {
    document.body.classList.add("rpr-printing");
    var imgs = state.root.querySelectorAll(".rpr-sheet img");
    var pending = Array.prototype.filter.call(imgs, function (i) { return !i.complete; });
    var go = function () {
      window.print();
    };
    if (!pending.length) return go();
    var left = pending.length;
    var done = function () { if (--left <= 0) go(); };
    pending.forEach(function (i) {
      i.addEventListener("load", done, { once: true });
      i.addEventListener("error", done, { once: true });
    });
    setTimeout(go, 4000);
  }

  window.addEventListener("afterprint", function () {
    document.body.classList.remove("rpr-printing");
  });

  function closePrint() {
    if (!state.root) return;
    document.removeEventListener("keydown", onKey, true);
    state.root.remove();
    state.root = null;
    document.body.classList.remove("rpr-open", "rpr-printing");
    var ps = document.getElementById("rpr-page-style");
    if (ps) ps.remove();
  }

  /* ------------------------------------------------------------------ *
   * Entry points: a Print button, and a card in Revision styles
   * ------------------------------------------------------------------ */

  var printerSvg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';

  function ensureToolbarButton() {
    if (document.querySelector("[data-print-mode]")) return;
    var host = document.querySelector(".workspace-actions");
    if (!host) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn outline rpr-launch";
    btn.setAttribute("data-print-mode", "1");
    btn.title = "Print entire pack (Ctrl+Alt+Shift+P)";
    btn.innerHTML = printerSvg + "<span>Print</span>";
    var present = host.querySelector("[data-present]");
    var trigger = host.querySelector('[data-action="revision-styles"]');
    var anchor = present || trigger;
    if (anchor && anchor.parentElement === host) host.insertBefore(btn, anchor);
    else host.appendChild(btn);
  }

  function ensureStyleCard() {
    var dialog = document.getElementById("dialog");
    if (!dialog || !dialog.open) return;
    var choices = dialog.querySelector(".revision-choices");
    if (!choices || choices.querySelector("[data-action='" + STYLE_ACTION + "']")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "revision-choice";
    btn.setAttribute("data-action", STYLE_ACTION);
    btn.setAttribute("data-testid", "revision-print");
    btn.innerHTML =
      "<span>" + printerSvg.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24" width="17" height="17"') + "</span>" +
      "<span><strong>Print mode</strong>" +
      "<small>Print-friendly page size, margins, binding edge, cover page, ink saver and page numbers. Use Ctrl+Alt+Shift+P to print.</small></span>";
    choices.appendChild(btn);
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      ensureToolbarButton();
      ensureStyleCard();
    });
  }

  document.addEventListener(
    "click",
    function (e) {
      var hit = e.target.closest("[data-print-mode],[data-action='" + STYLE_ACTION + "']");
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      var dialog = document.getElementById("dialog");
      if (dialog && dialog.open && dialog.close) dialog.close();
      openPrint();
    },
    true
  );

  document.addEventListener(
    "keydown",
    function (e) {
      if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPrint();
      } else if (!e.ctrlKey && e.altKey && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPrint();
      }
    },
    true
  );

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();

  window.RevisianPrint = { open: openPrint, close: closePrint };
})();
