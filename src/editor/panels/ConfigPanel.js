/** Editor panel for data/config.json — flat key-value form for all engine config fields. */
const ConfigPanel = {
	render(container) {
		container.innerHTML = "";
		const config = EditorState.rawData.storyConfig;

		const form = document.createElement("div");
		form.className = "p-6 max-w-xl";

		const title = document.createElement("h2");
		title.className = "text-lg font-bold text-slate-200 mb-6";
		title.textContent = "Config";
		form.appendChild(title);

		const fields = [
			{ key: "starting_scene", label: "Starting Scene", type: "text", suggest: "scenes" },
			{ key: "starting_location", label: "Starting Location (fallback)", type: "text", suggest: "locations" },
			{ key: "on_death", label: "On Death (event or scene id)", type: "text", suggest: "deathTargets" },
			{ key: "stat_training_diminishing_returns", label: "Diminishing Returns Factor", type: "number" },
			{ key: "font_scale", label: "Font Scale", type: "number" },
			{ key: "enable_images", label: "Enable Images", type: "checkbox" },
			{ key: "show_activity_log", label: "Show Activity Log", type: "checkbox" },
			{ key: "show_compiled_registry", label: "Show Debug Registry", type: "checkbox" },
		];

		const suggestionsFor = (kind) => {
			switch (kind) {
				case "scenes": return Object.keys(EditorState.rawData?.base?.scenes || {});
				case "locations": return EditorState.allLocationIds();
				case "deathTargets": return [
					...Object.keys(EditorState.rawData?.base?.events || {}),
					...Object.keys(EditorState.rawData?.base?.scenes || {}),
				];
				default: return [];
			}
		};

		fields.forEach(({ key, label, type, suggest }) => {
			if (type === "checkbox") {
				const row = EditorPanels.checkboxInput(label, config[key], (v) => {
					config[key] = v;
					EditorState.markDirty("config");
				});
				form.appendChild(row);
			} else {
				const input = document.createElement("input");
				input.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full focus:outline-none focus:border-indigo-500";
				input.type = type;
				input.value = config[key] ?? "";
				if (type === "number") input.step = "any";
				if (suggest) EditorPanels.bindDatalist(input, `dl-config-${key}`, suggestionsFor(suggest));
				input.oninput = () => {
					config[key] = type === "number" ? Number(input.value) : input.value;
					EditorState.markDirty("config");
				};
				form.appendChild(EditorPanels.fieldRow(label, input));
			}
		});

		const saveBtn = document.createElement("button");
		saveBtn.className = "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-bold transition-all mt-2";
		saveBtn.textContent = "Save Config";
		saveBtn.onclick = () => EditorShell.saveOne("config");
		form.appendChild(saveBtn);

		container.appendChild(form);
	},
};
