/**
 * Custom SVG scene graph renderer.
 *
 * Purpose:
 * Renders a scene's steps as a directed node graph with BFS auto-layout.
 * Supports pan (mouse drag) and zoom (scroll wheel). A Reset View button
 * restores the default transform. Cleans up global event listeners on each
 * re-render via the _cleanup ref to prevent listener accumulation.
 *
 * Important APIs:
 * - SVGGraph.render(container, steps, startStep, onSelectStep)
 */
const SVGGraph = {
	NODE_W: 180,
	NODE_H: 60,
	H_GAP: 60,
	V_GAP: 80,

	_cleanup: null,

	render(container, steps, startStep, onSelectStep) {
		// Remove stale global listeners from any previous render before adding new ones
		if (this._cleanup) {
			window.removeEventListener("mousemove", this._cleanup.onMouseMove);
			window.removeEventListener("mouseup", this._cleanup.onMouseUp);
			this._cleanup = null;
		}

		container.innerHTML = "";

		const { layers, positions } = this._layout(steps, startStep);
		const edges = this._buildEdges(steps, positions);

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.style.cursor = "grab";
		svg.style.userSelect = "none";

		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
		marker.setAttribute("id", "arrow");
		marker.setAttribute("markerWidth", "8");
		marker.setAttribute("markerHeight", "8");
		marker.setAttribute("refX", "6");
		marker.setAttribute("refY", "3");
		marker.setAttribute("orient", "auto");
		const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
		arrowPath.setAttribute("d", "M0,0 L0,6 L8,3 z");
		arrowPath.setAttribute("fill", "#475569");
		marker.appendChild(arrowPath);
		defs.appendChild(marker);
		svg.appendChild(defs);

		const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
		g.setAttribute("transform", "translate(40, 40)");
		svg.appendChild(g);

		// Pan + zoom
		let isPanning = false, startX = 0, startY = 0, tx = 40, ty = 40, scale = 1;

		svg.addEventListener("mousedown", (e) => {
			if (e.target === svg || e.target === g) {
				isPanning = true;
				startX = e.clientX - tx;
				startY = e.clientY - ty;
				svg.style.cursor = "grabbing";
			}
		});

		const onMouseMove = (e) => {
			if (!isPanning) return;
			tx = e.clientX - startX;
			ty = e.clientY - startY;
			g.setAttribute("transform", `translate(${tx}, ${ty}) scale(${scale})`);
		};
		const onMouseUp = () => { isPanning = false; svg.style.cursor = "grab"; };

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		this._cleanup = { onMouseMove, onMouseUp };

		svg.addEventListener("wheel", (e) => {
			e.preventDefault();
			scale = Math.max(0.4, Math.min(2.0, scale - e.deltaY * 0.001));
			g.setAttribute("transform", `translate(${tx}, ${ty}) scale(${scale})`);
		}, { passive: false });

		// Edges
		edges.forEach(({ fromId, toId, label }) => {
			const from = positions[fromId];
			const to = positions[toId];
			if (!from || !to) return;

			const x1 = from.x + this.NODE_W / 2;
			const y1 = from.y + this.NODE_H;
			const x2 = to.x + this.NODE_W / 2;
			const y2 = to.y;
			const cy = (y1 + y2) / 2;

			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`);
			path.setAttribute("stroke", "#475569");
			path.setAttribute("stroke-width", "1.5");
			path.setAttribute("fill", "none");
			path.setAttribute("marker-end", "url(#arrow)");
			g.appendChild(path);

			if (label) {
				const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
				text.setAttribute("x", (x1 + x2) / 2);
				text.setAttribute("y", cy - 4);
				text.setAttribute("text-anchor", "middle");
				text.setAttribute("fill", "#64748b");
				text.setAttribute("font-size", "9");
				text.textContent = label.length > 20 ? label.slice(0, 18) + "…" : label;
				g.appendChild(text);
			}
		});

		// Nodes
		Object.entries(positions).forEach(([stepId, pos]) => {
			const step = steps[stepId];
			const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
			group.style.cursor = "pointer";

			const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			rect.setAttribute("x", pos.x);
			rect.setAttribute("y", pos.y);
			rect.setAttribute("width", this.NODE_W);
			rect.setAttribute("height", this.NODE_H);
			rect.setAttribute("rx", "8");
			rect.setAttribute("fill", stepId === startStep ? "#312e81" : "#1e293b");
			rect.setAttribute("stroke", stepId === startStep ? "#818cf8" : "#334155");
			rect.setAttribute("stroke-width", "1.5");

			const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
			titleText.setAttribute("x", pos.x + this.NODE_W / 2);
			titleText.setAttribute("y", pos.y + 22);
			titleText.setAttribute("text-anchor", "middle");
			titleText.setAttribute("fill", "#e2e8f0");
			titleText.setAttribute("font-size", "11");
			titleText.setAttribute("font-weight", "bold");
			titleText.textContent = stepId;

			const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
			subText.setAttribute("x", pos.x + this.NODE_W / 2);
			subText.setAttribute("y", pos.y + 40);
			subText.setAttribute("text-anchor", "middle");
			subText.setAttribute("fill", "#64748b");
			subText.setAttribute("font-size", "9");
			const name = step?.name || "";
			subText.textContent = name.length > 22 ? name.slice(0, 20) + "…" : name;

			group.appendChild(rect);
			group.appendChild(titleText);
			group.appendChild(subText);

			group.addEventListener("click", (e) => {
				e.stopPropagation();
				// Highlight selected node
				document.querySelectorAll(".svg-node-selected").forEach((r) => {
					r.setAttribute("stroke", r.dataset.defaultStroke || "#334155");
					r.classList.remove("svg-node-selected");
				});
				rect.setAttribute("stroke", "#a5b4fc");
				rect.classList.add("svg-node-selected");
				rect.dataset.defaultStroke = stepId === startStep ? "#818cf8" : "#334155";
				onSelectStep(stepId);
			});

			g.appendChild(group);
		});

		container.style.position = "relative";
		container.appendChild(svg);

		const resetBtn = document.createElement("button");
		resetBtn.className = "absolute top-2 right-2 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs z-10";
		resetBtn.textContent = "Reset View";
		resetBtn.onclick = () => {
			tx = 40; ty = 40; scale = 1;
			g.setAttribute("transform", `translate(${tx}, ${ty}) scale(${scale})`);
		};
		container.appendChild(resetBtn);
	},

	_layout(steps, startStep) {
		const layers = {};
		const visited = new Set();
		const queue = [[startStep, 0]];

		while (queue.length > 0) {
			const [stepId, depth] = queue.shift();
			if (visited.has(stepId) || !steps[stepId]) continue;
			visited.add(stepId);
			if (!layers[depth]) layers[depth] = [];
			layers[depth].push(stepId);

			const choices = steps[stepId].choices || [];
			const choiceArr = Array.isArray(choices) ? choices : Object.entries(choices).map(([id, c]) => ({ id, ...c }));
			choiceArr.forEach((c) => {
				const next = c.next;
				if (next && !visited.has(next)) queue.push([next, depth + 1]);
			});
		}

		// Also include any steps not reachable from start
		Object.keys(steps).forEach((id) => {
			if (!visited.has(id)) {
				const depth = Object.keys(layers).length;
				if (!layers[depth]) layers[depth] = [];
				layers[depth].push(id);
			}
		});

		const positions = {};
		Object.entries(layers).forEach(([depth, ids]) => {
			const y = Number(depth) * (this.NODE_H + this.V_GAP);
			const totalWidth = ids.length * this.NODE_W + (ids.length - 1) * this.H_GAP;
			const startX = 0;
			ids.forEach((id, i) => {
				positions[id] = { x: startX + i * (this.NODE_W + this.H_GAP), y };
			});
		});

		return { layers, positions };
	},

	_buildEdges(steps, positions) {
		const edges = [];
		Object.entries(steps).forEach(([stepId, step]) => {
			if (!step) return;
			const choices = step.choices || [];
			const choiceArr = Array.isArray(choices) ? choices : Object.entries(choices).map(([id, c]) => ({ id, ...c }));
			choiceArr.forEach((c) => {
				if (c.next) edges.push({ fromId: stepId, toId: c.next, label: c.text || c.name || c.id || "" });
			});
			if (step.proceed?.next || step.proceed?.teleport) {
				const target = step.proceed.next || step.proceed.teleport;
				if (positions[target]) edges.push({ fromId: stepId, toId: target, label: step.proceed.text || "proceed" });
			}
		});
		return edges;
	},
};
