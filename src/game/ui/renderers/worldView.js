/**
 * Main world/location renderer.
 *
 * Purpose:
 * This file renders the central play surface for the current location. It owns
 * location title/description/image layout and reusable button sections for NPCs,
 * actions, and travel. When a location carries a `dialogue` array (compiled from
 * a scene step), it renders an immersive story panel instead of the plain
 * description block. Keyboard shortcuts (1–9) fire the focused interactive
 * buttons in document order.
 *
 * Responsibilities:
 * - Render the active location into #ui-container.
 * - Render optional location images using Config constraints.
 * - Build NPC, action, and travel sections with numbered kbd shortcuts.
 * - Render data-driven typed inputs for actions that require event input.
 * - Render scene step dialogue arrays as immersive beats.
 * - Delegate player panels and active shop sections to focused renderers.
 *
 * Interactions:
 * - Reads compiled locations, npcs, events, and items through the `data` arg.
 * - Reads current runtime state through the `state` arg.
 * - Calls Engine.talkTo, Engine.triggerEvent, Engine.moveTo, Engine.checkConditions,
 *   Engine.getEventInputs, Engine.getInputId, and Engine.validateEventInputs.
 * - Calls PlayerPanelRenderer and ShopRenderer after main location layout.
 *
 * What does not belong here:
 * - Activity log rendering, save/load list rendering, stat/effect calculations,
 *   item mutation rules, event execution internals, or data registry compilation.
 *
 * Architectural assumptions and constraints:
 * - This file is loaded before src/game/ui/ui.js and contributes the global
 *   WorldViewRenderer object.
 * - Renderer functions create DOM from current state; they should not store
 *   persistent UI state outside DOM inputs.
 * - Event input controls pass payloads to Engine; validation rules live in the
 *   engine input system so UI and runtime stay consistent.
 * - The keyboard shortcut handler is installed once and delegates to whichever
 *   kbd-choice buttons are currently in the DOM.
 *
 * Important APIs:
 * - WorldViewRenderer.renderView(data, state)
 * - WorldViewRenderer.createSection(label, list, sourceData, handler, hideIfLocked)
 *
 * Common risks:
 * - Duplicating engine validation here can desync button enabled state from
 *   actual event execution. Always use Engine.validateEventInputs.
 * - Moving player panel rendering elsewhere can leave sidebars stale after an
 *   event rerender.
 *
 * Related files:
 * - src/game/ui/ui.js exposes this renderer through UI.renderView.
 * - src/game/ui/renderers/playerPanels.js renders the player sidebars.
 * - src/game/ui/renderers/shopRenderer.js renders active shop sections.
 * - src/game/systems/eventSystem.js executes action button events.
 */
