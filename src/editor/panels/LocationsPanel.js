/** Editor panel for data/locations.json — list + detail form with ConnectionEditor for passages. */
const LocationsPanel = {
	render(container) {
		const locations = EditorState.rawData.base.locations;
		EditorPanels.makeListDetail(container, "locations", locations, (col, id, loc, onUpdate) => {
			this._renderForm(col, id, loc, onUpdate);
		});
	},

	_renderForm(col, id, loc, onUpdate) {
		const update = () => onUpdate(idInput.value || id, loc);

		const idInput = document.createElement("input");
		idInput.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full font-mono focus:outline-none focus:border-indigo-500";
		idInput.value = id;
		idInput.oninput = update;
		col.appendChild(EditorPanels.fieldRow("ID", idInput));

		const nameInput = EditorPanels.textInput(loc.name, (v) => { loc.name = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Name", nameInput));

		const descInput = EditorPanels.textareaInput(loc.description, (v) => { loc.description = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Description", descInput));

		const imageInput = EditorPanels.textInput(loc.image, (v) => { loc.image = v || undefined; update(); });
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
