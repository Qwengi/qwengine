const UI = {
	log(msg, isAction = false, customColor = null) {
		const logEl = document.getElementById("event-log");
		if (!logEl) return;

		const entry = document.createElement("div");

		const color = customColor || (isAction ? "#818cf8" : "#cbd5e1");
		entry.style.color = color;

		if (isAction) entry.classList.add("font-bold");

		entry.textContent = `> ${msg}`;

		logEl.appendChild(entry);

		while (logEl.children.length > 100) {
			logEl.removeChild(logEl.firstChild);
		}

		logEl.scrollTop = logEl.scrollHeight;
	},

	renderStats(player) {
		const topContainer = document.getElementById("stats-container");
		const sidebarContainer = document.getElementById("sidebar-attributes");

		if (!player?.stats) return;

		if (topContainer) topContainer.innerHTML = "";

		if (sidebarContainer) {
			sidebarContainer.innerHTML = `
				<div class="mb-6 pb-4 border-b border-slate-800 shrink-0">
					<h2 data-player-name class="text-2xl font-bold text-indigo-400">Player Profile</h2>
					<p class="text-xs text-slate-500 mt-1">Your core attributes and skills</p>
				</div>
			`;

			const playerNameEl = sidebarContainer.querySelector("[data-player-name]");
			if (playerNameEl) playerNameEl.textContent = player.name || "Player Profile";
		}

		const typeStyles = {
			resource: "bg-rose-900/40 text-rose-300 border-rose-800",
			currency: "bg-amber-900/40 text-amber-300 border-amber-800",
			default: "bg-slate-800 text-slate-300 border-slate-700",
		};

		const attributesByGroup = {};

		for (const [id, stat] of Object.entries(player.stats)) {
			if (typeof stat !== "object" || stat.value === undefined) continue;

			if (stat.type === "attribute") {
				if (!stat.group) continue;

				const groupName = stat.group;
				if (!attributesByGroup[groupName]) {
					attributesByGroup[groupName] = {};
				}
				attributesByGroup[groupName][id] = stat;
				continue;
			}

			if (topContainer) {
				const wrapper = document.createElement("div");
				const label = document.createElement("span");
				const value = document.createElement("span");

				const type = stat.type || "default";
				const style = typeStyles[type] || typeStyles.default;

				const isResource = type === "resource";
				const maxVal = stat.max !== undefined || isResource ? Engine.getEffectiveMax(id, "player") : undefined;
				const effectiveVal = Engine.getEffectiveStat(id, "player");

				wrapper.className = `flex flex-col px-3 py-1 rounded border ${style} min-w-[80px]`;

				label.className = "text-[10px] opacity-70 font-bold tracking-tighter";
				label.textContent = id.toUpperCase();

				value.className = "text-sm font-mono";
				value.textContent = maxVal !== undefined ? `${effectiveVal} / ${maxVal}` : `${effectiveVal}`;

				wrapper.appendChild(label);
				wrapper.appendChild(value);
				topContainer.appendChild(wrapper);
			}
		}

		if (sidebarContainer) {
			const groups = Object.keys(attributesByGroup).sort((a, b) => a.localeCompare(b));

			groups.forEach((group) => {
				const groupData = attributesByGroup[group];

				const section = document.createElement("div");
				section.className = "mb-6 last:mb-0 shrink-0";

				const title = document.createElement("h3");
				title.className = "text-[10px] text-slate-500 uppercase tracking-widest mb-3 font-bold border-b border-slate-800 pb-1";
				title.textContent = group;

				const list = document.createElement("div");
				list.className = "flex flex-col gap-2.5";

				for (const [id, stat] of Object.entries(groupData)) {
					const row = document.createElement("div");
					row.className = "flex justify-between items-center bg-slate-950/50 p-2.5 rounded border border-slate-800/50 shadow-inner";

					const nameSpan = document.createElement("span");
					nameSpan.className = "text-sm text-slate-300 font-medium capitalize";
					nameSpan.textContent = id.replace(/_/g, " ");

					const effectiveVal = Engine.getEffectiveStat(id, "player");

					const valSpan = document.createElement("span");
					valSpan.className = "text-sm font-mono text-indigo-400 font-bold bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-800/50 shadow-sm";
					valSpan.textContent = effectiveVal;

					row.appendChild(nameSpan);
					row.appendChild(valSpan);
					list.appendChild(row);
				}

				section.appendChild(title);
				section.appendChild(list);
				sidebarContainer.appendChild(section);
			});
		}
	},

	renderTraits(player, data) {
		const container = document.getElementById("traits-list");
		if (!container) return;
		container.innerHTML = "";

		const hasTraits = player?.traits && player.traits.length > 0;

		if (!hasTraits) {
			container.innerHTML = '<p class="text-slate-500 text-sm italic">You have no traits.</p>';
			return;
		}

		player.traits.forEach((traitInst) => {
			if (!traitInst) return;
			const traitDef = data.traits?.[traitInst.id];
			if (!traitDef) return;

			const row = document.createElement("div");
			row.className = "flex justify-between items-center bg-rose-950/40 p-3 rounded border border-rose-800/50 shadow-inner mb-2 shrink-0";

			const leftCol = document.createElement("div");
			leftCol.className = "flex flex-col";
			const nameSpan = document.createElement("span");
			nameSpan.className = "text-sm text-rose-300 font-bold";
			nameSpan.textContent = traitDef.name;

			const typeSpan = document.createElement("span");
			typeSpan.className = "text-[10px] text-rose-500 capitalize tracking-widest";
			typeSpan.textContent = traitDef.type || "Trait";

			leftCol.appendChild(nameSpan);
			leftCol.appendChild(typeSpan);
			row.appendChild(leftCol);

			container.appendChild(row);
		});
	},

	renderEquipment(player, data) {
		const container = document.getElementById("equipment-list");
		if (!container) return;
		container.innerHTML = "";

		// Explicitly check if there is at least one non-null worn item
		const hasWornItems = player?.worn && Object.values(player.worn).some((inst) => inst !== null && inst !== undefined);

		if (!hasWornItems) {
			container.innerHTML = '<p class="text-slate-500 text-sm italic">You have nothing equipped.</p>';
			return;
		}

		for (const [slot, itemInst] of Object.entries(player.worn)) {
			// Protection against empty/cleared slots (e.g. "chest": null)
			if (!itemInst) continue;

			const itemDef = data.items[itemInst.id];
			if (!itemDef) continue;

			const row = document.createElement("div");
			row.className = "flex justify-between items-center bg-indigo-950/40 p-3 rounded border border-indigo-800/50 shadow-inner mb-2 shrink-0";

			const leftCol = document.createElement("div");
			leftCol.className = "flex flex-col";
			const nameSpan = document.createElement("span");
			nameSpan.className = "text-sm text-indigo-300 font-bold";
			nameSpan.textContent = itemDef.name;

			const typeSpan = document.createElement("span");
			typeSpan.className = "text-[10px] text-indigo-500 capitalize tracking-widest";
			typeSpan.textContent = `Slot: ${slot}`;

			leftCol.appendChild(nameSpan);
			leftCol.appendChild(typeSpan);
			row.appendChild(leftCol);

			const unequipBtn = document.createElement("button");
			unequipBtn.className = "px-4 py-1.5 bg-slate-700/90 hover:bg-slate-600 text-white rounded text-xs font-bold transition-all shadow-sm";
			unequipBtn.textContent = "Unequip";
			unequipBtn.onclick = () => Engine.unequipItem(slot);
			row.appendChild(unequipBtn);

			container.appendChild(row);
		}
	},

	renderInventory(player, data) {
		const container = document.getElementById("inventory-list");
		if (!container) return;
		container.innerHTML = "";

		const hasInventoryItems = player?.inventory?.items && player.inventory.items.length > 0;

		if (!hasInventoryItems) {
			container.innerHTML = '<p class="text-slate-500 text-sm italic">Your inventory is empty.</p>';
			return;
		}

		player.inventory.items.forEach((itemInst, index) => {
			if (!itemInst) return; // Safety check

			const itemDef = data.items[itemInst.id];
			if (!itemDef) return;

			const row = document.createElement("div");
			row.className =
				"flex justify-between items-center bg-slate-950/50 p-3 rounded border border-slate-800/50 shadow-inner mb-2 shrink-0 transition-colors hover:bg-slate-900/50 hover:border-slate-700/80";

			const leftCol = document.createElement("div");
			leftCol.className = "flex flex-col";
			const nameSpan = document.createElement("span");
			nameSpan.className = "text-sm text-slate-300 font-bold";
			nameSpan.textContent = itemDef.name + (itemInst.quantity ? ` (x${itemInst.quantity})` : "");

			const typeSpan = document.createElement("span");
			typeSpan.className = "text-[10px] text-slate-500 capitalize tracking-widest";
			typeSpan.textContent = itemDef.type;

			leftCol.appendChild(nameSpan);
			leftCol.appendChild(typeSpan);
			row.appendChild(leftCol);

			if (Array.isArray(itemDef.effects) && itemDef.effects.length > 0 && itemDef.type !== "equipment") {
				const useBtn = document.createElement("button");
				useBtn.className = "px-4 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all shadow-sm";
				useBtn.textContent = "Use";
				useBtn.onclick = () => Engine.useItem(itemInst.id, index);
				row.appendChild(useBtn);
			} else if (itemDef.type === "equipment") {
				const eqBtn = document.createElement("button");
				eqBtn.className = "px-4 py-1.5 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-all shadow-sm";
				eqBtn.textContent = "Equip";
				eqBtn.onclick = () => Engine.equipItem(index);
				row.appendChild(eqBtn);
			}

			container.appendChild(row);
		});
	},

	createShopSection(npcId, data) {
		const npc = data.npcs[npcId];
		const section = document.createElement("div");
		section.className = "mb-6 mt-4 p-5 bg-slate-900/80 rounded-xl border border-amber-900/50 shadow-lg";

		const title = document.createElement("h3");
		title.className = "text-sm text-amber-500 uppercase tracking-widest mb-4 font-bold border-b border-amber-900/30 pb-2";
		title.textContent = `🛒 ${npc.name}'s Wares`;

		const wrapper = document.createElement("div");
		wrapper.className = "flex flex-col gap-3";

		const visibleItems = npc.shop.inventory.filter((shopItem) => {
			return Engine.canShowShopItem(shopItem.id);
		});

		if (visibleItems.length === 0) {
			wrapper.innerHTML = '<p class="text-slate-500 text-sm italic">Nothing else for sale right now.</p>';
		}

		visibleItems.forEach((shopItem) => {
			if (!shopItem) return; // Safety check

			const itemDef = data.items[shopItem.id];
			if (!itemDef) return;

			const row = document.createElement("div");
			row.className = "flex justify-between items-center p-3 bg-slate-950/50 rounded-lg border border-slate-700/50 transition-colors hover:border-amber-700/50";

			const infoDiv = document.createElement("div");
			infoDiv.className = "flex flex-col";

			const nameEl = document.createElement("span");
			nameEl.className = "text-slate-200 font-bold";
			nameEl.textContent = itemDef.name;

			const typeEl = document.createElement("span");
			typeEl.className = "text-xs text-slate-500 capitalize";
			typeEl.textContent = itemDef.type;

			infoDiv.appendChild(nameEl);
			infoDiv.appendChild(typeEl);

			let costLabel = "Free";
			if (Array.isArray(shopItem.cost) && shopItem.cost.length > 0) {
				costLabel = shopItem.cost
					.map((c) => {
						const statName = c.stat ? c.stat.charAt(0).toUpperCase() + c.stat.slice(1) : "Unknown";
						return `${c.amount || 0} ${statName}`;
					})
					.join(", ");
			}

			const buyBtn = document.createElement("button");
			const canAfford = Engine.canApplyChanges(shopItem.cost);

			if (canAfford) {
				buyBtn.className =
					"px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold flex gap-2 items-center shadow shadow-amber-900/50 transition-all active:scale-95";
				buyBtn.onclick = () => Engine.buyItem(npcId, shopItem.id);
			} else {
				buyBtn.className = "px-4 py-2 bg-amber-600/50 text-white/50 rounded-lg text-sm font-bold flex gap-2 items-center shadow transition-all cursor-not-allowed";
				buyBtn.disabled = true;
			}

			buyBtn.innerHTML = `<span>${costLabel}</span>`;

			row.appendChild(infoDiv);
			row.appendChild(buyBtn);
			wrapper.appendChild(row);
		});

		section.appendChild(title);
		section.appendChild(wrapper);
		return section;
	},

	renderView(data, state) {
		const loc = data.locations[state.location];
		const container = document.getElementById("ui-container");

		if (!loc || !container) return;

		container.innerHTML = "";

		const title = document.createElement("h2");
		title.className = "text-4xl font-bold text-white mb-2";
		title.textContent = loc.name || state.location;

		const desc = document.createElement("p");
		desc.className = "text-slate-300 text-lg mb-8 italic";
		desc.textContent = loc.description || "";

		container.appendChild(title);
		container.appendChild(desc);

		if (Config?.enable_images && loc.image) {
			const imgWrapper = document.createElement("div");
			imgWrapper.className = "mb-8 overflow-hidden rounded-lg shadow-2xl border border-slate-700/50 bg-slate-950 flex justify-center";

			const img = document.createElement("img");
			img.src = loc.image;
			img.className = "max-w-full object-contain";

			if (Config.global_max_image_height > 0) {
				img.style.height = `${Config.global_max_image_height}px`;
				img.style.width = "auto";
			} else if (Config.global_max_image_width > 0) {
				img.style.width = `${Config.global_max_image_width}px`;
				img.style.height = "auto";
			}

			img.onerror = () => (img.style.display = "none");

			imgWrapper.appendChild(img);
			container.appendChild(imgWrapper);
		}

		container.appendChild(
			this.createSection(
				"NPCs",
				loc.npcs,
				data.npcs,
				(id) => {
					Engine.talkTo(id);
				},
				true,
			),
		);

		if (state.activeShop && data.npcs[state.activeShop]?.shop) {
			container.appendChild(this.createShopSection(state.activeShop, data));
		}

		container.appendChild(
			this.createSection(
				"Actions",
				loc.events,
				data.events,
				(id, payload) => {
					Engine.triggerEvent(id, payload);
				},
				false,
			),
		);

		container.appendChild(
			this.createSection(
				"Travel",
				loc.connections,
				data.locations,
				(id) => {
					Engine.moveTo(id);
				},
				false,
			),
		);

		this.renderStats(state.entities.player);
		this.renderTraits(state.entities.player, data);
		this.renderEquipment(state.entities.player, data);
		this.renderInventory(state.entities.player, data);
	},

	createSection(label, list, sourceData, handler, hideIfLocked) {
		if (!Array.isArray(list) || list.length === 0) return document.createDocumentFragment();

		const section = document.createElement("div");
		section.className = "mb-6";

		const title = document.createElement("h3");
		title.className = "text-xs text-slate-500 uppercase tracking-widest mb-3 font-bold";
		title.textContent = label;

		const wrapper = document.createElement("div");
		wrapper.className = "flex flex-wrap gap-3";

		let hasVisible = false;

		list.forEach((id) => {
			const item = sourceData[id];
			if (!item) return;

			const meetsConditions = Engine.checkConditions(item.conditions);

			if (hideIfLocked && !meetsConditions) return;

			const inputDefs = label === "Actions" && Engine.getEventInputs ? Engine.getEventInputs(item) : [];
			const inputEls = new Map();
			const collectPayload = () => {
				const values = {};

				inputDefs.forEach((input, index) => {
					const inputId = Engine.getInputId(input, index);
					values[inputId] = inputEls.get(inputId)?.value || "";
				});

				return { inputs: values };
			};

			const button = document.createElement("button");
			button.className = "px-5 py-2.5 flex items-center gap-2 rounded-xl text-sm transition-all border shadow-sm";

			const setButtonState = () => {
				const inputIsValid = inputDefs.length === 0 || Engine.validateEventInputs(item, collectPayload()).valid;
				const isDisabled = !meetsConditions || !inputIsValid;

				button.disabled = isDisabled;
				button.className = "px-5 py-2.5 flex items-center gap-2 rounded-xl text-sm transition-all border shadow-sm";

				if (isDisabled) {
					button.classList.add("bg-slate-800/50", "text-slate-500", "border-slate-800", "cursor-not-allowed");
				} else {
					button.classList.add("bg-indigo-600", "hover:bg-indigo-500", "text-white", "border-indigo-400", "active:scale-95");
				}
			};

			button.addEventListener("click", () => {
				if (button.disabled) return;
				handler(id, collectPayload());
			});

			const icon = document.createElement("span");
			icon.className = "text-lg";
			icon.textContent = label === "NPCs" ? "💬" : label === "Actions" ? "✨" : "🚶";

			const text = document.createElement("span");
			text.className = "font-semibold";
			text.textContent = item.name || id;

			button.appendChild(icon);
			button.appendChild(text);

			if (inputDefs.length > 0) {
				const controlGroup = document.createElement("div");
				controlGroup.className = "flex flex-wrap gap-3 items-center";

				inputDefs.forEach((input, index) => {
					const inputId = Engine.getInputId(input, index);
					const inputEl = document.createElement("input");

					inputEl.type = input.type || "text";
					inputEl.className =
						"px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-200 min-w-[220px] focus:outline-none focus:border-indigo-400 placeholder-slate-600";
					inputEl.placeholder = input.placeholder || input.label || "";
					inputEl.value = input.value || "";
					inputEl.autocomplete = input.autocomplete || "off";
					inputEl.setAttribute("aria-label", input.label || input.placeholder || "Input");

					if (input.maxLength !== undefined || input.max_length !== undefined) {
						inputEl.maxLength = Number(input.maxLength ?? input.max_length);
					}

					inputEl.addEventListener("input", setButtonState);
					inputEl.addEventListener("keydown", (event) => {
						if (event.key === "Enter" && !button.disabled) {
							button.click();
						}
					});

					inputEls.set(inputId, inputEl);
					controlGroup.appendChild(inputEl);
				});

				controlGroup.appendChild(button);
				wrapper.appendChild(controlGroup);
			} else {
				wrapper.appendChild(button);
			}

			setButtonState();
			hasVisible = true;
		});

		if (!hasVisible) return document.createDocumentFragment();

		section.appendChild(title);
		section.appendChild(wrapper);

		return section;
	},
};
