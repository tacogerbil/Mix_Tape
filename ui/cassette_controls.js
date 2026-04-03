(function () {
  'use strict';

  window.__cassette = window.__cassette || {};

  function initScrubber() {
    var scrubber = document.getElementById('scrubber');
    var fill     = document.getElementById('scrubber-fill');
    var thumb    = document.getElementById('scrubber-thumb');
    if (!scrubber || !fill || !thumb) return null;

    function seekToClientX(clientX) {
      var state = window.__cassette._state;
      if (!state || state.duration <= 0) return;
      var rect  = scrubber.getBoundingClientRect();
      var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      state.seek = Math.floor(ratio * state.duration);
      var socket = window.__cassette._socket;
      if (socket) socket.emit('seek', state.seek);
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
        var state = window.__cassette._state;
        if (!state || state.duration <= 0) return;
        var pct = Math.min(state.seek / state.duration * 100, 100) + '%';
        fill.style.width = pct;
        thumb.style.left = pct;
      },
    };
  }

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

    function emit(event, data) {
      var socket = window.__cassette._socket;
      if (socket) socket.emit(event, data);
    }

    document.getElementById('btn-prev').addEventListener('click', function (e) {
      e.stopPropagation(); emit('prev');
    });
    document.getElementById('btn-play').addEventListener('click', function (e) {
      e.stopPropagation(); emit('play');
    });
    document.getElementById('btn-pause').addEventListener('click', function (e) {
      e.stopPropagation(); emit('pause');
    });
    document.getElementById('btn-stop').addEventListener('click', function (e) {
      e.stopPropagation(); window.__cassette.overlay.show();
    });
    document.getElementById('btn-next').addEventListener('click', function (e) {
      e.stopPropagation(); emit('next');
    });
    document.getElementById('btn-voldown').addEventListener('click', function (e) {
      e.stopPropagation(); emit('volume', '-');
    });
    document.getElementById('btn-volup').addEventListener('click', function (e) {
      e.stopPropagation(); emit('volume', '+');
    });
    document.getElementById('volumio-close').addEventListener('click', function (e) {
      e.stopPropagation(); window.__cassette.overlay.hide();
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

  window.__cassette.controls = { initScrubber: initScrubber, initControls: initControls };

})();
