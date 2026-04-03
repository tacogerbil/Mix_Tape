(function () {
  'use strict';

  window.__cassette = window.__cassette || {};

  function show() {
    var overlay = document.getElementById('volumio-overlay');
    var frame   = document.getElementById('volumio-frame');
    var socket  = window.__cassette._socket;
    var state   = window.__cassette._state;

    if (socket && state && state.status === 'play') socket.emit('pause');

    if (!frame.src || frame.src === 'about:blank') {
      frame.src = 'http://' + window.location.hostname + ':3000';
    }
    overlay.style.display = 'flex';
    overlay.offsetHeight; // force reflow so CSS transition fires
    overlay.classList.add('visible');

    if (window.__cassette.stopLoop) window.__cassette.stopLoop();
  }

  function hide() {
    var overlay = document.getElementById('volumio-overlay');
    overlay.classList.remove('visible');
    setTimeout(function () {
      overlay.style.display = 'none';
      var state = window.__cassette._state;
      if (state && state.status === 'play') {
        if (window.__cassette.startLoop) window.__cassette.startLoop();
      } else {
        if (window.__cassette.drawFrozenFrame) window.__cassette.drawFrozenFrame();
      }
    }, 200);
  }

  window.__cassette.overlay = { show: show, hide: hide };

})();
