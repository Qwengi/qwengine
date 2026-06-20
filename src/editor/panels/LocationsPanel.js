/**
 * Editor panel for data/locations.json — SVG map graph for passages, plus a
 * per-location form for name/description/image/connections.
 *
 * Edge colors (on the map):
 *   - Blue: unconditioned passage
 *   - Amber: conditioned passage (has a non-empty conditions block)
 * Bidirectional pairs (A↔B) draw as two parallel lines so asymmetric
 * conditioning is obvious.
 *
 * Top bar: + New / ✎ Rename / ✕ Delete / Save.
 * Form re-renders the graph on any change so colors update live.
 */
const LocationsPanel = {
	_selectedLocationId: null,
	_renderRoot: null,

	render(container) {
		container.innerHTML = "";
		this._renderRoot = container;
		const locations = EditorState.rawData.base.locations || (EditorState.rawData.base.locations = {});

		const wrap = document.createElement("div");
		wrap.className = "flex flex-col h-full";

		// --- Top bar ---
		const topBar = document.createElement("div");
		topBar.className = "flex items-center gap-3 px-4 py-2 border-b border-slate-800 shrink-0";

		const titleLbl = document.createElement("span");
		titleLbl.className = "text-xs text-slate-400 uppercase tracking-widest font-bold";
		titleLbl.textContent = "Map";

		const addBtn = document.createElement("button");
		addBtn.className = "px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-bold";
		addBtn.textContent = "+ New Location";

		const renameBtn = document.createElement("button");
		renameBtn.className = "px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded text-xs font-bold";
		renameBtn.textContent = "✎";
		renameBtn.title = "Rename selected location";
		renameBtn.disabled = !this._selectedLocationId;

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "px-2 py-1 bg-slate-700 hover:bg-red-900 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:text-red-300 rounded text-xs font-bold";
		deleteBtn.textContent = "✕";
		deleteBtn.title = "Delete selected location";
		deleteBtn.disabled = !this._selectedLocationId;

		// Legend
		const legend = document.createElement("div");
		legend.className = "flex items-center gap-3 ml-4 text-xs text-slate-500";
		legend.innerHTML = `
			<span class="flex items-center gap-1"><span class="inline-block w-3 h-0.5 bg-blue-400 rounded"></span>open</span>
			<span class="flex items-center gap-1"><span class="inline-block w-3 h-0.5 bg-amber-400 rounded"></span>conditioned</span>
		`;

		const saveBtn = document.createElement("button");
		saveBtn.className = "px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold ml-auto";
		saveBtn.textContent = "Save";
		saveBtn.onclick = () => EditorShell.saveOne("locations");

		topBar.appendChild(titleLbl);
		topBar.appendChild(addBtn);
		topBar.appendChild(renameBtn);
		topBar.appendChild(deleteBtn);
		topBar.appendChild(legend);
		topBar.appendChild(saveBtn);

		// --- Main area: graph + form ---
		const mainArea = document.createElement("div");
		mainArea.className = "flex flex-1 min-h-0";

		const graphContainer = document.createElement("div");
		graphContainer.className = "flex-1 relative overflow-hidden bg-slate-950";

		const formContainer = document.createElement("div");
		formContainer.className = "w-80 shrink-0 border-l border-slate-800 overflow-y-auto p-4";

		const renderGraph = () => {
			const ids = Object.keys(locations);
			if (ids.length === 0) {
				graphContainer.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-slate-600 text-sm italic">No locations yet — click + New Location.</div>`;
				return;
			}
			const startId = EditorState.rawData.storyConfig?.starting_location;
			SVGGraph.renderMap(
				graphContainer,
				locations,
				startId || ids[0],
				(locId) => {
					this._selectedLocationId = locId;
					renameBtn.disabled = false;
					deleteBtn.disabled = false;
					renderForm();
				},
			);
		};

		const renderForm = () => {
			formContainer.innerHTML = "";
			if (!this._selectedLocationId || !locations[this._selectedLocationId]) {
				const hint = document.createElement("p");
				hint.className = "text-xs text-slate-600 italic";
				hint.textContent = "Click a node on the map to edit.";
				formContainer.appendChild(hint);
				return;
			}
			this._renderForm(formContainer, this._selectedLocationId, locations[this._selectedLocationId], renderGraph);
		};

		addBtn.onclick = () => {
			let newId = "new_location";
			let i = 1;
			while (locations[newId]) newId = `new_location_${i++}`;
			locations[newId] = { name: "New Location", description: "", connections: [] };
			this._selectedLocationId = newId;
			EditorState.markDirty("locations");
			renameBtn.disabled = false;
			deleteBtn.disabled = false;
			renderGraph();
			renderForm();
		};

		renameBtn.onclick = () => {
			const oldId = this._selectedLocationId;
			if (!oldId || !locations[oldId]) return;
			const newId = (prompt(`Rename location '${oldId}' to:`, oldId) || "").trim();
			if (!newId || newId === oldId) return;
			if (locations[newId]) { alert(`Location '${newId}' already exists.`); return; }

			locations[newId] = locations[oldId];
			delete locations[oldId];

			// Update inbound references in other locations' connections.
			Object.values(locations).forEach((loc) => {
				if (!Array.isArray(loc.connections)) return;
				loc.connections = loc.connections.map((c) => {
					if (typeof c === "string") return c === oldId ? newId : c;
					if (c?.id === oldId) return { ...c, id: newId };
					return c;
				});
			});

			// storyConfig.starting_location
			const cfg = EditorState.rawData.storyConfig;
			if (cfg && cfg.starting_location === oldId) {
				cfg.starting_location = newId;
				EditorState.markDirty("config");
			}

			this._selectedLocationId = newId;
			EditorState.markDirty("locations");
			renderGraph();
			renderForm();
		};

		deleteBtn.onclick = () => {
			const id = this._selectedLocationId;
			if (!id || !locations[id]) return;
			if (!confirm(`Delete location '${id}'? This cannot be undone.`)) return;
			delete locations[id];

			// Drop dangling connections that pointed here so the map stays clean.
			Object.values(locations).forEach((loc) => {
				if (!Array.isArray(loc.connections)) return;
				loc.connections = loc.connections.filter((c) => (typeof c === "string" ? c !== id : c?.id !== id));
				if (loc.connections.length === 0) loc.connections = undefined;
			});

			this._selectedLocationId = null;
			renameBtn.disabled = true;
			deleteBtn.disabled = true;
			EditorState.markDirty("locations");
			renderGraph();
			renderForm();
		};

		mainArea.appendChild(graphContainer);
		mainArea.appendChild(formContainer);
		wrap.appendChild(topBar);
		wrap.appendChild(mainArea);
		container.appendChild(wrap);

		renderGraph();
		renderForm();
	},

	_renderForm(col, id, loc, onGraphChange) {
		const update = () => { EditorState.markDirty("locations"); onGraphChange(); };

		const idInput = document.createElement("input");
		idInput.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full font-mono focus:outline-none focus:border-indigo-500";
		idInput.value = id;
		idInput.onchange = () => {
			const newId = idInput.value.trim();
			if (!newId || newId === id) { idInput.value = id; return; }
			const locations = EditorState.rawData.base.locations;
			if (locations[newId]) { idInput.value = id; alert(`Location '${newId}' already exists.`); return; }

			locations[newId] = loc;
			delete locations[id];
			Object.values(locations).forEach((other) => {
				if (!Array.isArray(other.connections)) return;
				other.connections = other.connections.map((c) => {
					if (typeof c === "string") return c === id ? newId : c;
					if (c?.id === id) return { ...c, id: newId };
					return c;
				});
			});
			const cfg = EditorState.rawData.storyConfig;
			if (cfg && cfg.starting_location === id) {
				cfg.starting_location = newId;
				EditorState.markDirty("config");
			}
			this._selectedLocationId = newId;
			EditorState.markDirty("locations");
			onGraphChange();
			// Re-render the form so the rest of the inputs rebind to the new id.
			const formContainer = col;
			formContainer.innerHTML = "";
			this._renderForm(formContainer, newId, loc, onGraphChange);
		};
		col.appendChild(EditorPanels.fieldRow("ID", idInput));

		const nameInput = EditorPanels.textInput(loc.name, (v) => { loc.name = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Name", nameInput));

		const descInput = EditorPanels.textareaInput(loc.description, (v) => { loc.description = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Description", descInput));

		const imageInput = EditorPanels.imageInput(loc.image, (v) => { loc.image = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Image Path (opt)", imageInput));

		col.appendChild(EditorPanels.sectionLabel("Connections"));
		const connContainer = document.createElement("div");
		ConnectionEditor.render(connContainer, loc.connections || [], (updated) => {
			loc.connections = updated.length ? updated : undefined;
			update();
		});
		col.appendChild(connContainer);
	},
};
