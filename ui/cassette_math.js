(function () {
  'use strict';

  window.__cassette = window.__cassette || {};

  var BASE_TAPE_SPEED = 0.08;

  window.__cassette.math = {

    computeSpoolRadii: function (seek, duration, theme) {
      var p    = duration > 0 ? Math.min(Math.max(seek / duration, 0), 1.0) : 0;
      var minR = theme.minSpoolRadius;
      var maxR = theme.maxSpoolRadius;
      // Hub floor = midpoint of the configured range.
      // Neither spool ever shrinks below this so the tape texture always
      // fills the shell window (solid plastic hub underneath the tape).
      var hubR = (maxR + minR) / 2;
      var span = maxR - hubR;
      return {
        leftR:  maxR - span * p,
        rightR: hubR + span * p,
      };
    },

    computeHubDelta: function (dtMs, spoolRadius, animSpeed) {
      return (BASE_TAPE_SPEED / Math.max(spoolRadius, 1)) * dtMs * animSpeed;
    },

    truncateText: function (text, maxChars) {
      if (!text) return '';
      return text.length > maxChars ? text.substring(0, maxChars - 1) + '\u2026' : text;
    },

  };

})();
