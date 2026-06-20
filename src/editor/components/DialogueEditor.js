/**
 * Reusable dialogue beat array editor.
 * Renders an ordered list of dialogue beats (actor, text/action, optional conditions).
 * Supports reorder via up/down buttons. Calls onChange(updatedArray) on any change.
 * Used by NpcsPanel (NPC dialogue) and ScenesPanel (scene step dialogue).
 */
const DialogueEditor = {
	render(container, beats, onChange) {
		container.innerHTML = "";
		const list = Array.isArray(beats) ? beats : [];

		const rows = document.createElement("div");
		rows.className = "flex flex-col gap-2";
		rows.id = "dialogue-rows-" + Math.random().toString(36).slice(2);

		list.forEach((beat, idx) => {
			rows.appendChild(this._row(beat, idx, list.length, (updated) => {
				const next = [...list];
				next[idx] = updated;
				onChange(next);
			}, () => {
				onChange(list.filter((_, i) => i !== idx));
			}, (dir) => {
				const next = [...list];
				const swap = idx + dir;
				if (swap < 0 || swap >= next.length) return;
				[next[idx], next[swap]] = [next[swap], next[idx]];
				onChange(next);
			}, (from, to) => {
				const next = [...list];
				const [moved] = next.splice(from, 1);
				next.splice(to, 0, moved);
				onChange(next);
			}));
		});

		const addBtn = document.createElement("button");
		addBtn.className = "text-xs text-indigo-400 hover:text-indigo-300 mt-1 text-left";
		addBtn.textContent = "+ Add beat";
		addBtn.onclick = () => onChange([...list, { text: "" }]);

		rows.appendChild(addBtn);
		container.appendChild(rows);
	},

	_row(beat, idx, total, onUpdate, onRemove, onMove, onReorder) {
		const row = document.createElement("div");
		row.className = "flex flex-col gap-1 p-2 bg-slate-900/50 rounded border border-slate-800";

		const topRow = document.createElement("div");
		topRow.className = "flex gap-1 items-center";

		const handle = EditorPanels.dragHandle();
		EditorPanels.makeReorderableRow(row, handle, idx, onReorder);

		const actorInput = document.createElement("input");
		actorInput.className = "px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-300 w-24 focus:outline-none focus:border-indigo-500";
		actorInput.placeholder = "actor (opt)";
		actorInput.value = beat.actor || "";
		EditorPanels.bindDatalist(actorInput, "dl-actors", ["player", ...EditorState.allNpcIds()]);

		const typeToggle = document.createElement("select");
		typeToggle.className = "px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-300 focus:outline-none focus:border-indigo-500";
		["text", "action"].forEach((t) => {
			const opt = document.createElement("option");
			opt.value = t;
			opt.textContent = t;
			typeToggle.appendChild(opt);
		});
		typeToggle.value = beat.action ? "action" : "text";

		const upBtn = document.createElement("button");
		upBtn.className = "text-slate-600 hover:text-slate-300 text-xs px-1";
		upBtn.textContent = "↑";
		upBtn.disabled = idx === 0;
		upBtn.onclick = () => onMove(-1);

		const downBtn = document.createElement("button");
		downBtn.className = "text-slate-600 hover:text-slate-300 text-xs px-1";
		downBtn.textContent = "↓";
		downBtn.disabled = idx === total - 1;
		downBtn.onclick = () => onMove(1);

		const removeBtn = document.createElement("button");
		removeBtn.className = "text-slate-600 hover:text-red-400 text-xs px-1 ml-auto";
		removeBtn.textContent = "✕";
		removeBtn.onclick = onRemove;

		topRow.appendChild(handle);
		topRow.appendChild(actorInput);
		topRow.appendChild(typeToggle);
		topRow.appendChild(upBtn);
		topRow.appendChild(downBtn);
		topRow.appendChild(removeBtn);

		const textArea = document.createElement("textarea");
		textArea.className = "px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-200 resize-y focus:outline-none focus:border-indigo-500 leading-relaxed";
		textArea.rows = 4;
		textArea.value = beat.text || beat.action || "";
		EditorPanels.autoGrow(textArea, { minRows: 4, maxRows: 24 });

		const condToggle = document.createElement("button");
		condToggle.className = "text-xs text-slate-500 hover:text-indigo-400 text-left mt-1";
		const hasCond = !!(beat.conditions || beat.conditions_any);
		condToggle.textContent = hasCond ? "▾ conditions" : "▸ conditions";

		const condContainer = document.createElement("div");
		condContainer.className = "mt-1";
		condContainer.style.display = hasCond ? "" : "none";

		condToggle.onclick = () => {
			const open = condContainer.style.display === "none";
			condContainer.style.display = open ? "" : "none";
			condToggle.textContent = open ? "▾ conditions" : "▸ conditions";
		};

		const imageToggle = document.createElement("button");
		imageToggle.className = "text-xs text-slate-500 hover:text-indigo-400 text-left mt-1";
		const hasImage = !!beat.image;
		imageToggle.textContent = hasImage ? "▾ image" : "▸ image";

		const imageContainer = document.createElement("div");
		imageContainer.className = "mt-1";
		imageContainer.style.display = hasImage ? "" : "none";

		const buildBeat = () => {
			const isAction = typeToggle.value === "action";
			const b = {};
			if (actorInput.value) b.actor = actorInput.value;
			if (isAction) b.action = textArea.value;
			else b.text = textArea.value;
			if (beat.conditions) b.conditions = beat.conditions;
			if (beat.conditions_any) b.conditions_any = beat.conditions_any;
			if (beat.image) b.image = beat.image;
			return b;
		};

		imageContainer.appendChild(EditorPanels.imageInput(beat.image, (v) => {
			beat.image = v;
			onUpdate(buildBeat());
		}));

		imageToggle.onclick = () => {
			const open = imageContainer.style.display === "none";
			imageContainer.style.display = open ? "" : "none";
			imageToggle.textContent = open ? "▾ image" : "▸ image";
		};

		if (hasCond) {
			ConditionEditor.render(condContainer, beat.conditions || {}, (updated) => {
				beat.conditions = updated;
				onUpdate(buildBeat());
			});
		}

		actorInput.oninput = () => onUpdate(buildBeat());
		textArea.oninput = () => onUpdate(buildBeat());
		typeToggle.onchange = () => onUpdate(buildBeat());

		row.appendChild(topRow);
		row.appendChild(textArea);
		row.appendChild(condToggle);
		row.appendChild(condContainer);
		row.appendChild(imageToggle);
		row.appendChild(imageContainer);
		return row;
	},
};
