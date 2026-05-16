/**
 * Entity, stat, trait, condition, and effect system for Engine.
 *
 * Purpose:
 * This file owns the reusable game-state math around entities. It provides the
 * central stat/effect/trait helpers that events, inventory actions, UI panels,
 * and condition checks all rely on.
 *
 * Responsibilities:
 * - Find entities in Engine.state.
 * - Add/remove traits and collect item/trait effects.
 * - Calculate effective stat values and max resource limits.
 * - Clamp resource-like stats after changes.
 * - Apply data-driven `changes` arrays from events, item costs, and item effects.
 * - Evaluate stat conditions and chance objects.
 *
 * Interactions:
 * - Reads Engine.state.entities and Engine.data.traits/items.
 * - Writes entity stats and trait arrays.
 * - Calls UI.log for player-facing trait acquisition feedback.
 * - Used by eventSystem, inventorySystem, saveSystem, and UI renderers.
 *
 * What does not belong here:
 * - Event trigger ordering, input validation, location movement, save/load IO,
 *   rendering, or raw registry compilation.
 * - Item transfer/equipment mechanics beyond reading equipped effects.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before engine.js and contributes methods through the
 *   global EngineEntitySystem object.
 * - Methods are mixed into Engine and must use `this`.
 * - Data-driven stat ids are case-sensitive; do not silently normalize them.
 *
 * Important APIs:
 * - getEntity(id)
 * - getEffectiveStat(statId, entityId, silent)
 * - getEffectiveMax(statId, entityId)
 * - applyChanges(changes)
 * - canApplyChanges(changes)
 * - checkConditions(conditions)
 * - calculateChance(chanceObj)
 *
 * Common risks:
 * - Changing stat id casing or target field names can make existing JSON content
 *   appear broken even when the engine code still runs.
 * - Adding new change actions here should include validation and should avoid
 *   mutating unrelated entity fields.
 *
 * Related files:
 * - src/engine/systems/eventSystem.js executes event changes.
 * - src/engine/systems/inventorySystem.js applies item effects and costs.
 * - src/ui/renderers/playerPanels.js displays effective stats and traits.
 */
const EngineEntitySystem = {
	getEntity: function (id = "player") {
		const entity = this.state.entities?.[id];
		if (!entity) {
			console.warn(`[Engine] Entity '${id}' not found.`);
		}
		return entity;
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

		if (!entity.traits.some((t) => t.id === traitId)) {
			entity.traits.push({ id: traitId });
			UI.log(`Acquired trait: ${this.data.traits[traitId].name}`, true, "#f43f5e");

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

		if (entity.traits.length !== initialCount && entity.stats) {
			for (const statId in entity.stats) {
				this.clampResource(statId, entityId);
			}
		}
	},

	getAllEffects: function (entityId = "player") {
		const entity = this.getEntity(entityId);
		if (!entity) return [];

		const effects = [];

		if (entity.worn) {
			Object.values(entity.worn).forEach((itemInst) => {
				if (!itemInst) return;
				const item = this.data.items[itemInst.id];
				if (item?.effects) effects.push(...item.effects);
			});
		}

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

		this.getAllEffects(entityId).forEach((e) => {
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

		this.getAllEffects(entityId).forEach((e) => {
			if (e.stat === statId && (!e.target || e.target === "value")) {
				if (e.action === "add") value += e.amount;
				if (e.action === "sub") value -= e.amount;
			}
		});

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

			const entityId = c.entity || "player";
			const entity = this.getEntity(entityId);

			if (!entity) {
				console.warn(`[Engine] Target entity '${entityId}' not found for action '${c.action}'.`);
				return;
			}

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
};
