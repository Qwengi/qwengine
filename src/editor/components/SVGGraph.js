/**
 * Custom SVG node-graph renderer.
 *
 * Two public APIs share the same underlying renderer:
 *   - SVGGraph.render(container, steps, startStepId, onSelectStep)
 *       Scene step flow (existing).
 *   - SVGGraph.renderMap(container, locations, startLocationId, onSelectLocation)
 *       Location/passage map. Edges are colored per conditioning state:
 *         blue (#60a5fa) for unconditioned passages,
 *         amber (#fbbf24) for conditioned passages.
 *       Bidirectional pairs (A↔B) render as two parallel lines so asymmetric
 *       conditioning is visible.
 *
 * Pan (mouse drag), zoom (scroll wheel), Reset View. Cleans up global listeners
 * on each re-render via the _cleanup ref.
 */
const SVGGraph = {
	NODE_W: 180,
	NODE_H: 60,
	H_GAP: 60,
	V_GAP: 80,

	// Edge color palette.
	EDGE_DEFAULT: "#475569",   // slate-600 — scene edges
	EDGE_OPEN: "#60a5fa",      // blue-400 — unconditioned map passages
	EDGE_LOCKED: "#fbbf24",    // amber-400 — conditioned map passages

	_cleanup: null,

	// --- Scene step graph -----------------------------------------------------

	render(container, steps, startStep, onSelectStep) {
		const nodes = {};
		Object.entries(steps).forEach(([id, step]) => {
			nodes[id] = { sublabel: step?.name || "" };
		});
		const edges = this._buildSceneEdges(steps);
		const adjacency = this._adjacencyFromEdges(edges, Object.keys(steps));
		const positions = this._layout(adjacency, Object.keys(steps), startStep);
		this._renderGraph(container, nodes, edges, positions, startStep, onSelectStep);
	},

	_buildSceneEdges(steps) {
		const edges = [];
		Object.entries(steps).forEach(([stepId, step]) => {
			if (!step) return;
			const choices = step.choices || [];
			const choiceArr = Array.isArray(choices) ? choices : Object.entries(choices).map(([id, c]) => ({ id, ...c }));
			choiceArr.forEach((c) => {
				if (c.next) edges.push({ fromId: stepId, toId: c.next, label: c.text || c.name || c.id || "", color: this.EDGE_DEFAULT });
			});
			if (step.proceed?.next || step.proceed?.teleport) {
				const target = step.proceed.next || step.proceed.teleport;
				if (steps[target]) edges.push({ fromId: stepId, toId: target, label: step.proceed.text || "proceed", color: this.EDGE_DEFAULT });
			}
		});
		return edges;
	},

	// --- Location/map graph ---------------------------------------------------

	renderMap(container, locations, startId, onSelectLocation) {
		const nodes = {};
		Object.entries(locations).forEach(([id, loc]) => {
			nodes[id] = { sublabel: loc?.name || "" };
		});
		const edges = this._buildMapEdges(locations);
		const adjacency = this._adjacencyFromEdges(edges, Object.keys(locations));
		const seedId = locations[startId] ? startId : Object.keys(locations)[0];
		const positions = this._layout(adjacency, Object.keys(locations), seedId);
		this._renderGraph(container, nodes, edges, positions, seedId, onSelectLocation);
	},

	_buildMapEdges(locations) {
		const edges = [];
		Object.entries(locations).forEach(([fromId, loc]) => {
			if (!loc) return;
			const conns = Array.isArray(loc.connections) ? loc.connections : [];
			conns.forEach((conn) => {
				const toId = typeof conn === "string" ? conn : conn?.id;
				if (!toId || !locations[toId]) return;
				const conditioned = typeof conn === "object"
					&& conn.conditions
					&& Object.keys(conn.conditions).length > 0;
				const label = typeof conn === "object" ? (conn.label || "") : "";
				edges.push({
					fromId,
					toId,
					label,
					color: conditioned ? this.EDGE_LOCKED : this.EDGE_OPEN,
					conditioned: !!conditioned,
				});
			});
		});
		return edges;
	},

	// --- Shared layout + render -----------------------------------------------

	/** Adjacency map fromId -> [toId,...] used for BFS layout. */
	_adjacencyFromEdges(edges, allIds) {
		const adj = {};
		allIds.forEach((id) => { adj[id] = []; });
		edges.forEach(({ fromId, toId }) => {
			if (adj[fromId] && !adj[fromId].includes(toId)) adj[fromId].push(toId);
		});
		return adj;
	},

	/** BFS from startId; orphan ids get appended on a fresh layer. */
	_layout(adjacency, allIds, startId) {
		const layers = {};
		const visited = new Set();
		const queue = startId ? [[startId, 0]] : [];

		while (queue.length > 0) {
			const [id, depth] = queue.shift();
			if (visited.has(id) || !adjacency[id]) continue;
			visited.add(id);
			if (!layers[depth]) layers[depth] = [];
			layers[depth].push(id);
			(adjacency[id] || []).forEach((next) => {
				if (!visited.has(next)) queue.push([next, depth + 1]);
			});
		}
		allIds.forEach((id) => {
			if (!visited.has(id)) {
				const depth = Object.keys(layers).length;
				if (!layers[depth]) layers[depth] = [];
				layers[depth].push(id);
			}
		});

		const positions = {};
		Object.entries(layers).forEach(([depth, ids]) => {
			const y = Number(depth) * (this.NODE_H + this.V_GAP);
			ids.forEach((id, i) => {
				positions[id] = { x: i * (this.NODE_W + this.H_GAP), y };
			});
		});
		return positions;
	},

	/**
	 * Group edges so bidirectional pairs (A→B and B→A) render with a parallel
	 * perpendicular offset, while singletons render straight. Each item carries
	 * the offset to apply when drawing.
	 */
	_arrangeEdges(edges) {
		const seen = new Map();   // "from|to" -> index in edges
		edges.forEach((e, i) => seen.set(`${e.fromId}|${e.toId}`, i));

		const out = [];
		const handled = new Set();
		edges.forEach((e, i) => {
			if (handled.has(i)) return;
			const reverseIdx = seen.get(`${e.toId}|${e.fromId}`);
			if (reverseIdx !== undefined && reverseIdx !== i && !handled.has(reverseIdx)) {
				out.push({ ...e, offset: 6 });
				out.push({ ...edges[reverseIdx], offset: 6 });
				handled.add(i);
				handled.add(reverseIdx);
			} else {
				out.push({ ...e, offset: 0 });
				handled.add(i);
			}
		});
		return out;
	},

	_renderGraph(container, nodes, edges, positions, startId, onSelectNode) {
		// Remove stale global listeners from any previous render before adding new ones.
		if (this._cleanup) {
			window.removeEventListener("mousemove", this._cleanup.onMouseMove);
			window.removeEventListener("mouseup", this._cleanup.onMouseUp);
			this._cleanup = null;
		}

		container.innerHTML = "";

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.style.cursor = "grab";
		svg.style.userSelect = "none";

		// One arrowhead marker per distinct stroke color used (fill must match stroke).
		const colors = new Set(edges.map((e) => e.color || this.EDGE_DEFAULT));
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		const markerIdFor = (color) => `arrow-${color.replace(/[^a-z0-9]/gi, "")}`;
		colors.forEach((color) => {
			const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
			marker.setAttribute("id", markerIdFor(color));
			marker.setAttribute("markerWidth", "8");
			marker.setAttribute("markerHeight", "8");
			marker.setAttribute("refX", "6");
			marker.setAttribute("refY", "3");
			marker.setAttribute("orient", "auto");
			const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
			arrowPath.setAttribute("d", "M0,0 L0,6 L8,3 z");
			arrowPath.setAttribute("fill", color);
			marker.appendChild(arrowPath);
			defs.appendChild(marker);
		});
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

		// Edges (with bidirectional pair offsets).
		const arranged = this._arrangeEdges(edges);
		arranged.forEach((edge) => {
			const from = positions[edge.fromId];
			const to = positions[edge.toId];
			if (!from || !to) return;

			const x1c = from.x + this.NODE_W / 2;
			const y1c = from.y + this.NODE_H;
			const x2c = to.x + this.NODE_W / 2;
			const y2c = to.y;

			// Perpendicular offset for parallel bidirectional pairs.
			let x1 = x1c, y1 = y1c, x2 = x2c, y2 = y2c;
			if (edge.offset) {
				const dx = x2c - x1c, dy = y2c - y1c;
				const len = Math.max(1, Math.hypot(dx, dy));
				const px = -dy / len * edge.offset;
				const py = dx / len * edge.offset;
				x1 += px; y1 += py; x2 += px; y2 += py;
			}
			const cy = (y1 + y2) / 2;

			const color = edge.color || this.EDGE_DEFAULT;
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`);
			path.setAttribute("stroke", color);
			path.setAttribute("stroke-width", "1.8");
			path.setAttribute("fill", "none");
			path.setAttribute("marker-end", `url(#${markerIdFor(color)})`);
			g.appendChild(path);

			if (edge.label) {
				const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
				text.setAttribute("x", (x1 + x2) / 2);
				text.setAttribute("y", cy - 4);
				text.setAttribute("text-anchor", "middle");
				text.setAttribute("fill", "#64748b");
				text.setAttribute("font-size", "9");
				text.textContent = edge.label.length > 20 ? edge.label.slice(0, 18) + "…" : edge.label;
				g.appendChild(text);
			}
		});

		// Nodes
		Object.entries(positions).forEach(([id, pos]) => {
			const meta = nodes[id] || {};
			const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
			group.style.cursor = "pointer";

			const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			rect.setAttribute("x", pos.x);
			rect.setAttribute("y", pos.y);
			rect.setAttribute("width", this.NODE_W);
			rect.setAttribute("height", this.NODE_H);
			rect.setAttribute("rx", "8");
			rect.setAttribute("fill", id === startId ? "#312e81" : "#1e293b");
			rect.setAttribute("stroke", id === startId ? "#818cf8" : "#334155");
			rect.setAttribute("stroke-width", "1.5");

			const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
			titleText.setAttribute("x", pos.x + this.NODE_W / 2);
			titleText.setAttribute("y", pos.y + 22);
			titleText.setAttribute("text-anchor", "middle");
			titleText.setAttribute("fill", "#e2e8f0");
			titleText.setAttribute("font-size", "11");
			titleText.setAttribute("font-weight", "bold");
			titleText.textContent = id;

			const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
			subText.setAttribute("x", pos.x + this.NODE_W / 2);
			subText.setAttribute("y", pos.y + 40);
			subText.setAttribute("text-anchor", "middle");
			subText.setAttribute("fill", "#64748b");
			subText.setAttribute("font-size", "9");
			const sub = meta.sublabel || "";
			subText.textContent = sub.length > 22 ? sub.slice(0, 20) + "…" : sub;

			group.appendChild(rect);
			group.appendChild(titleText);
			group.appendChild(subText);

			group.addEventListener("click", (e) => {
				e.stopPropagation();
				document.querySelectorAll(".svg-node-selected").forEach((r) => {
					r.setAttribute("stroke", r.dataset.defaultStroke || "#334155");
					r.classList.remove("svg-node-selected");
				});
				rect.setAttribute("stroke", "#a5b4fc");
				rect.classList.add("svg-node-selected");
				rect.dataset.defaultStroke = id === startId ? "#818cf8" : "#334155";
				if (onSelectNode) onSelectNode(id);
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
};
