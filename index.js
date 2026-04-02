'use strict';

const libQ            = require('kew');
const path            = require('path');
const fs              = require('fs');
const { execFileSync } = require('child_process');

const TapeRegistry = require('./lib/tape_registry');
const StaticServer = require('./lib/static_server');

const PLUGIN_NAME  = 'mix_tape';
const STATIC_PORT  = 3042;
const TAPES_DIR    = path.join(__dirname, 'assets', 'tapes');
const KIOSK_SCRIPT = '/opt/volumiokiosk.sh';
const KIOSK_BACKUP = '/home/volumio/.mix_tape/volumiokiosk.sh.bak';

// Sudo helper — avoids shell string concatenation throughout
function sudoExec(args) {
  execFileSync('sudo', ['-S'].concat(args), { input: 'volumio\n' });
}

module.exports = MixTape;

function MixTape(context) {
  this.context       = context;
  this.commandRouter = context.coreCommand;
  this.logger        = context.logger;
  this.configManager = context.configManager;

  this._registry = new TapeRegistry(TAPES_DIR);
  this._server   = null;
}

MixTape.prototype.onVolumioStart = function () {
  const configFile = this.commandRouter.pluginManager.getConfigurationFile(
    this.context, 'config.json'
  );
  this.config = new (require('v-conf'))();
  this.config.loadFile(configFile);
  return libQ.resolve();
};

MixTape.prototype.onStart = function () {
  const defer = libQ.defer();
  try {
    this._server = new StaticServer(
      __dirname, STATIC_PORT,
      TAPES_DIR,
      this._registry.listTapes.bind(this._registry),
      this._getContext.bind(this),
      this._setContext.bind(this),
      this._buildConfig.bind(this),
      this._onTapeUploaded.bind(this),
      this.logger
    );
    this._server.start();
    this._kioskRedirect();
    this.commandRouter.pushToastMessage('info', PLUGIN_NAME, 'Remix Tape Now Playing started');
    defer.resolve();
  } catch (err) {
    this.logger.error('[MixTape] onStart: ' + err.message);
    defer.reject(err);
  }
  return defer.promise;
};

MixTape.prototype.onStop = function () {
  const defer = libQ.defer();
  try {
    this._kioskRestore();
    if (this._server) { this._server.stop(); this._server = null; }
    defer.resolve();
  } catch (err) {
    this.logger.error('[MixTape] onStop: ' + err.message);
    defer.resolve();
  }
  return defer.promise;
};

MixTape.prototype.onRestart = function () {
  return libQ.resolve();
};

MixTape.prototype.onUninstall = function () {
  try {
    const backupDir = path.dirname(KIOSK_BACKUP);
    if (fs.existsSync(backupDir)) {
      sudoExec(['/bin/rm', '-rf', backupDir]);
      this.logger.info('[MixTape] backup dir removed on uninstall');
    }
  } catch (err) {
    this.logger.error('[MixTape] onUninstall cleanup: ' + err.message);
  }
  return libQ.resolve();
};

MixTape.prototype._onTapeUploaded = function (tapeId) {
  this.logger.info('[MixTape] new tape installed: ' + tapeId);
  this.commandRouter.pushToastMessage('success', PLUGIN_NAME, 'Tape "' + tapeId + '" installed.');
};

MixTape.prototype.getUIConfig = function () {
  const defer     = libQ.defer();
  const lang_code = this.commandRouter.sharedVars.get('language_code');
  const self      = this;

  this.commandRouter.i18nJson(
    path.join(__dirname, 'i18n', 'strings_' + lang_code + '.json'),
    path.join(__dirname, 'i18n', 'strings_en.json'),
    path.join(__dirname, 'UIConfig.json')
  ).then(uiconf => {
    self._populateSimpleFields(uiconf);
    self._populateTapeOptions(uiconf);
    self._populateFontSelection(uiconf);
    defer.resolve(uiconf);
  }).fail(err => defer.reject(new Error(err)));

  return defer.promise;
};

