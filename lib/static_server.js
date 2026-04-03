'use strict';

const http            = require('http');
const https           = require('https');
const fs              = require('fs');
const path            = require('path');
const url             = require('url');
const { execFileSync } = require('child_process');

const MIME_TYPES = {
  '.js':    'application/javascript',
  '.json':  'application/json',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.html':  'text/html',
};

const HDR_JSON = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

const HDR_HTML = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

/**
 * @param {string}   pluginDir       Absolute path to plugin root
 * @param {number}   port            HTTP port to bind (3042)
 * @param {string}   tapesDir        Absolute path to assets/tapes/
 * @param {Function} getTapeList     () => TapeDescriptor[]
 * @param {Function} getContext      () => ContextObject
 * @param {Function} setContext      (ctx: ContextObject) => void
 * @param {Function} getConfig       () => ConfigObject
 * @param {Function} onTapeUploaded  (tapeId: string) => void
 * @param {Object}   logger          Volumio logger instance
 */
function StaticServer(pluginDir, port, tapesDir, getTapeList, getContext, setContext, getConfig, onTapeUploaded, logger) {
  this.pluginDir      = pluginDir;
  this.port           = port;
  this.tapesDir       = tapesDir;
  this.getTapeList    = getTapeList;
  this.getContext     = getContext;
  this.setContext     = setContext;
  this.getConfig      = getConfig;
  this.onTapeUploaded = onTapeUploaded;
  this.logger         = logger;
  this._server        = null;
}

StaticServer.prototype.start = function () {
  this._server = http.createServer(this._handleRequest.bind(this));
  this._server.listen(this.port, '0.0.0.0', () => {
    this.logger.info('[StaticServer] Listening on port ' + this.port);
  });
  this._server.on('error', err => {
    this.logger.error('[StaticServer] ' + err.message);
  });
};

StaticServer.prototype.stop = function () {
  if (this._server) {
    this._server.close();
    this._server = null;
  }
};

StaticServer.prototype._handleRequest = function (req, res) {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    this._serveIndex(res); return;
  }
  if (parsed.pathname === '/upload') {
    if (req.method === 'GET')    { this._serveUploadPage(res);           return; }
    if (req.method === 'POST')   { this._handleUpload(req, res, parsed); return; }
    if (req.method === 'DELETE') { this._handleDelete(req, res, parsed); return; }
  }
  if (parsed.pathname === '/proxy') {
    this._proxy(parsed.query.url, res); return;
  }
  if (parsed.pathname === '/tapes') {
    try {
      res.writeHead(200, HDR_JSON);
      res.end(JSON.stringify(this.getTapeList()));
    } catch (err) {
      this.logger.error('[StaticServer] /tapes error: ' + err.message);
      res.writeHead(200, HDR_JSON);
      res.end('[]');
    }
    return;
  }
  if (parsed.pathname === '/config' && req.method === 'GET') {
    try {
      res.writeHead(200, HDR_JSON);
      res.end(JSON.stringify(this.getConfig()));
    } catch (err) {
      this.logger.error('[StaticServer] /config error: ' + err.message);
      res.writeHead(500); res.end('{}');
    }
    return;
  }
  if (parsed.pathname === '/context') {
    if (req.method === 'GET')  { this._handleContextGet(res);      return; }
    if (req.method === 'POST') { this._handleContextPost(req, res); return; }
  }
  this._serveFile(parsed.pathname, res);
};

StaticServer.prototype._btnContent = function (name, fallback) {
  const iconPath = path.join(this.pluginDir, 'assets', 'icons', name);
  const exts = ['.svg', '.png', '.jpg'];
  for (var i = 0; i < exts.length; i++) {
    if (fs.existsSync(iconPath + exts[i])) {
      return { html: '<img src="/assets/icons/' + name + exts[i] + '" alt="' + name + '">', hasIcon: true };
    }
  }
  return { html: fallback, hasIcon: false };
};

StaticServer.prototype._buildControls = function () {
  var self = this;
  function btn(id, name, fallback) {
    var o = self._btnContent(name, fallback);
    return '  <button id="' + id + '"' + (o.hasIcon ? ' class="has-icon"' : '') + '>' + o.html + '</button>';
  }
  return [
    '<div id="controls">',
    btn('btn-prev',    'prev',    '&#x23EE;'),
    btn('btn-play',    'play',    '&#x25B6;'),
    btn('btn-pause',   'pause',   '&#x23F8;'),
    btn('btn-stop',    'stop',    '&#x25A0;'),
    btn('btn-next',    'next',    '&#x23ED;'),
    btn('btn-voldown', 'voldown', '&#x2212;'),
    btn('btn-volup',   'volup',   '&#x2B;'),
    '</div>',
  ].join('\n');
};

