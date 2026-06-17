/** Editor panel for data/events.json — list + detail form with conditions, changes, and bonus editing. */
const EventsPanel = {
	render(container) {
		const events = EditorState.rawData.base.events;
		EditorPanels.makeListDetail(container, "events", events, (col, id, ev, onUpdate) => {
			this._renderForm(col, id, ev, onUpdate);
		});
	},

	_renderForm(col, id, ev, onUpdate) {
		const update = () => onUpdate(idInput.value || id, ev);

		const idInput = document.createElement("input");
		idInput.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full font-mono focus:outline-none focus:border-indigo-500";
		idInput.value = id;
		idInput.oninput = update;
		col.appendChild(EditorPanels.fieldRow("ID", idInput));

		const nameInput = EditorPanels.textInput(ev.name, (v) => { ev.name = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Name (button label)", nameInput));

		// Locations multiselect
		col.appendChild(EditorPanels.sectionLabel("Locations"));
		const allLocs = EditorState.allLocationIds();
		const evLocs = new Set(ev.locations || []);
		const locContainer = document.createElement("div");
		locContainer.className = "flex flex-wrap gap-2 mb-4";
		allLocs.forEach((locId) => {
			const tag = document.createElement("label");
			tag.className = "flex items-center gap-1 text-xs text-slate-300 cursor-pointer";
			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = evLocs.has(locId);
			cb.onchange = () => { if (cb.checked) evLocs.add(locId); else evLocs.delete(locId); ev.locations = [...evLocs]; update(); };
			tag.appendChild(cb);
			tag.appendChild(document.createTextNode(locId));
			locContainer.appendChild(tag);
		});
		col.appendChild(locContainer);

		// Flags row
		const flagsRow = document.createElement("div");
		flagsRow.className = "flex gap-4 mb-4";
		flagsRow.appendChild(EditorPanels.checkboxInput("once", ev.once, (v) => { ev.once = v || undefined; update(); }));
		flagsRow.appendChild(EditorPanels.checkboxInput("hidden when locked", ev.hidden_when_locked, (v) => { ev.hidden_when_locked = v || undefined; update(); }));
		col.appendChild(flagsRow);

		col.appendChild(EditorPanels.sectionLabel("Conditions (AND — all must pass)"));
		const condContainer = document.createElement("div");
		ConditionEditor.render(condContainer, ev.conditions || {}, (updated) => { ev.conditions = Object.keys(updated).length ? updated : undefined; update(); });
		col.appendChild(condContainer);

		col.appendChild(EditorPanels.sectionLabel("Conditions Any (OR — one must pass)"));
		const condAnyContainer = document.createElement("div");
		ConditionEditor.render(condAnyContainer, ev.conditions_any || {}, (updated) => { ev.conditions_any = Object.keys(updated).length ? updated : undefined; update(); });
		col.appendChild(condAnyContainer);

		col.appendChild(EditorPanels.sectionLabel("Changes"));
		const changesContainer = document.createElement("div");
		ChangesEditor.render(changesContainer, ev.changes || [], (updated) => { ev.changes = updated.length ? updated : undefined; update(); });
		col.appendChild(changesContainer);

		const msgInput = EditorPanels.textareaInput(ev.msg, (v) => { ev.msg = v || undefined; update(); });
		col.appendChild(EditorPanels.fieldRow("Message", msgInput));

		// Bonus (collapsible)
		const bonusToggle = document.createElement("button");
		bonusToggle.className = "text-xs text-slate-500 hover:text-indigo-400 mb-2 text-left w-full";
		bonusToggle.textContent = ev.bonus ? "▾ Bonus" : "▸ Bonus (optional)";
		col.appendChild(bonusToggle);

		const bonusContainer = document.createElement("div");
		bonusContainer.className = "p-3 bg-slate-900/50 rounded border border-slate-800 mb-4";
		bonusContainer.style.display = ev.bonus ? "" : "none";
		col.appendChild(bonusContainer);

		const renderBonus = () => {
			bonusContainer.innerHTML = "";
			if (!ev.bonus) return;

			const chanceRow = EditorPanels.fieldRow("Chance Base (0–100)",
				EditorPanels.textInput(ev.bonus.chance?.base ?? 10, (v) => {
					if (!ev.bonus.chance) ev.bonus.chance = {};
					ev.bonus.chance.base = Number(v);
					update();
				})
			);
			bonusContainer.appendChild(chanceRow);

			const bChangesLabel = document.createElement("div");
			bChangesLabel.className = "text-xs text-slate-500 mb-1";
			bChangesLabel.textContent = "Bonus Changes:";
			bonusContainer.appendChild(bChangesLabel);

			const bChangesContainer = document.createElement("div");
			ChangesEditor.render(bChangesContainer, ev.bonus.changes || [], (updated) => {
				ev.bonus.changes = updated;
				update();
			});
			bonusContainer.appendChild(bChangesContainer);

			const bMsgInput = EditorPanels.textInput(ev.bonus.msg, (v) => { ev.bonus.msg = v; update(); });
			bonusContainer.appendChild(EditorPanels.fieldRow("Bonus Message", bMsgInput));
		};

		bonusToggle.onclick = () => {
			const open = bonusContainer.style.display === "none";
			bonusContainer.style.display = open ? "" : "none";
			bonusToggle.textContent = open ? "▾ Bonus" : "▸ Bonus (optional)";
			if (open && !ev.bonus) { ev.bonus = { chance: { base: 10 }, changes: [], msg: "" }; update(); }
			renderBonus();
		};

		if (ev.bonus) renderBonus();
	},
};
