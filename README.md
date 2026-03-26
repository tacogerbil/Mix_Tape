# Mix Tape — Now Playing Plugin for Volumio

A Volumio 3/4 `user_interface` plugin for Raspberry Pi with a touchscreen. Replaces the Chromium kiosk display with an animated HTML5 canvas cassette tape that reacts to playback in real time.

- Album art, title and artist stamped onto the tape label
- Spools advance as the track progresses
- Multiple installable tape themes (upload via browser, no SSH required)
- Random tape selection on each track change

## Requirements

- Volumio 3 or 4
- Raspberry Pi with an official Volumio touchscreen kiosk setup

## Installation

### From the Volumio Plugin Store
*(Coming soon)*

### Manual Install
1. SSH into your Pi
2. `volumio plugin install https://github.com/tacogerbil/Mix_Tape`

### Developer Sync (from source)
```bash
bash execution/sync.sh [pi-hostname]
```

## Uploading Themes

With the plugin running, open a browser on your local network and go to:
```
http://volumio.local:3042/upload
```
Drag and drop a `.zip` file containing your theme assets (flat — files at the root of the zip, no subfolder):
- `theme.json`
- `bg.png` or `bg.jpg`
- `shell.png`
- `hub.png`
- `tapetexture.png`

The new theme will appear immediately in the plugin settings.

## theme.json Reference

```json
{
  "name": "My Tape",
  "leftSpoolX": 228, "leftSpoolY": 230,
  "rightSpoolX": 574, "rightSpoolY": 230,
  "minSpoolRadius": 28, "maxSpoolRadius": 215,
  "fontFamily": "Permanent Marker",
  "textFields": [
    { "x": 0.50, "y": 0.10, "size": 0.07,  "rotate": 0.0, "colour": "#ffffff" },
    { "x": 0.50, "y": 0.20, "size": 0.042, "rotate": 0.0, "colour": "#e8d5a0" }
  ]
}
```

- `x` / `y` — fractional position (0.0–1.0) relative to canvas
- `size` — font size as fraction of canvas width
- `textFields[0]` → track title, `textFields[1]` → artist

## License

MIT
