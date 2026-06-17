/** Editor panel for data/npcs.json — list + detail form with dialogue, location, and shop editing. */
const NpcsPanel = {
	render(container) {
		const npcs = EditorState.rawData.base.npcs;
		EditorPanels.makeListDetail(container, "npcs", npcs, (col, id, npc, onUpdate) => {
			this._renderForm(col, id, npc, onUpdate);
		});
	},

	_renderForm(col, id, npc, onUpdate) {
		const update = () => onUpdate(idInput.value || id, npc);

		const idInput = document.createElement("input");
		idInput.className = "px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 w-full font-mono focus:outline-none focus:border-indigo-500";
		idInput.value = id;
		idInput.oninput = update;
		col.appendChild(EditorPanels.fieldRow("ID", idInput));

		const nameInput = EditorPanels.textInput(npc.name, (v) => { npc.name = v; update(); });
		col.appendChild(EditorPanels.fieldRow("Name", nameInput));

		// Color picker
		const colorRow = document.createElement("div");
		colorRow.className = "flex gap-2 items-center mb-4";
		const colorLabel = document.createElement("label");
		colorLabel.className = "text-xs text-slate-400 font-bold uppercase tracking-wider w-24";
		colorLabel.textContent = "Color";
		const colorInput = document.createElement("input");
		colorInput.type = "color";
		colorInput.className = "w-10 h-8 rounded border border-slate-700 bg-slate-900 cursor-pointer";
		colorInput.value = npc.color || "#67e8f9";
		colorInput.oninput = () => { npc.color = colorInput.value; update(); };
		colorRow.appendChild(colorLabel);
		colorRow.appendChild(colorInput);
		col.appendChild(colorRow);

		// Locations multiselect
		col.appendChild(EditorPanels.sectionLabel("Locations"));
		const allLocs = EditorState.allLocationIds();
		const locContainer = document.createElement("div");
		locContainer.className = "flex flex-wrap gap-2 mb-4";
		const npcLocs = new Set(npc.locations || []);

		allLocs.forEach((locId) => {
			const tag = document.createElement("label");
			tag.className = "flex items-center gap-1 text-xs text-slate-300 cursor-pointer";
			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = npcLocs.has(locId);
			cb.onchange = () => {
				if (cb.checked) npcLocs.add(locId);
				else npcLocs.delete(locId);
				npc.locations = [...npcLocs];
				update();
			};
			tag.appendChild(cb);
			tag.appendChild(document.createTextNode(locId));
			locContainer.appendChild(tag);
		});
		col.appendChild(locContainer);

		col.appendChild(EditorPanels.sectionLabel("Dialogue"));
		const dialogueContainer = document.createElement("div");
		DialogueEditor.render(dialogueContainer, npc.dialogue || [], (updated) => {
			npc.dialogue = updated;
			update();
		});
		col.appendChild(dialogueContainer);

		// Shop section
		col.appendChild(EditorPanels.sectionLabel("Shop (optional)"));
		const hasShop = !!(npc.shop?.inventory);
		const shopToggle = document.createElement("label");
		shopToggle.className = "flex items-center gap-2 text-sm text-slate-300 mb-3 cursor-pointer";
		const shopCb = document.createElement("input");
		shopCb.type = "checkbox";
		shopCb.checked = hasShop;
		shopToggle.appendChild(shopCb);
		shopToggle.appendChild(document.createTextNode("Has shop"));
		col.appendChild(shopToggle);

		const shopContainer = document.createElement("div");
		shopContainer.style.display = hasShop ? "" : "none";
		col.appendChild(shopContainer);

		const renderShop = () => {
			shopContainer.innerHTML = "";
			if (!npc.shop?.inventory) return;
			const inv = npc.shop.inventory;

			inv.forEach((shopItem, idx) => {
				const row = document.createElement("div");
				row.className = "flex flex-col gap-1 p-2 bg-slate-900/50 rounded border border-slate-800 mb-2";

				const idRow = document.createElement("div");
				idRow.className = "flex gap-2 items-center";

				const itemIdInput = document.createElement("input");
				itemIdInput.className = "px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 flex-1 focus:outline-none focus:border-indigo-500";
				itemIdInput.placeholder = "item id";
				itemIdInput.value = shopItem.id || "";
				itemIdInput.oninput = () => { shopItem.id = itemIdInput.value; update(); };

				const removeBtn = document.createElement("button");
				removeBtn.className = "text-slate-600 hover:text-red-400 text-xs px-1";
				removeBtn.textContent = "✕";
				removeBtn.onclick = () => { inv.splice(idx, 1); update(); renderShop(); };

				idRow.appendChild(itemIdInput);
				idRow.appendChild(removeBtn);
				row.appendChild(idRow);

				const costLabel = document.createElement("div");
				costLabel.className = "text-xs text-slate-500 mt-1";
				costLabel.textContent = "Cost:";
				row.appendChild(costLabel);

				const costContainer = document.createElement("div");
				ChangesEditor.render(costContainer, shopItem.cost || [], (updated) => {
					shopItem.cost = updated;
					update();
				});
				row.appendChild(costContainer);

				// Shop item conditions
				const condToggle = document.createElement("button");
				condToggle.className = "text-xs text-slate-500 hover:text-indigo-400 mt-1 text-left";
				condToggle.textContent = shopItem.conditions ? "▾ conditions" : "▸ conditions";
				row.appendChild(condToggle);
				const condContainer = document.createElement("div");
				condContainer.style.display = shopItem.conditions ? "" : "none";
				row.appendChild(condContainer);
				condToggle.onclick = () => {
					const open = condContainer.style.display === "none";
					condContainer.style.display = open ? "" : "none";
					condToggle.textContent = open ? "▾ conditions" : "▸ conditions";
					if (open) ConditionEditor.render(condContainer, shopItem.conditions || {}, (updated) => {
						shopItem.conditions = Object.keys(updated).length ? updated : undefined;
						update();
					});
				};

				shopContainer.appendChild(row);
			});

			const addBtn = document.createElement("button");
			addBtn.className = "text-xs text-indigo-400 hover:text-indigo-300 mt-1";
			addBtn.textContent = "+ Add item";
			addBtn.onclick = () => {
				inv.push({ id: "", cost: [] });
				update();
				renderShop();
			};
			shopContainer.appendChild(addBtn);
		};

		shopCb.onchange = () => {
			if (shopCb.checked) { npc.shop = { inventory: [] }; shopContainer.style.display = ""; renderShop(); }
			else { delete npc.shop; shopContainer.style.display = "none"; }
			update();
		};

		if (hasShop) renderShop();
	},
};
