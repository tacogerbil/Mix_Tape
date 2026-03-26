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

  function tapePath(ctx, theme, leftR, rightR) {
    var lgx = theme.leftGuideX;
    var lgy = theme.leftGuideY;
    if (lgx == null || lgy == null) return;

    // Tangent point on left spool aimed at left guide roller
    var lx     = theme.leftSpoolX;
    var ly     = theme.leftSpoolY;
    var ang1   = Math.atan2(lgy - ly, lgx - lx);
    var startX = lx + leftR * Math.cos(ang1);
    var startY = ly + leftR * Math.sin(ang1);

    ctx.save();
    ctx.strokeStyle = 'rgba(160,110,40,0.82)';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(lgx, lgy);

    var rgx = theme.rightGuideX;
    var rgy = theme.rightGuideY;
    if (rgx != null && rgy != null) {
      ctx.lineTo(rgx, rgy);
      // Tangent point on right spool from right guide roller
      var rx   = theme.rightSpoolX;
      var ry   = theme.rightSpoolY;
      var ang2 = Math.atan2(rgy - ry, rgx - rx);
      ctx.lineTo(rx + rightR * Math.cos(ang2), ry + rightR * Math.sin(ang2));
    }

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
