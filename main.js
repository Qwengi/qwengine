/**
 * Electron main-process entry point and trusted filesystem bridge.
 *
 * Purpose:
 * This file runs outside the renderer sandbox and owns window creation plus the
 * IPC handlers that read game data, read mods, and persist saves. It is the
 * only project-owned JavaScript file that should directly access Node fs/path
 * APIs for core game data at runtime.
 *
 * Responsibilities:
 * - Create the BrowserWindow and load src/index.html.
 * - Ensure base data, mods, and saves directories exist.
 * - Read JSON content from data/ and mods/ folders.
 * - Resolve relative image paths in locations and scenes into file URLs.
 * - Shape raw base/mod data for DataRegistry.compile in the renderer.
 * - Save, load, and list save slots through IPC.
 *
 * Interactions:
 * - Exposes handlers consumed by preload.js/DataLoader in the renderer.
 * - Reads data/*.json and mods/<mod>/*.json.
 * - Writes saves/<slot>.json.
 * - Does not call Engine or UI directly; renderer code handles gameplay.
 *
 * What does not belong here:
 * - Runtime game rules, event execution, stat logic, UI rendering, editor UI,
 *   save-state interpretation, or mod conflict resolution.
 *
 * Architectural assumptions and constraints:
 * - Renderer context isolation is enabled; all trusted filesystem access should
 *   pass through narrow IPC handlers.
 * - Mods are loaded by folder name sort order for now.
 * - DataRegistry owns deep merge and scene compilation; this file only reads and
 *   lightly normalizes raw JSON/assets.
 *
 * Important APIs:
 * - IPC handler "load-raw-data"
 * - IPC handler "save-game"
 * - IPC handler "load-game"
 * - IPC handler "list-saves"
 *
 * Common risks:
 * - Expanding IPC with broad filesystem paths would weaken the sandbox.
 * - Changing rawData shape must be coordinated with DataRegistry.compile.
 * - Asset path normalization should stay data-folder-relative to support mods.
 *
 * Related files:
 * - preload.js exposes these IPC handlers safely to the renderer.
 * - src/engine/dataLoader.js wraps the renderer API calls.
 * - src/engine/dataRegistry.js compiles the raw data returned here.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 850,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
}

const readJson = (filePath) => {
	if (!fs.existsSync(filePath)) return null;

	try {
		const content = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(content);
	} catch (error) {
		console.error(`圷 JSON PARSE ERROR: ${filePath}\n`, error.message);
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
			steps[stepId] = step;
		}

		scene.steps = steps;
		result[sceneId] = scene;
	}

	return result;
};

app.whenReady().then(() => {
	createWindow();

	const dataDir = path.join(__dirname, "data");
	const modsDir = path.join(__dirname, "mods");
	const savesDir = path.join(__dirname, "saves");

	[dataDir, modsDir, savesDir].forEach((dir) => {
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	});

	ipcMain.handle("load-raw-data", async () => {
		try {
			// Extract items and traits directly from their root wrapper
			const baseItemsRaw = readJson(path.join(dataDir, "items.json")) || {};
			const baseTraitsRaw = readJson(path.join(dataDir, "traits.json")) || {};

			const rawData = {
				base: {
					entities: readJson(path.join(dataDir, "stats.json"))?.entities || {},
					locations: processLocations(readJson(path.join(dataDir, "locations.json")) || {}, dataDir),
					npcs: readJson(path.join(dataDir, "npcs.json")) || {},
					events: readJson(path.join(dataDir, "events.json")) || {},
					scenes: processScenes(readJson(path.join(dataDir, "scenes.json")) || {}, dataDir),
					items: baseItemsRaw.items || {},
					traits: baseTraitsRaw.traits || {},
				},
				mods: [],
			};

			if (fs.existsSync(modsDir)) {
				const modFolders = fs
					.readdirSync(modsDir)
					.filter((name) => {
						const fullPath = path.join(modsDir, name);
						return fs.statSync(fullPath).isDirectory();
					})
					.sort();

				modFolders.forEach((folder) => {
					const modDir = path.join(modsDir, folder);

					try {
						const meta = readJson(path.join(modDir, "mod.json"));
						if (!meta) throw new Error("Missing mod.json");

						const modItemsRaw = readJson(path.join(modDir, "items.json")) || {};
						const modTraitsRaw = readJson(path.join(modDir, "traits.json")) || {};

						const modData = {
							meta,
							entities: readJson(path.join(modDir, "stats.json"))?.entities || {},
							locations: processLocations(readJson(path.join(modDir, "locations.json")) || {}, modDir),
							npcs: readJson(path.join(modDir, "npcs.json")) || {},
							events: readJson(path.join(modDir, "events.json")) || {},
							scenes: processScenes(readJson(path.join(modDir, "scenes.json")) || {}, modDir),
							items: modItemsRaw.items || {},
							traits: modTraitsRaw.traits || {},
						};

						rawData.mods.push(modData);
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

	ipcMain.handle("save-game", async (event, gameState, slotName) => {
		try {
			if (!gameState || typeof gameState !== "object") {
				throw new Error("Invalid game state");
			}

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
			const savePath = path.join(savesDir, `${safeSlot}.json`);

			return readJson(savePath);
		} catch (err) {
			console.error("[Main] Load failed:", err);
			throw new Error("Failed to load save.");
		}
	});

	ipcMain.handle("list-saves", async () => {
		try {
			if (!fs.existsSync(savesDir)) return [];

			const files = fs.readdirSync(savesDir);
			const saves = [];

			for (const file of files) {
				if (file.endsWith(".json")) {
					const slotName = path.basename(file, ".json");
					const stats = fs.statSync(path.join(savesDir, file));
					saves.push({
						slot: slotName,
						date: stats.mtimeMs,
					});
				}
			}

			return saves;
		} catch (err) {
			console.error("[Main] List saves failed:", err);
			return [];
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
