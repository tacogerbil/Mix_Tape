'use strict';

const { describe, it, before, after } = require('node:test');
const assert        = require('node:assert/strict');
const fs            = require('node:fs');
const path          = require('node:path');
const os            = require('node:os');
const TapeRegistry  = require('../lib/tape_registry.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tape_registry_test_'));
}

function writeTape(dir, id, themeData) {
  const tapeDir = path.join(dir, id);
  fs.mkdirSync(tapeDir, { recursive: true });
  fs.writeFileSync(path.join(tapeDir, 'theme.json'), JSON.stringify(themeData));
}

describe('TapeRegistry.listTapes()', () => {
  it('returns empty array when directory does not exist', () => {
    const reg = new TapeRegistry('/no/such/dir/ever');
    assert.deepEqual(reg.listTapes(), []);
  });

  it('returns empty array for empty directory', () => {
    const dir = makeTempDir();
    const reg = new TapeRegistry(dir);
    assert.deepEqual(reg.listTapes(), []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists tapes with name from theme.json', () => {
    const dir = makeTempDir();
    writeTape(dir, 'sony_bhf', { name: 'Sony BHF' });
    writeTape(dir, 'tdk_d90',  { name: 'TDK D90'  });

    const reg   = new TapeRegistry(dir);
    const tapes = reg.listTapes();

    assert.equal(tapes.length, 2);
    const ids = tapes.map(t => t.id).sort();
    assert.deepEqual(ids, ['sony_bhf', 'tdk_d90']);
    const sony = tapes.find(t => t.id === 'sony_bhf');
    assert.equal(sony.name, 'Sony BHF');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to id as name when theme.json has no name field', () => {
    const dir = makeTempDir();
    writeTape(dir, 'nameless', {});
    const reg  = new TapeRegistry(dir);
    const tape = reg.listTapes()[0];
    assert.equal(tape.id, 'nameless');
    assert.equal(tape.name, 'nameless');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to id as name when theme.json is invalid JSON', () => {
    const dir     = makeTempDir();
    const tapeDir = path.join(dir, 'badtape');
    fs.mkdirSync(tapeDir);
    fs.writeFileSync(path.join(tapeDir, 'theme.json'), 'not { json }');

    const reg  = new TapeRegistry(dir);
    const tape = reg.listTapes()[0];
    assert.equal(tape.id, 'badtape');
    assert.equal(tape.name, 'badtape');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips subdirectories without theme.json', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'no_theme'));
    writeTape(dir, 'valid_tape', { name: 'Valid' });

    const reg   = new TapeRegistry(dir);
    const tapes = reg.listTapes();
    assert.equal(tapes.length, 1);
    assert.equal(tapes[0].id, 'valid_tape');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
