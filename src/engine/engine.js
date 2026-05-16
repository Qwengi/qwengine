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

	resetState: function () {
		let startLoc = this.getConfiguredStartLocation();
		if (!this.data.locations[startLoc]) {
			startLoc = Object.keys(this.data.locations)[0] || "unknown";
		}

		this.state = {
			location: startLoc,
			entities: structuredClone(this.data.entities || {}),
			activeShop: null,
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

	getEntity: function (id = "player") {
		const entity = this.state.entities?.[id];
		if (!entity) {
			console.warn(`[Engine] Entity '${id}' not found.`);
		}
		return entity;
	},

	hasItem: function (entityId, itemId) {
		const entity = this.getEntity(entityId);
		if (!entity) return false;

		const inInventory = entity.inventory?.items?.some((i) => i.id === itemId) || false;

		const equipped = entity.worn ? Object.values(entity.worn).some((inst) => inst && inst.id === itemId) : false;

		return inInventory || equipped;
	},

	hasTrait: function (entityId, traitId) {
		const entity = this.getEntity(entityId);
		if (!entity) return false;

		return Array.isArray(entity.traits) ? entity.traits.some((t) => t && t.id === traitId) : false;
	},

	addTrait: function (entityId, traitId) {
		const entity = this.getEntity(entityId);
		if (!entity) return;

		if (!this.data.traits || !this.data.traits[traitId]) {
			console.warn(`[Engine] Trait '${traitId}' does not exist in the registry.`);
			return;
		}

		if (!Array.isArray(entity.traits)) entity.traits = [];

		// Prevent duplicate traits
		if (!entity.traits.some((t) => t.id === traitId)) {
			entity.traits.push({ id: traitId });
			UI.log(`Acquired trait: ${this.data.traits[traitId].name}`, true, "#f43f5e");

			// Recalculate caps in case the trait shifted max resource boundaries
			if (entity.stats) {
				for (const statId in entity.stats) {
					this.clampResource(statId, entityId);
				}
			}
		}
	},

	removeTrait: function (entityId, traitId) {
		const entity = this.getEntity(entityId);
		if (!entity?.traits) return;

		const initialCount = entity.traits.length;
		entity.traits = entity.traits.filter((t) => t.id !== traitId);

		// If a trait was actually removed, clamp limits
		if (entity.traits.length !== initialCount) {
			if (entity.stats) {
				for (const statId in entity.stats) {
					this.clampResource(statId, entityId);
				}
			}
		}
	},

	canShowShopItem: function (itemId) {
		const itemDef = this.data.items[itemId];
		if (!itemDef) return false;

		if (itemDef.stackable) return true;

		return !this.hasItem("player", itemId);
	},

	getAllEffects: function (entityId = "player") {
		const entity = this.getEntity(entityId);
		if (!entity) return [];

		const effects = [];

		// Equipment
		if (entity.worn) {
			Object.values(entity.worn).forEach((itemInst) => {
				if (!itemInst) return;
				const item = this.data.items[itemInst.id];
				if (item?.effects) effects.push(...item.effects);
			});
		}

		// Traits
		if (Array.isArray(entity.traits)) {
			entity.traits.forEach((traitInst) => {
				if (!traitInst) return;
				const trait = this.data.traits?.[traitInst.id];
				if (trait?.effects) effects.push(...trait.effects);
			});
		}

		return effects;
	},

	getEffectiveMax: function (statId, entityId = "player") {
		const entity = this.getEntity(entityId);
		if (!entity?.stats || !entity.stats[statId]) return undefined;

		const stat = entity.stats[statId];
		if (stat.max === undefined) return undefined;

		let max = stat.max;

		const effects = this.getAllEffects(entityId);
		effects.forEach((e) => {
			if (e.stat === statId && e.target === "max") {
				if (e.action === "add") max += e.amount;
				if (e.action === "sub") max -= e.amount;
			}
		});

		return max;
	},

	getEffectiveStat: function (statId, entityId = "player", silent = false) {
		const entity = this.getEntity(entityId);
		if (!entity?.stats) {
			if (!silent) console.warn(`[Engine] '${entityId}' has no stats.`);
			return undefined;
		}

		const stat = entity.stats[statId];
		if (!stat || typeof stat !== "object") {
			if (!silent) console.warn(`[Engine] Invalid or missing stat '${statId}' on '${entityId}'.`);
			return undefined;
		}

		let value = stat.value ?? 0;

		const effects = this.getAllEffects(entityId);
		effects.forEach((e) => {
			if (e.stat === statId && (!e.target || e.target === "value")) {
				if (e.action === "add") value += e.amount;
				if (e.action === "sub") value -= e.amount;
			}
		});

		// Clamp the floor to 0 so negative item effects don't push stats below 0
		value = Math.max(0, value);

		const max = this.getEffectiveMax(statId, entityId);
		if (max !== undefined) {
			value = Math.min(value, max);
		}

		return value;
	},

	clampResource: function (statId, entityId = "player") {
		const entity = this.getEntity(entityId);
		if (!entity?.stats || !entity.stats[statId]) return;

		const stat = entity.stats[statId];

		// Clamp the base value floor to 0
		stat.value = Math.max(0, stat.value);

		const max = this.getEffectiveMax(statId, entityId);
		if (max !== undefined) {
			stat.value = Math.min(stat.value, max);
		}
	},

	getStatValue: function (statId, entityId = "player", silent = false) {
		return this.getEffectiveStat(statId, entityId, silent);
	},

	applyStatChange: function (entityId, statId, action, amount) {
		const entity = this.getEntity(entityId);
		if (!entity?.stats) {
			console.error(`[Engine] Cannot modify stat: '${entityId}' has no stats.`);
			return;
		}

		const stat = entity.stats[statId];
		if (!stat || typeof stat !== "object") {
			console.error(`[Engine] Cannot modify stat '${statId}' on '${entityId}'.`);
			return;
		}

		const delta = Number(amount);
		if (Number.isNaN(delta)) {
			console.error(`[Engine] Invalid amount '${amount}' for '${statId}'.`);
			return;
		}

		let newValue = Number(stat.value);
		if (Number.isNaN(newValue)) newValue = 0;

		if (action === "add") newValue += delta;
		else if (action === "sub") newValue -= delta;
		else if (action === "set") newValue = delta;
		else {
			console.warn(`[Engine] Unknown action '${action}' for stat '${statId}'.`);
			return;
		}

		stat.value = newValue;
		this.clampResource(statId, entityId);
	},

	canApplyChanges: function (changes) {
		if (!Array.isArray(changes)) return true;

		for (const c of changes) {
			if (c.action === "sub") {
				const entityId = c.entity || "player";
				const currentAmount = this.getStatValue(c.stat, entityId, true) || 0;
				if (currentAmount < c.amount) {
					return false;
				}
			}
		}

		return true;
	},

	applyChanges: function (changes) {
		if (!Array.isArray(changes)) return;

		changes.forEach((c) => {
			if (!c.action) {
				console.error("[Engine] Invalid change object: missing action.", c);
				return;
			}

			// Strictly use "entity" property to determine who is affected
			const entityId = c.entity || "player";
			const entity = this.getEntity(entityId);

			if (!entity) {
				console.warn(`[Engine] Target entity '${entityId}' not found for action '${c.action}'.`);
				return;
			}

			// --- Trait Actions ---
			if (c.action === "add_trait") {
				if (!c.trait) return console.error("[Engine] 'add_trait' action is missing 'trait' property.", c);
				this.addTrait(entityId, c.trait);
				return;
			}

			if (c.action === "remove_trait") {
				if (!c.trait) return console.error("[Engine] 'remove_trait' action is missing 'trait' property.", c);
				this.removeTrait(entityId, c.trait);
				return;
			}

			// --- Stat Actions ---
			if (["add", "sub", "set"].includes(c.action)) {
				if (!c.stat) {
					console.error("[Engine] Stat change is missing 'stat' property.", c);
					return;
				}

				if (!entity.stats || !entity.stats[c.stat]) {
					console.warn(`[Engine] Stat '${c.stat}' does not exist on entity '${entityId}'.`, c);
					return;
				}

				if (typeof c.amount !== "number" || Number.isNaN(c.amount)) {
					console.error(`[Engine] Invalid amount for stat '${c.stat}'. Must be a valid number.`, c);
					return;
				}

				this.applyStatChange(entityId, c.stat, c.action, c.amount);
			} else {
				console.error(`[Engine] Unknown action '${c.action}'. Valid actions: add, sub, set, add_trait, remove_trait.`, c);
			}
		});
	},

	checkConditions: function (conditions) {
		if (!conditions || Object.keys(conditions).length === 0) return true;

		for (const [statId, req] of Object.entries(conditions)) {
			// Strictly use req.entity to target whose stat we are checking
			const entityId = req.entity || "player";
			const val = this.getStatValue(statId, entityId, true);

			if (val === undefined) return false;

			if (req.min !== undefined && val < req.min) return false;
			if (req.max !== undefined && val > req.max) return false;
			if (req.eq !== undefined && val !== req.eq) return false;
		}

		return true;
	},

	calculateChance: function (chanceObj) {
		if (!chanceObj) return true;

		let prob = Number(chanceObj.base);
		if (Number.isNaN(prob)) prob = 100;

		if (chanceObj.minus_stat) {
			prob -= this.getStatValue(chanceObj.minus_stat, "player", true) || 0;
		}

		if (Array.isArray(chanceObj.modifiers)) {
			chanceObj.modifiers.forEach((mod) => {
				const entityId = mod.entity || "player";
				const val = this.getStatValue(mod.stat, entityId, true) || 0;
				if (mod.op === "add") prob += val;
				else if (mod.op === "sub") prob -= val;
			});
		}

		const roll = Math.random() * 100;
		return roll < Math.max(0, Math.min(100, prob));
	},

	getEventInputs: function (eventData) {
		if (!eventData) return [];

		const inputs = [];
		const addInputs = (value) => {
			if (Array.isArray(value)) {
				value.forEach((item) => addInputs(item));
			} else if (value && typeof value === "object") {
				inputs.push(value);
			}
		};

		addInputs(eventData.input);
		addInputs(eventData.inputs);

		return inputs;
	},

	getInputId: function (input, index = 0) {
		return input.id || input.field || input.stat || input.state || `input_${index}`;
	},

	normalizeInputValue: function (input, rawValue) {
		if (rawValue === undefined || rawValue === null) return "";

		const value = String(rawValue);
		return input.trim === false ? value : value.trim();
	},

	validateInputValue: function (input, rawValue) {
		const value = this.normalizeInputValue(input, rawValue);
		const minLength = input.minLength ?? input.min_length;
		const maxLength = input.maxLength ?? input.max_length;

		if (input.required !== false && value.length === 0) {
			return { valid: false, value, message: input.required_msg || "A value is required before proceeding." };
		}

		if (minLength !== undefined && value.length < Number(minLength)) {
			return { valid: false, value, message: input.min_msg || `Enter at least ${minLength} characters.` };
		}

		if (maxLength !== undefined && value.length > Number(maxLength)) {
			return { valid: false, value, message: input.max_msg || `Enter no more than ${maxLength} characters.` };
		}

		if (input.pattern) {
			let matchesPattern = false;

			try {
				matchesPattern = new RegExp(input.pattern).test(value);
			} catch (err) {
				console.warn(`[Engine] Invalid input pattern '${input.pattern}'.`, err);
				return { valid: false, value, message: "The input validation pattern is invalid." };
			}

			if (!matchesPattern) {
				return { valid: false, value, message: input.pattern_msg || "The entered value is not valid." };
			}
		}

		return { valid: true, value };
	},

	validateEventInputs: function (eventData, payload = {}) {
		const inputs = this.getEventInputs(eventData);
		const payloadInputs = payload?.inputs || {};
		const values = {};

		for (let index = 0; index < inputs.length; index++) {
			const input = inputs[index];
			const id = this.getInputId(input, index);
			const rawValue = payloadInputs[id] ?? payload?.[id] ?? "";
			const result = this.validateInputValue(input, rawValue);

			values[id] = result.value;

			if (!result.valid) {
				return { valid: false, message: result.message, values };
			}
		}

		return { valid: true, values };
	},

	isSafeDataKey: function (key) {
		return key && !["__proto__", "constructor", "prototype"].includes(key);
	},

	applyEventInputs: function (eventData, payload = {}, validation = null) {
		const inputs = this.getEventInputs(eventData);
		if (inputs.length === 0) return true;

		const inputValidation = validation || this.validateEventInputs(eventData, payload);
		if (!inputValidation.valid) {
			UI.log(inputValidation.message || "Invalid input.", false, "#f87171");
			return false;
		}

		inputs.forEach((input, index) => {
			const id = this.getInputId(input, index);
			const value = inputValidation.values[id];

			if (input.field) {
				const entityId = input.entity || input.target || "player";
				const entity = this.getEntity(entityId);

				if (!entity) return;
				if (!this.isSafeDataKey(input.field)) {
					console.warn(`[Engine] Unsafe input field '${input.field}' ignored.`);
					return;
				}

				entity[input.field] = value;
				return;
			}

			if (input.state) {
				if (!this.isSafeDataKey(input.state)) {
					console.warn(`[Engine] Unsafe state field '${input.state}' ignored.`);
					return;
				}

				this.state[input.state] = value;
			}
		});

		return true;
	},

	moveTo: function (locId) {
		const resolvedLocId = this.resolveLocationId(locId);
		const loc = this.data.locations[resolvedLocId];
		if (!loc) {
			console.warn(`[Engine] Unknown location '${locId}'.`);
			return;
		}

		this.state.location = resolvedLocId;
		this.state.activeShop = null; // Clear shop when moving
		UI.log(`Moved to ${loc.name || locId}.`, true);
		UI.renderView(this.data, this.state);
	},

	talkTo: function (npcId) {
		const npc = this.data.npcs[npcId];
		if (!npc) {
			console.warn(`[Engine] Unknown NPC '${npcId}'.`);
			return;
		}

		UI.log(`${npc.name}: "${npc.dialogue}"`, false, npc.color || "#67e8f9");

		// Toggle Shop View
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

	addItem: function (entityId, itemId, amount = 1) {
		const entity = this.getEntity(entityId);
		if (!entity.inventory) entity.inventory = { items: [] };

		const itemDef = this.data.items[itemId];
		if (!itemDef) return;

		if (itemDef.stackable) {
			const existing = entity.inventory.items.find((i) => i.id === itemId);
			if (existing) {
				existing.quantity = (existing.quantity || 1) + amount;
			} else {
				entity.inventory.items.push({ id: itemId, quantity: amount });
			}
		} else {
			for (let i = 0; i < amount; i++) {
				entity.inventory.items.push({ id: itemId });
			}
		}
	},

	useItem: function (itemId, itemIndex) {
		const entity = this.getEntity("player");
		if (!entity.inventory || !entity.inventory.items[itemIndex]) return;

		const itemInst = entity.inventory.items[itemIndex];
		const itemDef = this.data.items[itemInst.id];

		this.applyChanges(itemDef.effects);

		UI.log(`Used ${itemDef.name}.`, true, "#34d399");

		if (itemInst.quantity && itemInst.quantity > 1) {
			itemInst.quantity -= 1;
		} else {
			entity.inventory.items.splice(itemIndex, 1);
		}

		UI.renderView(this.data, this.state);
	},

	equipItem: function (itemIndex) {
		const entity = this.getEntity("player");
		if (!entity.inventory || !entity.inventory.items[itemIndex]) return;

		const itemInst = entity.inventory.items[itemIndex];
		const itemDef = this.data.items[itemInst.id];

		if (itemDef.type !== "equipment" || !itemDef.slot) {
			UI.log(`Cannot equip ${itemDef.name} - missing slot info.`, false, "#ef4444");
			return;
		}

		if (!entity.worn) entity.worn = {};

		// Unequip existing item in the slot
		if (entity.worn[itemDef.slot]) {
			this.unequipItem(itemDef.slot, true); // true avoids double rendering
		}

		// Store instance data instead of just the ID
		const equippedInst = { ...itemInst };
		delete equippedInst.quantity;
		entity.worn[itemDef.slot] = equippedInst;

		if (itemInst.quantity && itemInst.quantity > 1) {
			itemInst.quantity -= 1;
		} else {
			entity.inventory.items.splice(itemIndex, 1);
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

		// Return instance to inventory
		if (!entity.inventory) entity.inventory = { items: [] };

		if (itemDef && itemDef.stackable) {
			const existing = entity.inventory.items.find((i) => i.id === itemInst.id);
			if (existing) {
				existing.quantity = (existing.quantity || 1) + 1;
			} else {
				entity.inventory.items.push({ id: itemInst.id, quantity: 1 });
			}
		} else {
			entity.inventory.items.push(itemInst);
		}

		// Clamp stats down if their max decreased (e.g. unequipped +Max HP item)
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

	triggerEvent: function (eventId, payload = {}, depth = 0) {
		if (typeof payload === "number") {
			depth = payload;
			payload = {};
		}

		if (depth > this.settings.max_event_depth) {
			console.warn(`[Engine] Max recursion reached at '${eventId}'.`);
			return;
		}

		const ev = this.data.events[eventId];
		if (!ev) {
			console.warn(`[Engine] Unknown event '${eventId}'.`);
			return;
		}

		if (!this.checkConditions(ev.conditions)) return;

		const inputValidation = this.validateEventInputs(ev, payload);
		if (!inputValidation.valid) {
			UI.log(inputValidation.message || "Invalid input.", false, "#f87171");
			return;
		}

		if (ev.chance && !this.calculateChance(ev.chance)) {
			if (ev.chance.trigger_msg) UI.log(ev.chance.trigger_msg);
			if (ev.chance.trigger_event) this.triggerEvent(ev.chance.trigger_event, {}, depth + 1);
			if (ev.chance.trigger_teleport) this.moveTo(ev.chance.trigger_teleport);
			return;
		}

		const changes = Array.isArray(ev.changes) ? [...ev.changes] : [];

		if (ev.action) {
			changes.push({
				entity: ev.entity || "player",
				stat: ev.stat,
				trait: ev.trait,
				action: ev.action,
				amount: ev.amount,
			});
		}

		this.applyEventInputs(ev, payload, inputValidation);
		this.applyChanges(changes);

		if (ev.msg) UI.log(ev.msg, true);

		if ((this.getStatValue("hp", "player", true) ?? Number.MAX_SAFE_INTEGER) <= 0) {
			UI.log("You have died! Resetting...", true, "#ef4444");
			this.resetState();
		}

		if (ev.teleport) this.moveTo(ev.teleport);
		else UI.renderView(this.data, this.state);
	},

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

document.addEventListener("DOMContentLoaded", () => Engine.init());
