/**
 * Data registry compiler and mod merge layer.
 *
 * Purpose:
 * This file turns raw base/mod JSON data into the normalized runtime registry
 * consumed by Engine. It is the boundary between author-friendly content files
 * and efficient runtime lookup tables.
 *
 * Responsibilities:
 * - Deep-merge base content and mods with safe override semantics.
 * - Keep entities, locations, npcs, events, scenes, items, and traits in one
 *   compiled registry object.
 * - Compile scene authoring data into generated runtime locations and events.
 * - Attach events and NPC ids to their declared locations.
 *
 * Interactions:
 * - Consumes rawData from DataLoader/main.js.
 * - Produces Engine.data consumed by engine systems and UI renderers.
 * - Shares generated scene id conventions with worldSystem and saveSystem.
 *
 * What does not belong here:
 * - Runtime state mutation, event execution, save/load reconciliation, DOM
 *   rendering, Electron IPC, or editor UI behavior.
 *
 * Architectural assumptions and constraints:
 * - Raw mods are already read and lightly normalized by main.js.
 * - Scene ids compile to `scene:<sceneId>:<stepId>` locations and
 *   `scene:<sceneId>:<stepId>:<choiceId>` events.
 * - Deep merge skips prototype-polluting keys and uses `!` suffix for explicit
 *   array/object replacement.
 *
 * Important APIs:
 * - DataRegistry.compile(rawData)
 * - DataRegistry.deepMerge(target, source)
 * - DataRegistry.compileScenes(compiled)
 * - DataRegistry.getSceneLocationId(sceneId, stepId)
 * - DataRegistry.getSceneEventId(sceneId, stepId, choiceId)
 *
 * Common risks:
 * - Changing generated scene id formats requires coordinated changes in saves,
 *   world resolution, and authored teleports.
 * - Overloading deepMerge semantics can make mod behavior surprising.
 *
 * Related files:
 * - main.js produces rawData.
 * - src/game/engine.js stores the compiled result as Engine.data.
 * - src/game/systems/worldSystem.js and saveSystem.js depend on scene ids.
 */
