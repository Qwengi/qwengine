const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const isEditor = process.argv.includes("--editor");

const ALLOWED_DATA_FILES = new Set(["events", "locations", "scenes", "npcs", "items", "traits", "stats", "config"]);

const editorWindows = new Set();
let primaryEditorWebContents = null;
const pendingSnapshotRequests = new Map();

function registerEditorWindow(win, { primary = false } = {}) {
	editorWindows.add(win.webContents);
	if (primary) primaryEditorWebContents = win.webContents;

	win.webContents.on("destroyed", () => {
		editorWindows.delete(win.webContents);
		if (primaryEditorWebContents === win.webContents) primaryEditorWebContents = null;
	});
}

// When the renderer's beforeunload sets event.returnValue to abort an unload, Electron
// fires will-prevent-unload here. Default behaviour is to honor the abort, so we present
// a native confirmation and call event.preventDefault() to allow close when the user
// confirms loss.
function wireUnsavedGuard(win) {
	win.webContents.on("will-prevent-unload", (event) => {
		const choice = dialog.showMessageBoxSync(win, {
			type: "warning",
			buttons: ["Cancel", "Discard changes"],
			defaultId: 0,
			cancelId: 0,
			title: "Unsaved changes",
			message: "You have unsaved edits. Close anyway?",
			detail: "Any unsaved files will be lost. Use Save All (⌘⇧S) to keep them.",
		});
		if (choice === 1) event.preventDefault();
	});
}

function createGameWindow(opts = {}) {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 850,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			additionalArguments: opts.additionalArgs || [],
		},
	});

	mainWindow.loadFile(path.join(__dirname, "src", "game", "index.html"), {
		query: opts.query || {},
	});
}

function createEditorWindow() {
	const editorWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			additionalArguments: ["--editor-role=primary"],
		},
	});

	editorWindow.loadFile(path.join(__dirname, "src", "editor", "index.html"));
	registerEditorWindow(editorWindow, { primary: true });
	wireUnsavedGuard(editorWindow);
}

function createStepEditorWindow({ sceneId, stepId }) {
	const win = new BrowserWindow({
		width: 1100,
		height: 850,
		title: `Step Editor — ${sceneId} / ${stepId}`,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			additionalArguments: [
				"--editor-role=step",
				`--editor-scene=${sceneId}`,
				`--editor-step=${stepId}`,
			],
		},
	});

	win.loadFile(path.join(__dirname, "src", "editor", "step-editor.html"), {
		query: { scene: sceneId, step: stepId },
	});

	registerEditorWindow(win);
}

const readJson = (filePath) => {
	if (!fs.existsSync(filePath)) return null;

	try {
		const content = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(content);
	} catch (error) {
		console.error(`[Main] JSON parse error: ${filePath}\n`, error.message);
		return null;
	}
};

const resolveDataAsset = (assetPath, baseDir) => {
	if (!assetPath || typeof assetPath !== "string") return assetPath;
	if (assetPath.startsWith("http") || assetPath.startsWith("file://")) return assetPath;

	return pathToFileURL(path.join(baseDir, assetPath)).href;
};

const processLocations = (locations, baseDir) => {
	if (!locations) return {};

	const result = {};

	for (const key in locations) {
		const loc = { ...locations[key] };
		loc.image = resolveDataAsset(loc.image, baseDir);
		result[key] = loc;
	}

	return result;
};

const processScenes = (scenes, baseDir) => {
	if (!scenes) return {};

	const result = {};

	for (const [sceneId, sceneData] of Object.entries(scenes)) {
		const scene = { ...sceneData };
		const steps = {};

		for (const [stepId, stepData] of Object.entries(scene.steps || {})) {
			const step = { ...stepData };
			step.image = resolveDataAsset(step.image, baseDir);

			if (Array.isArray(step.dialogue)) {
				step.dialogue = step.dialogue.map((beat) => {
					if (beat.image) return { ...beat, image: resolveDataAsset(beat.image, baseDir) };
					return beat;
				});
			}

			steps[stepId] = step;
		}

		scene.steps = steps;
		result[sceneId] = scene;
	}

	return result;
};

