/**
 * Electron preload bridge for renderer-safe APIs.
 *
 * Purpose:
 * This file is loaded by Electron before the renderer page and exposes a small,
 * explicit API surface from the trusted main process into the isolated browser
 * context. It is the boundary between DOM/game code and privileged IPC.
 *
 * Responsibilities:
 * - Use contextBridge to expose window.api.
 * - Forward raw data loading requests to main.js.
 * - Forward save/load/list-save requests to main.js.
 *
 * Interactions:
 * - Calls ipcRenderer.invoke for handlers registered in main.js.
 * - Consumed by src/engine/dataLoader.js through window.api.
 *
 * What does not belong here:
 * - Game logic, filesystem path construction, JSON parsing, UI rendering,
 *   validation, or broad arbitrary IPC helpers.
 *
 * Architectural assumptions and constraints:
 * - contextIsolation is enabled in main.js, so renderer scripts cannot import
 *   Node modules directly.
 * - Keep this API minimal and declarative; every exposed method is part of the
 *   renderer security boundary.
 *
 * Important APIs:
 * - window.api.loadRawData()
 * - window.api.saveGame(state, slot)
 * - window.api.loadGame(slot)
 * - window.api.listSaves()
 *
 * Common risks:
 * - Exposing generic IPC or filesystem access here would bypass the intended
 *   safety model.
 * - Renaming methods must be coordinated with DataLoader.
 *
 * Related files:
 * - main.js registers the IPC handlers.
 * - src/engine/dataLoader.js is the renderer-facing wrapper.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	loadRawData: () => ipcRenderer.invoke("load-raw-data"),
	saveGame: (state, slot) => ipcRenderer.invoke("save-game", state, slot),
	loadGame: (slot) => ipcRenderer.invoke("load-game", slot),
	listSaves: () => ipcRenderer.invoke("list-saves"),
});
