/**
 * World system for the runtime Engine.
 *
 * Purpose:
 * This file owns the player's current position in the compiled world registry.
 * It translates authoring-facing scene starts and shorthand step ids into the
 * generated runtime location ids produced by DataRegistry, resets game state to
 * a valid starting location, and performs location movement.
 *
 * Responsibilities:
 * - Resolve configured starting scene/location data into a runtime location id.
 * - Resolve loose scene step ids into generated scene location ids when possible.
 * - Reset Engine.state from compiled entity templates.
 * - Move the active game state between locations and ask the UI to rerender.
 *
 * Interactions:
 * - Reads Config.starting_scene, Config.startingScene, and Config.starting_location.
 * - Reads Engine.data.locations and Engine.data.scenes.
 * - Writes Engine.state.location, Engine.state.entities, and Engine.state.activeShop.
 * - Calls UI.log and UI.renderView after movement.
 *
 * What does not belong here:
 * - Event execution rules, stat changes, inventory logic, save/load persistence,
 *   or raw data loading/compilation.
 * - DOM construction beyond requesting a high-level UI rerender.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before engine.js and contributes methods through the
 *   global EngineWorldSystem object.
 * - Methods are mixed into Engine and must use `this` for Engine state/data.
 * - Generated scene locations use the DataRegistry convention `scene:<scene>:<step>`.
 *
 * Important APIs:
 * - resetState()
 * - getConfiguredStartLocation()
 * - resolveLocationId(locId)
 * - moveTo(locId)
 *
 * Common risks:
 * - Changing generated scene id conventions here without updating DataRegistry
 *   will break scene starts, saves, and event teleports.
 * - Calling UI directly from deeper systems increases coupling; keep this file
 *   limited to high-level movement feedback.
 *
 * Related files:
 * - src/game/engine.js wires this system into Engine.
 * - src/engine/dataRegistry.js generates scene locations.
 * - src/game/systems/saveSystem.js uses resolveLocationId for old saves.
 */
const EngineWorldSystem = {
	resetState: function () {
		let startLoc = this.getConfiguredStartLocation();
		if (!this.data.locations[startLoc]) {
			startLoc = Object.keys(this.data.locations)[0] || "unknown";
		}

		this.state = {
			location: startLoc,
			entities: structuredClone(this.data.entities || {}),
			activeShop: null,
			usedEvents: {},
		};
	},

	getConfiguredStartLocation: function () {
		const sceneId = Config.starting_scene || Config.startingScene;
		if (sceneId && this.data.scenes?.[sceneId]?.start_location) {
			return this.data.scenes[sceneId].start_location;
		}

		return Config.starting_location;
	},

	resolveLocationId: function (locId) {
		if (this.data.locations[locId]) return locId;

		for (const [sceneId, scene] of Object.entries(this.data.scenes || {})) {
			if (scene?.steps?.[locId]) {
				return `scene:${sceneId}:${locId}`;
			}
		}

		return locId;
	},

	moveTo: function (locId) {
		const resolvedLocId = this.resolveLocationId(locId);
		const loc = this.data.locations[resolvedLocId];
		if (!loc) {
			console.warn(`[Engine] Unknown location '${locId}'.`);
			return;
		}

		this.state.location = resolvedLocId;
		this.state.activeShop = null;
		if (!resolvedLocId.startsWith("scene:")) UI.log(`Moved to ${loc.name || locId}.`, true);
		UI.renderView(this.data, this.state);
	},
};
