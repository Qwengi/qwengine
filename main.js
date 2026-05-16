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

const processLocations = (locations, baseDir) => {
	if (!locations) return {};

	const result = {};

	for (const key in locations) {
		const loc = { ...locations[key] };

		if (loc.image && !loc.image.startsWith("http") && !loc.image.startsWith("file://")) {
			const absPath = path.join(baseDir, loc.image);
			loc.image = pathToFileURL(absPath).href;
		}

		result[key] = loc;
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
