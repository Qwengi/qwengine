/**
 * Reusable location connection list editor.
 * Renders an editable list for a connections array (mixed string | object format).
 * Each row shows a location ID with an optional expandable metadata section
 * (label, conditions, hidden_when_locked). Calls onChange(updatedArray) on any change.
 */
const ConnectionEditor = {
	render(container, connections, onChange) {
		container.innerHTML = "";
		const list = Array.isArray(connections) ? connections : [];

		const rows = document.createElement("div");
		rows.className = "flex flex-col gap-2";

		list.forEach((conn, idx) => {
			const isObj = typeof conn === "object";
			const id = isObj ? conn.id : conn;
			const meta = isObj ? conn : null;

			rows.appendChild(this._row(id, meta, (updatedId, updatedMeta) => {
				const next = [...list];
				next[idx] = updatedMeta ? { id: updatedId, ...updatedMeta } : updatedId;
				onChange(next);
			}, () => {
				onChange(list.filter((_, i) => i !== idx));
			}));
		});

		const addBtn = document.createElement("button");
		addBtn.className = "text-xs text-indigo-400 hover:text-indigo-300 mt-1 text-left";
		addBtn.textContent = "+ Add connection";
		addBtn.onclick = () => onChange([...list, ""]);

		rows.appendChild(addBtn);
		container.appendChild(rows);
	},

	_row(id, meta, onUpdate, onRemove) {
		const row = document.createElement("div");
		row.className = "flex flex-col gap-1 p-2 bg-slate-900/50 rounded border border-slate-800";

		const topRow = document.createElement("div");
		topRow.className = "flex gap-1 items-center";

		const idInput = document.createElement("input");
		idInput.className = "px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 flex-1 focus:outline-none focus:border-indigo-500";
		idInput.placeholder = "location id";
		idInput.value = id || "";

		const metaToggle = document.createElement("button");
		metaToggle.className = "text-xs text-slate-500 hover:text-indigo-400 px-2";
		metaToggle.textContent = meta ? "▾ meta" : "▸ meta";

		const removeBtn = document.createElement("button");
		removeBtn.className = "text-slate-600 hover:text-red-400 text-xs px-1";
		removeBtn.textContent = "✕";
		removeBtn.onclick = onRemove;

		topRow.appendChild(idInput);
		topRow.appendChild(metaToggle);
		topRow.appendChild(removeBtn);

		const metaContainer = document.createElement("div");
		metaContainer.className = "flex flex-col gap-1 mt-1";
		metaContainer.style.display = meta ? "" : "none";

		let localMeta = meta ? { ...meta } : null;

		const labelInput = document.createElement("input");
		labelInput.className = "px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500";
		labelInput.placeholder = "label (opt)";
		labelInput.value = meta?.label || "";

		const hiddenCheck = document.createElement("label");
		hiddenCheck.className = "flex items-center gap-2 text-xs text-slate-400";
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = meta?.hidden_when_locked || false;
		hiddenCheck.appendChild(cb);
		hiddenCheck.appendChild(document.createTextNode("hidden when locked"));

		const condLabel = document.createElement("div");
		condLabel.className = "text-xs text-slate-500 mt-1";
		condLabel.textContent = "Conditions:";

		const condContainer = document.createElement("div");

		const buildMeta = () => localMeta ? {
			label: labelInput.value || undefined,
			hidden_when_locked: cb.checked || undefined,
			conditions: localMeta?.conditions,
		} : null;

		if (meta?.conditions) {
			ConditionEditor.render(condContainer, meta.conditions, (updated) => {
				if (!localMeta) localMeta = {};
				localMeta.conditions = updated;
				onUpdate(idInput.value, buildMeta());
			});
		}

		metaContainer.appendChild(labelInput);
		metaContainer.appendChild(hiddenCheck);
		metaContainer.appendChild(condLabel);
		metaContainer.appendChild(condContainer);

		metaToggle.onclick = () => {
			const open = metaContainer.style.display === "none";
			metaContainer.style.display = open ? "" : "none";
			metaToggle.textContent = open ? "▾ meta" : "▸ meta";
			if (open && !localMeta) {
				localMeta = {};
				ConditionEditor.render(condContainer, {}, (updated) => {
					localMeta.conditions = updated;
					onUpdate(idInput.value, buildMeta());
				});
			}
		};

		idInput.oninput = () => onUpdate(idInput.value, buildMeta());
		labelInput.oninput = () => onUpdate(idInput.value, buildMeta());
		cb.onchange = () => onUpdate(idInput.value, buildMeta());

		row.appendChild(topRow);
		row.appendChild(metaContainer);
		return row;
	},
};
