/**
 * Shared DOM helpers for editor panels.
 *
 * Purpose:
 * Provides the standard two-column list+detail layout used by every data-file
 * panel, plus small reusable element builders (field rows, text inputs, checkboxes,
 * section labels) that keep panel code concise and visually consistent.
 *
 * Important APIs:
 * - EditorPanels.makeListDetail(container, fileType, items, renderForm)
 * - EditorPanels.fieldRow(label, input)
 * - EditorPanels.textInput(value, onChange)
 * - EditorPanels.textareaInput(value, onChange, rows)
 * - EditorPanels.checkboxInput(label, checked, onChange)
 * - EditorPanels.sectionLabel(text)
 */
const EditorPanels = {};

EditorPanels.makeListDetail = (container, fileType, items, renderForm) => {
	container.innerHTML = "";

	const wrap = document.createElement("div");
	wrap.className = "flex h-full gap-0";

	// Left list column
	const listCol = document.createElement("div");
	listCol.className = "w-52 shrink-0 border-r border-slate-800 flex flex-col h-full";

	const listHeader = document.createElement("div");
	listHeader.className = "flex items-center justify-between px-3 py-2 border-b border-slate-800 shrink-0";

	const listTitle = document.createElement("span");
	listTitle.className = "text-xs text-slate-400 uppercase tracking-widest font-bold";
	listTitle.textContent = fileType;

	const addBtn = document.createElement("button");
	addBtn.className = "text-xs text-indigo-400 hover:text-indigo-300 font-bold";
	addBtn.textContent = "+ New";

	listHeader.appendChild(listTitle);
	listHeader.appendChild(addBtn);

	const listScroll = document.createElement("div");
	listScroll.className = "flex-1 overflow-y-auto";

	let selectedId = null;

	const detailCol = document.createElement("div");
	detailCol.className = "flex-1 flex flex-col overflow-y-auto p-4 min-w-0";

	const renderList = () => {
		listScroll.innerHTML = "";
		Object.keys(items).forEach((id) => {
			const btn = document.createElement("button");
			btn.className = `w-full text-left px-3 py-2 text-sm border-b border-slate-800/50 transition-colors ${
				id === selectedId
					? "bg-indigo-900/40 text-indigo-300"
					: "text-slate-300 hover:bg-slate-800/50"
			}`;
			btn.textContent = id;
			btn.onclick = () => {
				selectedId = id;
				renderList();
				renderDetail();
			};

			const delBtn = document.createElement("button");
			delBtn.className = "float-right text-slate-700 hover:text-red-400 text-xs ml-1 mt-0.5";
			delBtn.textContent = "✕";
			delBtn.onclick = (e) => {
				e.stopPropagation();
				delete items[id];
				if (selectedId === id) { selectedId = null; detailCol.innerHTML = ""; }
				EditorState.markDirty(fileType);
				renderList();
			};

			btn.appendChild(delBtn);
			listScroll.appendChild(btn);
		});
	};

	const renderDetail = () => {
		detailCol.innerHTML = "";
		if (!selectedId || !items[selectedId]) return;
		renderForm(detailCol, selectedId, items[selectedId], (newId, newData) => {
			if (newId !== selectedId) {
				items[newId] = newData;
				delete items[selectedId];
				selectedId = newId;
			} else {
				items[selectedId] = newData;
			}
			EditorState.markDirty(fileType);
			renderList();
		});
	};

	addBtn.onclick = () => {
		let newId = "new_" + fileType;
		let i = 1;
		while (items[newId]) newId = `new_${fileType}_${i++}`;
		items[newId] = {};
		selectedId = newId;
		EditorState.markDirty(fileType);
		renderList();
		renderDetail();
	};

	const saveBar = document.createElement("div");
	saveBar.className = "shrink-0 border-t border-slate-800 px-3 py-2 flex items-center gap-3";

	const saveBtn = document.createElement("button");
	saveBtn.className = "px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-all";
	saveBtn.textContent = "Save";
	saveBtn.onclick = async () => {
		await EditorState.save(fileType);
		const warnings = EditorValidation.validate();
		EditorValidation.render(warnings);
	};

	saveBar.appendChild(saveBtn);

	renderList();
	listCol.appendChild(listHeader);
	listCol.appendChild(listScroll);
	listCol.appendChild(saveBar);
	wrap.appendChild(listCol);
	wrap.appendChild(detailCol);
	container.appendChild(wrap);
};

EditorPanels.fieldRow = (label, input) => {
	const row = document.createElement("div");
	row.className = "flex flex-col gap-1 mb-4";
	const lbl = document.createElement("label");
	lbl.className = "text-xs text-slate-400 font-bold uppercase tracking-wider";
	lbl.textContent = label;
	row.appendChild(lbl);
	row.appendChild(input);
	return row;
};

EditorPanels.textInput = (value, onChange) => {
	const el = document.createElement("input");
	el.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-indigo-500";
	el.value = value || "";
	el.oninput = () => onChange(el.value);
	return el;
};

EditorPanels.textareaInput = (value, onChange, rows = 3) => {
	const el = document.createElement("textarea");
	el.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 resize-none focus:outline-none focus:border-indigo-500";
	el.rows = rows;
	el.value = value || "";
	el.oninput = () => onChange(el.value);
	return el;
};

EditorPanels.checkboxInput = (label, checked, onChange) => {
	const row = document.createElement("label");
	row.className = "flex items-center gap-2 text-sm text-slate-300 mb-4 cursor-pointer";
	const cb = document.createElement("input");
	cb.type = "checkbox";
	cb.checked = !!checked;
	cb.onchange = () => onChange(cb.checked);
	row.appendChild(cb);
	row.appendChild(document.createTextNode(label));
	return row;
};

EditorPanels.sectionLabel = (text) => {
	const el = document.createElement("div");
	el.className = "text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 mt-4 pb-1 border-b border-slate-800";
	el.textContent = text;
	return el;
};
