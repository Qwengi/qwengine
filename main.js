const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const isEditor = process.argv.includes("--editor");

const ALLOWED_DATA_FILES = new Set(["events", "locations", "scenes", "npcs", "items", "traits", "stats", "config"]);

function createGameWindow() {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 850,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	mainWindow.loadFile(path.join(__dirname, "src", "game", "index.html"));
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
		},
	});

	editorWindow.loadFile(path.join(__dirname, "src", "editor", "index.html"));
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

	ipcMain.handle("load-raw-data", async () => {
		try {
			const rawData = {
				storyConfig: readJson(path.join(dataDir, "config.json")) || {},
				base: {
					entities: readJson(path.join(dataDir, "stats.json"))?.entities || {},
					locations: processLocations(readJson(path.join(dataDir, "locations.json")) || {}, dataDir),
					npcs: readJson(path.join(dataDir, "npcs.json")) || {},
					events: readJson(path.join(dataDir, "events.json")) || {},
					scenes: processScenes(readJson(path.join(dataDir, "scenes.json")) || {}, dataDir),
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
							locations: processLocations(readJson(path.join(modDir, "locations.json")) || {}, modDir),
							npcs: readJson(path.join(modDir, "npcs.json")) || {},
							events: readJson(path.join(modDir, "events.json")) || {},
							scenes: processScenes(readJson(path.join(modDir, "scenes.json")) || {}, modDir),
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
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		isEditor ? createEditorWindow() : createGameWindow();
	}
});
