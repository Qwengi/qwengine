/**
 * Inventory, equipment, NPC talk, and shop system for Engine.
 *
 * Purpose:
 * This file owns interactions that move items around or expose shop behavior.
 * It keeps concrete inventory/equipment rules together because they share the
 * same item definitions, player inventory shape, and cost/effect application
 * rules.
 *
 * Responsibilities:
 * - Check whether an entity has an item in inventory or equipped slots.
 * - Determine whether shop items should be shown.
 * - Handle NPC talk and active shop state.
 * - Buy items by applying costs and adding inventory entries.
 * - Add, use, equip, and unequip items.
 *
 * Interactions:
 * - Reads Engine.data.items and Engine.data.npcs.
 * - Reads/writes entity inventory and worn equipment in Engine.state.
 * - Calls Engine.applyChanges, Engine.canApplyChanges, Engine.clampResource,
 *   Engine.addItem, and Engine.unequipItem.
 * - Calls UI.log and UI.renderView after player-facing interactions.
 *
 * What does not belong here:
 * - Stat math internals, trait effects, location movement, event recursion,
 *   save/load persistence, or DOM rendering details.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before engine.js and contributes methods through the
 *   global EngineInventorySystem object.
 * - Methods are mixed into Engine and must use `this`.
 * - Inventory item instances carry `{ id, quantity? }`; equipment stores copied
 *   item instances without stack quantities.
 *
 * Important APIs:
 * - hasItem(entityId, itemId)
 * - canShowShopItem(itemId)
 * - talkTo(npcId)
 * - buyItem(npcId, itemId)
 * - addItem(entityId, itemId, amount)
 * - useItem(itemId, itemIndex)
 * - equipItem(itemIndex)
 * - unequipItem(slot, skipRender)
 *
 * Common risks:
 * - Equipment effects affect effective stat caps; unequip paths must reclamp.
 * - Stackable and non-stackable items use different inventory instance shapes.
 *
 * Related files:
 * - src/game/systems/entitySystem.js applies costs and item effects.
 * - src/game/ui/renderers/playerPanels.js renders inventory/equipment controls.
 * - src/game/ui/renderers/shopRenderer.js renders shop purchase controls.
 */
