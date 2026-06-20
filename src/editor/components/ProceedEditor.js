/**
 * Reusable step.proceed editor.
 * Renders a checkbox to enable proceed plus its sub-fields:
 *   - text (button label)
 *   - next (step ID dropdown for the same scene)
 *   - teleport (location ID, optional — overrides next at runtime)
 *   - conditions (collapsible)
 *
 * The container is rebuilt on every render. Used by the ScenesPanel side form
 * and the pop-out step editor; both pass the same (container, step, scene, onChange).
 */
const ProceedEditor = {
	render(container, step, scene, onChange) {
		container.innerHTML = "";

		const enableRow = EditorPanels.checkboxInput(
			"Enable proceed (auto-advance)",
			!!step.proceed,
			(v) => {
				if (v) step.proceed = step.proceed || { text: "Continue", next: "" };
				else delete step.proceed;
				onChange();
				ProceedEditor.render(container, step, scene, onChange);
			},
		);
		container.appendChild(enableRow);

		if (!step.proceed) return;
		const p = step.proceed;

		const textInput = document.createElement("input");
		textInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-full focus:outline-none focus:border-indigo-500";
		textInput.placeholder = "button text (e.g. Continue)";
		textInput.value = p.text || "";
		textInput.oninput = () => { p.text = textInput.value || undefined; onChange(); };
		container.appendChild(EditorPanels.fieldRow("Button text", textInput));

		const nextSel = document.createElement("select");
		nextSel.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-full focus:outline-none focus:border-indigo-500";
		const noneOpt = document.createElement("option");
		noneOpt.value = "";
		noneOpt.textContent = "— same scene step —";
		nextSel.appendChild(noneOpt);
		Object.keys(scene.steps || {}).forEach((id) => {
			const opt = document.createElement("option");
			opt.value = id;
			opt.textContent = id;
			nextSel.appendChild(opt);
		});
		nextSel.value = p.next || "";
		nextSel.onchange = () => { p.next = nextSel.value || undefined; onChange(); };
		container.appendChild(EditorPanels.fieldRow("Next step", nextSel));

		const teleportInput = document.createElement("input");
		teleportInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-full focus:outline-none focus:border-indigo-500";
		teleportInput.placeholder = "location id (overrides next)";
		teleportInput.value = p.teleport || "";
		EditorPanels.bindDatalist(teleportInput, "dl-locations", EditorState.allLocationIds());
		teleportInput.oninput = () => { p.teleport = teleportInput.value || undefined; onChange(); };
		container.appendChild(EditorPanels.fieldRow("Teleport (opt)", teleportInput));

		const imageInput = EditorPanels.imageInput(p.image, (v) => { p.image = v; onChange(); });
		container.appendChild(EditorPanels.fieldRow("Image (opt)", imageInput));

		const condToggle = document.createElement("button");
		condToggle.className = "text-xs text-slate-500 hover:text-indigo-400 text-left mt-2";
		condToggle.textContent = p.conditions ? "▾ conditions" : "▸ conditions";
		const condContainer = document.createElement("div");
		condContainer.style.display = p.conditions ? "" : "none";
		if (p.conditions) {
			ConditionEditor.render(condContainer, p.conditions, (updated) => {
				p.conditions = Object.keys(updated).length ? updated : undefined;
				onChange();
			});
		}
		condToggle.onclick = () => {
			const open = condContainer.style.display === "none";
			condContainer.style.display = open ? "" : "none";
			condToggle.textContent = open ? "▾ conditions" : "▸ conditions";
			if (open && !p.conditions) {
				ConditionEditor.render(condContainer, {}, (updated) => {
					p.conditions = Object.keys(updated).length ? updated : undefined;
					onChange();
				});
			}
		};
		container.appendChild(condToggle);
		container.appendChild(condContainer);
	},
};
