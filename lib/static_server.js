'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

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
    this._serveIndex(res);
    return;
  }

  if (parsed.pathname === '/upload') {
    if (req.method === 'GET')  { this._serveUploadPage(res);           return; }
    if (req.method === 'POST') { this._handleUpload(req, res, parsed); return; }
  }

  if (parsed.pathname === '/proxy') {
    this._proxy(parsed.query.url, res);
    return;
  }

  if (parsed.pathname === '/tapes') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(this.getTapeList()));
    return;
  }

  if (parsed.pathname === '/context') {
    if (req.method === 'GET')  { this._handleContextGet(res);      return; }
    if (req.method === 'POST') { this._handleContextPost(req, res); return; }
  }

  this._serveFile(parsed.pathname, res);
};

StaticServer.prototype._serveIndex = function (res) {
  const cfg     = this.getConfig();
  const cfgJson = JSON.stringify(cfg);
  const port    = this.port;

  const html = [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
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
    '  color:#fff;font-size:22px;padding:10px 18px;border-radius:10px;',
    '  cursor:pointer;touch-action:manipulation;min-width:52px;',
    '}',
    '#controls button:active{background:rgba(255,255,255,0.28)}',
    '#btn-play{font-size:26px;padding:10px 22px}',
    '#btn-stop{font-size:18px;padding:10px 16px}',
    '#vol-toast{',
    '  position:fixed;top:20px;left:50%;transform:translateX(-50%);',
    '  background:rgba(0,0,0,0.7);color:#fff;font:bold 18px sans-serif;',
    '  padding:8px 20px;border-radius:8px;',
    '  opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:300;',
    '}',
    '#vol-toast.visible{opacity:1}',
    '#scrubber{',
    '  position:fixed;bottom:62px;left:20px;right:20px;height:6px;',
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
    '</head><body>',
    '<canvas id="cassette-canvas"></canvas>',
    '<div id="vol-toast"></div>',
    '<div id="scrubber"><div id="scrubber-fill"></div><div id="scrubber-thumb"></div></div>',
    '<div id="volumio-overlay">',
    '  <div id="volumio-close-bar"><span id="volumio-close">Close</span></div>',
    '  <iframe id="volumio-frame" src="about:blank"></iframe>',
    '</div>',
    '<div id="controls">',
    '  <button id="btn-prev">&#x23EE;</button>',
    '  <button id="btn-play">&#x25B6;</button>',
    '  <button id="btn-pause">&#x23F8;</button>',
    '  <button id="btn-stop">&#x25A0;</button>',
    '  <button id="btn-next">&#x23ED;</button>',
    '  <button id="btn-voldown">&#x2212;</button>',
    '  <button id="btn-volup">&#x2B;</button>',
    '</div>',
    '<script>window.__cassetteConfig=' + cfgJson + ';</script>',
    '<script>',
    '(function(){',
    '  var s=document.createElement("script");',
    '  s.src="http://"+location.hostname+":3000/socket.io/socket.io.js";',
    '  document.head.appendChild(s);',
    '})();',
    '</script>',
    '<script src="/ui/cassette_math.js"></script>',
    '<script src="/ui/cassette_loader.js"></script>',
    '<script src="/ui/cassette_context.js"></script>',
    '<script src="/ui/cassette_draw.js"></script>',
    '<script src="/ui/cassette_main.js"></script>',
    '</body></html>',
  ].join('\n');

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(html);
};

StaticServer.prototype._handleContextGet = function (res) {
  const ctx = this.getContext();
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
};

StaticServer.prototype._safeResolve = function (urlPath) {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const resolved = path.resolve(this.pluginDir, relative);
  const boundary = this.pluginDir + path.sep;
  return (resolved.startsWith(boundary) || resolved === this.pluginDir) ? resolved : null;
};

// ------------------------------------------------------------------ upload