StaticServer.prototype._buildIndexStyles = function () {
  return [
    '<style>',
    '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:100%;height:100%;background:#000;overflow:hidden}',
    'canvas{display:block;width:100%;height:100%}',
    '#controls{',
    '  position:fixed;bottom:0;left:0;right:0;',
    '  display:flex;justify-content:center;align-items:center;gap:24px;',
    '  padding:12px 20px;',
    '  background:linear-gradient(transparent,rgba(0,0,0,0.75));',
    '  opacity:0;transition:opacity 0.4s;pointer-events:none;z-index:200;',
    '}',
    '#controls.visible{opacity:1;pointer-events:all}',
    '#controls button{',
    '  background:rgba(255,255,255,0.12);border:1.5px solid rgba(255,255,255,0.4);',
    '  color:#fff;font-size:26px;padding:10px 18px;border-radius:10px;',
    '  cursor:pointer;touch-action:manipulation;min-width:54px;',
    '}',
    '#controls button:active{background:rgba(255,255,255,0.28)}',
    '#btn-prev,#btn-next,#btn-pause{font-size:64px}',
    '#controls button.has-icon{font-size:0;background:none!important;border:none!important;padding:4px;min-width:0}',
    '#controls button img{height:69px;width:auto;pointer-events:none;display:block}',
    '#btn-prev img,#btn-next img,#btn-pause img{height:128px}',
    '#vol-toast{',
    '  position:fixed;top:20px;left:50%;transform:translateX(-50%);',
    '  background:rgba(0,0,0,0.7);color:#fff;font:bold 18px sans-serif;',
    '  padding:8px 20px;border-radius:8px;',
    '  opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:300;',
    '}',
    '#vol-toast.visible{opacity:1}',
    '#scrubber{',
    '  position:fixed;bottom:125px;left:20px;right:20px;height:6px;',
    '  background:rgba(255,255,255,0.2);border-radius:3px;',
    '  opacity:0;transition:opacity 0.4s;z-index:201;touch-action:none;cursor:pointer;',
    '}',
    '#scrubber.visible{opacity:1}',
    '#scrubber-fill{',
    '  height:100%;background:rgba(255,255,255,0.85);',
    '  border-radius:3px;pointer-events:none;',
    '}',
    '#scrubber-thumb{',
    '  position:absolute;top:50%;transform:translate(-50%,-50%);',
    '  width:18px;height:18px;background:#fff;border-radius:50%;',
    '  pointer-events:none;',
    '}',
    '#volumio-overlay{',
    '  display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000;background:#000;',
    '  opacity:0;transition:opacity 0.2s;flex-direction:column;',
    '}',
    '#volumio-overlay.visible{opacity:1}',
    '#volumio-close-bar{',
    '  flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end;',
    '  padding:8px 16px;background:rgba(0,0,0,0.6);',
    '}',
    '#volumio-close{',
    '  color:rgba(255,255,255,0.7);font:13px sans-serif;letter-spacing:1px;',
    '  cursor:pointer;padding:4px 8px;',
    '}',
    '#volumio-frame{flex:1 1 auto;width:100%;border:none;}',
    '</style>',
  ];
};

