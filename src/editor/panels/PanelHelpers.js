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

	const filterRow = document.createElement("div");
	filterRow.className = "px-3 py-2 border-b border-slate-800/60 shrink-0";

	const filterInput = document.createElement("input");
	filterInput.type = "search";
	filterInput.placeholder = `Filter ${fileType}…`;
	filterInput.className = "w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500";
	filterRow.appendChild(filterInput);

	let filterText = "";
	filterInput.oninput = () => {
		filterText = filterInput.value.trim().toLowerCase();
		renderList();
	};

	const listScroll = document.createElement("div");
	listScroll.className = "flex-1 overflow-y-auto";

	let selectedId = null;

	const detailCol = document.createElement("div");
	detailCol.className = "flex-1 flex flex-col overflow-y-auto p-4 min-w-0";

	const renderList = () => {
		listScroll.innerHTML = "";
		const ids = Object.keys(items).filter((id) => !filterText || id.toLowerCase().includes(filterText));

		if (ids.length === 0) {
			const empty = document.createElement("p");
			empty.className = "text-xs text-slate-600 italic px-3 py-3";
			empty.textContent = filterText ? `No ${fileType} match "${filterText}".` : `No ${fileType} yet — click + New.`;
			listScroll.appendChild(empty);
			return;
		}

		ids.forEach((id) => {
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
			delBtn.title = `Delete ${id}`;
			delBtn.onclick = (e) => {
				e.stopPropagation();
				if (!confirm(`Delete ${fileType.replace(/s$/, "") || "item"} '${id}'? This cannot be undone.`)) return;
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
		const singular = fileType.replace(/s$/, "") || fileType;
		let newId = "new_" + singular;
		let i = 1;
		while (items[newId]) newId = `new_${singular}_${i++}`;
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
	saveBtn.onclick = () => EditorShell.saveOne(fileType);

	saveBar.appendChild(saveBtn);

	renderList();
	listCol.appendChild(listHeader);
	listCol.appendChild(filterRow);
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

/**
 * Make a textarea auto-grow to fit its content (capped). Adds a one-time input
 * listener and resizes once on attach. Capped at maxRows so very long content
 * stops growing and starts scrolling instead.
 */
EditorPanels.autoGrow = (textarea, { minRows = 3, maxRows = 20 } = {}) => {
	textarea.rows = Math.max(textarea.rows || minRows, minRows);
	const lineHeightPx = () => {
		// Each row ≈ 1.2x the computed font-size; close enough for sizing math.
		const fs = parseFloat(getComputedStyle(textarea).fontSize) || 14;
		return fs * 1.4;
	};
	const resize = () => {
		textarea.style.height = "auto";
		const lh = lineHeightPx();
		const padding = textarea.offsetHeight - textarea.clientHeight + 4;
		const target = Math.min(textarea.scrollHeight + padding, lh * maxRows + padding);
		textarea.style.height = `${Math.max(target, lh * minRows + padding)}px`;
	};
	textarea.addEventListener("input", resize);
	// Defer one tick so the element has measurable layout.
	requestAnimationFrame(resize);
	return resize;
};

EditorPanels.textareaInput = (value, onChange, rows = 4) => {
	const el = document.createElement("textarea");
	el.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 resize-y focus:outline-none focus:border-indigo-500";
	el.rows = rows;
	el.value = value || "";
	el.oninput = () => onChange(el.value);
	EditorPanels.autoGrow(el, { minRows: rows });
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

/**
 * Wire a free-text input to a shared HTML5 datalist so the user gets autocomplete
 * suggestions while still being able to type anything. The datalist is hosted at
 * #editor-datalists (or body fallback) and rebuilt every call so options stay
 * current as data changes.
 */
EditorPanels.bindDatalist = (input, datalistId, options) => {
	let host = document.getElementById("editor-datalists");
	if (!host) {
		host = document.createElement("div");
		host.id = "editor-datalists";
		host.hidden = true;
		document.body.appendChild(host);
	}
	let dl = document.getElementById(datalistId);
	if (!dl) {
		dl = document.createElement("datalist");
		dl.id = datalistId;
		host.appendChild(dl);
	}
	dl.innerHTML = "";
	(options || []).forEach((value) => {
		if (value === undefined || value === null) return;
		const o = document.createElement("option");
		o.value = value;
		dl.appendChild(o);
	});
	input.setAttribute("list", datalistId);
};

/**
 * Image path field with a live thumbnail preview. Stores raw path values in the
 * underlying data (relative paths or absolute URLs); resolves to file:// for
 * preview using window.api.dataDirUrl.
 */
/**
 * Make a row reorderable via drag-and-drop. The row itself is the drop target;
 * a separate handle element initiates the drag (so the row's text inputs stay
 * normally selectable). onReorder(fromIdx, toIdx) is called after a successful
 * drop with different from/to indices.
 */
EditorPanels.makeReorderableRow = (rowEl, handleEl, idx, onReorder) => {
	handleEl.draggable = true;
	handleEl.title = "Drag to reorder";
	handleEl.style.cursor = "grab";
	handleEl.dataset.dragHandle = "1";

	handleEl.addEventListener("dragstart", (e) => {
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", String(idx));
		rowEl.classList.add("opacity-50");
	});
	handleEl.addEventListener("dragend", () => rowEl.classList.remove("opacity-50"));

	rowEl.addEventListener("dragover", (e) => {
		// Only accept drops from our own handles (text drops shouldn't trigger).
		if (!e.dataTransfer.types.includes("text/plain")) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		rowEl.classList.add("ring-1", "ring-indigo-500");
	});
	rowEl.addEventListener("dragleave", () => rowEl.classList.remove("ring-1", "ring-indigo-500"));
	rowEl.addEventListener("drop", (e) => {
		e.preventDefault();
		rowEl.classList.remove("ring-1", "ring-indigo-500");
		const from = Number(e.dataTransfer.getData("text/plain"));
		if (!Number.isFinite(from) || from === idx) return;
		onReorder(from, idx);
	});
};

EditorPanels.dragHandle = () => {
	const el = document.createElement("span");
	el.className = "text-slate-600 hover:text-slate-300 text-sm px-1 select-none";
	el.textContent = "≡";
	el.style.cursor = "grab";
	return el;
};

/**
 * Image path field with a live thumbnail preview. Stores raw path values in the
 * underlying data (relative paths or absolute URLs); resolves to file:// for
 * preview using window.api.dataDirUrl.
 */
EditorPanels.imageInput = (value, onChange, placeholder = "img/foo.png") => {
	const wrap = document.createElement("div");
	wrap.className = "flex gap-2 items-start";

	const input = document.createElement("input");
	input.className = "flex-1 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500";
	input.placeholder = placeholder;
	input.value = value || "";

	const thumb = document.createElement("img");
	thumb.className = "h-14 w-14 object-cover rounded border border-slate-700 bg-slate-950 shrink-0";
	thumb.alt = "";
	thumb.onerror = () => { thumb.style.visibility = "hidden"; };
	thumb.onload = () => { thumb.style.visibility = ""; };

	const refresh = () => {
		const v = input.value.trim();
		if (!v) { thumb.style.visibility = "hidden"; thumb.removeAttribute("src"); return; }
		if (v.startsWith("http") || v.startsWith("file://")) thumb.src = v;
		else if (window.api?.dataDirUrl) thumb.src = `${window.api.dataDirUrl}/${v}`;
		else thumb.style.visibility = "hidden";
	};
	refresh();

	input.oninput = () => {
		onChange(input.value || undefined);
		refresh();
	};

	wrap.appendChild(input);
	wrap.appendChild(thumb);
	return wrap;
};