/** Restore saved values for all simple (non-dynamic) fields from config.json. */
MixTape.prototype._populateSimpleFields = function (uiconf) {
  const map = {
    enabled:        this.config.get('enabled'),
    animationSpeed: this.config.get('animationSpeed'),
    labelOpacity:   this.config.get('labelOpacity'),
    randomizeTape:  this.config.get('randomizeTape') || false,
  };
  uiconf.sections.forEach(section => {
    (section.content || []).forEach(field => {
      if (Object.prototype.hasOwnProperty.call(map, field.id)) {
        field.value = map[field.id];
      }
    });
  });
};

MixTape.prototype._populateFontSelection = function (uiconf) {
  const saved = this.config.get('fontFamily') || '';
  const firstSection = uiconf.sections[0];
  if (!firstSection) return;
  const fontField = firstSection.content.find(c => c.id === 'fontFamily');
  if (!fontField) return;
  // Volumio3 select: value must be the full option object {value, label}
  const matched = (fontField.options || []).find(o => o.value === saved);
  fontField.value = matched || { value: '', label: 'Per Tape (use each tape\'s own font)' };
};

MixTape.prototype._populateTapeOptions = function (uiconf) {
  const tapes     = this._registry.listTapes();
  const savedTape = this.config.get('activeTape');
  const activeTape = (savedTape && tapes.some(t => t.id === savedTape))
    ? savedTape
    : (tapes[0] ? tapes[0].id : '');

  const tapeSection = uiconf.sections.find(s => s.id === 'section_tape');
  if (!tapeSection) return;

  const activeSelect = tapeSection.content.find(c => c.id === 'activeTape');
  if (activeSelect) {
    activeSelect.options = tapes.map(t => ({ value: t.id, label: t.name }));
    // Volumio3 select: value must be the full option object {value, label}
    const activeTapeObj = tapes.find(t => t.id === activeTape);
    activeSelect.value = activeTapeObj
      ? { value: activeTapeObj.id, label: activeTapeObj.name }
      : (tapes[0] ? { value: tapes[0].id, label: tapes[0].name } : { value: '', label: '' });
  }

  // checkboxGroup is not supported by Volumio3's UIConfig renderer.
  // Inject one switch per tape (id prefix: tapePool__) at end of content.
  tapeSection.content = tapeSection.content.filter(c => !c.id.startsWith('tapePool__'));
  tapes.forEach(t => {
    const v = this.config.get('pool_' + t.id);
    tapeSection.content.push({
      id:      'tapePool__' + t.id,
      element: 'switch',
      label:   t.name + ' (pool)',
      value:   v === true || v === 'true',
    });
  });

  // Add dynamic tapePool__ IDs to saveButton.data so Volumio3 sends them
  if (tapeSection.saveButton) {
    tapeSection.saveButton.data = tapeSection.saveButton.data
      .filter(id => !id.startsWith('tapePool__'))
      .concat(tapes.map(t => 'tapePool__' + t.id));
  }

};

MixTape.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

MixTape.prototype.saveOptions = function (rawData) {
  const data = rawData || {};
  this.logger.info('[MixTape] saveOptions: ' + JSON.stringify(data));
  this.commandRouter.pushToastMessage('info', PLUGIN_NAME, 'Saving…');

  // Volumio3: select fields arrive as {value: string}, switches/inputs as direct values
  function val(v) { return (v !== null && typeof v === 'object' && 'value' in v) ? v.value : v; }

  try {
    const numFields  = ['animationSpeed', 'labelOpacity'];
    const boolFields = ['enabled', 'randomizeTape'];
    const strFields  = ['activeTape', 'fontFamily'];

    boolFields.forEach(k => { if (data[k] !== undefined) this.config.set(k, val(data[k]) === true || val(data[k]) === 'true'); });
    numFields.forEach(k  => { if (data[k] !== undefined) this.config.set(k, parseFloat(val(data[k]))); });
    strFields.forEach(k  => { if (data[k] !== undefined) this.config.set(k, val(data[k])); });

    // Store each tape's pool membership as its own boolean key (pool_{id})
    // — same pattern as enabled/randomizeTape, avoids v-conf array/string issues
    Object.keys(data).forEach(k => {
      if (k.startsWith('tapePool__')) {
        const id = k.slice('tapePool__'.length);
        this.config.set('pool_' + id, val(data[k]) === true || val(data[k]) === 'true');
      }
    });

    this.logger.info('[MixTape] saved — randomizeTape=' + this.config.get('randomizeTape') + ' activeTape=' + this.config.get('activeTape'));
    this.commandRouter.pushToastMessage('success', PLUGIN_NAME, 'Settings saved.');
  } catch (err) {
    this.logger.error('[MixTape] saveOptions error: ' + err.message);
    this.commandRouter.pushToastMessage('error', PLUGIN_NAME, 'Save failed: ' + err.message);
  }
  return libQ.resolve();
};

