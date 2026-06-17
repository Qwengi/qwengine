/** Editor panel for data/stats.json — three-column entity → stat → detail form. */
const StatsPanel = {
	render(container) {
		container.innerHTML = "";
		const entities = EditorState.rawData.base.entities;

		const wrap = document.createElement("div");
		wrap.className = "flex h-full";

		// Entity list
		const entityCol = document.createElement("div");
		entityCol.className = "w-36 shrink-0 border-r border-slate-800 flex flex-col";

		const entityHeader = document.createElement("div");
		entityHeader.className = "px-3 py-2 text-xs text-slate-400 uppercase tracking-widest font-bold border-b border-slate-800";
		entityHeader.textContent = "Entities";
		entityCol.appendChild(entityHeader);

		// Stat list
		const statCol = document.createElement("div");
		statCol.className = "w-44 shrink-0 border-r border-slate-800 flex flex-col";

		// Detail
		const detailCol = document.createElement("div");
		detailCol.className = "flex-1 overflow-y-auto p-4";

		let selectedEntity = null;
		let selectedStat = null;

		const renderStatList = () => {
			statCol.innerHTML = "";
			if (!selectedEntity) return;
			const stats = entities[selectedEntity]?.stats || {};

			const header = document.createElement("div");
			header.className = "flex items-center justify-between px-3 py-2 text-xs text-slate-400 uppercase tracking-widest font-bold border-b border-slate-800";
			header.innerHTML = `<span>Stats</span>`;
			const addBtn = document.createElement("button");
			addBtn.className = "text-indigo-400 hover:text-indigo-300 font-bold";
			addBtn.textContent = "+ New";
			addBtn.onclick = () => {
				let newId = "new_stat";
				let i = 1;
				while (stats[newId]) newId = `new_stat_${i++}`;
				stats[newId] = { value: 0, type: "attribute" };
				if (!entities[selectedEntity].stats) entities[selectedEntity].stats = {};
				entities[selectedEntity].stats[newId] = stats[newId];
				selectedStat = newId;
				EditorState.markDirty("stats");
				renderStatList();
				renderDetail();
			};
			header.appendChild(addBtn);
			statCol.appendChild(header);

			Object.keys(stats).forEach((statId) => {
				const btn = document.createElement("button");
				btn.className = `w-full text-left px-3 py-2 text-sm border-b border-slate-800/50 transition-colors ${
					statId === selectedStat ? "bg-indigo-900/40 text-indigo-300" : "text-slate-300 hover:bg-slate-800/50"
				}`;
				btn.textContent = statId;
				btn.onclick = () => { selectedStat = statId; renderStatList(); renderDetail(); };
				statCol.appendChild(btn);
			});
		};

		const renderDetail = () => {
			detailCol.innerHTML = "";
			if (!selectedEntity || !selectedStat) return;
			const stats = entities[selectedEntity].stats || {};
			const stat = stats[selectedStat];
			if (!stat) return;

			const update = () => EditorState.markDirty("stats");

			const idInput = document.createElement("input");
			idInput.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full font-mono focus:outline-none focus:border-indigo-500";
			idInput.value = selectedStat;
			idInput.oninput = () => {
				const newId = idInput.value;
				if (newId && newId !== selectedStat) {
					stats[newId] = stats[selectedStat];
					delete stats[selectedStat];
					selectedStat = newId;
					EditorState.markDirty("stats");
					renderStatList();
				}
			};
			detailCol.appendChild(EditorPanels.fieldRow("Stat ID", idInput));

			const typeSel = document.createElement("select");
			typeSel.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full focus:outline-none focus:border-indigo-500";
			["attribute", "resource", "currency"].forEach((t) => {
				const opt = document.createElement("option");
				opt.value = t; opt.textContent = t;
				typeSel.appendChild(opt);
			});
			typeSel.value = stat.type || "attribute";
			typeSel.onchange = () => { stat.type = typeSel.value; update(); };
			detailCol.appendChild(EditorPanels.fieldRow("Type", typeSel));

			const valueInput = EditorPanels.textInput(stat.value, (v) => { stat.value = Number(v); update(); });
			valueInput.type = "number";
			detailCol.appendChild(EditorPanels.fieldRow("Default Value", valueInput));

			if (stat.type === "resource" || stat.max !== undefined) {
				const maxInput = EditorPanels.textInput(stat.max ?? "", (v) => { stat.max = v ? Number(v) : undefined; update(); });
				maxInput.type = "number";
				detailCol.appendChild(EditorPanels.fieldRow("Max", maxInput));
			}

			const groupInput = EditorPanels.textInput(stat.group, (v) => { stat.group = v || undefined; update(); });
			detailCol.appendChild(EditorPanels.fieldRow("Group (for sidebar display)", groupInput));

			if (stat.type === "attribute") {
				const pmInput = EditorPanels.textInput(stat.progress_max ?? "", (v) => {
					stat.progress_max = v ? Number(v) : undefined;
					stat.progress = v ? (stat.progress || 0) : undefined;
					update();
				});
				pmInput.type = "number";
				detailCol.appendChild(EditorPanels.fieldRow("Progress Max (enables skill training)", pmInput));
			}

			const saveBtn = document.createElement("button");
			saveBtn.className = "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-bold transition-all mt-4";
			saveBtn.textContent = "Save Stats";
			saveBtn.onclick = async () => {
				await EditorState.save("stats");
				const warnings = EditorValidation.validate();
				EditorValidation.render(warnings);
			};
			detailCol.appendChild(saveBtn);
		};

		Object.keys(entities).forEach((entityId) => {
			const btn = document.createElement("button");
			btn.className = `w-full text-left px-3 py-2 text-sm border-b border-slate-800/50 transition-colors ${
				entityId === selectedEntity ? "bg-indigo-900/40 text-indigo-300" : "text-slate-300 hover:bg-slate-800/50"
			}`;
			btn.textContent = entityId;
			btn.onclick = () => {
				selectedEntity = entityId;
				selectedStat = null;
				renderEntityList();
				renderStatList();
				detailCol.innerHTML = "";
			};
			entityCol.appendChild(btn);
		});

		const renderEntityList = () => {
			const btns = entityCol.querySelectorAll("button");
			btns.forEach((btn) => {
				btn.className = `w-full text-left px-3 py-2 text-sm border-b border-slate-800/50 transition-colors ${
					btn.textContent === selectedEntity ? "bg-indigo-900/40 text-indigo-300" : "text-slate-300 hover:bg-slate-800/50"
				}`;
			});
		};

		Object.keys(entities).forEach((entityId) => {
			const btn = entityCol.querySelector(`button`);
		});

		// Re-render entity list properly
		entityCol.innerHTML = "";
		entityCol.appendChild(entityHeader);
		Object.keys(entities).forEach((entityId) => {
			const btn = document.createElement("button");
			btn.className = `w-full text-left px-3 py-2 text-sm border-b border-slate-800/50 transition-colors ${
				entityId === selectedEntity ? "bg-indigo-900/40 text-indigo-300" : "text-slate-300 hover:bg-slate-800/50"
			}`;
			btn.textContent = entityId;
			btn.onclick = () => {
				selectedEntity = entityId;
				selectedStat = null;
				// Re-highlight
				entityCol.querySelectorAll("button").forEach((b) => {
					b.className = `w-full text-left px-3 py-2 text-sm border-b border-slate-800/50 transition-colors ${
						b.textContent === selectedEntity ? "bg-indigo-900/40 text-indigo-300" : "text-slate-300 hover:bg-slate-800/50"
					}`;
				});
				renderStatList();
				detailCol.innerHTML = "";
			};
			entityCol.appendChild(btn);
		});

		wrap.appendChild(entityCol);
		wrap.appendChild(statCol);
		wrap.appendChild(detailCol);
		container.appendChild(wrap);

		// Select first entity by default
		const firstEntity = Object.keys(entities)[0];
		if (firstEntity) {
			selectedEntity = firstEntity;
			entityCol.querySelector("button")?.click();
		}
	},
};
