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

const argFor = (prefix) => {
	const hit = process.argv.find((a) => a.startsWith(prefix));
	return hit ? hit.slice(prefix.length) : null;
};

contextBridge.exposeInMainWorld("api", {
	staticBasePath: pathToFileURL(staticDir).href,
	dataDirUrl: pathToFileURL(path.join(__dirname, "data")).href,
	loadRawData: (opts) => ipcRenderer.invoke("load-raw-data", opts),
	writeDataFile: (filename, content) => ipcRenderer.invoke("write-data-file", filename, content),
	saveGame: (state, slot) => ipcRenderer.invoke("save-game", state, slot),
	loadGame: (slot) => ipcRenderer.invoke("load-game", slot),
	listSaves: () => ipcRenderer.invoke("list-saves"),

	editorRole: argFor("--editor-role=") || null,
	editorSceneArg: argFor("--editor-scene=") || null,
	editorStepArg: argFor("--editor-step=") || null,

	openStepEditor: (sceneId, stepId) => ipcRenderer.invoke("editor:open-step-window", { sceneId, stepId }),
	requestEditorSnapshot: () => ipcRenderer.invoke("editor:request-snapshot"),
	broadcastEditorEvent: (payload) => ipcRenderer.send("editor:broadcast", payload),
	onEditorEvent: (handler) => {
		const wrapped = (_e, payload) => handler(payload);
		ipcRenderer.on("editor:event", wrapped);
		return () => ipcRenderer.removeListener("editor:event", wrapped);
	},
	onSnapshotRequest: (handler) => {
		const wrapped = (_e, { requestId }) => {
			const snapshot = handler();
			ipcRenderer.send("editor:snapshot-response", { requestId, snapshot });
		};
		ipcRenderer.on("editor:snapshot-request", wrapped);
		return () => ipcRenderer.removeListener("editor:snapshot-request", wrapped);
	},

	launchGameAtScene: (sceneId, stepId) => ipcRenderer.invoke("editor:launch-game", { sceneId, stepId }),
});
