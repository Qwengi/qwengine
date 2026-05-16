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

	compile(rawData) {
		if (!rawData?.base) {
			throw new Error("[Registry] Invalid rawData: missing base");
		}

		const compiled = {
			entities: structuredClone(rawData.base.entities || {}),
			locations: structuredClone(rawData.base.locations || {}),
			npcs: structuredClone(rawData.base.npcs || {}),
			events: structuredClone(rawData.base.events || {}),
			items: structuredClone(rawData.base.items || {}),
			traits: structuredClone(rawData.base.traits || {}),
		};

		(rawData.mods || []).forEach((mod, index) => {
			const id = mod?.meta?.id || `mod_${index}`;
			console.log(`[Registry] Applying Mod: ${id}`);

			if (mod.entities) this.deepMerge(compiled.entities, mod.entities);
			if (mod.locations) this.deepMerge(compiled.locations, mod.locations);
			if (mod.npcs) this.deepMerge(compiled.npcs, mod.npcs);
			if (mod.events) this.deepMerge(compiled.events, mod.events);
			if (mod.items) this.deepMerge(compiled.items, mod.items);
			if (mod.traits) this.deepMerge(compiled.traits, mod.traits);
		});

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