StaticServer.prototype._buildIndexScripts = function (cfg) {
  const cfgJson = JSON.stringify(cfg);
  return [
    '<script>',
    // Strip any Unicode text nodes from buttons that loaded a custom img icon.
    // Runs once at DOMContentLoaded — handles caching edge cases where both
    // an img and a legacy text node end up in the same button.
    '(function(){',
    '  function purgeTextNodes(btn){',
    '    Array.prototype.forEach.call(btn.childNodes,function(n){',
    '      if(n.nodeType===3) btn.removeChild(n);',
    '    });',
    '  }',
    '  function applyIconStyles(){',
    '    document.querySelectorAll("#controls button").forEach(function(btn){',
    '      var img=btn.querySelector("img");',
    '      if(!img) return;',
    '      purgeTextNodes(btn);',
    '      btn.style.fontSize="0";',
    '      btn.style.background="none";',
    '      btn.style.border="none";',
    '      btn.style.padding="4px";',
    '      btn.style.minWidth="0";',
    '    });',
    '  }',
    '  if(document.readyState==="loading"){',
    '    document.addEventListener("DOMContentLoaded",applyIconStyles);',
    '  } else {',
    '    applyIconStyles();',
    '  }',
    '})();',
    '</script>',
    // staticBase is set from window.location.origin rather than server-side
    // hostname to avoid cross-origin canvas taint on getImageData().
    '<script>window.__cassetteConfig=' + cfgJson + ';window.__cassetteConfig.staticBase=window.location.origin;</script>',
    '<script>',
    '(function(){',
    '  var s=document.createElement("script");',
    '  s.src="http://"+location.hostname+":3000/socket.io/socket.io.js";',
    '  document.head.appendChild(s);',
    '})();',
    '</script>',
    '<script src="/ui/cassette_math.js"></script>',
    '<script src="/ui/cassette_loader.js"></script>',
    '<script src="/ui/cassette_draw.js"></script>',
    '<script src="/ui/cassette_context.js"></script>',
    '<script src="/ui/cassette_overlay.js"></script>',
    '<script src="/ui/cassette_controls.js"></script>',
    '<script src="/ui/cassette_socket.js"></script>',
    '<script src="/ui/cassette_main.js"></script>',
  ];
};

StaticServer.prototype._buildIndexBody = function () {
  return [
    '<canvas id="cassette-canvas"></canvas>',
    '<div id="vol-toast"></div>',
    '<div id="scrubber"><div id="scrubber-fill"></div><div id="scrubber-thumb"></div></div>',
    '<div id="volumio-overlay">',
    '  <div id="volumio-close-bar"><span id="volumio-close">Close</span></div>',
    '  <iframe id="volumio-frame" src="about:blank"></iframe>',
    '</div>',
    this._buildControls(),
  ];
};

StaticServer.prototype._buildIndexHtml = function () {
  const cfg = this.getConfig();
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">',
    '<meta http-equiv="Pragma" content="no-cache">',
  ]
    .concat(this._buildIndexStyles())
    .concat(['</head><body>'])
    .concat(this._buildIndexBody())
    .concat(this._buildIndexScripts(cfg))
    .concat(['</body></html>'])
    .join('\n');
};

StaticServer.prototype._serveIndex = function (res) {
  res.writeHead(200, Object.assign({}, HDR_HTML, { 'Expires': '0', 'Access-Control-Allow-Origin': '*' }));
  res.end(this._buildIndexHtml());
};

