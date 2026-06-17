# QwEngine

A data-driven narrative game engine with a built-in story editor. Game content is authored entirely in JSON — no code required to create locations, events, characters, items, or branching scenes.

## Getting Started

**Prerequisites:** Node.js and npm.

```bash
npm install
```

**Run the game:**
```bash
npm start
```

**Run the story editor:**
```bash
npm run edit
```

## How it works

All game content lives in the `data/` folder as plain JSON files:

| File | What it defines |
|---|---|
| `config.json` | Starting scene, font scale, death handler |
| `stats.json` | Player and world entity stats |
| `locations.json` | World locations and their connections |
| `scenes.json` | Scripted scenes with dialogue and branching choices |
| `events.json` | Actions the player can take (with conditions and effects) |
| `npcs.json` | Characters, their dialogue, and their shops |
| `items.json` | Item definitions and use effects |
| `traits.json` | Trait definitions and passive effects |

The engine compiles these files at boot into a runtime registry. No rebuilding needed when you change content — just restart.

## Story Editor

`npm run edit` opens a second window with a panel for each data file type. Changes are saved directly back to `data/` on disk. The Scenes panel includes an SVG node graph showing branching flow.

## Mods

Drop a folder into `mods/` (in your OS user data directory) with a `mod.json` metadata file. Mods deep-merge with base content — add new locations, override existing events, or extend NPC dialogue. The `!` suffix on any key forces a full replacement instead of a merge.

```
mods/
  my_mod/
    mod.json       ← { "id": "my_mod", "name": "My Mod" }
    events.json    ← adds or overrides events
    locations.json ← adds or overrides locations
```

## Project structure

See `project-structure.txt` for the full annotated file layout.

## Build

```bash
npm run dist
```

Produces a distributable in `dist/` for the current platform.
