(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Config & module references
  // -------------------------------------------------------------------------

  var cfg           = window.__cassetteConfig || {};
  var STATIC_BASE   = cfg.staticBase     || 'http://localhost:3042';
  var ANIM_SPEED    = cfg.animationSpeed || 1.0;
  var LABEL_OPACITY = cfg.labelOpacity   || 0.75;
  var RANDOMIZE     = cfg.randomizeTape  || false;
  var TAPE_POOL     = Array.isArray(cfg.tapePool) && cfg.tapePool.length ? cfg.tapePool : null;
  var GLOBAL_FONT   = cfg.fontFamily     || '';   // '' = use each tape's own font

  var math    = window.__cassette.math;
  var loader  = window.__cassette.loader;
  var context = window.__cassette.context;
  var draw    = window.__cassette.draw;

  // -------------------------------------------------------------------------
  // Mutable state
  // -------------------------------------------------------------------------

  var state = {
    seek: 0, duration: 0, status: 'stop',
    albumart: '', title: '', artist: '', album: '',
    stream: false, trackType: '',
    hubAngle: 0, rafId: null, lastFrameTs: null, prevTitle: null,
    volume: 50,
  };

  var tape = {
    id:                 cfg.activeTape || '',
    theme:              null,
    images:             {},
    albumart:           null,
    composited:         null,
    originalFontFamily: null,   // saved on load; restored when GLOBAL_FONT is cleared
  };

  var availableTapes = [];
  var canvas         = null;
  var ctx            = null;
  var _socket        = null;
  var _scrubber      = null;

  // -------------------------------------------------------------------------
  // Font override
  // -------------------------------------------------------------------------

  /** Apply or remove the global font override on the current tape theme. */
  function _applyFontOverride() {
    if (!tape.theme) return;
    tape.theme.fontFamily = GLOBAL_FONT || tape.originalFontFamily;
    if (GLOBAL_FONT) {
      loader.loadFont(GLOBAL_FONT, STATIC_BASE, function () {});
    }
  }

  // -------------------------------------------------------------------------
  // Tape loading helpers
  // -------------------------------------------------------------------------

  function recompositeArt() {
    if (!canvas) return;
    tape.composited = draw.precompositeArt(canvas.width, canvas.height, tape.images, tape.albumart);
  }

  function _afterTapeLoaded(theme, images) {
    tape.theme              = theme;
    tape.images             = images;
    tape.originalFontFamily = theme.fontFamily;
    _applyFontOverride();
  }

  function switchToRandomTape() {
    var pool       = TAPE_POOL
      ? availableTapes.filter(function (t) { return TAPE_POOL.indexOf(t.id) !== -1; })
      : availableTapes;
    var candidates = pool.filter(function (t) { return t.id !== tape.id; });
    if (!candidates.length) candidates = pool;
    if (!candidates.length) {
      console.log('[MixTape] switchToRandomTape: no candidates (pool:', JSON.stringify(TAPE_POOL), ', available:', availableTapes.length, ')');
      return;
    }

    var next    = candidates[Math.floor(Math.random() * candidates.length)];
    console.log('[MixTape] switchToRandomTape:', tape.id, '->', next.id);
    var prevArt = state.albumart;
    loader.loadTape(next.id, STATIC_BASE, function (theme, images) {
      tape.id = next.id;
      _afterTapeLoaded(theme, images);
      loader.loadAlbumArt(prevArt, STATIC_BASE, function (img) {
        tape.albumart = img;
        recompositeArt();
        // Ensure the canvas updates whether or not the animation loop is running.
        if (state.status === 'play') startLoop(); else drawFrozenFrame();
      });
    });
  }

  // -------------------------------------------------------------------------
  // Animation loop
  // -------------------------------------------------------------------------

  /** Advance seek and hub rotation; returns computed spool radii. */
  function _advanceAnimation(dt) {
    if (state.status === 'play' && dt > 0) state.seek += dt / 1000;
    var radii = math.computeSpoolRadii(state.seek, state.duration, tape.theme);
    if (state.status === 'play') {
      state.hubAngle += math.computeHubDelta(dt, (radii.leftR + radii.rightR) / 2, ANIM_SPEED);
    }
    return radii;
  }

  /** Execute all canvas draw calls for one frame. */
  function _renderFrame(W, H, radii) {
    var hubSize = tape.theme.maxSpoolRadius * 1.1;
    var maxR    = tape.theme.maxSpoolRadius;
    draw.background(ctx, W, H, tape.images);
    draw.spoolTexture(ctx, tape.theme.leftSpoolX,  tape.theme.leftSpoolY,  radii.leftR,  maxR, tape.images.tapetexture);
    draw.spoolTexture(ctx, tape.theme.rightSpoolX, tape.theme.rightSpoolY, radii.rightR, maxR, tape.images.tapetexture);
    draw.rotatedHub(ctx, tape.theme.leftSpoolX,  tape.theme.leftSpoolY,  hubSize, state.hubAngle, tape.images.hub);
    draw.rotatedHub(ctx, tape.theme.rightSpoolX, tape.theme.rightSpoolY, hubSize, state.hubAngle, tape.images.hub);
    draw.tapePath(ctx, tape.theme, radii.leftR, radii.rightR);
    if (tape.images.shell) ctx.drawImage(tape.images.shell, 0, 0, W, H);
    draw.drawComposited(ctx, tape.composited, LABEL_OPACITY);
    draw.textFields(ctx, W, H, tape.theme, state);
  }

  function drawFrame(timestamp) {
    var dt = state.lastFrameTs !== null ? timestamp - state.lastFrameTs : 0;
    state.lastFrameTs = timestamp;
    var radii = _advanceAnimation(dt);
    _renderFrame(canvas.width, canvas.height, radii);
    if (_scrubber) _scrubber.update();
    state.rafId = state.status === 'play' ? requestAnimationFrame(drawFrame) : null;
  }

  function startLoop() {
    if (state.rafId !== null) return;
    state.lastFrameTs = null;
    state.rafId = requestAnimationFrame(drawFrame);
  }

  function stopLoop() {
    if (state.rafId === null) return;
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  function drawFrozenFrame() {
    stopLoop();
    requestAnimationFrame(function (ts) { state.lastFrameTs = ts; drawFrame(ts); });
  }

  // -------------------------------------------------------------------------
  // Volumio overlay
  // -------------------------------------------------------------------------

  function showVolumioOverlay() {
    var overlay = document.getElementById('volumio-overlay');
    var frame   = document.getElementById('volumio-frame');
    if (_socket && state.status === 'play') _socket.emit('pause');
    if (!frame.src || frame.src === 'about:blank') {
      frame.src = 'http://' + window.location.hostname + ':3000';
    }
    overlay.style.display = 'flex';
    overlay.offsetHeight; // force reflow so transition fires
    overlay.classList.add('visible');
    stopLoop();
  }

  function hideVolumioOverlay() {
    var overlay = document.getElementById('volumio-overlay');
    overlay.classList.remove('visible');
    setTimeout(function () {
      overlay.style.display = 'none';
      if (state.status === 'play') startLoop();
      else drawFrozenFrame();
    }, 200);
  }

  // -------------------------------------------------------------------------
  // Scrubber
  // -------------------------------------------------------------------------

  function initScrubber() {
    var scrubber = document.getElementById('scrubber');
    var fill     = document.getElementById('scrubber-fill');
    var thumb    = document.getElementById('scrubber-thumb');
    if (!scrubber || !fill || !thumb) return null;

    function seekToClientX(clientX) {
      if (state.duration <= 0) return;
      var rect  = scrubber.getBoundingClientRect();
      var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      state.seek = Math.floor(ratio * state.duration);
      if (_socket) _socket.emit('seek', state.seek);
    }

    scrubber.addEventListener('touchstart', function (e) {
      e.stopPropagation();
      seekToClientX(e.touches[0].clientX);
    }, { passive: true });

    scrubber.addEventListener('touchmove', function (e) {
      e.stopPropagation();
      seekToClientX(e.touches[0].clientX);
    }, { passive: true });

    scrubber.addEventListener('click', function (e) {
      e.stopPropagation();
      seekToClientX(e.clientX);
    });

    return {
      update: function () {
        if (state.duration <= 0) return;
        var pct = Math.min(state.seek / state.duration * 100, 100) + '%';
        fill.style.width = pct;
        thumb.style.left = pct;
      },
    };
  }

  // -------------------------------------------------------------------------
  // Controls bar
  // -------------------------------------------------------------------------

  function initControls() {
    var bar      = document.getElementById('controls');
    var scrubber = document.getElementById('scrubber');
    var hideTimer = null;

    function showControls() {
      bar.classList.add('visible');
      scrubber.classList.add('visible');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        bar.classList.remove('visible');
        scrubber.classList.remove('visible');
      }, 3000);
    }

    document.body.addEventListener('touchstart', showControls, { passive: true });
    document.body.addEventListener('mousedown',  showControls);

    document.getElementById('btn-prev').addEventListener('click', function (e) {
      e.stopPropagation(); if (_socket) _socket.emit('prev');
    });
    document.getElementById('btn-play').addEventListener('click', function (e) {
      e.stopPropagation(); if (_socket) _socket.emit('play');
    });
    document.getElementById('btn-pause').addEventListener('click', function (e) {
      e.stopPropagation(); if (_socket) _socket.emit('pause');
    });
    document.getElementById('btn-stop').addEventListener('click', function (e) {
      e.stopPropagation(); showVolumioOverlay();
    });
    document.getElementById('btn-next').addEventListener('click', function (e) {
      e.stopPropagation(); if (_socket) _socket.emit('next');
    });
    document.getElementById('btn-voldown').addEventListener('click', function (e) {
      e.stopPropagation(); if (_socket) _socket.emit('volume', '-');
    });
    document.getElementById('btn-volup').addEventListener('click', function (e) {
      e.stopPropagation(); if (_socket) _socket.emit('volume', '+');
    });
    document.getElementById('volumio-close').addEventListener('click', function (e) {
      e.stopPropagation(); hideVolumioOverlay();
    });

    var volToast     = document.getElementById('vol-toast');
    var volHideTimer = null;

    function showVolume(vol) {
      volToast.textContent = 'Vol: ' + vol + '%';
      volToast.classList.add('visible');
      clearTimeout(volHideTimer);
      volHideTimer = setTimeout(function () { volToast.classList.remove('visible'); }, 2000);
    }

    return { showVolume: showVolume };
  }

  // -------------------------------------------------------------------------
  // Socket — state handler decomposed from connectSocket
  // -------------------------------------------------------------------------

  function _onAlbumArtChange(artUrl) {
    state.albumart = artUrl;
    loader.loadAlbumArt(artUrl, STATIC_BASE, function (img) {
      tape.albumart = img;
      recompositeArt();
    });
  }

  function _handlePushState(s, controls) {
    var prevStatus = state.status;
    var prevTitle  = state.title;
    var prevVolume = state.volume;

    state.seek      = typeof s.seek     === 'number' ? s.seek / 1000 : 0;
    state.duration  = typeof s.duration === 'number' ? s.duration : 0;
    state.status    = s.status    || 'stop';
    state.volume    = typeof s.volume === 'number' ? s.volume : (state.volume || 50);
    state.title     = s.title     || '';
    state.artist    = s.artist    || '';
    state.album     = s.album     || '';
    state.stream    = s.stream    || false;
    state.trackType = s.trackType || '';

    context.setFromState(s);

    if (typeof s.volume === 'number' && typeof prevVolume === 'number' && s.volume !== prevVolume) {
      controls.showVolume(s.volume);
    }

    if (s.albumart !== state.albumart) {
      _onAlbumArtChange(s.albumart || '');
    }

    if (state.title !== prevTitle) {
      console.log('[MixTape] title change: "' + prevTitle + '" -> "' + state.title + '" RANDOMIZE=' + RANDOMIZE + ' tapes=' + availableTapes.length);
      if (prevTitle !== null && RANDOMIZE) {
        switchToRandomTape();
      }
    }

    if (state.status === 'play' && prevStatus !== 'play') {
      var overlay = document.getElementById('volumio-overlay');
      if (overlay && overlay.style.display !== 'none') hideVolumioOverlay();
    }

    if (state.status === 'play' && canvas) startLoop();
    else if (canvas) drawFrozenFrame();
  }

  function connectSocket() {
    if (typeof io === 'undefined') {
      setTimeout(connectSocket, 500);
      return;
    }

    var volumioUrl = 'http://' + window.location.hostname + ':3000';
    _socket = io(volumioUrl);

    var controls = initControls();
    _socket.emit('getState', '');
    _socket.on('pushState', function (s) { _handlePushState(s, controls); });
  }

  // -------------------------------------------------------------------------
  // Config polling — also handles live font/tape changes
  // -------------------------------------------------------------------------

  function pollConfig() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', STATIC_BASE + '/config');
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var fresh;
      try { fresh = JSON.parse(xhr.responseText); } catch (_) { return; }

      // Active tape changed (only when not in random mode)
      if (fresh.activeTape && fresh.activeTape !== tape.id && !RANDOMIZE) {
        var next = fresh.activeTape;
        loader.loadTape(next, STATIC_BASE, function (theme, images) {
          tape.id = next;
          _afterTapeLoaded(theme, images);
          recompositeArt();
        });
      }

      var wasRandom = RANDOMIZE;
      RANDOMIZE = fresh.randomizeTape  || false;
      TAPE_POOL = Array.isArray(fresh.tapePool) && fresh.tapePool.length ? fresh.tapePool : null;
      if (Array.isArray(fresh.availableTapes)) {
        availableTapes = fresh.availableTapes;
      }

      // User just enabled randomize — switch immediately so they see it take effect.
      if (!wasRandom && RANDOMIZE) {
        switchToRandomTape();
      }

      // Global font override changed
      if (typeof fresh.fontFamily === 'string' && fresh.fontFamily !== GLOBAL_FONT) {
        GLOBAL_FONT = fresh.fontFamily;
        _applyFontOverride();
      }
    };
    xhr.onerror = function () {};
    xhr.send();
  }

  // -------------------------------------------------------------------------
  // Bootstrap
  // -------------------------------------------------------------------------

  function initCanvas() {
    canvas        = document.getElementById('cassette-canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx           = canvas.getContext('2d');
  }

  function bootstrap() {
    initCanvas();
    _scrubber = initScrubber();
    loader.fetchTapeList(STATIC_BASE, function (tapes) {
      availableTapes = tapes;
      loader.loadTape(tape.id, STATIC_BASE, function (theme, images) {
        _afterTapeLoaded(theme, images);
        context.restore(function () {
          connectSocket();
          showVolumioOverlay();
        });
      });
    });
    pollConfig();                    // pick up saved config immediately on load
    setInterval(pollConfig, 5000);
  }

  window.addEventListener('load', bootstrap);

})();