StaticServer.prototype._buildUploadStyles = function () {
  return [
    '<style>',
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{background:#111;color:#ddd;font-family:sans-serif;min-height:100vh;',
    '     display:flex;flex-direction:column;align-items:center;padding:40px 20px}',
    'h1{font-size:1.4rem;letter-spacing:2px;text-transform:uppercase;color:#ff9f43;margin-bottom:8px}',
    '.subtitle{font-size:0.82rem;color:#777;margin-bottom:36px}',
    '.dropzone{width:100%;max-width:480px;border:2px dashed #444;border-radius:12px;',
    '          background:#1a1a1a;padding:48px 24px;text-align:center;cursor:pointer;',
    '          transition:border-color 0.2s,background 0.2s;margin-bottom:24px}',
    '.dropzone.over{border-color:#ff9f43;background:#1f1a12}',
    '.dropzone .icon{font-size:3rem;margin-bottom:12px}',
    '.dropzone p{color:#888;font-size:0.9rem}',
    '.drop-hint strong{color:#ccc}',
    'label{display:block;font-size:0.8rem;color:#888;margin-bottom:6px;',
    '      text-align:left;width:100%;max-width:480px}',
    'input[type=text]{width:100%;max-width:480px;background:#222;border:1px solid #444;',
    '  color:#fff;padding:10px 14px;border-radius:8px;font-size:0.95rem;margin-bottom:20px;outline:none}',
    'input[type=text]:focus{border-color:#ff9f43}',
    'button{background:#ff9f43;color:#111;border:none;padding:12px 32px;border-radius:8px;',
    '       font-size:1rem;font-weight:bold;cursor:pointer;width:100%;max-width:480px;transition:background 0.2s}',
    'button:hover{background:#ffb86c}',
    'button:disabled{background:#555;color:#999;cursor:not-allowed}',
    '#status{margin-top:20px;font-size:0.9rem;min-height:24px;max-width:480px;text-align:center}',
    '#status.ok{color:#2ecc71}#status.err{color:#e74c3c}#status.busy{color:#f39c12}',
    '.tapelist{width:100%;max-width:480px;margin-top:40px}',
    '.tapelist h2{font-size:0.85rem;text-transform:uppercase;letter-spacing:2px;color:#666;margin-bottom:12px}',
    '.tape-item{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;',
    '           padding:10px 16px;margin-bottom:8px;font-size:0.9rem;color:#bbb;',
    '           display:flex;align-items:center;justify-content:space-between}',
    '.tape-item .tape-info{display:flex;align-items:center;gap:10px}',
    '.tape-item .tape-id{color:#555;font-size:0.75rem}',
    '.tape-del{background:transparent;border:1px solid #c0392b;color:#c0392b;',
    '          font-size:0.78rem;padding:4px 10px;border-radius:6px;cursor:pointer;',
    '          width:auto;min-width:0;font-weight:normal}',
    '.tape-del:hover{background:#c0392b;color:#fff}',
    '</style>',
  ];
};

StaticServer.prototype._buildUploadScripts = function () {
  return [
    '<script>',
    '(function(){',
    '  var dz=document.getElementById("dropzone");',
    '  var fi=document.getElementById("fileInput");',
    '  var nameInput=document.getElementById("tapeName");',
    '  var btn=document.getElementById("uploadBtn");',
    '  var statusEl=document.getElementById("status");',
    '  var selectedFile=null;',
    '',
    '  function slugify(s){',
    '    return s.replace(/\\.zip$/i,"").replace(/[^a-zA-Z0-9_-]/g,"_").toLowerCase();',
    '  }',
    '',
    '  function setFile(f){',
    '    selectedFile=f;',
    '    nameInput.value=slugify(f.name);',
    '    btn.disabled=false;',
    '    var p=dz.querySelector(".drop-hint");',
    '    p.textContent="";',
    '    var strong=document.createElement("strong");',
    '    strong.textContent=f.name;',
    '    p.appendChild(strong);',
    '    p.appendChild(document.createTextNode(" selected"));',
    '  }',
    '',
    '  function setStatus(text, cls){ statusEl.textContent=text; statusEl.className=cls; }',
    '',
    '  dz.addEventListener("click",function(){ fi.click(); });',
    '  fi.addEventListener("change",function(){ if(fi.files[0]) setFile(fi.files[0]); });',
    '  dz.addEventListener("dragover",function(e){ e.preventDefault(); dz.classList.add("over"); });',
    '  dz.addEventListener("dragleave",function(){ dz.classList.remove("over"); });',
    '  dz.addEventListener("drop",function(e){',
    '    e.preventDefault(); dz.classList.remove("over");',
    '    var f=e.dataTransfer.files[0];',
    '    if(f && f.name.match(/\\.zip$/i)) setFile(f);',
    '    else setStatus("Please drop a .zip file","err");',
    '  });',
    '',
    '  btn.addEventListener("click",function(){',
    '    if(!selectedFile) return;',
    '    var name=nameInput.value.trim();',
    '    if(!name){ setStatus("Tape ID cannot be empty","err"); return; }',
    '    btn.disabled=true;',
    '    setStatus("Uploading\u2026","busy");',
    '    fetch("/upload?name="+encodeURIComponent(name),{',
    '      method:"POST",',
    '      headers:{"Content-Type":"application/octet-stream"},',
    '      body:selectedFile',
    '    }).then(function(r){ return r.json(); })',
    '      .then(function(j){',
    '        setStatus((j.ok ? "\u2713 " : "\u2717 ")+j.message, j.ok ? "ok" : "err");',
    '        if(j.ok) loadTapes();',
    '        btn.disabled=false;',
    '      })',
    '      .catch(function(e){ setStatus("Upload failed: "+e.message,"err"); btn.disabled=false; });',
    '  });',
    '',
    '  function loadTapes(){',
    '    fetch("/tapes").then(function(r){ return r.json(); }).then(function(tapes){',
    '      var el=document.getElementById("tapeList");',
    '      while(el.firstChild) el.removeChild(el.firstChild);',
    '      if(!tapes.length){',
    '        var em=document.createElement("em");',
    '        em.style.color="#555";',
    '        em.textContent="No tapes installed";',
    '        el.appendChild(em);',
    '        return;',
    '      }',
    '      tapes.forEach(function(t){',
    '        var div=document.createElement("div");',
    '        div.className="tape-item";',
    '        var info=document.createElement("div");',
    '        info.className="tape-info";',
    '        var name=document.createElement("span");',
    '        name.textContent=t.name;',
    '        var span=document.createElement("span");',
    '        span.className="tape-id";',
    '        span.textContent=t.id;',
    '        info.appendChild(name);',
    '        info.appendChild(span);',
    '        var del=document.createElement("button");',
    '        del.className="tape-del";',
    '        del.textContent="Delete";',
    '        del.setAttribute("data-id",t.id);',
    '        del.addEventListener("click",function(){',
    '          var id=this.getAttribute("data-id");',
    '          if(!confirm("Delete tape \\""+id+"\\"?")) return;',
    '          var btn=this;',
    '          btn.disabled=true;',
    '          fetch("/upload?name="+encodeURIComponent(id),{method:"DELETE"})',
    '            .then(function(r){ return r.json(); })',
    '            .then(function(j){',
    '              setStatus((j.ok?"\u2713 ":"\u2717 ")+j.message,j.ok?"ok":"err");',
    '              if(j.ok) loadTapes();',
    '              else btn.disabled=false;',
    '            })',
    '            .catch(function(e){ setStatus("Delete failed: "+e.message,"err"); btn.disabled=false; });',
    '        });',
    '        div.appendChild(info);',
    '        div.appendChild(del);',
    '        el.appendChild(div);',
    '      });',
    '    });',
    '  }',
    '',
    '  loadTapes();',
    '})();',
    '</script>',
  ];
};

StaticServer.prototype._buildUploadBody = function () {
  return [
    // All dynamic content is set via textContent/DOM methods — no innerHTML.
    '<h1>\uD83C\uDF9E Cassette Theme Uploader</h1>',
    '<p class="subtitle">Upload a ZIP file containing your theme assets</p>',
    '<div class="dropzone" id="dropzone">',
    '  <div class="icon">\uD83D\uDCE6</div>',
    '  <p class="drop-hint">Drag &amp; drop a <strong>.zip</strong> here<br>or click to browse</p>',
    '  <input type="file" id="fileInput" accept=".zip" style="display:none">',
    '</div>',
    '<label for="tapeName">Tape folder ID (auto-filled from filename)</label>',
    '<input type="text" id="tapeName" placeholder="e.g. my_custom_tape">',
    '<button id="uploadBtn" disabled>Upload Theme</button>',
    '<div id="status"></div>',
    '<div class="tapelist">',
    '  <h2>Installed Tapes</h2>',
    '  <div id="tapeList"><em style="color:#555">Loading\u2026</em></div>',
    '</div>',
  ];
};

StaticServer.prototype._buildUploadPageHtml = function () {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Cassette Theme Uploader</title>',
  ]
    .concat(this._buildUploadStyles())
    .concat(['</head>', '<body>'])
    .concat(this._buildUploadBody())
    .concat(this._buildUploadScripts())
    .concat(['</body></html>'])
    .join('\n');
};

