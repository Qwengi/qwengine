/**
 * Editor panel for data/scenes.json — SVG node graph for step flow, plus per-step
 * dialogue and choice editing in a side form. Graph-level operations (add step,
 * switch scene, save) live in the top bar. Buttons:
 *   - Pop Out:    opens the selected step in a separate window for spacious editing
 *   - Test Scene: saves scenes.json and launches a game window starting at the step
 *
 * Cross-window sync:
 * - Local edits emit IPC broadcasts (step:patch, step:rename, step:delete, scene:meta)
 *   so any open pop-outs stay in sync.
 * - Incoming events update EditorState and re-render the graph + form.
 * - When a pop-out targets the same step shown here, the right form locks and shows
 *   "Editing in pop-out window — close it to edit here".
 */
const ScenesPanel = {
	_unsubscribe: null,
	_selectedSceneId: null,
	_selectedStepId: null,
	_renderRoot: null,

	render(container) {
		container.innerHTML = "";
		if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }

		this._renderRoot = container;
		const scenes = EditorState.rawData.base.scenes;

		const wrap = document.createElement("div");
		wrap.className = "flex flex-col h-full";

		// --- Top bar ---
		const topBar = document.createElement("div");
		topBar.className = "flex items-center gap-3 px-4 py-2 border-b border-slate-800 shrink-0";

		const sceneLabel = document.createElement("span");
		sceneLabel.className = "text-xs text-slate-400 uppercase tracking-widest font-bold";
		sceneLabel.textContent = "Scene:";

		const sceneSel = document.createElement("select");
		sceneSel.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-indigo-500";
		Object.keys(scenes).forEach((sceneId) => {
			const opt = document.createElement("option");
			opt.value = sceneId;
			opt.textContent = sceneId;
			sceneSel.appendChild(opt);
		});

		if (this._selectedSceneId && scenes[this._selectedSceneId]) {
			sceneSel.value = this._selectedSceneId;
		} else {
			this._selectedSceneId = sceneSel.value || null;
		}

		const newSceneBtn = document.createElement("button");
		newSceneBtn.className = "px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-bold";
		newSceneBtn.textContent = "+";
		newSceneBtn.title = "Create a new scene";
		newSceneBtn.onclick = () => this._createScene();

		const renameSceneBtn = document.createElement("button");
		renameSceneBtn.className = "px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 rounded text-xs font-bold";
		renameSceneBtn.textContent = "✎";
		renameSceneBtn.title = "Rename current scene";
		renameSceneBtn.disabled = !this._selectedSceneId;
		renameSceneBtn.onclick = () => this._renameScene();

		const deleteSceneBtn = document.createElement("button");
		deleteSceneBtn.className = "px-2 py-1 bg-slate-700 hover:bg-red-900 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:text-red-300 rounded text-xs font-bold";
		deleteSceneBtn.textContent = "✕";
		deleteSceneBtn.title = "Delete current scene";
		deleteSceneBtn.disabled = !this._selectedSceneId;
		deleteSceneBtn.onclick = () => this._deleteScene();

		const addStepBtn = document.createElement("button");
		addStepBtn.className = "px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-bold ml-4";
		addStepBtn.textContent = "+ Add Step";
		addStepBtn.disabled = !this._selectedSceneId;

		const testBtn = document.createElement("button");
		testBtn.className = "px-3 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-bold ml-auto";
		testBtn.textContent = "▶ Test Scene";
		testBtn.title = "Save every dirty file and launch a game window starting at the selected step (or scene start)";
		testBtn.disabled = !this._selectedSceneId;
		testBtn.onclick = async () => {
			testBtn.disabled = true;
			testBtn.textContent = "Saving…";
			try {
				const result = await EditorShell.saveAll();
				if (result.errors.length > 0) {
					const failed = result.errors.map((e) => `${e.fileType}: ${e.message}`).join("\n");
					alert(`Could not save before testing:\n${failed}`);
					return;
				}
				await EditorSync.launchGame(this._selectedSceneId, this._selectedStepId || undefined);
			} catch (err) {
				console.error("[ScenesPanel] Test scene failed:", err);
				alert(`Failed to launch test: ${err.message}`);
			} finally {
				testBtn.disabled = false;
				testBtn.textContent = "▶ Test Scene";
			}
		};

		const saveBtn = document.createElement("button");
		saveBtn.className = "px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold";
		saveBtn.textContent = "Save";
		saveBtn.onclick = () => EditorShell.saveOne("scenes");

		topBar.appendChild(sceneLabel);
		topBar.appendChild(sceneSel);
		topBar.appendChild(newSceneBtn);
		topBar.appendChild(renameSceneBtn);
		topBar.appendChild(deleteSceneBtn);
		topBar.appendChild(addStepBtn);
		topBar.appendChild(testBtn);
		topBar.appendChild(saveBtn);

		// --- Main area: graph + step form ---
		const mainArea = document.createElement("div");
		mainArea.className = "flex flex-1 min-h-0";

		const graphContainer = document.createElement("div");
		graphContainer.className = "flex-1 relative overflow-hidden bg-slate-950";

		const stepFormContainer = document.createElement("div");
		stepFormContainer.className = "w-80 shrink-0 border-l border-slate-800 overflow-y-auto p-4";

		const renderGraph = () => {
			const scene = scenes[this._selectedSceneId];
			if (!scene?.steps || Object.keys(scene.steps).length === 0) {
				graphContainer.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-slate-600 text-sm italic">${
					this._selectedSceneId ? "No steps yet — click + Add Step." : "No scenes yet — click + above to create one."
				}</div>`;
				return;
			}
			SVGGraph.render(
				graphContainer,
				scene.steps,
				scene.start || Object.keys(scene.steps)[0],
				(stepId) => {
					this._selectedStepId = stepId;
					renderStepForm();
				},
			);
		};

		const renderStepForm = () => {
			stepFormContainer.innerHTML = "";
			if (!this._selectedStepId) return;

			const scene = scenes[this._selectedSceneId];
			const step = scene?.steps?.[this._selectedStepId];
			if (!step) return;

			if (EditorState.isStepLocked(this._selectedSceneId, this._selectedStepId)) {
				const lock = document.createElement("div");
				lock.className = "p-3 rounded border border-amber-700/50 bg-amber-900/20 text-amber-300 text-xs leading-relaxed";
				lock.innerHTML = `<div class="font-bold mb-1">Editing in pop-out window</div>Close the pop-out window to edit this step here.`;
				stepFormContainer.appendChild(lock);
				return;
			}

			const sceneId = this._selectedSceneId;
			const stepId = this._selectedStepId;

			const emitPatch = () => {
				EditorSync.emit({ type: "step:patch", sceneId, stepId, step });
			};

			const update = () => {
				EditorState.markDirty("scenes");
				emitPatch();
				renderGraph();
			};

			// Pop-out + step ID inline
			const idRow = document.createElement("div");
			idRow.className = "flex items-center gap-2 mb-3";

			const stepIdInput = document.createElement("input");
			stepIdInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 flex-1 font-mono focus:outline-none focus:border-indigo-500";
			stepIdInput.value = stepId;
			stepIdInput.onchange = () => {
				const newId = stepIdInput.value.trim();
				if (!newId || newId === stepId) return;
				if (scene.steps[newId]) {
					stepIdInput.value = stepId;
					return;
				}
				scene.steps[newId] = scene.steps[stepId];
				delete scene.steps[stepId];
				if (scene.start === stepId) scene.start = newId;
				this._selectedStepId = newId;
				EditorState.markDirty("scenes");
				EditorSync.emit({ type: "step:rename", sceneId, oldId: stepId, newId });
				EditorSync.emit({ type: "step:patch", sceneId, stepId: newId, step: scene.steps[newId] });
				renderGraph();
				renderStepForm();
			};

			const popOutBtn = document.createElement("button");
			popOutBtn.className = "px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs shrink-0";
			popOutBtn.textContent = "Pop Out ↗";
			popOutBtn.title = "Open this step in a separate, larger editor window";
			popOutBtn.onclick = async () => {
				try {
					await EditorSync.openStepEditor(sceneId, stepId);
				} catch (err) {
					console.error("[ScenesPanel] Pop out failed:", err);
				}
			};

			const idLbl = document.createElement("label");
			idLbl.className = "text-xs text-slate-400 font-bold uppercase tracking-wider w-full block mb-1";
			idLbl.textContent = "Step ID";
			stepFormContainer.appendChild(idLbl);

			idRow.appendChild(stepIdInput);
			idRow.appendChild(popOutBtn);
			stepFormContainer.appendChild(idRow);

			const nameInput = EditorPanels.textInput(step.name, (v) => { step.name = v; update(); });
			stepFormContainer.appendChild(EditorPanels.fieldRow("Step Name", nameInput));

			const startToggle = EditorPanels.checkboxInput("Start step", scene.start === stepId, (v) => {
				if (v) scene.start = stepId;
				EditorState.markDirty("scenes");
				EditorSync.emit({ type: "scene:meta", sceneId, start: scene.start });
				renderGraph();
			});
			stepFormContainer.appendChild(startToggle);

			const imageInput = EditorPanels.imageInput(step.image, (v) => { step.image = v; update(); });
			stepFormContainer.appendChild(EditorPanels.fieldRow("Image Path (opt)", imageInput));

			stepFormContainer.appendChild(EditorPanels.sectionLabel("Dialogue Beats"));
			const dialogueContainer = document.createElement("div");
			DialogueEditor.render(dialogueContainer, step.dialogue || [], (updated) => {
				step.dialogue = updated.length ? updated : undefined;
				update();
			});
			stepFormContainer.appendChild(dialogueContainer);

			stepFormContainer.appendChild(EditorPanels.sectionLabel("Choices"));
			this._renderChoices(stepFormContainer, step, sceneId, () => { update(); });

			stepFormContainer.appendChild(EditorPanels.sectionLabel("Proceed (auto-advance)"));
			const proceedContainer = document.createElement("div");
			ProceedEditor.render(proceedContainer, step, scene, () => { update(); });
			stepFormContainer.appendChild(proceedContainer);

			const delBtn = document.createElement("button");
			delBtn.className = "px-3 py-1 bg-red-900/60 hover:bg-red-800 text-red-300 rounded text-xs font-bold mt-4 w-full";
			delBtn.textContent = "Delete Step";
			delBtn.onclick = () => {
				if (!confirm(`Delete step '${stepId}' from scene '${sceneId}'? This cannot be undone.`)) return;
				delete scene.steps[stepId];
				EditorSync.emit({ type: "step:delete", sceneId, stepId });
				this._selectedStepId = null;
				stepFormContainer.innerHTML = "";
				EditorState.markDirty("scenes");
				renderGraph();
			};
			stepFormContainer.appendChild(delBtn);
		};

		addStepBtn.onclick = () => {
			const scene = scenes[this._selectedSceneId];
			if (!scene.steps) scene.steps = {};
			let newId = "new_step";
			let i = 1;
			while (scene.steps[newId]) newId = `new_step_${i++}`;
			scene.steps[newId] = { name: "New Step", dialogue: [], choices: [] };
			this._selectedStepId = newId;
			EditorState.markDirty("scenes");
			EditorSync.emit({ type: "step:patch", sceneId: this._selectedSceneId, stepId: newId, step: scene.steps[newId] });
			renderGraph();
			renderStepForm();
		};

		sceneSel.onchange = () => {
			this._selectedSceneId = sceneSel.value;
			this._selectedStepId = null;
			stepFormContainer.innerHTML = "";
			renderGraph();
		};

		mainArea.appendChild(graphContainer);
		mainArea.appendChild(stepFormContainer);
		wrap.appendChild(topBar);
		wrap.appendChild(mainArea);
		container.appendChild(wrap);

		renderGraph();
		renderStepForm();

		// React to remote sync events while this panel is mounted.
		this._unsubscribe = EditorState.onScenesChanged((payload) => {
			if (!this._renderRoot || !document.body.contains(this._renderRoot)) {
				if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
				return;
			}
			if (payload.sceneId && payload.sceneId !== this._selectedSceneId) {
				renderGraph();
				return;
			}
			if (payload.type === "step:rename" && payload.oldId === this._selectedStepId) {
				this._selectedStepId = payload.newId;
			}
			if (payload.type === "step:delete" && payload.stepId === this._selectedStepId) {
				this._selectedStepId = null;
			}

			renderGraph();

			// Only re-render the side form when the change actually affects what's shown,
			// to avoid clobbering focus/scroll on every keystroke from another window.
			const affectsForm =
				payload.type === "step:rename" ||
				payload.type === "step:delete" ||
				payload.type === "scene:meta" ||
				payload.type === "scene:reload" ||
				payload.type === "popout:opened" ||
				payload.type === "popout:closed" ||
				(payload.type === "step:patch" && (payload.stepId === this._selectedStepId || payload._wasNew));

			if (affectsForm) renderStepForm();
		});
	},

	_createScene() {
		const scenes = EditorState.rawData.base.scenes;
		const id = (prompt("New scene ID:", "new_scene") || "").trim();
		if (!id) return;
		if (scenes[id]) { alert(`Scene '${id}' already exists.`); return; }

		const newScene = {
			start: "start",
			steps: { start: { name: "Start", dialogue: [], choices: [] } },
		};
		scenes[id] = newScene;
		EditorState.markDirty("scenes");
		EditorSync.emit({ type: "scene:add", sceneId: id, scene: newScene });

		this._selectedSceneId = id;
		this._selectedStepId = "start";
		this.render(this._renderRoot);
	},

	_renameScene() {
		const scenes = EditorState.rawData.base.scenes;
		const oldId = this._selectedSceneId;
		if (!oldId || !scenes[oldId]) return;

		const newId = (prompt(`Rename scene '${oldId}' to:`, oldId) || "").trim();
		if (!newId || newId === oldId) return;
		if (scenes[newId]) { alert(`Scene '${newId}' already exists.`); return; }

		scenes[newId] = scenes[oldId];
		delete scenes[oldId];

		// Keep config in sync if it pointed here.
		const cfg = EditorState.rawData.storyConfig;
		let cfgChanged = false;
		if (cfg.starting_scene === oldId) { cfg.starting_scene = newId; cfgChanged = true; }
		if (cfg.startingScene === oldId) { cfg.startingScene = newId; cfgChanged = true; }
		if (cfg.on_death === oldId) { cfg.on_death = newId; cfgChanged = true; }
		if (cfgChanged) EditorState.markDirty("config");

		EditorState.markDirty("scenes");
		EditorSync.emit({ type: "scene:rename", oldId, newId });
		this._selectedSceneId = newId;
		this.render(this._renderRoot);
	},

	_deleteScene() {
		const scenes = EditorState.rawData.base.scenes;
		const sceneId = this._selectedSceneId;
		if (!sceneId || !scenes[sceneId]) return;

		const stepCount = Object.keys(scenes[sceneId].steps || {}).length;
		if (!confirm(`Delete scene '${sceneId}' and all ${stepCount} step(s)? This cannot be undone.`)) return;

		delete scenes[sceneId];

		// Clear config refs that pointed here so validation doesn't immediately flag them.
		const cfg = EditorState.rawData.storyConfig;
		let cfgChanged = false;
		if (cfg.starting_scene === sceneId) { delete cfg.starting_scene; cfgChanged = true; }
		if (cfg.startingScene === sceneId) { delete cfg.startingScene; cfgChanged = true; }
		if (cfg.on_death === sceneId) { delete cfg.on_death; cfgChanged = true; }
		if (cfgChanged) EditorState.markDirty("config");

		EditorState.markDirty("scenes");
		EditorSync.emit({ type: "scene:delete", sceneId });

		this._selectedSceneId = Object.keys(scenes)[0] || null;
		this._selectedStepId = null;
		this.render(this._renderRoot);
	},

	/**
	 * Renders the step.proceed editor — auto-advance after dialogue beats.
	 * Reusable by ScenesPanel side form and the pop-out window.
	 */
	renderProceed(container, step, scene, onChange) {
		ProceedEditor.render(container, step, scene, onChange);
	},

	_renderChoices(container, step, sceneId, onChange) {
		const scene = EditorState.rawData.base.scenes[sceneId];
		const choices = Array.isArray(step.choices) ? step.choices : [];

		const choiceRows = document.createElement("div");
		choiceRows.className = "flex flex-col gap-2 mb-2";

		choices.forEach((choice, idx) => {
			const row = document.createElement("div");
			row.className = "flex flex-col gap-1 p-2 bg-slate-900/50 rounded border border-slate-800";

			const topRow = document.createElement("div");
			topRow.className = "flex gap-1 items-center";

			const handle = EditorPanels.dragHandle();
			EditorPanels.makeReorderableRow(row, handle, idx, (from, to) => {
				const [moved] = choices.splice(from, 1);
				choices.splice(to, 0, moved);
				onChange();
				container.innerHTML = "";
				this._renderChoices(container, step, sceneId, onChange);
			});

			const textInput = document.createElement("input");
			textInput.className = "px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 flex-1 focus:outline-none focus:border-indigo-500";
			textInput.placeholder = "button text";
			textInput.value = choice.text || "";
			textInput.oninput = () => { choice.text = textInput.value; onChange(); };

			const removeBtn = document.createElement("button");
			removeBtn.className = "text-slate-600 hover:text-red-400 text-xs px-1";
			removeBtn.textContent = "✕";
			removeBtn.onclick = () => {
				step.choices = choices.filter((_, i) => i !== idx);
				onChange();
				container.innerHTML = "";
				this._renderChoices(container, step, sceneId, onChange);
			};

			topRow.appendChild(handle);
			topRow.appendChild(textInput);
			topRow.appendChild(removeBtn);

			const nextSel = document.createElement("select");
			nextSel.className = "px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 w-full focus:outline-none focus:border-indigo-500 mt-1";
			const noneOpt = document.createElement("option");
			noneOpt.value = "";
			noneOpt.textContent = "— next step —";
			nextSel.appendChild(noneOpt);
			Object.keys(scene.steps || {}).forEach((stepId) => {
				const opt = document.createElement("option");
				opt.value = stepId;
				opt.textContent = stepId;
				nextSel.appendChild(opt);
			});
			nextSel.value = choice.next || "";
			nextSel.onchange = () => { choice.next = nextSel.value || undefined; onChange(); };

			const condToggle = document.createElement("button");
			condToggle.className = "text-xs text-slate-500 hover:text-indigo-400 mt-1 text-left";
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
			choiceRows.appendChild(row);
		});

		const addBtn = document.createElement("button");
		addBtn.className = "text-xs text-indigo-400 hover:text-indigo-300 text-left";
		addBtn.textContent = "+ Add choice";
		addBtn.onclick = () => {
			if (!Array.isArray(step.choices)) step.choices = [];
			step.choices.push({ id: `choice_${step.choices.length + 1}`, text: "", next: "" });
			onChange();
			container.innerHTML = "";
			this._renderChoices(container, step, sceneId, onChange);
		};

		container.appendChild(choiceRows);
		container.appendChild(addBtn);
	},
};
