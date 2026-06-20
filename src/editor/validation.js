/**
 * Post-save validation via DataRegistry.
 *
 * Purpose:
 * Runs DataRegistry.compile() against the current rawData and captures any
 * warnings or errors it emits. Results are rendered into the validation panel.
 * Triggered live (debounced) by EditorState.markDirty so authors see broken
 * references as they edit, not just on save.
 *
 * Important APIs:
 * - EditorValidation.validate() → [{ level, message }]
 * - EditorValidation.render(warnings)
 * - EditorValidation.scheduleRevalidate() — debounced re-run + render
 */
const EditorValidation = {
	_timer: null,

	validate() {
		const warnings = [];
		const originalWarn = console.warn;
		const originalError = console.error;

		console.warn = (msg, ...args) => warnings.push({ level: "warn", message: String(msg) });
		console.error = (msg, ...args) => warnings.push({ level: "error", message: String(msg) });

		try {
			DataRegistry.compile(structuredClone(EditorState.rawData));
		} catch (err) {
			warnings.push({ level: "error", message: err.message });
		} finally {
			console.warn = originalWarn;
			console.error = originalError;
		}

		return warnings;
	},

	scheduleRevalidate() {
		if (this._timer) clearTimeout(this._timer);
		this._timer = setTimeout(() => {
			this._timer = null;
			try {
				this.render(this.validate());
			} catch (err) {
				console.error("[EditorValidation] revalidate failed:", err);
			}
		}, 500);
	},

	render(warnings) {
		const container = document.getElementById("validation-panel");
		if (!container) return;
		container.innerHTML = "";

		const title = document.createElement("h3");
		title.className = "text-xs text-slate-500 uppercase tracking-widest font-bold mb-3 pb-2 border-b border-slate-800";
		title.textContent = "Validation";
		container.appendChild(title);

		if (warnings.length === 0) {
			const ok = document.createElement("p");
			ok.className = "text-xs text-emerald-500 italic";
			ok.textContent = "No issues found.";
			container.appendChild(ok);
			return;
		}

		warnings.forEach(({ level, message }) => {
			const target = this._parseTarget(message);
			const row = document.createElement("div");
			const base = level === "error"
				? "bg-red-950/40 border-red-800/50 text-red-300"
				: "bg-amber-950/40 border-amber-800/50 text-amber-300";
			row.className = `text-xs mb-2 p-2 rounded border ${base}${target ? " cursor-pointer hover:brightness-125" : ""}`;
			row.textContent = message;
			if (target) {
				row.title = `Click to jump to ${target.panel}${target.sceneId ? `/${target.sceneId}` : ""}${target.stepId ? `/${target.stepId}` : ""}`;
				row.onclick = () => this._jumpTo(target);
			}
			container.appendChild(row);
		});
	},

	/**
	 * Heuristically extract a jump target from a validation message.
	 * DataRegistry currently emits "[Registry] Scene '<id>' ..." patterns,
	 * sometimes including step and choice IDs.
	 */
	_parseTarget(msg) {
		const sceneMatch = msg.match(/Scene '([^']+)'/);
		if (sceneMatch) {
			const stepMatch = msg.match(/step '([^']+)'/i);
			return {
				panel: "scenes",
				sceneId: sceneMatch[1],
				stepId: stepMatch ? stepMatch[1] : null,
			};
		}
		// Map other entity-type mentions to their panels (future warnings).
		const m = (re, panel) => {
			const hit = msg.match(re);
			return hit ? { panel, id: hit[1] } : null;
		};
		return (
			m(/Event '([^']+)'/, "events") ||
			m(/Location '([^']+)'/, "locations") ||
			m(/Item '([^']+)'/, "items") ||
			m(/NPC '([^']+)'/, "npcs") ||
			null
		);
	},

	_jumpTo(target) {
		const content = document.getElementById("editor-content");
		if (!content || typeof EditorNav === "undefined") return;
		if (target.panel === "scenes" && target.sceneId && typeof ScenesPanel !== "undefined") {
			ScenesPanel._selectedSceneId = target.sceneId;
			ScenesPanel._selectedStepId = target.stepId || null;
		}
		EditorNav.activate(target.panel, content);
	},
};
