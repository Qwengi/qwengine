/**
 * Shop section renderer.
 *
 * Purpose:
 * This file renders the transactional shop UI that appears after talking to an
 * NPC with a shop definition. It is separated from the broader world view so
 * shop row layout, cost labels, and purchase button state can evolve together.
 *
 * Responsibilities:
 * - Build the active NPC shop section.
 * - Filter hidden or already-owned shop items through Engine.canShowShopItem.
 * - Format item cost arrays into compact button labels.
 * - Enable/disable purchase controls based on Engine.canApplyChanges.
 * - Call Engine.buyItem when the player purchases something.
 *
 * Interactions:
 * - Reads compiled npc/item data passed from the world renderer.
 * - Reads Engine.canShowShopItem and Engine.canApplyChanges.
 * - Calls Engine.buyItem from button handlers.
 *
 * What does not belong here:
 * - Inventory mutation rules, stat-cost application, NPC talk behavior, location
 *   layout, player panel rendering, or activity log rendering.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before src/ui/ui.js and contributes the global
 *   ShopRenderer object.
 * - It returns DOM nodes to the caller rather than appending directly to the
 *   main container, keeping layout ownership in worldView.js.
 *
 * Important APIs:
 * - ShopRenderer.createShopSection(npcId, data)
 *
 * Common risks:
 * - Cost labels are display-only; affordability must always be checked again by
 *   Engine.buyItem before mutating state.
 * - Hiding non-stackable owned items depends on Engine.canShowShopItem.
 *
 * Related files:
 * - src/ui/renderers/worldView.js inserts this section into the location view.
 * - src/engine/systems/inventorySystem.js implements shop and item behavior.
 */
const ShopRenderer = {
	createShopSection(npcId, data) {
		const npc = data.npcs[npcId];
		const section = document.createElement("div");
		section.className = "mb-6 mt-4 p-5 bg-slate-900/80 rounded-xl border border-amber-900/50 shadow-lg";

		const title = document.createElement("h3");
		title.className = "text-sm text-amber-500 uppercase tracking-widest mb-4 font-bold border-b border-amber-900/30 pb-2";
		title.textContent = `🛒 ${npc.name}'s Wares`;

		const wrapper = document.createElement("div");
		wrapper.className = "flex flex-col gap-3";

		const visibleItems = npc.shop.inventory.filter((shopItem) => {
			return Engine.canShowShopItem(shopItem.id);
		});

		if (visibleItems.length === 0) {
			wrapper.innerHTML = '<p class="text-slate-500 text-sm italic">Nothing else for sale right now.</p>';
		}

		visibleItems.forEach((shopItem) => {
			if (!shopItem) return;

			const itemDef = data.items[shopItem.id];
			if (!itemDef) return;

			const row = document.createElement("div");
			row.className = "flex justify-between items-center p-3 bg-slate-950/50 rounded-lg border border-slate-700/50 transition-colors hover:border-amber-700/50";

			const infoDiv = document.createElement("div");
			infoDiv.className = "flex flex-col";

			const nameEl = document.createElement("span");
			nameEl.className = "text-slate-200 font-bold";
			nameEl.textContent = itemDef.name;

			const typeEl = document.createElement("span");
			typeEl.className = "text-xs text-slate-500 capitalize";
			typeEl.textContent = itemDef.type;

			infoDiv.appendChild(nameEl);
			infoDiv.appendChild(typeEl);

			let costLabel = "Free";
			if (Array.isArray(shopItem.cost) && shopItem.cost.length > 0) {
				costLabel = shopItem.cost
					.map((c) => {
						const statName = c.stat ? c.stat.charAt(0).toUpperCase() + c.stat.slice(1) : "Unknown";
						return `${c.amount || 0} ${statName}`;
					})
					.join(", ");
			}

			const buyBtn = document.createElement("button");
			const canAfford = Engine.canApplyChanges(shopItem.cost);

			if (canAfford) {
				buyBtn.className =
					"px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold flex gap-2 items-center shadow shadow-amber-900/50 transition-all active:scale-95";
				buyBtn.onclick = () => Engine.buyItem(npcId, shopItem.id);
			} else {
				buyBtn.className = "px-4 py-2 bg-amber-600/50 text-white/50 rounded-lg text-sm font-bold flex gap-2 items-center shadow transition-all cursor-not-allowed";
				buyBtn.disabled = true;
			}

			buyBtn.innerHTML = `<span>${costLabel}</span>`;

			row.appendChild(infoDiv);
			row.appendChild(buyBtn);
			wrapper.appendChild(row);
		});

		section.appendChild(title);
		section.appendChild(wrapper);
		return section;
	},
};
