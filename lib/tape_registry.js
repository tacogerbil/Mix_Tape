'use strict';

const fs   = require('fs');
const path = require('path');

function TapeRegistry(tapesDir) {
  this.tapesDir = tapesDir;
}

TapeRegistry.prototype.listTapes = function () {
  if (!fs.existsSync(this.tapesDir)) return [];

  return fs.readdirSync(this.tapesDir)
    .filter(entry => fs.existsSync(path.join(this.tapesDir, entry, 'theme.json')))
    .map(entry => {
      try {
        const raw   = fs.readFileSync(path.join(this.tapesDir, entry, 'theme.json'), 'utf8');
        const theme = JSON.parse(raw);
        return { id: entry, name: theme.name || entry };
      } catch (_) {
        return { id: entry, name: entry };
      }
    });
};

module.exports = TapeRegistry;
