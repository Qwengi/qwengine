/**
 * Editor boot coordinator and nav wiring.
 *
 * Purpose:
 * Initialises EditorState, registers nav panel buttons, and activates the first
 * panel on DOMContentLoaded. Also owns dirty-indicator updates for the nav,
 * the global Save All button, the Cmd+S / Cmd+Shift+S keyboard shortcuts,
 * and the unsaved-changes guard on window close.
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
		EditorShell.refreshSaveAll();
	},
};

const EditorShell = {
	saveAllBtn: null,
	reloadBtn: null,
	undoBtn: null,
	redoBtn: null,
	statusEl: null,

	init() {
		this.saveAllBtn = document.getElementById("editor-save-all");
		this.reloadBtn = document.getElementById("editor-reload");
		this.undoBtn = document.getElementById("editor-undo");
		this.redoBtn = document.getElementById("editor-redo");
		this.statusEl = document.getElementById("editor-status");

		if (this.saveAllBtn) this.saveAllBtn.onclick = () => this.saveAll();
		if (this.reloadBtn) this.reloadBtn.onclick = () => this.reloadFromDisk();
		if (this.undoBtn) this.undoBtn.onclick = () => this.undo();
		if (this.redoBtn) this.redoBtn.onclick = () => this.redo();
		this.refreshSaveAll();

		document.addEventListener("keydown", (e) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			const key = e.key?.toLowerCase();
			if (key === "s") {
				e.preventDefault();
				if (e.shiftKey) this.saveAll();
				else this.saveActive();
			} else if (key === "z") {
				e.preventDefault();
				if (e.shiftKey) this.redo();
				else this.undo();
			} else if (key === "y") {
				e.preventDefault();
				this.redo();
			}
		});

		// Block window close while there are unsaved files; main process shows
		// the native confirmation via webContents 'will-prevent-unload'.
		window.addEventListener("beforeunload", (e) => {
			if (EditorState.dirty.size > 0) {
				e.preventDefault();
				e.returnValue = false;
			}
		});
	},

	refreshSaveAll() {
		if (this.saveAllBtn) {
			const count = EditorState.dirty.size;
			this.saveAllBtn.disabled = count === 0;
			this.saveAllBtn.textContent = count > 0 ? `Save All (${count})` : "Save All";
		}
		this.refreshUndoRedo();
	},

	async reloadFromDisk() {
		if (EditorState.dirty.size > 0) {
			const ok = confirm(
				`Reload from disk will discard ${EditorState.dirty.size} unsaved file(s):\n${Array.from(EditorState.dirty).join(", ")}\n\nContinue?`,
			);
			if (!ok) return;
		}
		this._setStatus("Reloading from disk…");
		try {
			await EditorState.load();  // resets history to a single initial snapshot
			EditorNav.updateDirtyIndicators();
			const id = EditorNav.activeId;
			if (id) EditorNav.activate(id, document.getElementById("editor-content"));
			EditorValidation.render(EditorValidation.validate());
			EditorSync.emit({ type: "editor:full-reload" });
			this._setStatus("Reloaded from disk.", true);
		} catch (err) {
			this._setStatus(`Reload failed: ${err.message}`, false, true);
		}
	},

	undo() {
		if (!EditorState.undo()) { this._setStatus("Nothing to undo."); return; }
		this._afterTimeTravel("Undo.");
	},

	redo() {
		if (!EditorState.redo()) { this._setStatus("Nothing to redo."); return; }
		this._afterTimeTravel("Redo.");
	},

	_afterTimeTravel(msg) {
		this.refreshSaveAll();
		this.refreshUndoRedo();
		EditorValidation.render(EditorValidation.validate());
		const id = EditorNav.activeId;
		if (id) EditorNav.activate(id, document.getElementById("editor-content"));
		EditorSync.emit({ type: "editor:full-reload" });
		this._setStatus(msg, true);
	},

	refreshUndoRedo() {
		if (this.undoBtn) this.undoBtn.disabled = !EditorState.canUndo();
		if (this.redoBtn) this.redoBtn.disabled = !EditorState.canRedo();
	},

	async saveActive() {
		const id = EditorNav.activeId;
		if (!id) return { saved: [], errors: [] };
		return this.saveOne(id);
	},

	async saveOne(fileType) {
		if (!EditorState.dirty.has(fileType)) {
			this._setStatus(`Nothing to save in ${fileType}.`);
			return { saved: [], errors: [] };
		}
		this._setStatus(`Saving ${fileType}…`);
		try {
			await EditorState.save(fileType);
			EditorValidation.render(EditorValidation.validate());
			EditorSync.emit({ type: "save:complete", saved: [fileType], errors: [] });
			this._setStatus(`Saved ${fileType}.`, true);
			return { saved: [fileType], errors: [] };
		} catch (err) {
			const errPayload = { fileType, message: err.message };
			EditorSync.emit({ type: "save:complete", saved: [], errors: [errPayload] });
			this._setStatus(`Save failed: ${err.message}`, false, true);
			return { saved: [], errors: [errPayload] };
		}
	},

	async saveAll() {
		if (EditorState.dirty.size === 0) {
			this._setStatus("Nothing to save.");
			return { saved: [], errors: [] };
		}
		this._setStatus(`Saving ${EditorState.dirty.size} file(s)…`);
		const result = await EditorState.saveAll();
		EditorValidation.render(EditorValidation.validate());
		if (result.errors.length === 0) {
			this._setStatus(`Saved: ${result.saved.join(", ")}.`, true);
		} else {
			const failed = result.errors.map((e) => e.fileType).join(", ");
			this._setStatus(`Saved ${result.saved.length}, failed: ${failed}`, false, true);
		}
		EditorSync.emit({ type: "save:complete", saved: result.saved, errors: result.errors });
		return result;
	},

	_setStatus(text, ok = false, error = false) {
		if (!this.statusEl) return;
		this.statusEl.textContent = text;
		this.statusEl.className = error
			? "text-xs italic text-red-400"
			: ok
				? "text-xs italic text-emerald-400"
				: "text-xs italic text-slate-500";
		if (ok || error) {
			setTimeout(() => {
				if (this.statusEl?.textContent === text) {
					this.statusEl.textContent = "";
					this.statusEl.className = "text-xs text-slate-500 italic";
				}
			}, 2500);
		}
	},
};

document.addEventListener("DOMContentLoaded", async () => {
	const statusEl = document.getElementById("editor-status");
	if (statusEl) statusEl.textContent = "Loading data...";

	try {
		await EditorState.load();
		if (statusEl) statusEl.textContent = "Ready";

		EditorSync.init({
			provideSnapshot: () => ({
				rawData: EditorState.rawData,
				dirty: Array.from(EditorState.dirty),
			}),
		});

		EditorSync.subscribe((payload) => {
			if (payload?.type === "save:request") { EditorShell.saveAll(); return; }
			if (payload?.type === "undo:request") { EditorShell.undo(); return; }
			if (payload?.type === "redo:request") { EditorShell.redo(); return; }
			EditorState.applyRemoteEvent(payload);
		});

		EditorShell.init();
		EditorZoom.init();
		EditorNav.init();
		const warnings = EditorValidation.validate();
		EditorValidation.render(warnings);
	} catch (err) {
		console.error("[Editor] Boot failed:", err);
		if (statusEl) statusEl.textContent = "Error: " + err.message;
	}
});
