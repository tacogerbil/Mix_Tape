# Mix Tape — Now Playing Plugin for Volumio

A Volumio 3/4 `user_interface` plugin for Raspberry Pi with a touchscreen. Replaces the Chromium kiosk display with an animated HTML5 canvas cassette tape that reacts to playback in real time.

- Album art, title and artist stamped onto the tape label
- Spools advance as the track progresses
- Multiple installable tape themes (upload via browser, no SSH required)
- Random tape selection from a configurable pool on each track change
- Custom button icons supported (drop PNG or SVG into `assets/icons/`)

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
bash execution/sync.sh [pi-hostname]   # default: pimusic.local
```

## Plugin Settings

| Setting | Description |
|---------|-------------|
| Enable Cassette Animation | Master on/off |
| Animation Speed | Hub rotation speed multiplier (0.5–2.0) |
| Label / Album Art Opacity | Blend opacity of art on the tape label (0.0–1.0) |
| Text Font | Global font override; "Per Tape" uses each theme's own font |
| Active Tape | Which tape to display |
| Randomize Tape | Switch to a random tape on each track change |
| Tape pool switches | Which tapes are eligible for random selection |

## Uploading Themes

With the plugin running, open a browser on your local network and go to:
```
http://volumio.local:3042/upload
```
Drag and drop a `.zip` file. The zip must contain these files at the root (no subfolder):

| File | Required | Notes |
|------|----------|-------|
| `theme.json` | Yes | Layout, font, text positions |
| `bg.jpg` or `bg.png` | Yes | Full canvas background |
| `shell.png` | Yes | Cassette body (transparent window) |
| `hub.png` | Yes | Spool hub image |
| `tape_texture.png` | Yes | Wound-tape texture |
| `label_mask.png` | No | Greyscale mask for label area |
| `misc.png` | No | Extra composited layer |

Installed themes appear immediately in plugin settings. Delete them from the same upload page.

## theme.json Reference

```json
{
  "name": "My Tape",
  "leftSpoolX":     228,   "leftSpoolY":  230,
  "rightSpoolX":    574,   "rightSpoolY": 230,
  "minSpoolRadius": 28,
  "maxSpoolRadius": 215,
  "leftGuideX":     null,  "leftGuideY":  null,
  "rightGuideX":    null,  "rightGuideY": null,
  "fontFamily":     "Permanent Marker",
  "textFields": [
    { "x": 0.50, "y": 0.10, "size": 0.07,  "width": 0.7, "rotate": 0.0, "colour": "#ffffff", "binding": "title"  },
    { "x": 0.50, "y": 0.20, "size": 0.042, "width": 0.7, "rotate": 0.0, "colour": "#e8d5a0", "binding": "artist" }
  ]
}
```

| Field | Notes |
|-------|-------|
| `leftSpoolX/Y`, `rightSpoolX/Y` | Absolute pixel coordinates of each spool center in shell.png |
| `minSpoolRadius`, `maxSpoolRadius` | Spool size range in pixels |
| `leftGuideX/Y`, `rightGuideX/Y` | Optional tape guide pin positions (null to omit) |
| `fontFamily` | Google Fonts name; `"Permanent Marker"` is bundled offline |
| `textFields[].x/y` | Fractional position (0.0–1.0) relative to canvas size |
| `textFields[].size` | Font size as fraction of canvas width |
| `textFields[].width` | Max text width as fraction of canvas width |
| `textFields[].binding` | `"title"` or `"artist"` |

## Custom Button Icons

Drop icon files into `assets/icons/` and sync. PNG or SVG both work; SVG scales best.

| Filename | Button |
|----------|--------|
| `prev.svg` / `prev.png` | Previous track |
| `play.svg` / `play.png` | Play |
| `pause.svg` / `pause.png` | Pause |
| `stop.svg` / `stop.png` | Stop |
| `next.svg` / `next.png` | Next track |
| `voldown.svg` / `voldown.png` | Volume down |
| `volup.svg` / `volup.png` | Volume up |

Any button without a matching file falls back to its Unicode symbol.

## Fonts

**Permanent Marker** is bundled and works fully offline. All other font names are fetched from Google Fonts CDN — the Pi must have internet access for them to render.

Available options in the plugin settings dropdown:
Rock Salt, Caveat, Satisfy, Dancing Script, Special Elite, Pacifico, Indie Flower

## License

MIT
