#!/bin/bash
# Clean up backup directory created by kiosk redirect
BACKUP_DIR="/home/volumio/.mix_tape"
if [ -d "$BACKUP_DIR" ]; then
  echo "MixTape: removing kiosk backup dir..."
  rm -rf "$BACKUP_DIR"
fi
echo "MixTape: uninstall complete."