MixTape.prototype._buildConfig = function () {
  const savedTape  = this.config.get('activeTape');
  const allTapes   = this._registry.listTapes();
  const activeTape = (savedTape && allTapes.some(t => t.id === savedTape))
    ? savedTape
    : (allTapes[0] ? allTapes[0].id : '');

  return {
    enabled:        this.config.get('enabled'),
    animationSpeed: this.config.get('animationSpeed'),
    labelOpacity:   this.config.get('labelOpacity'),
    fontFamily:     this.config.get('fontFamily') || '',
    activeTape:     activeTape,
    randomizeTape:  this.config.get('randomizeTape') || false,
    tapePool:       allTapes.filter(t => { const v = this.config.get('pool_' + t.id); return v === true || v === 'true'; }).map(t => t.id),
    staticBase:     'http://' + require('os').hostname() + '.local:' + STATIC_PORT,
  };
};

MixTape.prototype._getContext = function () {
  return {
    type:  this.config.get('contextType')  || 'none',
    line1: this.config.get('contextLine1') || '',
    line2: this.config.get('contextLine2') || '',
    line3: this.config.get('contextLine3') || '',
  };
};

MixTape.prototype._setContext = function (ctx) {
  if (!ctx || typeof ctx.type !== 'string') return;
  this.config.set('contextType',  ctx.type);
  this.config.set('contextLine1', ctx.line1 || '');
  this.config.set('contextLine2', ctx.line2 || '');
  this.config.set('contextLine3', ctx.line3 || '');
};

// ------------------------------------------------------------------ kiosk

MixTape.prototype._kioskRedirect = function () {
  const backupDir = path.dirname(KIOSK_BACKUP);
  if (!fs.existsSync(backupDir)) {
    sudoExec(['/bin/mkdir', '-p', backupDir]);
  }
  if (!fs.existsSync(KIOSK_BACKUP)) {
    sudoExec(['/bin/cp', KIOSK_SCRIPT, KIOSK_BACKUP]);
    this.logger.info('[MixTape] kiosk script backed up to ' + KIOSK_BACKUP);
  }

  const content = fs.readFileSync(KIOSK_SCRIPT, 'utf8');
  if (content.includes('localhost:3000')) {
    this._sudoSed('localhost:3000', 'localhost:' + STATIC_PORT);
    this.logger.info('[MixTape] kiosk redirected → port ' + STATIC_PORT);
    this._restartKioskIfActive();
  }
};

MixTape.prototype._kioskRestore = function () {
  if (fs.existsSync(KIOSK_BACKUP)) {
    sudoExec(['/bin/cp', KIOSK_BACKUP, KIOSK_SCRIPT]);
    this.logger.info('[MixTape] kiosk script restored from backup');
  } else {
    const content = fs.readFileSync(KIOSK_SCRIPT, 'utf8');
    if (content.includes('localhost:' + STATIC_PORT)) {
      this._sudoSed('localhost:' + STATIC_PORT, 'localhost:3000');
      this.logger.info('[MixTape] kiosk script restored via sed (no backup found)');
    }
  }
  this._restartKioskIfActive();
};

MixTape.prototype._sudoSed = function (from, to) {
  sudoExec(['/bin/sed', '-i', 's|' + from + '|' + to + '|g', KIOSK_SCRIPT]);
};

MixTape.prototype._restartKioskIfActive = function () {
  try {
    execFileSync('systemctl', ['is-active', '--quiet', 'volumio-kiosk']);
    sudoExec(['/bin/systemctl', 'restart', 'volumio-kiosk']);
    this.logger.info('[MixTape] volumio-kiosk service restarted');
  } catch (_) {
    this.logger.info('[MixTape] volumio-kiosk not active — skipping restart');
  }
};
