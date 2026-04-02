(function () {
  'use strict';

  window.__cassette = window.__cassette || {};

  var STATIC_BASE   = (window.__cassetteConfig || {}).staticBase || 'http://localhost:3042';
  var MIXTAPE_LABEL = 'Mixtape';

  var STATES = { NONE: 'none', ALBUM: 'album', TRACK: 'track', STREAM: 'stream', MIXTAPE: 'mixtape' };

  var current = { type: STATES.NONE, line1: '', line2: '', line3: '' };

  var ALBUM_MATCH_THRESHOLD = 0.90;

  function buildLine2(artist, album) {
    var parts = [];
    if (artist) parts.push(artist);
    if (album)  parts.push(album);
    return parts.join(' \u00b7 ');
  }

  function evaluateQueue(queue, pushStateData) {
    if (!queue || queue.length === 0) {
      set(STATES.NONE, '', '', '');
      return;
    }

    if (pushStateData && (pushStateData.stream || pushStateData.trackType === 'webradio')) {
      var stationName = pushStateData.title || pushStateData.artist || 'Radio';
      set(STATES.STREAM, stationName, '', '');
      return;
    }

    if (queue.length === 1) {
      var t = queue[0];
      set(STATES.TRACK, t.name || t.title || '', buildLine2(t.artist, t.album), '');
      return;
    }

    var albums   = queue.map(function (t) { return (t.album || '').trim().toLowerCase(); });
    var nonEmpty = albums.filter(function (a) { return a !== ''; });
    if (nonEmpty.length === 0) { set(STATES.MIXTAPE, MIXTAPE_LABEL, '', ''); return; }

    var counts = {};
    nonEmpty.forEach(function (a) { counts[a] = (counts[a] || 0) + 1; });
    var topAlbum = Object.keys(counts).reduce(function (a, b) { return counts[a] >= counts[b] ? a : b; });
    var ratio    = counts[topAlbum] / queue.length;

    if (ratio >= ALBUM_MATCH_THRESHOLD) {
      var artist = queue[0].artist || '';
      set(STATES.ALBUM, queue[0].album || topAlbum, buildLine2(artist, ''), '');
    } else {
      set(STATES.MIXTAPE, MIXTAPE_LABEL, '', '');
    }
  }

  function set(type, line1, line2, line3) {
    current = { type: type, line1: line1 || '', line2: line2 || '', line3: line3 || '' };
    persist();
  }

  function setFromState(s) {
    if (!s || !s.title) return;
    if (s.stream || s.trackType === 'webradio') {
      set(STATES.STREAM, s.title || s.artist || 'Radio', '', '');
    } else {
      set(STATES.TRACK, s.title, buildLine2(s.artist, s.album), '');
    }
  }

  function clear() {
    set(STATES.NONE, '', '', '');
  }

  var _persistTimer = null;

  function persist() {
    clearTimeout(_persistTimer);
    _persistTimer = setTimeout(function () {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', STATIC_BASE + '/context', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(current));
    }, 300);
  }

  function restore(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', STATIC_BASE + '/context', true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var saved = JSON.parse(xhr.responseText);
          if (saved && saved.type) current = saved;
        } catch (_) {}
      }
      if (callback) callback(current);
    };
    xhr.onerror = function () { if (callback) callback(current); };
    xhr.send();
  }

  function getCurrent() { return current; }

  window.__cassette.context = {
    STATES:        STATES,
    setFromState:  setFromState,
    clear:         clear,
    evaluateQueue: evaluateQueue,
    restore:       restore,
    getCurrent:    getCurrent,
  };

})();
