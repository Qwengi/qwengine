/** Editor panel for data/items.json — list + detail form for item type, stackability, and effects. */
const ItemsPanel = {
	render(container) {
		const items = EditorState.rawData.base.items;
		EditorPanels.makeListDetail(container, "items", items, (col, id, item, onUpdate) => {
			this._renderForm(col, id, item, onUpdate);
		});
	},

	_renderForm(col, id, item, onUpdate) {
		const update = () => EditorState.markDirty("items");

		const idInput = document.createElement("input");
		idInput.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full font-mono focus:outline-none focus:border-indigo-500";
		idInput.value = id;
		idInput.onchange = () => {
			const newId = idInput.value.trim();
			if (!newId || newId === id) { idInput.value = id; return; }
			onUpdate(newId, item);
		};

		col.appendChild(EditorPanels.fieldRow("ID", idInput));

		const nameInput = EditorPanels.textInput(item.name, (v) => { item.name = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Name", nameInput));

		const typeSel = document.createElement("select");
		typeSel.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full focus:outline-none focus:border-indigo-500";
		["consumable", "tool", "equipment"].forEach((t) => {
			const opt = document.createElement("option");
			opt.value = t; opt.textContent = t;
			typeSel.appendChild(opt);
		});
		typeSel.value = item.type || "consumable";
		typeSel.onchange = () => { item.type = typeSel.value; update(); };
		col.appendChild(EditorPanels.fieldRow("Type", typeSel));

		col.appendChild(EditorPanels.checkboxInput("Stackable", item.stackable, (v) => { item.stackable = v || undefined; update(); }));

		if (typeSel.value === "equipment") {
			const slotInput = EditorPanels.textInput(item.slot, (v) => { item.slot = v; update(); });
			col.appendChild(EditorPanels.fieldRow("Slot", slotInput));
		}

		const descInput = EditorPanels.textareaInput(item.description, (v) => { item.description = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Description", descInput));

		col.appendChild(EditorPanels.sectionLabel("Effects"));
		const effectsContainer = document.createElement("div");
		ChangesEditor.render(effectsContainer, item.effects || [], (updated) => {
			item.effects = updated.length ? updated : undefined;
			update();
		});
		col.appendChild(effectsContainer);
	},
};
