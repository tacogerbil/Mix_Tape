(function () {
  'use strict';

  window.__cassette = window.__cassette || {};

  var math = window.__cassette.math;

  function background(ctx, W, H, images) {
    if (images.bg) { ctx.drawImage(images.bg, 0, 0, W, H); return; }
    ctx.fillStyle = '#1a0e00';
    ctx.fillRect(0, 0, W, H);
  }

  function spoolTexture(ctx, cx, cy, radius, maxR, img) {
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - maxR, cy - maxR, maxR * 2, maxR * 2);
    ctx.restore();
  }

  function rotatedHub(ctx, cx, cy, hubSize, angle, img) {
    if (!img) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -hubSize / 2, -hubSize / 2, hubSize, hubSize);
    ctx.restore();
  }

  function precompositeArt(W, H, images, albumartImg) {
    if (!albumartImg || !images.labelmask) return null;
    var offscreen    = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    var off          = offscreen.getContext('2d');

    var scale = Math.max(W / albumartImg.naturalWidth, H / albumartImg.naturalHeight);
    var sw    = albumartImg.naturalWidth  * scale;
    var sh    = albumartImg.naturalHeight * scale;
    var sx    = (W - sw) / 2;
    var sy    = (H - sh) / 2;
    off.drawImage(albumartImg, sx, sy, sw, sh);

    off.globalCompositeOperation = 'destination-in';
    off.drawImage(images.labelmask, 0, 0, W, H);

    return offscreen;
  }

  function drawComposited(ctx, composited, opacity) {
    if (!composited) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(composited, 0, 0);
    ctx.restore();
  }

  function _formatTime(secs) {
    var s = Math.floor(secs || 0);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function _resolveBinding(binding, state) {
    switch (binding) {
      case 'title':     return state.title     || '';
      case 'artist':    return state.artist    || '';
      case 'album':     return state.album     || '';
      case 'trackType': return state.trackType || '';
      case 'duration':  return _formatTime(state.duration);
      case 'seek':      return _formatTime(state.seek);
      default:          return '';
    }
  }

  function _truncateToWidth(ctx, text, maxPx) {
    if (!text || ctx.measureText(text).width <= maxPx) return text;
    var ellipsis = '\u2026';
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxPx) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo) + ellipsis;
  }

  function textField(ctx, W, H, field, state, font) {
    if (!field) return;
    var raw = _resolveBinding(field.binding || 'title', state);
    if (!raw) return;
    ctx.save();
    ctx.font = Math.round(field.size * H) + 'px ' + font;
    var maxPx = (field.width || 0.6) * W;
    var text  = _truncateToWidth(ctx, raw, maxPx);
    ctx.translate(field.x * W, field.y * H);
    ctx.rotate(field.rotate || 0);
    if (field.shadow !== false) {
      ctx.shadowColor   = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur    = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
    }
    ctx.fillStyle = field.colour || '#ffffff';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function textFields(ctx, W, H, theme, state) {
    var fields = theme.textFields;
    if (!fields || !fields.length || !state) return;
    var font = '"' + (theme.fontFamily || 'Permanent Marker') + '",cursive';
    fields.forEach(function (field) {
      textField(ctx, W, H, field, state, font);
    });
  }

  function misc(ctx, W, H, images) {
    if (images.misc) { ctx.drawImage(images.misc, 0, 0, W, H); }
  }

  /**
   * Returns the angle (in canvas radians) of the tangent point on a circle
   * (cx,cy,r) that is closest to the external point (px,py), choosing the
   * tangent on the given side ('left' = outer-left for left spool,
   * 'right' = outer-right for right spool).
   *
   * The two tangent angles are:  baseAng ± acos(r/d)
   * We pick the one whose canvas-y component is larger (lower on screen) so
   * the arc wraps around the bottom of the spool.
   */
  /**
   * Both tangent angles from external point (px,py) to circle (cx,cy,r).
   * Returns { outer, inner } where:
   *   outer = base + offset  (higher angle value)
   *   inner = base - offset  (lower angle value)
   */
  function _bothTangents(cx, cy, r, px, py) {
    var dx      = px - cx;
    var dy      = py - cy;
    var d       = Math.sqrt(dx * dx + dy * dy);
    if (d <= r) { var a = Math.atan2(dy, dx); return { outer: a, inner: a }; }
    var baseAng = Math.atan2(dy, dx);
    var offset  = Math.acos(r / d);
    return { outer: baseAng + offset, inner: baseAng - offset };
  }

  function tapePath(ctx, theme, leftR, rightR) {
    var lgx = theme.leftGuideX;
    var lgy = theme.leftGuideY;
    if (lgx == null || lgy == null) return;

    var lx  = theme.leftSpoolX;
    var ly  = theme.leftSpoolY;
    var rx  = theme.rightSpoolX;
    var ry  = theme.rightSpoolY;

    var rgx = theme.rightGuideX;
    var rgy = theme.rightGuideY;
    if (rgx == null || rgy == null) return;

    // Both tangent angles from each guide pin to its spool.
    // Left spool:  la.outer > π (outer/left side), la.inner < π (inner/right side)
    // Right spool: ra.outer > 0 (inner/left side), ra.inner < 0 (outer/right side)
    var la = _bothTangents(lx, ly, leftR,  lgx, lgy);
    var ra = _bothTangents(rx, ry, rightR, rgx, rgy);

    var cos = Math.cos, sin = Math.sin;

    ctx.save();
    ctx.strokeStyle = '#5c2800';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();

    // Start at left guide pin.
    ctx.moveTo(lgx, lgy);

    // Line to outer tangent point on left spool (the point on the outer/left side).
    ctx.lineTo(lx + leftR * cos(la.outer), ly + leftR * sin(la.outer));

    // Arc over the left apex (9 o'clock = π): from la.outer counterclockwise to la.inner.
    // anticlockwise=true in canvas = decreasing angle, which sweeps OVER the outer-left side.
    ctx.arc(lx, ly, leftR, la.outer, la.inner, true);

    // Line from inner tangent point on left spool to capstans and right guide.
    var lcx = theme.leftCapstanX,  lcy = theme.leftCapstanY;
    var rcx = theme.rightCapstanX, rcy = theme.rightCapstanY;
    if (lcx != null && lcy != null) ctx.lineTo(lcx, lcy);
    if (rcx != null && rcy != null) ctx.lineTo(rcx, rcy);

    // Line to inner tangent point on right spool (the point on the inner/left side).
    ctx.lineTo(rx + rightR * cos(ra.outer), ry + rightR * sin(ra.outer));

    // Arc over the right apex (3 o'clock = 0): from ra.outer counterclockwise to ra.inner.
    // anticlockwise=true sweeps OVER the outer-right side.
    ctx.arc(rx, ry, rightR, ra.outer, ra.inner, true);

    // Line from outer tangent point on right spool back to right guide pin.
    ctx.lineTo(rgx, rgy);

    ctx.stroke();
    ctx.restore();
  }

  window.__cassette.draw = {
    background:       background,
    spoolTexture:     spoolTexture,
    rotatedHub:       rotatedHub,
    tapePath:         tapePath,
    precompositeArt:  precompositeArt,
    drawComposited:   drawComposited,
    textFields:       textFields,
    misc:             misc,
  };

})();
