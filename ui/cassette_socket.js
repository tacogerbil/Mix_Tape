(function () {
  'use strict';

  window.__cassette = window.__cassette || {};

  function _onAlbumArtChange(artUrl) {
    var state  = window.__cassette._state;
    var tape   = window.__cassette._tape;
    var loader = window.__cassette.loader;
    var cfg    = window.__cassetteConfig || {};
    var base   = cfg.staticBase || 'http://localhost:3042';

    state.albumart = artUrl;
    loader.loadAlbumArt(artUrl, base, function (img) {
      tape.albumart = img;
      if (window.__cassette.recompositeArt) window.__cassette.recompositeArt();
    });
  }

  function _handlePushState(s, controls) {
    var state   = window.__cassette._state;
    var context = window.__cassette.context;

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
      var randomize = window.__cassette._randomize;
      if (prevTitle !== null && randomize) {
        if (window.__cassette.switchToRandomTape) window.__cassette.switchToRandomTape();
      }
    }

    if (state.status === 'play' && prevStatus !== 'play') {
      var overlay = document.getElementById('volumio-overlay');
      if (overlay && overlay.style.display !== 'none') window.__cassette.overlay.hide();
    }

    if (state.status === 'play') {
      if (window.__cassette.startLoop) window.__cassette.startLoop();
    } else {
      if (window.__cassette.drawFrozenFrame) window.__cassette.drawFrozenFrame();
    }
  }

  function connect() {
    // socket.io.js is injected at page load from Volumio at :3000.
    // Retry until the global io() is available.
    if (typeof io === 'undefined') {
      setTimeout(connect, 500);
      return;
    }

    var volumioUrl = 'http://' + window.location.hostname + ':3000';
    var socket = io(volumioUrl);
    window.__cassette._socket = socket;

    var controls = window.__cassette.controls.initControls();
    socket.emit('getState', '');
    socket.on('pushState', function (s) { _handlePushState(s, controls); });
  }

  window.__cassette.socket = { connect: connect };

})();