StaticServer.prototype._serveUploadPage = function (res) {
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
  res.end(this._buildUploadPageHtml());
};

/**
 * Extract ZIP into destDir and verify it contains theme.json.
 * Cleans up tmpFile and destDir on failure.
 * Returns { ok, status, message }.
 */
StaticServer.prototype._extractAndValidate = function (tmpFile, destDir, tapeId) {
  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    // unzip is standard on Raspbian/Pi; avoids a python3 dependency.
    execFileSync('unzip', ['-o', tmpFile, '-d', destDir]);
    fs.unlinkSync(tmpFile);

    if (!fs.existsSync(path.join(destDir, 'theme.json'))) {
      execFileSync('rm', ['-rf', destDir]);
      return { ok: false, status: 422, message: 'No theme.json found in archive. Aborting.' };
    }
    return { ok: true, status: 200, message: 'Tape "' + tapeId + '" installed successfully.' };
  } catch (err) {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
    return { ok: false, status: 500, message: err.message };
  }
};

StaticServer.prototype._handleUpload = function (req, res, parsed) {
  const self   = this;
  const tapeId = (parsed.query.name || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

  if (!tapeId) {
    res.writeHead(400, HDR_JSON);
    res.end(JSON.stringify({ ok: false, message: 'Invalid tape name' }));
    return;
  }

  const tmpFile = '/tmp/cassette_upload_' + Date.now() + '.zip';
  const destDir = path.join(self.tapesDir, tapeId);
  const chunks  = [];

  req.on('data', function (chunk) { chunks.push(chunk); });

  req.on('end', function () {
    try {
      fs.writeFileSync(tmpFile, Buffer.concat(chunks));
    } catch (err) {
      self.logger.error('[StaticServer] upload write error: ' + err.message);
      res.writeHead(500, HDR_JSON);
      res.end(JSON.stringify({ ok: false, message: err.message }));
      return;
    }

    const result = self._extractAndValidate(tmpFile, destDir, tapeId);
    if (result.ok) {
      self.logger.info('[StaticServer] tape installed: ' + tapeId);
      if (self.onTapeUploaded) self.onTapeUploaded(tapeId);
    } else {
      self.logger.error('[StaticServer] upload error: ' + result.message);
    }
    res.writeHead(result.status, HDR_JSON);
    res.end(JSON.stringify({ ok: result.ok, message: result.message }));
  });

  req.on('error', function (err) {
    self.logger.error('[StaticServer] upload stream error: ' + err.message);
    res.writeHead(500, HDR_JSON);
    res.end(JSON.stringify({ ok: false, message: err.message }));
  });
};

StaticServer.prototype._handleDelete = function (req, res, parsed) {
  const tapeId = (parsed.query.name || '').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!tapeId) {
    res.writeHead(400, HDR_JSON); res.end(JSON.stringify({ ok: false, message: 'Missing tape name' })); return;
  }

  const tapeDir = path.resolve(this.tapesDir, tapeId);
  // Safety: must be a direct child of tapesDir — no path traversal.
  if (path.dirname(tapeDir) !== this.tapesDir) {
    res.writeHead(403, HDR_JSON); res.end(JSON.stringify({ ok: false, message: 'Forbidden' })); return;
  }
  if (!fs.existsSync(tapeDir)) {
    res.writeHead(404, HDR_JSON); res.end(JSON.stringify({ ok: false, message: 'Tape not found' })); return;
  }

  try {
    execFileSync('rm', ['-rf', tapeDir]);
    this.logger.info('[StaticServer] tape deleted: ' + tapeId);
    res.writeHead(200, HDR_JSON);
    res.end(JSON.stringify({ ok: true, message: 'Tape "' + tapeId + '" deleted.' }));
  } catch (err) {
    this.logger.error('[StaticServer] delete error: ' + err.message);
    res.writeHead(500, HDR_JSON);
    res.end(JSON.stringify({ ok: false, message: err.message }));
  }
};

