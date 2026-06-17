/**
 * Save/load system for Engine.
 *
 * Purpose:
 * This file owns persistence-facing runtime behavior. It delegates actual disk
 * IO to DataLoader/Electron IPC, then reconciles loaded mutable save state with
 * the current compiled registry so content updates do not leave missing entity
 * templates or invalid locations behind.
 *
 * Responsibilities:
 * - Save the current Engine.state to a named slot.
 * - Load a saved state from a named slot.
 * - Merge loaded entity state over fresh compiled entity templates.
 * - Repair missing/renamed saved locations by resolving scene shorthand ids or
 *   falling back to configured/default starting locations.
 * - Trigger UI rerenders and log save/load feedback.
 *
 * Interactions:
 * - Calls DataLoader.saveGame and DataLoader.loadGame.
 * - Calls DataRegistry.deepMerge for entity template reconciliation.
 * - Uses worldSystem helpers to resolve or recover saved locations.
 * - Calls UI.renderView and UI.log.
 *
 * What does not belong here:
 * - Disk path handling, Electron IPC setup, event execution, item/stat logic,
 *   or DOM-level save list rendering.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before engine.js and contributes methods through the
 *   global EngineSaveSystem object.
 * - Methods are mixed into Engine and must use `this`.
 * - Saves intentionally store mutable state only; compiled registry content is
 *   regenerated from data files on boot.
 *
 * Important APIs:
 * - save(slot)
 * - load(slot, isAutoBoot)
 *
 * Common risks:
 * - Loading stale saves after content refactors can strand players in missing
 *   locations unless repair logic stays here.
 * - Entity merging must preserve saved mutable values while inheriting new base
 *   stats/items/traits from updated content.
 *
 * Related files:
 * - src/engine/dataLoader.js wraps renderer-to-main IPC.
 * - main.js performs the actual filesystem save/load work.
 * - src/game/systems/worldSystem.js resolves and repairs locations.
 */
const EngineSaveSystem = {
	save: async function (slot) {
		await DataLoader.saveGame(this.state, slot || "save1");
		UI.log(`💾 Saved: [${slot || "save1"}]`, true);
	},

	load: async function (slot, isAutoBoot = false) {
		const loaded = await DataLoader.loadGame(slot || "save1");
		if (loaded) {
			const baseEntities = structuredClone(this.data.entities || {});

			this.state = loaded;
			this.state.entities = DataRegistry.deepMerge(baseEntities, loaded.entities || {});

			if (!this.data.locations[this.state.location]) {
				const resolvedLocId = this.resolveLocationId(this.state.location);

				if (this.data.locations[resolvedLocId]) {
					this.state.location = resolvedLocId;
				} else {
					UI.log(`[Warning] Saved location '${this.state.location}' is missing. Relocating...`, false, "#f59e0b");
					this.state.location = this.getConfiguredStartLocation();
					if (!this.data.locations[this.state.location]) {
						this.state.location = Object.keys(this.data.locations)[0] || "home";
					}
				}
			}

			UI.renderView(this.data, this.state);
			UI.log(isAutoBoot ? `📁 Auto-loaded 'save1' state.` : `📁 Loaded: [${slot || "save1"}]`, true);
		} else if (isAutoBoot) {
			UI.log("Engine Ready.");
			UI.renderView(this.data, this.state);
		}
	},
};