StaticServer.prototype._serveUploadPage = function (res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cassette Theme Uploader</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111;color:#ddd;font-family:sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:40px 20px}
h1{font-size:1.4rem;letter-spacing:2px;text-transform:uppercase;color:#ff9f43;margin-bottom:8px}
.subtitle{font-size:0.82rem;color:#777;margin-bottom:36px}
.dropzone{
  width:100%;max-width:480px;border:2px dashed #444;border-radius:12px;
  background:#1a1a1a;padding:48px 24px;text-align:center;
  cursor:pointer;transition:border-color 0.2s,background 0.2s;
  margin-bottom:24px;
}
.dropzone.over{border-color:#ff9f43;background:#1f1a12}
.dropzone .icon{font-size:3rem;margin-bottom:12px}
.dropzone p{color:#888;font-size:0.9rem}
.dropzone p strong{color:#ccc}
label{display:block;font-size:0.8rem;color:#888;margin-bottom:6px;text-align:left;width:100%;max-width:480px}
input[type=text]{
  width:100%;max-width:480px;background:#222;border:1px solid #444;
  color:#fff;padding:10px 14px;border-radius:8px;font-size:0.95rem;
  margin-bottom:20px;outline:none;
}
input[type=text]:focus{border-color:#ff9f43}
button{
  background:#ff9f43;color:#111;border:none;padding:12px 32px;
  border-radius:8px;font-size:1rem;font-weight:bold;cursor:pointer;
  width:100%;max-width:480px;transition:background 0.2s;
}
button:hover{background:#ffb86c}
button:disabled{background:#555;color:#999;cursor:not-allowed}
#status{margin-top:20px;font-size:0.9rem;min-height:24px;max-width:480px;text-align:center}
#status.ok{color:#2ecc71}#status.err{color:#e74c3c}#status.busy{color:#f39c12}
.tapelist{width:100%;max-width:480px;margin-top:40px}
.tapelist h2{font-size:0.85rem;text-transform:uppercase;letter-spacing:2px;color:#666;margin-bottom:12px}
.tape-item{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:10px 16px;margin-bottom:8px;font-size:0.9rem;color:#bbb}
</style>
</head>
<body>
<h1>🎞 Cassette Theme Uploader</h1>
<p class="subtitle">Upload a ZIP file containing your theme assets</p>

<div class="dropzone" id="dropzone">
  <div class="icon">📦</div>
  <p>Drag &amp; drop a <strong>.zip</strong> here<br>or click to browse</p>
  <input type="file" id="fileInput" accept=".zip" style="display:none">
</div>

<label for="tapeName">Tape folder ID (auto-filled from filename)</label>
<input type="text" id="tapeName" placeholder="e.g. my_custom_tape">

<button id="uploadBtn" disabled>Upload Theme</button>
<div id="status"></div>

<div class="tapelist">
  <h2>Installed Tapes</h2>
  <div id="tapeList"><em style="color:#555">Loading...</em></div>
</div>

<script>
(function(){
  var dz = document.getElementById('dropzone');
  var fi = document.getElementById('fileInput');
  var nameInput = document.getElementById('tapeName');
  var btn = document.getElementById('uploadBtn');
  var status = document.getElementById('status');
  var selectedFile = null;

  function slugify(s) { return s.replace(/\.zip$/i,'').replace(/[^a-zA-Z0-9_-]/g,'_').toLowerCase(); }

  function setFile(f) {
    selectedFile = f;
    nameInput.value = slugify(f.name);
    btn.disabled = false;
    dz.querySelector('p').innerHTML = '<strong>' + f.name + '</strong> selected';
  }

  dz.addEventListener('click', function(){ fi.click(); });
  fi.addEventListener('change', function(){ if(fi.files[0]) setFile(fi.files[0]); });

  dz.addEventListener('dragover', function(e){ e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', function(){ dz.classList.remove('over'); });
  dz.addEventListener('drop', function(e){
    e.preventDefault(); dz.classList.remove('over');
    var f = e.dataTransfer.files[0];
    if(f && f.name.match(/\.zip$/i)) setFile(f);
    else { status.textContent='Please drop a .zip file'; status.className='err'; }
  });

  btn.addEventListener('click', function(){
    if(!selectedFile) return;
    var name = nameInput.value.trim();
    if(!name){status.textContent='Tape ID cannot be empty';status.className='err';return;}
    btn.disabled=true;
    status.textContent='Uploading…'; status.className='busy';
    fetch('/upload?name='+encodeURIComponent(name),{
      method:'POST',
      headers:{'Content-Type':'application/octet-stream'},
      body:selectedFile
    }).then(function(r){return r.json();}).then(function(j){
      if(j.ok){
        status.textContent='✓ '+j.message; status.className='ok';
        loadTapes();
      } else {
        status.textContent='✗ '+j.message; status.className='err';
      }
      btn.disabled=false;
    }).catch(function(e){
      status.textContent='Upload failed: '+e.message; status.className='err';
      btn.disabled=false;
    });
  });

  function loadTapes(){
    fetch('/tapes').then(function(r){return r.json();}).then(function(tapes){
      var el=document.getElementById('tapeList');
      if(!tapes.length){el.innerHTML='<em style="color:#555">No tapes installed</em>';return;}
      el.innerHTML=tapes.map(function(t){
        return '<div class="tape-item">'+t.name+'<span style="color:#555;font-size:0.75rem;margin-left:10px">'+t.id+'</span></div>';
      }).join('');
    });
  }

  loadTapes();
})();
</script>
</body></html>`;

  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
  res.end(html);
};

StaticServer.prototype._handleUpload = function (req, res, parsed) {
  const { execSync } = require('child_process');
  const self   = this;
  const tapeId = (parsed.query.name || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

  if (!tapeId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
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

      // Create dest dir and extract
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      execSync('unzip -o ' + tmpFile + ' -d ' + destDir);
      fs.unlinkSync(tmpFile);

      // Validate required file
      if (!fs.existsSync(path.join(destDir, 'theme.json'))) {
        // Clean up invalid extract
        execSync('rm -rf ' + destDir);
        res.writeHead(422, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, message: 'No theme.json found in archive. Aborting.' }));
        return;
      }

      self.logger.info('[StaticServer] tape installed: ' + tapeId);
      if (self.onTapeUploaded) self.onTapeUploaded(tapeId);

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, message: 'Tape "' + tapeId + '" installed successfully.' }));
    } catch (err) {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
      self.logger.error('[StaticServer] upload error: ' + err.message);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, message: err.message }));
    }
  });

  req.on('error', function (err) {
    self.logger.error('[StaticServer] upload stream error: ' + err.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: false, message: err.message }));
  });
};

module.exports = StaticServer;
