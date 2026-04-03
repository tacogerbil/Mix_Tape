(function () {
  'use strict';

  window.__cassette = window.__cassette || {};

  var THEME_DEFAULTS = {
    name:           'Unknown',
    leftSpoolX:     210,  leftSpoolY:  185,
    rightSpoolX:    590,  rightSpoolY: 185,
    minSpoolRadius: 28,   maxSpoolRadius: 90,
    leftGuideX:  null, leftGuideY:  null,
    rightGuideX: null, rightGuideY: null,
    fontFamily:     'Permanent Marker',
    textFields:     [
      { x: 0.50, y: 0.10, size: 0.07,  width: 0.7, rotate: 0.0, colour: '#ffffff', binding: 'title'  },
      { x: 0.50, y: 0.20, size: 0.042, width: 0.7, rotate: 0.0, colour: '#e8d5a0', binding: 'artist' },
    ],
  };

  function fetchJson(url, onSuccess, onFail) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { onSuccess(JSON.parse(xhr.responseText)); return; } catch (_) {}
      }
      onFail();
    };
    xhr.onerror = onFail;
    xhr.send();
  }

  function loadImages(assetMap, callback) {
    var keys    = Object.keys(assetMap).filter(function (k) { return !!assetMap[k]; });
    var result  = {};
    var pending = keys.length;
    if (pending === 0) { callback(result); return; }
    keys.forEach(function (key) {
      var img        = new Image();
      img.onload = img.onerror = function () {
        result[key] = img.naturalWidth > 0 ? img : null;
        if (--pending === 0) {
          try { result.labelmask = buildAlphaMask(result.labelmask); } catch (_) { result.labelmask = null; }
          callback(result);
        }
      };
      img.src = assetMap[key];
    });
  }

  function buildAlphaMask(img) {
    if (!img) return null;
    var W   = img.naturalWidth;
    var H   = img.naturalHeight;
    var c   = document.createElement('canvas');
    c.width = W; c.height = H;
    var cx  = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    var px  = cx.getImageData(0, 0, W, H);
    var d   = px.data;
    for (var i = 0; i < d.length; i += 4) {
      d[i + 3] = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      d[i] = d[i + 1] = d[i + 2] = 0;
    }
    cx.putImageData(px, 0, 0);
    return c;
  }

  /**
   * "Permanent Marker" is bundled as a woff2 on the static server — no
   * network request needed, works fully offline.
   */
  function _loadBundledFont(name, staticBase, cb) {
    var faceId = 'cassette-face-' + name.replace(/\s+/g, '-');
    if (!document.getElementById(faceId)) {
      var style = document.createElement('style');
      style.id  = faceId;
      style.textContent =
        '@font-face{font-family:"' + name + '";' +
        'src:url("' + staticBase + '/assets/fonts/PermanentMarker-Regular.woff2") format("woff2");' +
        'font-display:swap;}';
      document.head.appendChild(style);
    }
    cb();
  }

  function _loadCdnFont(name, cb) {
    var linkId = 'cassette-font-' + name.replace(/\s+/g, '-');
    if (document.getElementById(linkId)) { cb(); return; }
    var link    = document.createElement('link');
    link.id     = linkId;
    link.rel    = 'stylesheet';
    link.href   = 'https://fonts.googleapis.com/css2?family=' +
                  encodeURIComponent(name).replace(/%20/g, '+') + ':wght@400&display=swap';
    link.onload = link.onerror = cb;
    document.head.appendChild(link);
  }

  /**
   * Register a font so the canvas can render it.
   * Idempotent: calling twice for the same font is a no-op.
   *
   * @param {string}   fontName    Exact Google Fonts family name, e.g. "Rock Salt"
   * @param {string}   staticBase  Base URL of the Mix Tape static server
   * @param {function} callback    Called once the font stylesheet is injected
   */
  function loadFont(fontName, staticBase, callback) {
    if (fontName === 'Permanent Marker') {
      _loadBundledFont(fontName, staticBase, callback);
    } else {
      _loadCdnFont(fontName, callback);
    }
  }

  function fetchTapeList(staticBase, callback) {
    fetchJson(staticBase + '/tapes', callback, function () { callback([]); });
  }

  function loadTape(tapeId, staticBase, callback) {
    var base = staticBase + '/assets/tapes/' + tapeId + '/';

    fetchJson(
      base + 'theme.json',
      function (raw) {
        var theme = Object.assign({}, THEME_DEFAULTS, raw);
        loadImages({
          bg:          base + 'bg.jpg',
          shell:       base + 'shell.png',
          hub:         base + 'hub.png',
          tapetexture: base + 'tape_texture.png',
          labelmask:   base + 'label_mask.png',
          misc:        base + 'misc.png',
        }, function (images) {
          loadFont(theme.fontFamily, staticBase, function () {
            callback(theme, images);
          });
        });
      },
      function () {
        callback(Object.assign({}, THEME_DEFAULTS), {});
      }
    );
  }

  function loadAlbumArt(artUrl, staticBase, callback) {
    if (!artUrl) { callback(null); return; }
    var img         = new Image();
    img.crossOrigin = 'anonymous';
    img.onload      = function () { callback(img); };
    img.onerror     = function () {
      var proxy     = new Image();
      proxy.onload  = function () { callback(proxy); };
      proxy.onerror = function () { callback(null); };
      proxy.src     = staticBase + '/proxy?url=' + encodeURIComponent(artUrl);
    };
    var base = /^https?:\/\//i.test(artUrl) ? '' : 'http://' + window.location.hostname + ':3000';
    img.src  = base + artUrl;
  }

  window.__cassette.loader = {
    fetchTapeList: fetchTapeList,
    loadTape:      loadTape,
    loadAlbumArt:  loadAlbumArt,
    loadFont:      loadFont,
  };

})();
