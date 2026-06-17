/**
 * Player sidebar and status renderer.
 *
 * Purpose:
 * This file renders player-centric UI panels: top resource/currency badges,
 * sidebar attributes, traits, equipment, and inventory. It keeps closely
 * related player presentation code together while leaving world/action layout
 * and shop rendering to separate renderer modules.
 *
 * Responsibilities:
 * - Render effective player stats in the top header and attributes sidebar.
 * - Render traits from compiled trait definitions.
 * - Render worn equipment and unequip controls.
 * - Render inventory items and item action controls.
 *
 * Interactions:
 * - Reads compiled data passed in by UI.renderView.
 * - Reads Engine effective stat helpers and inventory/equipment actions.
 * - Writes DOM under #stats-container, #sidebar-attributes, #traits-list,
 *   #equipment-list, and #inventory-list.
 *
 * What does not belong here:
 * - Main location rendering, event/action button construction, shop sections,
 *   activity log output, save/load list rendering, or engine state mutation
 *   beyond calling public Engine item/equipment methods from button handlers.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before src/game/ui/ui.js and contributes the global
 *   PlayerPanelRenderer object.
 * - The renderer is intentionally DOM-based and does not own game state.
 * - Stat ids are displayed as authored; effective calculations come from Engine.
 *
 * Important APIs:
 * - PlayerPanelRenderer.renderStats(player)
 * - PlayerPanelRenderer.renderTraits(player, data)
 * - PlayerPanelRenderer.renderEquipment(player, data)
 * - PlayerPanelRenderer.renderInventory(player, data)
 *
 * Common risks:
 * - Calling raw stat values instead of Engine.getEffectiveStat will desync the
 *   UI from traits/equipment effects.
 * - Item button handlers should call Engine APIs rather than mutating inventory
 *   directly from the renderer.
 *
 * Related files:
 * - src/game/ui/ui.js exposes these methods through the public UI facade.
 * - src/game/ui/renderers/worldView.js calls these after rendering the location.
 * - src/game/systems/entitySystem.js and inventorySystem.js provide actions.
 */