app.whenReady().then(() => {
	isEditor ? createEditorWindow() : createGameWindow();

	// Game data lives inside the package (ASAR-safe read via electron's patched fs).
	const dataDir = path.join(app.getAppPath(), "data");

	// Saves and mods live in user data — writable, persists across updates.
	const userDataDir = app.getPath("userData");
	const modsDir = path.join(userDataDir, "mods");
	const savesDir = path.join(userDataDir, "saves");

	[modsDir, savesDir].forEach((dir) => {
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	});

	ipcMain.handle("load-raw-data", async (_event, opts = {}) => {
		const processPaths = opts.processPaths !== false;
		try {
			const rawData = {
				storyConfig: readJson(path.join(dataDir, "config.json")) || {},
				base: {
					entities: readJson(path.join(dataDir, "stats.json"))?.entities || {},
					locations: processPaths
						? processLocations(readJson(path.join(dataDir, "locations.json")) || {}, dataDir)
						: (readJson(path.join(dataDir, "locations.json")) || {}),
					npcs: readJson(path.join(dataDir, "npcs.json")) || {},
					events: readJson(path.join(dataDir, "events.json")) || {},
					scenes: processPaths
						? processScenes(readJson(path.join(dataDir, "scenes.json")) || {}, dataDir)
						: (readJson(path.join(dataDir, "scenes.json")) || {}),
					items: readJson(path.join(dataDir, "items.json")) || {},
					traits: readJson(path.join(dataDir, "traits.json")) || {},
				},
				mods: [],
			};

			if (fs.existsSync(modsDir)) {
				const modFolders = fs
					.readdirSync(modsDir)
					.filter((name) => fs.statSync(path.join(modsDir, name)).isDirectory())
					.sort();

				modFolders.forEach((folder) => {
					const modDir = path.join(modsDir, folder);

					try {
						const meta = readJson(path.join(modDir, "mod.json"));
						if (!meta) throw new Error("Missing mod.json");

						rawData.mods.push({
							meta,
							entities: readJson(path.join(modDir, "stats.json"))?.entities || {},
							locations: processPaths
								? processLocations(readJson(path.join(modDir, "locations.json")) || {}, modDir)
								: (readJson(path.join(modDir, "locations.json")) || {}),
							npcs: readJson(path.join(modDir, "npcs.json")) || {},
							events: readJson(path.join(modDir, "events.json")) || {},
							scenes: processPaths
								? processScenes(readJson(path.join(modDir, "scenes.json")) || {}, modDir)
								: (readJson(path.join(modDir, "scenes.json")) || {}),
							items: readJson(path.join(modDir, "items.json")) || {},
							traits: readJson(path.join(modDir, "traits.json")) || {},
						});
					} catch (err) {
						console.error(`[Main] Failed to load mod '${folder}':`, err.message);
					}
				});
			}

			return rawData;
		} catch (err) {
			console.error("[Main] load-raw-data failed:", err);
			throw new Error("Failed to load game data.");
		}
	});

	ipcMain.handle("write-data-file", async (event, filename, content) => {
		try {
			const name = path.basename(filename, ".json");
			if (!ALLOWED_DATA_FILES.has(name)) throw new Error(`Disallowed file: ${filename}`);

			const filePath = path.join(dataDir, `${name}.json`);
			fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
			return true;
		} catch (err) {
			console.error("[Main] write-data-file failed:", err);
			throw new Error("Failed to write data file.");
		}
	});

	ipcMain.handle("save-game", async (event, gameState, slotName) => {
		try {
			if (!gameState || typeof gameState !== "object") throw new Error("Invalid game state");

			const safeSlot = path.basename(slotName || "save1");
			const savePath = path.join(savesDir, `${safeSlot}.json`);

			fs.writeFileSync(savePath, JSON.stringify(gameState, null, 2));
			return true;
		} catch (err) {
			console.error("[Main] Save failed:", err);
			throw new Error("Failed to save game.");
		}
	});

	ipcMain.handle("load-game", async (event, slotName) => {
		try {
			const safeSlot = path.basename(slotName || "save1");
			return readJson(path.join(savesDir, `${safeSlot}.json`));
		} catch (err) {
			console.error("[Main] Load failed:", err);
			throw new Error("Failed to load save.");
		}
	});

	ipcMain.handle("list-saves", async () => {
		try {
			if (!fs.existsSync(savesDir)) return [];

			return fs
				.readdirSync(savesDir)
				.filter((f) => f.endsWith(".json"))
				.map((f) => ({
					slot: path.basename(f, ".json"),
					date: fs.statSync(path.join(savesDir, f)).mtimeMs,
				}));
		} catch (err) {
			console.error("[Main] List saves failed:", err);
			return [];
		}
	});

	ipcMain.handle("editor:open-step-window", async (event, { sceneId, stepId }) => {
		if (!sceneId || !stepId) throw new Error("sceneId and stepId required");
		createStepEditorWindow({ sceneId, stepId });
		return true;
	});

	ipcMain.handle("editor:request-snapshot", async () => {
		if (!primaryEditorWebContents || primaryEditorWebContents.isDestroyed()) {
			throw new Error("Primary editor window not available");
		}

		const requestId = `snap_${process.hrtime.bigint().toString(36)}`;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				pendingSnapshotRequests.delete(requestId);
				reject(new Error("Snapshot request timed out"));
			}, 5000);

			pendingSnapshotRequests.set(requestId, (snapshot) => {
				clearTimeout(timeout);
				resolve(snapshot);
			});

			primaryEditorWebContents.send("editor:snapshot-request", { requestId });
		});
	});

	ipcMain.on("editor:snapshot-response", (_event, { requestId, snapshot }) => {
		const resolver = pendingSnapshotRequests.get(requestId);
		if (resolver) {
			pendingSnapshotRequests.delete(requestId);
			resolver(snapshot);
		}
	});

	ipcMain.on("editor:broadcast", (event, payload) => {
		// Forward to all OTHER editor windows (not back to sender).
		editorWindows.forEach((wc) => {
			if (wc !== event.sender && !wc.isDestroyed()) {
				wc.send("editor:event", payload);
			}
		});
	});

	ipcMain.handle("editor:launch-game", async (_event, { sceneId, stepId } = {}) => {
		const query = {};
		if (sceneId) query.scene = sceneId;
		if (stepId) query.step = stepId;
		createGameWindow({ query });
		return true;
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		isEditor ? createEditorWindow() : createGameWindow();
	}
});