const EngineInventorySystem = {
	hasItem: function (entityId, itemId) {
		const entity = this.getEntity(entityId);
		if (!entity) return false;

		const inInventory = Array.isArray(entity.inventory) && entity.inventory.some((i) => i.id === itemId);
		const equipped = entity.worn ? Object.values(entity.worn).some((inst) => inst && inst.id === itemId) : false;

		return inInventory || equipped;
	},

	canShowShopItem: function (itemId, shopItem = null) {
		const itemDef = this.data.items[itemId];
		if (!itemDef) return false;

		if (shopItem && !this.meetsConditions(shopItem)) return false;

		if (itemDef.stackable) return true;

		return !this.hasItem("player", itemId);
	},

	talkTo: function (npcId) {
		const npc = this.data.npcs[npcId];
		if (!npc) {
			console.warn(`[Engine] Unknown NPC '${npcId}'.`);
			return;
		}

		let line = "";
		if (typeof npc.dialogue === "string") {
			line = npc.dialogue;
		} else if (Array.isArray(npc.dialogue)) {
			const match = npc.dialogue.find((d) => this.meetsConditions(d));
			line = match?.text || "";
		}

		if (line) UI.log(`${npc.name}: "${line}"`, false, npc.color || "#67e8f9");

		if (npc.shop && npc.shop.inventory) {
			this.state.activeShop = npcId;
		} else {
			this.state.activeShop = null;
		}

		UI.renderView(this.data, this.state);
	},

	buyItem: function (npcId, itemId) {
		const npc = this.data.npcs[npcId];
		const itemDef = this.data.items[itemId];
		if (!npc || !npc.shop || !itemDef) return;

		const shopItem = npc.shop.inventory.find((i) => i.id === itemId);
		if (!shopItem) return;

		if (this.canApplyChanges(shopItem.cost)) {
			this.applyChanges(shopItem.cost);
			this.addItem("player", itemId, 1);
			UI.log(`Obtained ${itemDef.name}.`, true, "#10b981");
			UI.renderView(this.data, this.state);
		} else {
			UI.log(`Cannot afford ${itemDef.name}.`, false, "#ef4444");
		}
	},

	stackItem: function (entity, itemId, amount) {
		if (!entity.inventory) entity.inventory = [];
		const existing = entity.inventory.find((i) => i.id === itemId);
		if (existing) {
			existing.quantity = (existing.quantity || 1) + amount;
		} else {
			entity.inventory.push({ id: itemId, quantity: amount });
		}
	},

	addItem: function (entityId, itemId, amount = 1) {
		const entity = this.getEntity(entityId);
		if (!entity.inventory) entity.inventory = [];

		const itemDef = this.data.items[itemId];
		if (!itemDef) return;

		if (itemDef.stackable) {
			this.stackItem(entity, itemId, amount);
		} else {
			for (let i = 0; i < amount; i++) {
				entity.inventory.push({ id: itemId });
			}
		}
	},

	useItem: function (itemId, itemIndex) {
		const entity = this.getEntity("player");
		if (!Array.isArray(entity.inventory) || !entity.inventory[itemIndex]) return;

		const itemInst = entity.inventory[itemIndex];
		const itemDef = this.data.items[itemInst.id];
		if (!itemDef) return;

		if (!this.canApplyChanges(itemDef.effects)) {
			UI.log(`Cannot use ${itemDef.name}.`, false, "#ef4444");
			return;
		}

		this.applyChanges(itemDef.effects);

		UI.log(`Used ${itemDef.name}.`, true, "#34d399");

		if (itemInst.quantity && itemInst.quantity > 1) {
			itemInst.quantity -= 1;
		} else {
			entity.inventory.splice(itemIndex, 1);
		}

		UI.renderView(this.data, this.state);
	},

	equipItem: function (itemIndex) {
		const entity = this.getEntity("player");
		if (!Array.isArray(entity.inventory) || !entity.inventory[itemIndex]) return;

		const itemInst = entity.inventory[itemIndex];
		const itemDef = this.data.items[itemInst.id];
		if (!itemDef) return;

		if (itemDef.type !== "equipment" || !itemDef.slot) {
			UI.log(`Cannot equip ${itemDef.name} - missing slot info.`, false, "#ef4444");
			return;
		}

		if (!entity.worn) entity.worn = {};

		if (entity.worn[itemDef.slot]) {
			this.unequipItem(itemDef.slot, true);
		}

		const equippedInst = { ...itemInst };
		delete equippedInst.quantity;
		entity.worn[itemDef.slot] = equippedInst;

		if (itemInst.quantity && itemInst.quantity > 1) {
			itemInst.quantity -= 1;
		} else {
			entity.inventory.splice(itemIndex, 1);
		}

		UI.log(`Equipped ${itemDef.name}.`, true, "#818cf8");
		UI.renderView(this.data, this.state);
	},

	unequipItem: function (slot, skipRender = false) {
		const entity = this.getEntity("player");
		if (!entity.worn || !entity.worn[slot]) return;

		const itemInst = entity.worn[slot];
		const itemDef = this.data.items[itemInst.id];

		delete entity.worn[slot];

		if (!entity.inventory) entity.inventory = [];

		if (itemDef && itemDef.stackable) {
			this.stackItem(entity, itemInst.id, 1);
		} else {
			entity.inventory.push(itemInst);
		}

		if (entity.stats) {
			for (const statId in entity.stats) {
				this.clampResource(statId, "player");
			}
		}

		if (!skipRender) {
			UI.log(`Unequipped ${itemDef ? itemDef.name : itemInst.id}.`, true, "#818cf8");
			UI.renderView(this.data, this.state);
		}
	},
};
