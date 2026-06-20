/**
 * Pop-out step editor window.
 *
 * Boot:
 * 1. Read scene/step ids from window.api args (set by main when opening this window).
 * 2. Request a state snapshot from the primary editor via IPC.
 * 3. Render the step form using the shared component library (DialogueEditor,
 *    ConditionEditor, ChangesEditor, PanelHelpers).
 *
 * Sync:
 * - On any edit: rebuild the step locally, mutate EditorState.rawData, then emit a
 *   "step:patch" sync event so the primary editor and other pop-outs apply it.
 * - On incoming "step:patch" for our (sceneId, stepId): replace local step and re-render.
 * - On incoming "step:rename" affecting us: retarget to newId.
 * - On incoming "step:delete" of our step: show banner, disable the form.
 *
 * Lifecycle:
 * - On open: emit "popout:opened" so the primary editor knows to lock the matching
 *   step in its right-side form.
 * - On window close: emit "popout:closed" so the lock releases.
 */
const StepEditor = {
	sceneId: null,
	stepId: null,
	mounted: false,

	async boot() {
		const sceneId = window.api?.editorSceneArg || new URLSearchParams(window.location.search).get("scene");
		const stepId = window.api?.editorStepArg || new URLSearchParams(window.location.search).get("step");
		if (!sceneId || !stepId) {
			this._fatal("Missing scene/step parameters.");
			return;
		}
		this.sceneId = sceneId;
		this.stepId = stepId;

		this._setStatus("Loading state from main editor…");

		EditorSync.init({});
		EditorSync.subscribe((payload) => this._onSync(payload));
		EditorState.onScenesChanged((payload) => {
			if (!this.mounted) return;
			if (!this._shouldRerender(payload)) return;
			this.render();
		});

		try {
			const snapshot = await EditorSync.requestSnapshot();
			if (!snapshot?.rawData) {
				this._fatal("Could not load state from main editor.");
				return;
			}
			EditorState.rawData = snapshot.rawData;
			EditorState.dirty = new Set(snapshot.dirty || []);
		} catch (err) {
			this._fatal(`Snapshot failed: ${err.message}`);
			return;
		}

		const scene = EditorState.rawData.base.scenes?.[this.sceneId];
		if (!scene?.steps?.[this.stepId]) {
			this._fatal(`Step '${this.sceneId}/${this.stepId}' not found.`);
			return;
		}

		this.mounted = true;
		this._renderBreadcrumb();
		this._setStatus("Linked to main editor");
		this._wireSaveControls();
		this._refreshDirtyUI();
		EditorZoom.init();
		this.render();

		EditorSync.emit({ type: "popout:opened", sceneId: this.sceneId, stepId: this.stepId });
		window.addEventListener("beforeunload", () => {
			EditorSync.emit({ type: "popout:closed", sceneId: this.sceneId, stepId: this.stepId });
		});
	},

	_wireSaveControls() {
		const saveBtn = document.getElementById("step-save");
		if (saveBtn) saveBtn.onclick = () => this._requestSave();

		document.addEventListener("keydown", (e) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			const key = e.key?.toLowerCase();
			if (key === "s") {
				e.preventDefault();
				this._requestSave();
			} else if (key === "z") {
				e.preventDefault();
				EditorSync.emit({ type: e.shiftKey ? "redo:request" : "undo:request" });
				this._setStatus(e.shiftKey ? "Redo…" : "Undo…");
			} else if (key === "y") {
				e.preventDefault();
				EditorSync.emit({ type: "redo:request" });
				this._setStatus("Redo…");
			}
		});
	},

	_requestSave() {
		if (EditorState.dirty.size === 0) {
			this._setStatus("Nothing to save.");
			return;
		}
		this._setStatus("Saving in main editor…");
		EditorSync.emit({ type: "save:request" });
	},

	_markDirty() {
		EditorState.markDirty("scenes");
		this._refreshDirtyUI();
	},

	_refreshDirtyUI() {
		const dirtyEl = document.getElementById("step-dirty");
		const saveBtn = document.getElementById("step-save");
		const dirty = EditorState.dirty.size > 0;
		if (dirtyEl) dirtyEl.textContent = dirty ? `● unsaved (${EditorState.dirty.size})` : "";
		if (saveBtn) saveBtn.disabled = !dirty;
	},

	_setStatus(text, ok = false, error = false) {
		const el = document.getElementById("step-status");
		if (!el) return;
		el.textContent = text;
		el.className = error
			? "text-xs italic text-red-400"
			: ok
				? "text-xs italic text-emerald-400"
				: "text-xs italic text-slate-500";
		if (ok || error) {
			setTimeout(() => {
				if (el.textContent === text) {
					el.textContent = "";
					el.className = "text-xs italic text-slate-500";
				}
			}, 2500);
		}
	},

	_renderBreadcrumb() {
		const el = document.getElementById("step-breadcrumb");
		if (el) el.textContent = `${this.sceneId} / ${this.stepId}`;
	},

	_fatal(msg) {
		this._setStatus(msg);
		const banner = document.getElementById("step-banner");
		if (banner) {
			banner.classList.remove("hidden");
			banner.textContent = msg;
		}
		const main = document.getElementById("step-form");
		if (main) main.innerHTML = "";
	},

	_shouldRerender(payload) {
		if (payload.sceneId && payload.sceneId !== this.sceneId) return false;
		if (payload.type === "step:patch") {
			// Re-render only when the patch is on our own step (so our form reflects the
			// remote edit) or when it adds a step we didn't know about (so dropdowns refresh).
			return payload.stepId === this.stepId || payload._wasNew;
		}
		// Structural changes always warrant a re-render.
		return true;
	},

	_onSync(payload) {
		// Handle command-style messages first; they don't pass through applyRemoteEvent.
		if (payload?.type === "save:complete") {
			(payload.saved || []).forEach((ft) => EditorState.dirty.delete(ft));
			this._refreshDirtyUI();
			if (payload.errors?.length) {
				this._setStatus(`Save failed: ${payload.errors.map((e) => e.fileType).join(", ")}`, false, true);
			} else {
				this._setStatus(`Saved: ${(payload.saved || []).join(", ") || "(no changes)"}.`, true);
			}
			return;
		}
		if (payload?.type === "editor:full-reload") {
			// Main reloaded from disk — our snapshot is stale. Re-fetch and re-render.
			this._setStatus("Resyncing after main editor reload…");
			EditorSync.requestSnapshot().then((snapshot) => {
				if (!snapshot?.rawData) {
					this._fatal("Resync after reload failed.");
					return;
				}
				EditorState.rawData = snapshot.rawData;
				EditorState.dirty = new Set(snapshot.dirty || []);
				if (!EditorState.rawData.base.scenes?.[this.sceneId]?.steps?.[this.stepId]) {
					this._fatal("This step no longer exists after reload.");
					this.mounted = false;
					return;
				}
				this._refreshDirtyUI();
				this.render();
				this._setStatus("Resynced.", true);
			}).catch((err) => this._fatal(`Resync failed: ${err.message}`));
			return;
		}

		// Mirror the universal mutation pipeline so all steps in our local rawData
		// stay current — dropdowns reference other steps' ids.
		EditorState.applyRemoteEvent(payload);
		this._refreshDirtyUI();

		if (!this.mounted) return;
		if (payload.sceneId && payload.sceneId !== this.sceneId) return;

		switch (payload.type) {
			case "step:rename":
				if (payload.oldId === this.stepId) {
					this.stepId = payload.newId;
					this._renderBreadcrumb();
				}
				break;
			case "step:delete":
				if (payload.stepId === this.stepId) {
					this._fatal("This step was deleted in the main editor.");
					this.mounted = false;
				}
				break;
			case "scene:delete":
				if (payload.sceneId === this.sceneId) {
					this._fatal("This scene was deleted in the main editor.");
					this.mounted = false;
				}
				break;
			case "scene:rename":
				if (payload.oldId === this.sceneId) {
					this.sceneId = payload.newId;
					this._renderBreadcrumb();
				}
				break;
			case "scene:reload":
				if (!EditorState.rawData.base.scenes[this.sceneId]?.steps?.[this.stepId]) {
					this._fatal("This step is no longer present after a scene reload.");
					this.mounted = false;
				}
				break;
			default:
				break;
		}
		// onScenesChanged will trigger render via applyRemoteEvent's _notifyScenes call.
	},

	_emitPatch() {
		const step = EditorState.rawData.base.scenes[this.sceneId]?.steps?.[this.stepId];
		if (!step) return;
		this._markDirty();
		EditorSync.emit({
			type: "step:patch",
			sceneId: this.sceneId,
			stepId: this.stepId,
			step,
		});
	},

	render() {
		const form = document.getElementById("step-form");
		if (!form) return;
		form.innerHTML = "";

		const scene = EditorState.rawData.base.scenes[this.sceneId];
		const step = scene.steps[this.stepId];

		const update = () => {
			this._emitPatch();
		};

		// Single-column stack so dialogue and choices each get full window width.
		const layout = document.createElement("div");
		layout.className = "flex flex-col gap-6 max-w-5xl mx-auto";

		// --- Top metadata row: id / name / image side-by-side, start toggle below ---
		const metaRow = document.createElement("div");
		metaRow.className = "grid grid-cols-1 md:grid-cols-3 gap-4";

		const idCell = document.createElement("div");
		const stepIdInput = document.createElement("input");
		stepIdInput.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 w-full";
		stepIdInput.value = this.stepId;
		stepIdInput.onchange = () => {
			const newId = stepIdInput.value.trim();
			if (!newId || newId === this.stepId) return;
			if (scene.steps[newId]) {
				stepIdInput.value = this.stepId;
				return;
			}
			scene.steps[newId] = scene.steps[this.stepId];
			delete scene.steps[this.stepId];
			if (scene.start === this.stepId) scene.start = newId;
			const oldId = this.stepId;
			this.stepId = newId;
			this._renderBreadcrumb();
			this._markDirty();
			EditorSync.emit({ type: "step:rename", sceneId: this.sceneId, oldId, newId });
			this._emitPatch();
			this.render();
		};
		idCell.appendChild(EditorPanels.fieldRow("Step ID", stepIdInput));

		const nameCell = document.createElement("div");
		const nameInput = EditorPanels.textInput(step.name, (v) => { step.name = v; update(); });
		nameCell.appendChild(EditorPanels.fieldRow("Step Name", nameInput));

		const imageCell = document.createElement("div");
		const imageInput = EditorPanels.imageInput(step.image, (v) => { step.image = v; update(); });
		imageCell.appendChild(EditorPanels.fieldRow("Image Path (opt)", imageInput));

		metaRow.appendChild(idCell);
		metaRow.appendChild(nameCell);
		metaRow.appendChild(imageCell);
		layout.appendChild(metaRow);

		const startToggle = EditorPanels.checkboxInput("Start step", scene.start === this.stepId, (v) => {
			scene.start = v ? this.stepId : (Object.keys(scene.steps).find((k) => k !== this.stepId) || null);
			this._markDirty();
			EditorSync.emit({ type: "scene:meta", sceneId: this.sceneId, start: scene.start });
		});
		layout.appendChild(startToggle);

		// --- Dialogue beats (full width) ---
		layout.appendChild(EditorPanels.sectionLabel("Dialogue Beats"));
		const dialogueContainer = document.createElement("div");
		DialogueEditor.render(dialogueContainer, step.dialogue || [], (updated) => {
			step.dialogue = updated.length ? updated : undefined;
			update();
		});
		layout.appendChild(dialogueContainer);

		// --- Choices (full width) ---
		layout.appendChild(EditorPanels.sectionLabel("Choices"));
		const choicesContainer = document.createElement("div");
		this._renderChoices(choicesContainer, step, scene, () => { update(); });
		layout.appendChild(choicesContainer);

		// --- Proceed (auto-advance) ---
		layout.appendChild(EditorPanels.sectionLabel("Proceed (auto-advance)"));
		const proceedContainer = document.createElement("div");
		ProceedEditor.render(proceedContainer, step, scene, () => { update(); });
		layout.appendChild(proceedContainer);

		// --- Delete step ---
		const delBtn = document.createElement("button");
		delBtn.className = "px-4 py-2 bg-red-900/60 hover:bg-red-800 text-red-300 rounded text-sm font-bold mt-6 self-start";
		delBtn.textContent = "Delete Step";
		delBtn.onclick = () => {
			if (!confirm(`Delete step '${this.stepId}'? This window will close.`)) return;
			delete scene.steps[this.stepId];
			this._markDirty();
			EditorSync.emit({ type: "step:delete", sceneId: this.sceneId, stepId: this.stepId });
			this._fatal("Step deleted.");
			this.mounted = false;
			setTimeout(() => window.close(), 200);
		};
		layout.appendChild(delBtn);

		form.appendChild(layout);
	},

	_renderChoices(container, step, scene, onChange) {
		container.innerHTML = "";
		const choices = Array.isArray(step.choices) ? step.choices : [];

		const rows = document.createElement("div");
		rows.className = "flex flex-col gap-3 mb-3";

		choices.forEach((choice, idx) => {
			const row = document.createElement("div");
			row.className = "flex flex-col gap-2 p-3 bg-slate-900/50 rounded border border-slate-800";

			const topRow = document.createElement("div");
			topRow.className = "flex gap-2 items-center";

			const handle = EditorPanels.dragHandle();
			EditorPanels.makeReorderableRow(row, handle, idx, (from, to) => {
				const [moved] = choices.splice(from, 1);
				choices.splice(to, 0, moved);
				onChange();
				this._renderChoices(container, step, scene, onChange);
			});

			const textInput = document.createElement("input");
			textInput.className = "px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-sm text-slate-200 flex-1 focus:outline-none focus:border-indigo-500";
			textInput.placeholder = "button text";
			textInput.value = choice.text || "";
			textInput.oninput = () => { choice.text = textInput.value; onChange(); };

			const removeBtn = document.createElement("button");
			removeBtn.className = "text-slate-600 hover:text-red-400 text-sm px-2";
			removeBtn.textContent = "✕";
			removeBtn.onclick = () => {
				step.choices = choices.filter((_, i) => i !== idx);
				onChange();
				this._renderChoices(container, step, scene, onChange);
			};

			topRow.appendChild(handle);
			topRow.appendChild(textInput);
			topRow.appendChild(removeBtn);

			const nextSel = document.createElement("select");
			nextSel.className = "px-2 py-1.5 bg-slate-950 border border-slate-700 rounded text-sm text-slate-200 w-full focus:outline-none focus:border-indigo-500";
			const noneOpt = document.createElement("option");
			noneOpt.value = "";
			noneOpt.textContent = "— next step —";
			nextSel.appendChild(noneOpt);
			Object.keys(scene.steps || {}).forEach((id) => {
				const opt = document.createElement("option");
				opt.value = id;
				opt.textContent = id;
				nextSel.appendChild(opt);
			});
			nextSel.value = choice.next || "";
			nextSel.onchange = () => { choice.next = nextSel.value || undefined; onChange(); };

			const condToggle = document.createElement("button");
			condToggle.className = "text-xs text-slate-500 hover:text-indigo-400 text-left";
			condToggle.textContent = choice.conditions ? "▾ conditions" : "▸ conditions";
			const condContainer = document.createElement("div");
			condContainer.style.display = choice.conditions ? "" : "none";
			if (choice.conditions) {
				ConditionEditor.render(condContainer, choice.conditions, (updated) => {
					choice.conditions = Object.keys(updated).length ? updated : undefined;
					onChange();
				});
			}
			condToggle.onclick = () => {
				const open = condContainer.style.display === "none";
				condContainer.style.display = open ? "" : "none";
				condToggle.textContent = open ? "▾ conditions" : "▸ conditions";
				if (open && !choice.conditions) {
					ConditionEditor.render(condContainer, {}, (updated) => {
						choice.conditions = Object.keys(updated).length ? updated : undefined;
						onChange();
					});
				}
			};

			row.appendChild(topRow);
			row.appendChild(nextSel);
			row.appendChild(condToggle);
			row.appendChild(condContainer);
			rows.appendChild(row);
		});

		const addBtn = document.createElement("button");
		addBtn.className = "text-sm text-indigo-400 hover:text-indigo-300 text-left mt-1";
		addBtn.textContent = "+ Add choice";
		addBtn.onclick = () => {
			if (!Array.isArray(step.choices)) step.choices = [];
			step.choices.push({ id: `choice_${step.choices.length + 1}`, text: "", next: "" });
			onChange();
			this._renderChoices(container, step, scene, onChange);
		};

		container.appendChild(rows);
		container.appendChild(addBtn);
	},
};

document.addEventListener("DOMContentLoaded", () => StepEditor.boot());
