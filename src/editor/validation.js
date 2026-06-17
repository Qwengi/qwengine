/**
 * Post-save validation via DataRegistry.
 *
 * Purpose:
 * Runs DataRegistry.compile() against the current rawData and captures any
 * warnings or errors it emits. Results are rendered into the validation panel
 * so the author sees broken references immediately after saving.
 *
 * Important APIs:
 * - EditorValidation.validate() → [{ level, message }]
 * - EditorValidation.render(warnings)
 */
const EditorValidation = {
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
			const row = document.createElement("div");
			row.className = `text-xs mb-2 p-2 rounded border ${
				level === "error"
					? "bg-red-950/40 border-red-800/50 text-red-300"
					: "bg-amber-950/40 border-amber-800/50 text-amber-300"
			}`;
			row.textContent = message;
			container.appendChild(row);
		});
	},
};
