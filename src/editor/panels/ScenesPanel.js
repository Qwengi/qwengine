/** Editor panel for data/scenes.json — SVG node graph for step flow, plus per-step dialogue and choice editing. */
const ScenesPanel = {
	render(container) {
		container.innerHTML = "";
		const scenes = EditorState.rawData.base.scenes;

		const wrap = document.createElement("div");
		wrap.className = "flex flex-col h-full";

		// Top bar: scene selector + add step button
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

		const addStepBtn = document.createElement("button");
		addStepBtn.className = "px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold ml-2";
		addStepBtn.textContent = "+ Add Step";

		const saveBtn = document.createElement("button");
		saveBtn.className = "px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold ml-auto";
		saveBtn.textContent = "Save";
		saveBtn.onclick = async () => {
			await EditorState.save("scenes");
			const warnings = EditorValidation.validate();
			EditorValidation.render(warnings);
		};

		topBar.appendChild(sceneLabel);
		topBar.appendChild(sceneSel);
		topBar.appendChild(addStepBtn);
		topBar.appendChild(saveBtn);

		// Main area: graph + step form
		const mainArea = document.createElement("div");
		mainArea.className = "flex flex-1 min-h-0";

		const graphContainer = document.createElement("div");
		graphContainer.className = "flex-1 relative overflow-hidden bg-slate-950";

		const stepFormContainer = document.createElement("div");
		stepFormContainer.className = "w-80 shrink-0 border-l border-slate-800 overflow-y-auto p-4";

		let selectedSceneId = sceneSel.value;
		let selectedStepId = null;

		const renderGraph = () => {
			const scene = scenes[selectedSceneId];
			if (!scene?.steps) return;
			SVGGraph.render(graphContainer, scene.steps, scene.start || Object.keys(scene.steps)[0], (stepId) => {
				selectedStepId = stepId;
				renderStepForm();
			});
		};

		const renderStepForm = () => {
			stepFormContainer.innerHTML = "";
			if (!selectedStepId) return;
			const scene = scenes[selectedSceneId];
			const step = scene?.steps?.[selectedStepId];
			if (!step) return;

			const update = () => {
				EditorState.markDirty("scenes");
				renderGraph();
			};

			const stepIdInput = document.createElement("input");
			stepIdInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-full font-mono focus:outline-none focus:border-indigo-500 mb-3";
			stepIdInput.value = selectedStepId;
			stepIdInput.onchange = () => {
				const newId = stepIdInput.value;
				if (newId && newId !== selectedStepId) {
					scene.steps[newId] = scene.steps[selectedStepId];
					delete scene.steps[selectedStepId];
					if (scene.start === selectedStepId) scene.start = newId;
					selectedStepId = newId;
					EditorState.markDirty("scenes");
					renderGraph();
					renderStepForm();
				}
			};
			stepFormContainer.appendChild(EditorPanels.fieldRow("Step ID", stepIdInput));

			const nameInput = EditorPanels.textInput(step.name, (v) => { step.name = v; update(); });
			stepFormContainer.appendChild(EditorPanels.fieldRow("Step Name", nameInput));

			const startToggle = EditorPanels.checkboxInput("Start step", scene.start === selectedStepId, (v) => {
				if (v) scene.start = selectedStepId;
				EditorState.markDirty("scenes");
			});
			stepFormContainer.appendChild(startToggle);

			stepFormContainer.appendChild(EditorPanels.sectionLabel("Dialogue Beats"));
			const dialogueContainer = document.createElement("div");
			DialogueEditor.render(dialogueContainer, step.dialogue || [], (updated) => {
				step.dialogue = updated.length ? updated : undefined;
				update();
			});
			stepFormContainer.appendChild(dialogueContainer);

			stepFormContainer.appendChild(EditorPanels.sectionLabel("Choices"));
			this._renderChoices(stepFormContainer, step, selectedSceneId, update);

			// Delete step button
			const delBtn = document.createElement("button");
			delBtn.className = "px-3 py-1 bg-red-900/60 hover:bg-red-800 text-red-300 rounded text-xs font-bold mt-4 w-full";
			delBtn.textContent = "Delete Step";
			delBtn.onclick = () => {
				delete scene.steps[selectedStepId];
				selectedStepId = null;
				stepFormContainer.innerHTML = "";
				EditorState.markDirty("scenes");
				renderGraph();
			};
			stepFormContainer.appendChild(delBtn);
		};

		addStepBtn.onclick = () => {
			const scene = scenes[selectedSceneId];
			if (!scene.steps) scene.steps = {};
			let newId = "new_step";
			let i = 1;
			while (scene.steps[newId]) newId = `new_step_${i++}`;
			scene.steps[newId] = { name: "New Step", dialogue: [], choices: [] };
			selectedStepId = newId;
			EditorState.markDirty("scenes");
			renderGraph();
			renderStepForm();
		};

		sceneSel.onchange = () => {
			selectedSceneId = sceneSel.value;
			selectedStepId = null;
			stepFormContainer.innerHTML = "";
			renderGraph();
		};

		mainArea.appendChild(graphContainer);
		mainArea.appendChild(stepFormContainer);
		wrap.appendChild(topBar);
		wrap.appendChild(mainArea);
		container.appendChild(wrap);

		renderGraph();
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

			// Choice conditions (collapsible)
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
			choiceRows.innerHTML = "";
			container.innerHTML = "";
			this._renderChoices(container, step, sceneId, onChange);
		};

		container.appendChild(choiceRows);
		container.appendChild(addBtn);
	},
};
