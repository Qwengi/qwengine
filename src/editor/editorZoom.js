/**
 * Editor font-scale control.
 *
 * Tailwind classes use rem-based sizing, so changing document.documentElement's
 * font-size proportionally rescales the entire editor (including the pop-out).
 * Persists between sessions in localStorage. Bound to A− / A+ buttons and
 * Cmd+= / Cmd+- / Cmd+0.
 */
const EditorZoom = {
	STORAGE_KEY: "editor.fontScale",
	MIN: 0.75,
	MAX: 1.6,
	STEP: 0.1,
	scale: 1,

	init() {
		const stored = parseFloat(localStorage.getItem(this.STORAGE_KEY));
		this.scale = Number.isFinite(stored) ? this._clamp(stored) : 1;
		this._apply();

		const decBtn = document.getElementById("editor-zoom-out");
		const incBtn = document.getElementById("editor-zoom-in");
		const labelBtn = document.getElementById("editor-zoom-label");
		if (decBtn) decBtn.onclick = () => this.adjust(-this.STEP);
		if (incBtn) incBtn.onclick = () => this.adjust(this.STEP);
		if (labelBtn) labelBtn.onclick = () => this.set(1);

		document.addEventListener("keydown", (e) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			// "+" on US keyboards arrives as "=" without shift; "+" with shift.
			if (e.key === "=" || e.key === "+") { e.preventDefault(); this.adjust(this.STEP); }
			else if (e.key === "-" || e.key === "_") { e.preventDefault(); this.adjust(-this.STEP); }
			else if (e.key === "0") { e.preventDefault(); this.set(1); }
		});
	},

	adjust(delta) { this.set(this.scale + delta); },

	set(scale) {
		this.scale = this._clamp(scale);
		this._apply();
		try { localStorage.setItem(this.STORAGE_KEY, String(this.scale)); } catch (_) { /* private mode */ }
	},

	_clamp(v) {
		return Math.max(this.MIN, Math.min(this.MAX, Math.round(v * 100) / 100));
	},

	_apply() {
		document.documentElement.style.fontSize = `${16 * this.scale}px`;
		const label = document.getElementById("editor-zoom-label");
		if (label) label.textContent = `${Math.round(this.scale * 100)}%`;
	},
};
