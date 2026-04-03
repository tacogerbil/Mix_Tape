'use strict';

const { describe, it } = require('node:test');
const assert       = require('node:assert/strict');
const path         = require('node:path');
const StaticServer = require('../lib/static_server.js');

function makeServer(pluginDir) {
  return new StaticServer(
    pluginDir,
    3042,
    '/tmp/tapes',
    () => [],
    () => ({ type: 'none', line1: '', line2: '', line3: '' }),
    () => {},
    () => ({}),
    () => {},
    { info: () => {}, error: () => {} }
  );
}

describe('StaticServer._safeResolve()', () => {
  it('resolves valid sub-paths within pluginDir', () => {
    const srv    = makeServer('/app/plugin');
    const result = srv._safeResolve('/ui/cassette_main.js');
    assert.equal(result, '/app/plugin/ui/cassette_main.js');
  });

  it('returns null for path traversal attempts', () => {
    const srv = makeServer('/app/plugin');
    assert.equal(srv._safeResolve('/../etc/passwd'), null);
    assert.equal(srv._safeResolve('/ui/../../etc/shadow'), null);
  });

  it('returns pluginDir itself for root path', () => {
    const srv    = makeServer('/app/plugin');
    const result = srv._safeResolve('/');
    assert.equal(result, '/app/plugin');
  });

  it('allows nested paths within pluginDir', () => {
    const srv    = makeServer('/app/plugin');
    const result = srv._safeResolve('/assets/tapes/sony_bhf/bg.png');
    assert.equal(result, '/app/plugin/assets/tapes/sony_bhf/bg.png');
  });
});
