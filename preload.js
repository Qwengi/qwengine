const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// In dev, static/ sits next to preload.js at the project root.
// In a packaged app, static/ is an extraResource placed in resources/.
const staticInApp = path.join(__dirname, "static");
const staticDir = fs.existsSync(staticInApp)
	? staticInApp
	: path.join(process.resourcesPath, "static");

contextBridge.exposeInMainWorld("api", {
	staticBasePath: pathToFileURL(staticDir).href,
	loadRawData: () => ipcRenderer.invoke("load-raw-data"),
	writeDataFile: (filename, content) => ipcRenderer.invoke("write-data-file", filename, content),
	saveGame: (state, slot) => ipcRenderer.invoke("save-game", state, slot),
	loadGame: (slot) => ipcRenderer.invoke("load-game", slot),
	listSaves: () => ipcRenderer.invoke("list-saves"),
});
