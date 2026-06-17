/**
 * UI facade for renderer-side game presentation.
 *
 * Purpose:
 * This file defines the global UI object used by Engine systems. It keeps the
 * public UI API stable while delegating substantial rendering work to focused
 * renderer modules under src/game/ui/renderers.
 *
 * Responsibilities:
 * - Provide activity log output through UI.log.
 * - Expose compatibility methods expected by Engine and existing UI handlers:
 *   renderView, renderStats, renderTraits, renderEquipment, renderInventory,
 *   createShopSection, and createSection.
 * - Keep renderer module wiring in one discoverable place.
 *
 * Interactions:
 * - Called by Engine systems after events, movement, inventory changes, saves,
 *   loads, and boot.
 * - Delegates player sidebars to PlayerPanelRenderer.
 * - Delegates shop sections to ShopRenderer.
 * - Delegates the main location/play surface to WorldViewRenderer.
 *
 * What does not belong here:
 * - Large DOM render functions, game state mutation, data loading, registry
 *   compilation, save/load IPC, or custom element implementation.
 *
 * Architectural assumptions and constraints:
 * - The renderer currently uses ordered classic scripts. playerPanels.js,
 *   shopRenderer.js, and worldView.js must load before this file.
 * - UI remains a global facade because Engine systems call UI directly.
 * - Renderers should remain stateless functions over current data/state.
 *
 * Important APIs:
 * - UI.log(msg, isAction, customColor)
 * - UI.renderView(data, state)
 * - UI.renderStats/player inventory helpers kept for compatibility
 *
 * Common risks:
 * - Moving log behavior into a renderer would couple gameplay feedback to a
 *   specific view. Keep logging here.
 * - Removing facade methods can break older Engine/UI call sites even if the
 *   new renderers still exist.
 *
 * Related files:
 * - src/game/ui/renderers/playerPanels.js
 * - src/game/ui/renderers/shopRenderer.js
 * - src/game/ui/renderers/worldView.js
 * - src/game/engine.js and src/game/systems/*.js call this facade.
 */
const UI = {
	log(msg, isAction = false, customColor = null) {
		const logEl = document.getElementById("event-log");
		if (!logEl) return;

		const entry = document.createElement("div");

		const color = customColor || (isAction ? "#818cf8" : "#cbd5e1");
		entry.style.color = color;

		if (isAction) entry.classList.add("font-bold");

		entry.textContent = `> ${msg}`;

		logEl.appendChild(entry);

		while (logEl.children.length > 100) {
			logEl.removeChild(logEl.firstChild);
		}

		logEl.scrollTop = logEl.scrollHeight;
	},

	renderStats(player) {
		return PlayerPanelRenderer.renderStats(player);
	},

	renderTraits(player, data) {
		return PlayerPanelRenderer.renderTraits(player, data);
	},

	renderEquipment(player, data) {
		return PlayerPanelRenderer.renderEquipment(player, data);
	},

	renderInventory(player, data) {
		return PlayerPanelRenderer.renderInventory(player, data);
	},

	createShopSection(npcId, data) {
		return ShopRenderer.createShopSection(npcId, data);
	},

	renderView(data, state) {
		return WorldViewRenderer.renderView(data, state);
	},

	createSection(label, list, sourceData, handler, hideIfLocked) {
		return WorldViewRenderer.createSection(label, list, sourceData, handler, hideIfLocked);
	},
};
