'use strict';

const libQ         = require('kew');
const path         = require('path');
const fs           = require('fs');
const { execSync } = require('child_process');

const TapeRegistry = require('./lib/tape_registry');
const StaticServer = require('./lib/static_server');

const PLUGIN_NAME  = 'mix_tape';
const STATIC_PORT  = 3042;
const TAPES_DIR    = path.join(__dirname, 'assets', 'tapes');
const KIOSK_SCRIPT = '/opt/volumiokiosk.sh';
const KIOSK_BACKUP = '/home/volumio/.mix_tape/volumiokiosk.sh.bak';

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
      execSync("echo 'volumio' | sudo -S /bin/rm -rf " + backupDir);
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
    self._populateTapeOptions(uiconf);
    defer.resolve(uiconf);
  }).fail(err => defer.reject(new Error(err)));

  return defer.promise;
};

MixTape.prototype._populateTapeOptions = function (uiconf) {
  const tapes      = this._registry.listTapes();
  const activeTape = this.config.get('activeTape') || '';
  const tapePool   = this._registry.parseTapePool(this.config.get('tapePool'));

  const tapeSection = uiconf.sections.find(s => s.label === 'Tape Selection');
  if (!tapeSection) return;

  const activeSelect = tapeSection.content.find(c => c.id === 'activeTape');
  if (activeSelect) {
    activeSelect.options = tapes.map(t => ({ value: t.id, label: t.name }));
    activeSelect.value   = activeTape;
  }

  const poolCheck = tapeSection.content.find(c => c.id === 'tapePool');
  if (poolCheck) {
    poolCheck.options = tapes.map(t => ({
      value: t.id, label: t.name, checked: tapePool.includes(t.id),
    }));
    poolCheck.value = tapePool;
  }
};

MixTape.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

MixTape.prototype.saveOptions = function (data) {
  const numFields  = ['animationSpeed', 'labelOpacity'];
  const boolFields = ['enabled', 'randomizeTape'];
  const strFields  = ['activeTape'];

  boolFields.forEach(k => { if (data[k] !== undefined) this.config.set(k, data[k]); });
  numFields.forEach(k  => { if (data[k] !== undefined) this.config.set(k, parseFloat(data[k])); });
  strFields.forEach(k  => { if (data[k] !== undefined) this.config.set(k, data[k]); });

  if (data.tapePool !== undefined) {
    this.config.set('tapePool', Array.isArray(data.tapePool) ? data.tapePool : []);
  }

  this.commandRouter.pushToastMessage('success', PLUGIN_NAME, 'Settings saved.');
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
    activeTape:     activeTape,
    randomizeTape:  this.config.get('randomizeTape') || false,
    tapePool:       this._registry.parseTapePool(this.config.get('tapePool')),
    staticBase:     'http://localhost:' + STATIC_PORT,
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
  // Back up original before first modification.
  const backupDir = path.dirname(KIOSK_BACKUP);
  if (!fs.existsSync(backupDir)) {
    execSync("echo 'volumio' | sudo -S /bin/mkdir -p " + backupDir);
  }
  if (!fs.existsSync(KIOSK_BACKUP)) {
    execSync("echo 'volumio' | sudo -S /bin/cp " + KIOSK_SCRIPT + ' ' + KIOSK_BACKUP);
    this.logger.info('[MixTape] kiosk script backed up to ' + KIOSK_BACKUP);
  }

  // Only modify if still pointing at :3000.
  const content = fs.readFileSync(KIOSK_SCRIPT, 'utf8');
  if (content.includes('localhost:3000')) {
    this._sudoSed('localhost:3000', 'localhost:' + STATIC_PORT);
    this.logger.info('[MixTape] kiosk redirected → port ' + STATIC_PORT);
    this._restartKioskIfActive();
  }
};

MixTape.prototype._kioskRestore = function () {
  if (fs.existsSync(KIOSK_BACKUP)) {
    execSync("echo 'volumio' | sudo -S /bin/cp " + KIOSK_BACKUP + ' ' + KIOSK_SCRIPT);
    this.logger.info('[MixTape] kiosk script restored from backup');
  } else {
    // No backup — reverse the sed manually if we can.
    const content = fs.readFileSync(KIOSK_SCRIPT, 'utf8');
    if (content.includes('localhost:' + STATIC_PORT)) {
      this._sudoSed('localhost:' + STATIC_PORT, 'localhost:3000');
      this.logger.info('[MixTape] kiosk script restored via sed (no backup found)');
    }
  }
  this._restartKioskIfActive();
};

MixTape.prototype._sudoSed = function (from, to) {
  execSync(
    "echo 'volumio' | sudo -S /bin/sed -i 's|" + from + '|' + to + "|g' " + KIOSK_SCRIPT
  );
};

MixTape.prototype._restartKioskIfActive = function () {
  try {
    execSync('systemctl is-active --quiet volumio-kiosk');
    execSync("echo 'volumio' | sudo -S /bin/systemctl restart volumio-kiosk");
    this.logger.info('[MixTape] volumio-kiosk service restarted');
  } catch (_) {
    this.logger.info('[MixTape] volumio-kiosk not active — skipping restart');
  }
};