const DataRegistry = {
	isPlainObject(obj) {
		return Object.prototype.toString.call(obj) === "[object Object]";
	},

	deepMerge(target, source) {
		if (!this.isPlainObject(target)) return structuredClone(source);
		if (!this.isPlainObject(source)) return structuredClone(source);

		for (const rawKey in source) {
			if (rawKey === "__proto__" || rawKey === "constructor" || rawKey === "prototype") continue;

			const isOverride = rawKey.endsWith("!");
			const key = isOverride ? rawKey.slice(0, -1) : rawKey;

			const sourceVal = source[rawKey];
			const targetVal = target[key];

			if (Array.isArray(sourceVal)) {
				if (isOverride) {
					target[key] = structuredClone(sourceVal);
				} else {
					const targetArr = Array.isArray(targetVal) ? targetVal : [];
					const merged = [...targetArr.map((v) => structuredClone(v)), ...sourceVal.map((v) => structuredClone(v))];
					const seen = new Map();

					for (const item of merged) {
						if (item && typeof item === "object") {
							const id = item.id ?? JSON.stringify(item);
							seen.set(id, item);
						} else {
							seen.set(item, item);
						}
					}

					target[key] = Array.from(seen.values());
				}
				continue;
			}

			if (this.isPlainObject(sourceVal)) {
				if (!this.isPlainObject(targetVal) || isOverride) {
					target[key] = {};
				}
				this.deepMerge(target[key], sourceVal);
				continue;
			}

			target[key] = structuredClone(sourceVal);
		}

		return target;
	},

	getSceneLocationId(sceneId, stepId) {
		return `scene:${sceneId}:${stepId}`;
	},

	getSceneEventId(sceneId, stepId, choiceId) {
		return `scene:${sceneId}:${stepId}:${choiceId}`;
	},

	getSceneStepChoices(step) {
		if (!step || typeof step !== "object") return {};

		const choices = {};

		const mergeSource = (src) => {
			if (Array.isArray(src)) {
				src.forEach((entry) => {
					if (!entry || !entry.id) return;
					const { id, ...rest } = entry;
					choices[id] = rest;
				});
			} else if (this.isPlainObject(src)) {
				this.deepMerge(choices, src);
			}
		};

		mergeSource(step.actions);
		mergeSource(step.choices);

		if (Object.keys(choices).length === 0 && (step.next || step.teleport || step.input || step.inputs || step.proceed)) {
			const proceed = this.isPlainObject(step.proceed) ? structuredClone(step.proceed) : {};

			proceed.name = proceed.text || proceed.name || step.proceed_name || step.proceedName || "Proceed";
			if (step.next && proceed.next === undefined) proceed.next = step.next;
			if (step.teleport && proceed.teleport === undefined) proceed.teleport = step.teleport;

			choices.proceed = proceed;
		}

		return choices;
	},

	compileScenes(compiled) {
		for (const [sceneId, scene] of Object.entries(compiled.scenes || {})) {
			if (!scene || !this.isPlainObject(scene.steps)) {
				console.warn(`[Registry] Scene '${sceneId}' has no valid steps.`);
				continue;
			}

			const startStep = scene.start || Object.keys(scene.steps)[0];
			if (!startStep || !scene.steps[startStep]) {
				console.warn(`[Registry] Scene '${sceneId}' has invalid start step '${scene.start}'.`);
				continue;
			}

			scene.start_location = this.getSceneLocationId(sceneId, startStep);

			for (const [stepId, step] of Object.entries(scene.steps)) {
				if (!step || typeof step !== "object") continue;

				const locationId = this.getSceneLocationId(sceneId, stepId);
				const location = structuredClone(step);
				const choices = this.getSceneStepChoices(step);

				delete location.actions;
				delete location.choices;
				delete location.input;
				delete location.inputs;
				delete location.next;
				delete location.teleport;
				delete location.proceed;
				delete location.proceed_name;
				delete location.proceedName;
				// dialogue, description, and image are preserved on the compiled location

				location.scene = { id: sceneId, step: stepId };
				location.events = Array.isArray(location.events) ? location.events : [];

				for (const [choiceId, choiceData] of Object.entries(choices)) {
					if (!choiceData || typeof choiceData !== "object") continue;

					const eventId = this.getSceneEventId(sceneId, stepId, choiceId);
					const eventData = structuredClone(choiceData);

					delete eventData.next;

					eventData.name = eventData.text || eventData.name || choiceId;
					delete eventData.text;
					eventData.locations = [locationId];
					eventData.scene = { id: sceneId, step: stepId, choice: choiceId };

					if (choiceData.next) {
						if (!scene.steps[choiceData.next]) {
							console.warn(`[Registry] Scene '${sceneId}' choice '${choiceId}' points to missing step '${choiceData.next}'.`);
						}
						eventData.teleport = this.getSceneLocationId(sceneId, choiceData.next);
					}

					if ((step.input || step.inputs) && eventData.input === undefined && eventData.inputs === undefined) {
						if (step.input) eventData.input = structuredClone(step.input);
						if (step.inputs) eventData.inputs = structuredClone(step.inputs);
					}

					compiled.events[eventId] = eventData;
					if (!location.events.includes(eventId)) location.events.push(eventId);
				}

				compiled.locations[locationId] = location;
			}
		}
	},

	normalizeConnections(compiled) {
		for (const loc of Object.values(compiled.locations)) {
			if (!Array.isArray(loc.connections)) continue;
			loc.connections = loc.connections.map((c) => (typeof c === "string" ? { id: c } : c));
		}
	},

	compile(rawData) {
		if (!rawData?.base) {
			throw new Error("[Registry] Invalid rawData: missing base");
		}

		const compiled = {
			entities: structuredClone(rawData.base.entities || {}),
			locations: structuredClone(rawData.base.locations || {}),
			npcs: structuredClone(rawData.base.npcs || {}),
			events: structuredClone(rawData.base.events || {}),
			scenes: structuredClone(rawData.base.scenes || {}),
			items: structuredClone(rawData.base.items || {}),
			traits: structuredClone(rawData.base.traits || {}),
		};

		(rawData.mods || []).forEach((mod, index) => {
			const id = mod?.meta?.id || `mod_${index}`;
			console.debug(`[Registry] Applying Mod: ${id}`);

			if (mod.entities) this.deepMerge(compiled.entities, mod.entities);
			if (mod.locations) this.deepMerge(compiled.locations, mod.locations);
			if (mod.npcs) this.deepMerge(compiled.npcs, mod.npcs);
			if (mod.events) this.deepMerge(compiled.events, mod.events);
			if (mod.scenes) this.deepMerge(compiled.scenes, mod.scenes);
			if (mod.items) this.deepMerge(compiled.items, mod.items);
			if (mod.traits) this.deepMerge(compiled.traits, mod.traits);
		});

		this.compileScenes(compiled);
		this.normalizeConnections(compiled);

		["events", "npcs"].forEach((type) => {
			const registryPart = compiled[type] || {};
			for (const [id, data] of Object.entries(registryPart)) {
				if (!data || !Array.isArray(data.locations)) continue;

				data.locations.forEach((locId) => {
					const loc = compiled.locations[locId];
					if (!loc) return;

					if (!Array.isArray(loc[type])) loc[type] = [];
					if (!loc[type].includes(id)) loc[type].push(id);
				});
			}
		});

		return compiled;
	},
};