// Album art is served from Volumio at port 3000 with no CORS headers.
// This proxy lets the canvas fetch it cross-origin without tainting getImageData().
StaticServer.prototype._proxy = function (targetUrl, res) {
  if (!targetUrl) { res.writeHead(400); res.end('Missing url'); return; }

  var parsed;
  try { parsed = new URL(targetUrl); } catch (_) { res.writeHead(400); res.end('Invalid url'); return; }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.writeHead(403); res.end('Forbidden protocol'); return;
  }

  var mod = parsed.protocol === 'https:' ? https : http;
  mod.get(targetUrl, function (upstream) {
    res.writeHead(upstream.statusCode, {
      'Content-Type':  upstream.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    upstream.pipe(res);
  }).on('error', function (err) {
    res.writeHead(502);
    res.end('Proxy error: ' + err.message);
  });
};

StaticServer.prototype._handleContextGet = function (res) {
  const ctx = this.getContext();
  res.writeHead(200, HDR_JSON);
  res.end(JSON.stringify(ctx));
};

StaticServer.prototype._handleContextPost = function (req, res) {
  const self = this;
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const ctx = JSON.parse(body);
      self.setContext(ctx);
      res.writeHead(200, HDR_JSON);
      res.end(JSON.stringify({ ok: true }));
    } catch (_) {
      res.writeHead(400);
      res.end('Bad JSON');
    }
  });
};

StaticServer.prototype._serveFile = function (urlPath, res) {
  const resolved = this._safeResolve(urlPath);
  if (!resolved) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(resolved, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const mime = MIME_TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type':  mime,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
};

StaticServer.prototype._safeResolve = function (urlPath) {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const resolved = path.resolve(this.pluginDir, relative);
  const boundary = this.pluginDir + path.sep;
  return (resolved.startsWith(boundary) || resolved === this.pluginDir) ? resolved : null;
};

module.exports = StaticServer;
