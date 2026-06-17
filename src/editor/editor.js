/**
 * Editor boot coordinator and nav wiring.
 *
 * Purpose:
 * Initialises EditorState, registers nav panel buttons, and activates the first
 * panel on DOMContentLoaded. Also owns dirty-indicator updates for the nav.
 *
 * Related files:
 * - src/editor/editorState.js holds rawData and dirty tracking.
 * - src/editor/panels/*.js are the panel renderers wired in here.
 */
const EditorNav = {
	panels: [
		{ id: "events",    label: "Events",    render: (c) => EventsPanel.render(c) },
		{ id: "locations", label: "Locations", render: (c) => LocationsPanel.render(c) },
		{ id: "scenes",    label: "Scenes",    render: (c) => ScenesPanel.render(c) },
		{ id: "npcs",      label: "NPCs",      render: (c) => NpcsPanel.render(c) },
		{ id: "items",     label: "Items",     render: (c) => ItemsPanel.render(c) },
		{ id: "stats",     label: "Stats",     render: (c) => StatsPanel.render(c) },
		{ id: "config",    label: "Config",    render: (c) => ConfigPanel.render(c) },
	],

	activeId: null,

	init() {
		const nav = document.getElementById("editor-nav");
		const content = document.getElementById("editor-content");

		this.panels.forEach(({ id, label }) => {
			const btn = document.createElement("button");
			btn.id = `nav-btn-${id}`;
			btn.dataset.panelId = id;
			btn.className = "w-full text-left px-4 py-3 text-sm border-b border-slate-800 transition-colors text-slate-400 hover:bg-slate-800/50 hover:text-slate-200";
			btn.textContent = label;
			btn.onclick = () => this.activate(id, content);
			nav.appendChild(btn);
		});

		// Activate first panel
		if (this.panels.length > 0) this.activate(this.panels[0].id, content);
	},

	activate(id, content) {
		this.activeId = id;
		this.updateNavStyles();
		const panel = this.panels.find((p) => p.id === id);
		if (panel) panel.render(content);
	},

	updateNavStyles() {
		this.panels.forEach(({ id }) => {
			const btn = document.getElementById(`nav-btn-${id}`);
			if (!btn) return;
			const isDirty = EditorState.dirty.has(id);
			const isActive = id === this.activeId;
			btn.className = `w-full text-left px-4 py-3 text-sm border-b border-slate-800 transition-colors ${
				isActive
					? "bg-indigo-900/40 text-indigo-300 border-l-2 border-l-indigo-500"
					: "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
			}`;
			btn.textContent = isDirty ? `${this.panels.find((p) => p.id === id)?.label} ●` : this.panels.find((p) => p.id === id)?.label;
		});
	},

	updateDirtyIndicators() {
		this.updateNavStyles();
	},
};

document.addEventListener("DOMContentLoaded", async () => {
	const statusEl = document.getElementById("editor-status");
	if (statusEl) statusEl.textContent = "Loading data...";

	try {
		await EditorState.load();
		if (statusEl) statusEl.textContent = "Ready";
		EditorNav.init();
		const warnings = EditorValidation.validate();
		EditorValidation.render(warnings);
	} catch (err) {
		console.error("[Editor] Boot failed:", err);
		if (statusEl) statusEl.textContent = "Error: " + err.message;
	}
});
