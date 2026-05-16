const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	loadRawData: () => ipcRenderer.invoke("load-raw-data"),
	saveGame: (state, slot) => ipcRenderer.invoke("save-game", state, slot),
	loadGame: (slot) => ipcRenderer.invoke("load-game", slot),
	listSaves: () => ipcRenderer.invoke("list-saves"),
});
