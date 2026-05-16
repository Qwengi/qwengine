/**
 * Engine runtime shell and boot coordinator.
 *
 * Purpose:
 * This file defines the global Engine object and coordinates startup. It is the
 * small composition root for renderer-side game logic: raw data is loaded,
 * compiled into runtime registries, state is initialized, save data is loaded,
 * and focused systems are mixed into the Engine API.
 *
 * Responsibilities:
 * - Own the top-level Engine.state, Engine.data, and Engine.settings containers.
 * - Register focused runtime systems from src/engine/systems.
 * - Apply config-controlled debug panel visibility and runtime settings.
 * - Load raw content through DataLoader and compile it through DataRegistry.
 * - Render debug registry output when enabled.
 * - Kick off automatic save loading on DOMContentLoaded.
 *
 * Interactions:
 * - Requires Config, DataLoader, DataRegistry, UI, and all Engine*System globals
 *   to be loaded before this script.
 * - Calls system methods mixed into Engine, especially resetState and load.
 * - Does not talk to the filesystem directly; DataLoader/main.js handle IPC.
 *
 * What does not belong here:
 * - Stat math, event execution, input validation, inventory/equipment rules,
 *   movement details, save reconciliation, DOM component rendering, or registry
 *   compilation internals. Add those to the appropriate system module instead.
 *
 * Architectural assumptions and constraints:
 * - The project currently uses ordered classic browser scripts, not ES modules,
 *   for the engine runtime. Script order in src/index.html is therefore part of
 *   the architecture.
 * - Systems are plain object mixins that use `this` as Engine. Avoid storing
 *   per-system mutable state outside Engine.state/settings/data.
 * - Public Engine methods are intentionally global because inline UI handlers
 *   and renderer scripts call them directly.
 *
 * Important APIs:
 * - Engine.init()
 * - Engine.state, Engine.data, Engine.settings
 * - Mixed-in systems expose methods such as triggerEvent, moveTo, save, load,
 *   getEffectiveStat, addItem, and validateEventInputs.
 *
 * Common risks:
 * - Loading this file before system files will fail at Object.assign time.
 * - Adding new responsibilities here recreates the oversized engine.js problem;
 *   prefer a focused system file when behavior has a clear domain.
 *
 * Related files:
 * - src/engine/systems/*.js contain focused runtime behavior.
 * - src/engine/dataLoader.js wraps IPC for data/save IO.
 * - src/engine/dataRegistry.js compiles base content and mods.
 * - src/ui/ui.js provides the rendering facade used by Engine.
 */
const Engine = {
	state: { location: "home", entities: {}, activeShop: null },
	data: null,
	settings: { max_event_depth: 5 },

	init: async function () {
		if (typeof Config !== "undefined") {
			const logPanel = document.getElementById("log-panel");
			const registryPanel = document.getElementById("registry-panel");

			if (logPanel && !Config.show_activity_log) logPanel.style.display = "none";
			if (registryPanel && !Config.show_compiled_registry) registryPanel.style.display = "none";

			if (Config.max_event_depth) {
				this.settings.max_event_depth = Config.max_event_depth;
			}
		}

		UI.log("Booting Engine...");

		if (!window.api) {
			UI.log("ERROR: Electron API not found.");
			return;
		}

		try {
			const rawData = await DataLoader.loadRaw();
			this.data = DataRegistry.compile(rawData);

			const debugEl = document.getElementById("debug-output");
			if (debugEl) debugEl.innerText = JSON.stringify(this.data, null, 2);

			this.resetState();

			await this.load("save1", true);
		} catch (err) {
			console.error("[Engine] Init failed:", err);
			UI.log(`CRITICAL ERROR: ${err.message}`, false, "#f87171");
		}
	},
};

Object.assign(
	Engine,
	EngineWorldSystem,
	EngineEntitySystem,
	EngineInputSystem,
	EngineInventorySystem,
	EngineEventSystem,
	EngineSaveSystem,
);

document.addEventListener("DOMContentLoaded", () => Engine.init());