const WorldViewRenderer = {
	_kbdListenerInstalled: false,

	_installKbdListener() {
		if (this._kbdListenerInstalled) return;
		this._kbdListenerInstalled = true;

		document.addEventListener("keydown", (e) => {
			const tag = e.target?.tagName?.toLowerCase();
			if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

			const n = parseInt(e.key, 10);
			if (n >= 1 && n <= 9) {
				const buttons = Array.from(document.querySelectorAll("button.kbd-choice:not([disabled])"));
				const btn = buttons[n - 1];
				if (btn) btn.click();
			}
		});
	},

	renderDialoguePanel(dialogue, npcs, container) {
		const panel = document.createElement("div");
		panel.className = "mb-8 p-6 bg-stone-950 rounded-xl border border-stone-800 shadow-inner flex flex-col gap-3";

		dialogue.forEach((beat) => {
			if (beat.image) {
				if (Config?.enable_images) {
					const imgWrap = document.createElement("div");
					imgWrap.className = "flex justify-center my-2";

					const img = document.createElement("img");
					img.src = beat.image;
					img.className = "max-w-full rounded-lg object-contain";

					if (Config.global_max_image_height > 0) {
						img.style.maxHeight = `${Config.global_max_image_height}px`;
					}

					img.onerror = () => (imgWrap.style.display = "none");
					imgWrap.appendChild(img);
					panel.appendChild(imgWrap);
				}
				return;
			}

			const npc = beat.actor ? (npcs[beat.actor] || null) : null;
			const npcColor = npc?.color || "#a8a29e";
			const npcName = npc?.name || beat.actor || "";

			if (beat.action) {
				const row = document.createElement("p");
				row.className = "text-sm italic";
				row.style.color = npcColor;
				row.style.opacity = "0.85";
				row.textContent = `*${beat.action}*`;
				panel.appendChild(row);
				return;
			}

			if (beat.text && beat.actor) {
				const row = document.createElement("p");
				row.className = "text-sm leading-relaxed";

				const nameSpan = document.createElement("span");
				nameSpan.className = "font-bold mr-1";
				nameSpan.style.color = npcColor;
				nameSpan.textContent = `${npcName}:`;

				const textSpan = document.createElement("span");
				textSpan.className = "text-stone-200";
				textSpan.textContent = ` "${beat.text}"`;

				row.appendChild(nameSpan);
				row.appendChild(textSpan);
				panel.appendChild(row);
				return;
			}

			if (beat.text) {
				const row = document.createElement("p");
				row.className = "text-sm italic text-stone-300 leading-relaxed";
				row.textContent = beat.text;
				panel.appendChild(row);
				return;
			}
		});

		container.appendChild(panel);
	},

	renderView(data, state) {
		this._installKbdListener();

		const loc = data.locations[state.location];
		const container = document.getElementById("ui-container");

		if (!loc || !container) return;

		container.innerHTML = "";

		const title = document.createElement("h2");
		title.className = "text-4xl font-bold text-white mb-2";
		title.textContent = loc.name || state.location;
		container.appendChild(title);

		if (Array.isArray(loc.dialogue) && loc.dialogue.length > 0) {
			this.renderDialoguePanel(loc.dialogue, data.npcs, container);
		} else {
			const desc = document.createElement("p");
			desc.className = "text-slate-300 text-lg mb-8 italic";
			desc.textContent = loc.description || "";
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
			container.appendChild(ShopRenderer.createShopSection(state.activeShop, data));
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

		this._assignKbdBadges(container);

		PlayerPanelRenderer.renderStats(state.entities.player);
		PlayerPanelRenderer.renderTraits(state.entities.player, data);
		PlayerPanelRenderer.renderEquipment(state.entities.player, data);
		PlayerPanelRenderer.renderInventory(state.entities.player, data);
	},

	_assignKbdBadges(container) {
		const buttons = Array.from(container.querySelectorAll("button.kbd-choice:not([disabled])"));
		buttons.forEach((btn, i) => {
			const n = i + 1;
			if (n > 9) return;

			const existing = btn.querySelector(".kbd-badge");
			if (!existing) {
				const badge = document.createElement("span");
				badge.className = "kbd-badge text-xs font-mono opacity-60 bg-slate-700 rounded px-1 mr-1";
				badge.textContent = `[${n}]`;
				btn.insertBefore(badge, btn.firstChild);
			}
		});
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

		list.forEach((entry) => {
			const id = typeof entry === "object" ? entry.id : entry;
			const item = sourceData[id];
			if (!item) return;

			// Connection objects carry their own conditions/hidden_when_locked; fall back to the target item's.
			const condSource = typeof entry === "object" ? entry : item;
			const meetsConditions = Engine.meetsConditions(condSource);

			if (!meetsConditions && (hideIfLocked || condSource.hidden_when_locked)) return;

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
			button.className = "kbd-choice px-6 py-3 flex items-center gap-2 rounded-xl text-base transition-all border shadow-sm";

			const setButtonState = () => {
				const inputIsValid = inputDefs.length === 0 || Engine.validateEventInputs(item, collectPayload()).valid;
				const isDisabled = !meetsConditions || !inputIsValid;

				button.disabled = isDisabled;
				button.className = "kbd-choice px-6 py-3 flex items-center gap-2 rounded-xl text-base transition-all border shadow-sm";

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
			text.textContent = (typeof entry === "object" && entry.label) || item.name || id;

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
