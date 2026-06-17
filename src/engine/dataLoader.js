/**
 * Renderer-side data and save IPC wrapper.
 *
 * Purpose:
 * This file provides a tiny abstraction over the safe APIs exposed by preload.js.
 * It keeps Engine code from reaching into window.api directly and gives tests or
 * non-Electron contexts one small object to stub.
 *
 * Responsibilities:
 * - Request raw base/mod data from the Electron main process.
 * - Save and load mutable Engine.state snapshots.
 * - List available save slots.
 * - Return conservative fallback values when window.api is unavailable.
 *
 * Interactions:
 * - Calls window.api methods exposed by preload.js.
 * - Used by src/game/engine.js and src/game/systems/saveSystem.js.
 *
 * What does not belong here:
 * - Filesystem paths, JSON parsing, raw data shape normalization, registry
 *   compilation, gameplay rules, or UI rendering.
 *
 * Architectural assumptions and constraints:
 * - In the Electron app, window.api should exist because preload.js is configured
 *   in main.js.
 * - Fallbacks are for graceful failure/dev contexts, not full browser support.
 *
 * Important APIs:
 * - DataLoader.loadRaw()
 * - DataLoader.saveGame(state, slot)
 * - DataLoader.loadGame(slot)
 * - DataLoader.listSaves()
 *
 * Common risks:
 * - Adding behavior here can hide errors that belong in main.js or Engine.
 * - Return shapes must stay compatible with DataRegistry and saveSystem.
 *
 * Related files:
 * - preload.js exposes window.api.
 * - main.js handles the trusted IPC work.
 * - src/engine/dataRegistry.js consumes loadRaw output.
 */
const DataLoader = {
	loadRaw: async function () {
		if (window.api) {
			return await window.api.loadRawData();
		}
		return null;
	},

	saveGame: async function (state, slot) {
		if (window.api) {
			return await window.api.saveGame(state, slot);
		}
		return false;
	},

	loadGame: async function (slot) {
		if (window.api) {
			return await window.api.loadGame(slot);
		}
		return null;
	},

	listSaves: async function () {
		if (window.api && window.api.listSaves) {
			return await window.api.listSaves();
		}
		return [];
	},
};
