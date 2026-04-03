(function () {
  'use strict';

  var cfg        = window.__cassetteConfig || {};
  var STATIC_BASE = cfg.staticBase     || 'http://localhost:3042';
  var ANIM_SPEED  = cfg.animationSpeed || 1.0;
  var LABEL_OPACITY = cfg.labelOpacity || 0.75;

  var math    = window.__cassette.math;
  var loader  = window.__cassette.loader;
  var context = window.__cassette.context;
  var draw    = window.__cassette.draw;

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
    originalFontFamily: null,
  };

  var availableTapes = [];
  var canvas         = null;
  var ctx            = null;

  // Exposed on namespace so socket/overlay/controls modules can read them.
  window.__cassette._state    = state;
  window.__cassette._tape     = tape;
  window.__cassette._randomize = cfg.randomizeTape || false;

  function _applyFontOverride() {
    if (!tape.theme) return;
    var globalFont = cfg.fontFamily || '';
    tape.theme.fontFamily = globalFont || tape.originalFontFamily;
    if (globalFont) loader.loadFont(globalFont, STATIC_BASE, function () {});
  }

  function recompositeArt() {
    if (!canvas) return;
    tape.composited = draw.precompositeArt(canvas.width, canvas.height, tape.images, tape.albumart);
  }
  window.__cassette.recompositeArt = recompositeArt;

  function _afterTapeLoaded(theme, images) {
    tape.theme              = theme;
    tape.images             = images;
    tape.originalFontFamily = theme.fontFamily;
    _applyFontOverride();
  }

  function switchToRandomTape() {
    var tapePool = window.__cassette._tapePool || null;
    var pool       = tapePool
      ? availableTapes.filter(function (t) { return tapePool.indexOf(t.id) !== -1; })
      : availableTapes;
    var candidates = pool.filter(function (t) { return t.id !== tape.id; });
    if (!candidates.length) candidates = pool;
    if (!candidates.length) return;

    var next    = candidates[Math.floor(Math.random() * candidates.length)];
    var prevArt = state.albumart;
    loader.loadTape(next.id, STATIC_BASE, function (theme, images) {
      tape.id = next.id;
      _afterTapeLoaded(theme, images);
      loader.loadAlbumArt(prevArt, STATIC_BASE, function (img) {
        tape.albumart = img;
        recompositeArt();
        if (state.status === 'play') startLoop(); else drawFrozenFrame();
      });
    });
  }
  window.__cassette.switchToRandomTape = switchToRandomTape;

  function _advanceAnimation(dt) {
    if (state.status === 'play' && dt > 0) state.seek += dt / 1000;
    var radii = math.computeSpoolRadii(state.seek, state.duration, tape.theme);
    if (state.status === 'play') {
      state.hubAngle += math.computeHubDelta(dt, (radii.leftR + radii.rightR) / 2, ANIM_SPEED);
    }
    return radii;
  }

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
    var scrubber = window.__cassette._scrubber;
    if (scrubber) scrubber.update();
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

  window.__cassette.startLoop      = startLoop;
  window.__cassette.stopLoop       = stopLoop;
  window.__cassette.drawFrozenFrame = drawFrozenFrame;

  function pollConfig() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', STATIC_BASE + '/config');
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var fresh;
      try { fresh = JSON.parse(xhr.responseText); } catch (_) { return; }

      // Active tape changed (only when not in random mode)
      if (fresh.activeTape && fresh.activeTape !== tape.id && !window.__cassette._randomize) {
        var next = fresh.activeTape;
        loader.loadTape(next, STATIC_BASE, function (theme, images) {
          tape.id = next;
          _afterTapeLoaded(theme, images);
          recompositeArt();
        });
      }

      var wasRandom = window.__cassette._randomize;
      window.__cassette._randomize = fresh.randomizeTape || false;
      window.__cassette._tapePool  = Array.isArray(fresh.tapePool) && fresh.tapePool.length ? fresh.tapePool : null;
      if (Array.isArray(fresh.availableTapes)) {
        availableTapes = fresh.availableTapes;
      }

      // User just enabled randomize — switch immediately so they see it take effect.
      if (!wasRandom && window.__cassette._randomize) {
        switchToRandomTape();
      }

      if (typeof fresh.fontFamily === 'string' && fresh.fontFamily !== cfg.fontFamily) {
        cfg.fontFamily = fresh.fontFamily;
        _applyFontOverride();
      }
    };
    xhr.onerror = function () {};
    xhr.send();
  }

  function initCanvas() {
    canvas        = document.getElementById('cassette-canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx           = canvas.getContext('2d');
  }

  function bootstrap() {
    initCanvas();
    window.__cassette._scrubber = window.__cassette.controls.initScrubber();

    loader.fetchTapeList(STATIC_BASE, function (tapes) {
      availableTapes = tapes;
      loader.loadTape(tape.id, STATIC_BASE, function (theme, images) {
        _afterTapeLoaded(theme, images);
        context.restore(function () {
          window.__cassette.socket.connect();
          window.__cassette.overlay.show();
        });
      });
    });

    // Polling is used instead of a persistent socket subscription for config
    // because config changes originate from the Volumio UI, not Volumio's
    // socket.io push events.
    pollConfig();
    setInterval(pollConfig, 5000);
  }

  window.addEventListener('load', bootstrap);

})();
