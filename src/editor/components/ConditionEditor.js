/**
 * Reusable condition row editor.
 * Renders an editable table for a conditions or conditions_any object.
 * Each row: [stat id] [operator: min/max/eq/item] [value] [entity].
 * Calls onChange(updatedObject) on every field change.
 */
const ConditionEditor = {
	render(container, conditions, onChange) {
		container.innerHTML = "";
		const entries = Object.entries(conditions || {});

		const table = document.createElement("div");
		table.className = "flex flex-col gap-1";

		entries.forEach(([statId, req]) => {
			table.appendChild(this._row(statId, req, (newId, newReq) => {
				const updated = Object.fromEntries(
					Object.entries(conditions).map(([k, v]) => (k === statId ? [newId, newReq] : [k, v]))
				);
				onChange(updated);
			}, () => {
				const updated = { ...conditions };
				delete updated[statId];
				onChange(updated);
			}));
		});

		const addBtn = document.createElement("button");
		addBtn.className = "text-xs text-indigo-400 hover:text-indigo-300 mt-1 text-left";
		addBtn.textContent = "+ Add condition";
		addBtn.onclick = () => {
			const updated = { ...conditions, "": { min: 0 } };
			onChange(updated);
		};

		table.appendChild(addBtn);
		container.appendChild(table);
	},

	_row(statId, req, onUpdate, onRemove) {
		const row = document.createElement("div");
		row.className = "flex gap-1 items-center";

		const statInput = document.createElement("input");
		statInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-28 focus:outline-none focus:border-indigo-500";
		statInput.value = statId;
		statInput.placeholder = "stat id";

		const opSel = document.createElement("select");
		opSel.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500";
		["min", "max", "eq", "item"].forEach((op) => {
			const opt = document.createElement("option");
			opt.value = op;
			opt.textContent = op;
			opSel.appendChild(opt);
		});

		const currentOp = req.item ? "item" : req.min !== undefined ? "min" : req.max !== undefined ? "max" : "eq";
		opSel.value = currentOp;

		const refreshDatalist = () => {
			const ids = opSel.value === "item"
				? EditorState.allItemIds()
				: EditorState.allStatIdsAcrossEntities();
			EditorPanels.bindDatalist(statInput, opSel.value === "item" ? "dl-items" : "dl-stats", ids);
			statInput.placeholder = opSel.value === "item" ? "item id" : "stat id";
		};
		refreshDatalist();

		const valInput = document.createElement("input");
		valInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-16 focus:outline-none focus:border-indigo-500";
		valInput.type = "number";
		valInput.value = req[currentOp] ?? 0;
		valInput.style.display = currentOp === "item" ? "none" : "";

		const entityInput = document.createElement("input");
		entityInput.className = "px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 w-20 focus:outline-none focus:border-indigo-500";
		entityInput.placeholder = "entity";
		entityInput.value = req.entity || "";
		EditorPanels.bindDatalist(entityInput, "dl-entities", Object.keys(EditorState.rawData?.base?.entities || {}));

		const removeBtn = document.createElement("button");
		removeBtn.className = "text-slate-600 hover:text-red-400 text-xs px-1";
		removeBtn.textContent = "✕";
		removeBtn.onclick = onRemove;

		const buildReq = () => {
			const op = opSel.value;
			const newReq = {};
			if (op === "item") { newReq.item = true; }
			else { newReq[op] = Number(valInput.value); }
			if (entityInput.value) newReq.entity = entityInput.value;
			return newReq;
		};

		opSel.onchange = () => {
			valInput.style.display = opSel.value === "item" ? "none" : "";
			refreshDatalist();
			onUpdate(statInput.value, buildReq());
		};
		statInput.oninput = () => onUpdate(statInput.value, buildReq());
		valInput.oninput = () => onUpdate(statInput.value, buildReq());
		entityInput.oninput = () => onUpdate(statInput.value, buildReq());

		row.appendChild(statInput);
		row.appendChild(opSel);
		row.appendChild(valInput);
		row.appendChild(entityInput);
		row.appendChild(removeBtn);
		return row;
	},
};
