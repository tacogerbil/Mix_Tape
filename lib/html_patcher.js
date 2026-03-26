'use strict';

const fs = require('fs');

const MARKER = '<!-- cassette_nowplaying -->';

function HtmlPatcher(logger) {
  this.logger = logger;
}

HtmlPatcher.prototype.inject = function (htmlPath, scriptBlock) {
  if (!fs.existsSync(htmlPath)) return false;

  let html = fs.readFileSync(htmlPath, 'utf8');
  if (html.includes(MARKER)) {
    this.logger.info('[HtmlPatcher] Marker already present — skipping');
    return false;
  }

  const block = MARKER + '\n' + scriptBlock + '\n';
  html = html.includes('</body>')
    ? html.replace('</body>', block + '</body>')
    : html + block;

  fs.writeFileSync(htmlPath, html, 'utf8');
  this.logger.info('[HtmlPatcher] Injected into ' + htmlPath);
  return true;
};

HtmlPatcher.prototype.remove = function (htmlPath) {
  if (!fs.existsSync(htmlPath)) return;

  let html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes(MARKER)) return;

  const escaped = MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(escaped + '[\\s\\S]*?<\\/script>\\s*', 'g'), '');

  fs.writeFileSync(htmlPath, html, 'utf8');
  this.logger.info('[HtmlPatcher] Removed injection from ' + htmlPath);
};

module.exports = HtmlPatcher;