const PlayerPanelRenderer = {
	clearContainer(id) {
		const container = document.getElementById(id);
		if (!container) return null;
		container.innerHTML = "";
		return container;
	},

	setEmptyState(container, message) {
		container.innerHTML = `<p class="text-slate-500 text-sm italic">${message}</p>`;
	},

	createItemRow(name, typeLabel, rowClass, nameColor, typeColor) {
		const row = document.createElement("div");
		row.className = `flex justify-between items-center ${rowClass} p-3 rounded border shadow-inner mb-2 shrink-0`;

		const leftCol = document.createElement("div");
		leftCol.className = "flex flex-col";

		const nameSpan = document.createElement("span");
		nameSpan.className = `text-sm ${nameColor} font-bold`;
		nameSpan.textContent = name;

		const typeSpan = document.createElement("span");
		typeSpan.className = `text-[10px] ${typeColor} capitalize tracking-widest`;
		typeSpan.textContent = typeLabel;

		leftCol.appendChild(nameSpan);
		leftCol.appendChild(typeSpan);
		row.appendChild(leftCol);

		return { row, leftCol };
	},

	renderStats(player) {
		const topContainer = document.getElementById("stats-container");
		const sidebarContainer = document.getElementById("sidebar-attributes");

		if (!player?.stats) return;

		if (topContainer) topContainer.innerHTML = "";

		if (sidebarContainer) {
			sidebarContainer.innerHTML = `
				<div class="mb-6 pb-4 border-b border-slate-800 shrink-0">
					<h2 data-player-name class="text-2xl font-bold text-indigo-400">Player Profile</h2>
					<p class="text-xs text-slate-500 mt-1">Your core attributes and skills</p>
				</div>
			`;

			const playerNameEl = sidebarContainer.querySelector("[data-player-name]");
			if (playerNameEl) playerNameEl.textContent = player.name || "Player Profile";
		}

		const typeStyles = {
			resource: "bg-rose-900/40 text-rose-300 border-rose-800",
			currency: "bg-amber-900/40 text-amber-300 border-amber-800",
			default: "bg-slate-800 text-slate-300 border-slate-700",
		};

		const attributesByGroup = {};

		for (const [id, stat] of Object.entries(player.stats)) {
			if (typeof stat !== "object" || stat.value === undefined) continue;

			if (stat.type === "attribute") {
				if (!stat.group) continue;

				const groupName = stat.group;
				if (!attributesByGroup[groupName]) {
					attributesByGroup[groupName] = {};
				}
				attributesByGroup[groupName][id] = stat;
				continue;
			}

			if (topContainer) {
				const wrapper = document.createElement("div");
				const label = document.createElement("span");
				const value = document.createElement("span");

				const type = stat.type || "default";
				const style = typeStyles[type] || typeStyles.default;

				const isResource = type === "resource";
				const maxVal = stat.max !== undefined || isResource ? Engine.getEffectiveMax(id, "player") : undefined;
				const effectiveVal = Engine.getEffectiveStat(id, "player");

				wrapper.className = `flex flex-col px-3 py-1 rounded border ${style} min-w-[80px]`;

				label.className = "text-[10px] opacity-70 font-bold tracking-tighter";
				label.textContent = id.toUpperCase();

				value.className = "text-sm font-mono";
				value.textContent = maxVal !== undefined ? `${effectiveVal} / ${maxVal}` : `${effectiveVal}`;

				wrapper.appendChild(label);
				wrapper.appendChild(value);
				topContainer.appendChild(wrapper);
			}
		}

		if (sidebarContainer) {
			const groups = Object.keys(attributesByGroup).sort((a, b) => a.localeCompare(b));

			groups.forEach((group) => {
				const groupData = attributesByGroup[group];

				const section = document.createElement("div");
				section.className = "mb-6 last:mb-0 shrink-0";

				const title = document.createElement("h3");
				title.className = "text-[10px] text-slate-500 uppercase tracking-widest mb-3 font-bold border-b border-slate-800 pb-1";
				title.textContent = group;

				const list = document.createElement("div");
				list.className = "flex flex-col gap-2.5";

				for (const [id, stat] of Object.entries(groupData)) {
					const hasProgress = stat.progress_max !== undefined;

					const row = document.createElement("div");
					row.className = "bg-slate-950/50 p-2.5 rounded border border-slate-800/50 shadow-inner";

					const topLine = document.createElement("div");
					topLine.className = "flex justify-between items-center";

					const nameSpan = document.createElement("span");
					nameSpan.className = "text-sm text-slate-300 font-medium capitalize";
					nameSpan.textContent = id.replace(/_/g, " ");

					const effectiveVal = Engine.getEffectiveStat(id, "player");

					const valSpan = document.createElement("span");
					valSpan.className = "text-sm font-mono text-indigo-400 font-bold bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-800/50 shadow-sm";
					valSpan.textContent = effectiveVal;

					topLine.appendChild(nameSpan);
					topLine.appendChild(valSpan);
					row.appendChild(topLine);

					if (hasProgress) {
						const factor = Config?.stat_training_diminishing_returns ?? 0;
						const threshold = stat.progress_max * (1 + factor * stat.value);
						const pct = Math.min(100, ((stat.progress || 0) / threshold) * 100);
						const barWrap = document.createElement("div");
						barWrap.className = "mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden";
						const fill = document.createElement("div");
						fill.className = "h-full bg-violet-500/70 rounded-full transition-all";
						fill.style.width = `${pct}%`;
						barWrap.appendChild(fill);
						row.appendChild(barWrap);
					}

					list.appendChild(row);
				}

				section.appendChild(title);
				section.appendChild(list);
				sidebarContainer.appendChild(section);
			});
		}
	},

	renderTraits(player, data) {
		const container = this.clearContainer("traits-list");
		if (!container) return;

		const hasTraits = player?.traits && player.traits.length > 0;
		if (!hasTraits) return this.setEmptyState(container, "You have no traits.");

		player.traits.forEach((traitInst) => {
			if (!traitInst) return;
			const traitDef = data.traits?.[traitInst.id];
			if (!traitDef) return;

			const { row } = this.createItemRow(
				traitDef.name,
				traitDef.type || "Trait",
				"bg-rose-950/40 border-rose-800/50",
				"text-rose-300",
				"text-rose-500",
			);
			container.appendChild(row);
		});
	},

	renderEquipment(player, data) {
		const container = this.clearContainer("equipment-list");
		if (!container) return;

		const hasWornItems = player?.worn && Object.values(player.worn).some((inst) => inst !== null && inst !== undefined);
		if (!hasWornItems) return this.setEmptyState(container, "You have nothing equipped.");

		for (const [slot, itemInst] of Object.entries(player.worn)) {
			if (!itemInst) continue;

			const itemDef = data.items[itemInst.id];
			if (!itemDef) continue;

			const { row } = this.createItemRow(
				itemDef.name,
				`Slot: ${slot}`,
				"bg-indigo-950/40 border-indigo-800/50",
				"text-indigo-300",
				"text-indigo-500",
			);

			const unequipBtn = document.createElement("button");
			unequipBtn.className = "px-4 py-1.5 bg-slate-700/90 hover:bg-slate-600 text-white rounded text-xs font-bold transition-all shadow-sm";
			unequipBtn.textContent = "Unequip";
			unequipBtn.onclick = () => Engine.unequipItem(slot);
			row.appendChild(unequipBtn);

			container.appendChild(row);
		}
	},

	renderInventory(player, data) {
		const container = this.clearContainer("inventory-list");
		if (!container) return;

		const hasInventoryItems = Array.isArray(player?.inventory) && player.inventory.length > 0;
		if (!hasInventoryItems) return this.setEmptyState(container, "Your inventory is empty.");

		player.inventory.forEach((itemInst, index) => {
			if (!itemInst) return;

			const itemDef = data.items[itemInst.id];
			if (!itemDef) return;

			const { row } = this.createItemRow(
				itemDef.name + (itemInst.quantity ? ` (x${itemInst.quantity})` : ""),
				itemDef.type,
				"bg-slate-950/50 border-slate-800/50 transition-colors hover:bg-slate-900/50 hover:border-slate-700/80",
				"text-slate-300",
				"text-slate-500",
			);

			if (Array.isArray(itemDef.effects) && itemDef.effects.length > 0 && itemDef.type !== "equipment") {
				const useBtn = document.createElement("button");
				useBtn.className = "px-4 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all shadow-sm";
				useBtn.textContent = "Use";
				useBtn.onclick = () => Engine.useItem(itemInst.id, index);
				row.appendChild(useBtn);
			} else if (itemDef.type === "equipment") {
				const eqBtn = document.createElement("button");
				eqBtn.className = "px-4 py-1.5 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-all shadow-sm";
				eqBtn.textContent = "Equip";
				eqBtn.onclick = () => Engine.equipItem(index);
				row.appendChild(eqBtn);
			} else {
				const passiveLabel = document.createElement("span");
				passiveLabel.className = "text-[10px] text-slate-600 capitalize tracking-widest italic";
				passiveLabel.textContent = itemDef.type || "passive";
				row.appendChild(passiveLabel);
			}

			container.appendChild(row);
		});
	},
};
