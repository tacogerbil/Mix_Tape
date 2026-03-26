#!/bin/bash
echo "MixTape: installing dependencies..."
cd "$(dirname "$0")"
npm install --production

echo "MixTape: installation complete."
echo "plugininstallend"
