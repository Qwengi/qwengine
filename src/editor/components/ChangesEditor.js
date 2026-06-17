/**
 * Reusable changes array editor.
 * Renders an editable row list for a changes array.
 * Each row: [entity] [action dropdown] [stat/trait/item — contextual] [amount].
 * Calls onChange(updatedArray) on every field change.
 */
const CHANGE_ACTIONS = ["add", "sub", "set", "add_progress", "add_trait", "remove_trait", "remove_item"];
const STAT_ACTIONS = new Set(["add", "sub", "set", "add_progress"]);
const TRAIT_ACTIONS = new Set(["add_trait", "remove_trait"]);
const ITEM_ACTIONS = new Set(["remove_item"]);

const ChangesEditor = {
	render(container, changes, onChange) {
		container.innerHTML = "";
		const list = Array.isArray(changes) ? changes : [];

		const rows = document.createElement("div");
		rows.className = "flex flex-col gap-1";

		list.forEach((change, idx) => {
			rows.appendChild(this._row(change, (updated) => {
				const next = [...list];
				next[idx] = updated;
				onChange(next);
			}, () => {
				onChange(list.filter((_, i) => i !== idx));
			}));
		});

		const addBtn = document.createElement("button");
		addBtn.className = "text-xs text-indigo-400 hover:text-indigo-300 mt-1 text-left";
		addBtn.textContent = "+ Add change";
		addBtn.onclick = () => onChange([...list, { entity: "player", action: "add", stat: "", amount: 0 }]);

		rows.appendChild(addBtn);
		container.appendChild(rows);
	},

	_row(change, onUpdate, onRemove) {
		const row = document.createElement("div");
		row.className = "flex gap-1 items-center flex-wrap";

		const entityInput = document.createElement("input");
		entityInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-20 focus:outline-none focus:border-indigo-500";
		entityInput.placeholder = "entity";
		entityInput.value = change.entity || "player";

		const actionSel = document.createElement("select");
		actionSel.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500";
		CHANGE_ACTIONS.forEach((a) => {
			const opt = document.createElement("option");
			opt.value = a;
			opt.textContent = a;
			actionSel.appendChild(opt);
		});
		actionSel.value = change.action || "add";

		const targetInput = document.createElement("input");
		targetInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-28 focus:outline-none focus:border-indigo-500";

		const amountInput = document.createElement("input");
		amountInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-16 focus:outline-none focus:border-indigo-500";
		amountInput.type = "number";

		const removeBtn = document.createElement("button");
		removeBtn.className = "text-slate-600 hover:text-red-400 text-xs px-1";
		removeBtn.textContent = "✕";
		removeBtn.onclick = onRemove;

		const updateInputs = () => {
			const action = actionSel.value;
			if (STAT_ACTIONS.has(action)) {
				targetInput.placeholder = "stat";
				targetInput.value = change.stat || "";
				amountInput.style.display = "";
				amountInput.value = change.amount ?? 0;
			} else if (TRAIT_ACTIONS.has(action)) {
				targetInput.placeholder = "trait";
				targetInput.value = change.trait || "";
				amountInput.style.display = "none";
			} else if (ITEM_ACTIONS.has(action)) {
				targetInput.placeholder = "item";
				targetInput.value = change.item || "";
				amountInput.style.display = "none";
			}
		};
		updateInputs();

		const buildChange = () => {
			const action = actionSel.value;
			const c = { entity: entityInput.value || "player", action };
			if (STAT_ACTIONS.has(action)) { c.stat = targetInput.value; c.amount = Number(amountInput.value); }
			else if (TRAIT_ACTIONS.has(action)) { c.trait = targetInput.value; }
			else if (ITEM_ACTIONS.has(action)) { c.item = targetInput.value; }
			return c;
		};

		actionSel.onchange = () => { updateInputs(); onUpdate(buildChange()); };
		entityInput.oninput = () => onUpdate(buildChange());
		targetInput.oninput = () => onUpdate(buildChange());
		amountInput.oninput = () => onUpdate(buildChange());

		row.appendChild(entityInput);
		row.appendChild(actionSel);
		row.appendChild(targetInput);
		row.appendChild(amountInput);
		row.appendChild(removeBtn);
		return row;
	},
};
