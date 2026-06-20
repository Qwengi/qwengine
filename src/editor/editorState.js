/**
 * Editor working state and persistence.
 *
 * Holds the raw data loaded from disk as the editor's single source of truth.
 * Tracks which files have unsaved changes, which steps are currently being
 * edited in pop-out windows, and dispatches remote sync events received via
 * EditorSync so panels can re-render.
 *
 * Important APIs:
 * - EditorState.load()                          — loads rawData via DataLoader
 * - EditorState.save(fileType)                  — writes one file back to disk
 * - EditorState.markDirty(fileType)             — flags a file as having unsaved changes
 * - EditorState.applyRemoteEvent(payload)       — apply a sync event from another window
 * - EditorState.onScenesChanged(handler)        — subscribe to scene-state changes
 * - EditorState.isStepLocked(sceneId, stepId)   — true when a pop-out edits this step
 */
const EditorState = {
	rawData: null,
	dirty: new Set(),
	popoutLocks: new Map(),
	_sceneListeners: new Set(),
	_history: [],
	_historyIndex: -1,
	_snapshotTimer: null,
	_historyLimit: 50,

	async load() {
		// Editor wants raw relative paths so it can save them back unchanged.
		// The game uses default processPaths:true to get file:// URLs for rendering.
		this.rawData = await DataLoader.loadRaw({ processPaths: false });
		this._history = [this._snapshotData()];
		this._historyIndex = 0;
	},

	async save(fileType) {
		const fileMap = {
			events: this.rawData.base.events,
			locations: this.rawData.base.locations,
			scenes: this.rawData.base.scenes,
			npcs: this.rawData.base.npcs,
			items: this.rawData.base.items,
			traits: this.rawData.base.traits,
			stats: { entities: this.rawData.base.entities },
			config: this.rawData.storyConfig,
		};

		const content = fileMap[fileType];
		if (content === undefined) {
			console.error(`[EditorState] Unknown fileType: ${fileType}`);
			return;
		}

		await window.api.writeDataFile(fileType, content);
		this.dirty.delete(fileType);
		if (typeof EditorNav !== "undefined") EditorNav.updateDirtyIndicators();
	},

	async saveAll() {
		const dirtyTypes = Array.from(this.dirty);
		if (dirtyTypes.length === 0) return { saved: [], errors: [] };

		const saved = [];
		const errors = [];
		for (const fileType of dirtyTypes) {
			try {
				await this.save(fileType);
				saved.push(fileType);
			} catch (err) {
				errors.push({ fileType, message: err.message });
				console.error(`[EditorState] saveAll: failed to save ${fileType}:`, err);
			}
		}
		return { saved, errors };
	},

	markDirty(fileType) {
		this.dirty.add(fileType);
		if (typeof EditorNav !== "undefined") EditorNav.updateDirtyIndicators();
		if (typeof EditorValidation !== "undefined") EditorValidation.scheduleRevalidate();
		this._scheduleSnapshot();
	},

	_snapshotData() {
		return {
			rawData: structuredClone(this.rawData),
			dirty: new Set(this.dirty),
		};
	},

	_scheduleSnapshot() {
		if (this._snapshotTimer) clearTimeout(this._snapshotTimer);
		this._snapshotTimer = setTimeout(() => {
			this._snapshotTimer = null;
			this._commitSnapshot();
		}, 600);
	},

	_commitSnapshot() {
		// Truncate the redo branch — new edit invalidates any redo history.
		this._history.length = this._historyIndex + 1;
		this._history.push(this._snapshotData());
		this._historyIndex++;
		if (this._history.length > this._historyLimit) {
			this._history.shift();
			this._historyIndex--;
		}
	},

	canUndo() { return this._historyIndex > 0; },
	canRedo() { return this._historyIndex < this._history.length - 1; },

	_restore(snapshot) {
		this.rawData = structuredClone(snapshot.rawData);
		this.dirty = new Set(snapshot.dirty);
	},

	undo() {
		// Flush any pending snapshot so the current state is captured before stepping back.
		if (this._snapshotTimer) {
			clearTimeout(this._snapshotTimer);
			this._snapshotTimer = null;
			this._commitSnapshot();
		}
		if (!this.canUndo()) return false;
		this._historyIndex--;
		this._restore(this._history[this._historyIndex]);
		if (typeof EditorNav !== "undefined") EditorNav.updateDirtyIndicators();
		if (typeof EditorValidation !== "undefined") EditorValidation.scheduleRevalidate();
		return true;
	},

	redo() {
		if (!this.canRedo()) return false;
		this._historyIndex++;
		this._restore(this._history[this._historyIndex]);
		if (typeof EditorNav !== "undefined") EditorNav.updateDirtyIndicators();
		if (typeof EditorValidation !== "undefined") EditorValidation.scheduleRevalidate();
		return true;
	},

	allLocationIds() {
		return Object.keys(this.rawData?.base?.locations || {});
	},

	allStatIds(entityId = "player") {
		return Object.keys(this.rawData?.base?.entities?.[entityId]?.stats || {});
	},

	allStatIdsAcrossEntities() {
		const all = new Set();
		const entities = this.rawData?.base?.entities || {};
		for (const entityId of Object.keys(entities)) {
			for (const statId of Object.keys(entities[entityId]?.stats || {})) all.add(statId);
		}
		return Array.from(all).sort();
	},

	allItemIds() {
		return Object.keys(this.rawData?.base?.items || {});
	},

	allTraitIds() {
		return Object.keys(this.rawData?.base?.traits || {});
	},

	allNpcIds() {
		return Object.keys(this.rawData?.base?.npcs || {});
	},

	onScenesChanged(handler) {
		this._sceneListeners.add(handler);
		return () => this._sceneListeners.delete(handler);
	},

	_notifyScenes(payload) {
		this._sceneListeners.forEach((fn) => {
			try { fn(payload); } catch (err) { console.error("[EditorState] scene listener threw:", err); }
		});
	},

	isStepLocked(sceneId, stepId) {
		return this.popoutLocks.get(sceneId)?.has(stepId) || false;
	},

	_setLock(sceneId, stepId, locked) {
		if (!this.popoutLocks.has(sceneId)) this.popoutLocks.set(sceneId, new Set());
		const set = this.popoutLocks.get(sceneId);
		if (locked) set.add(stepId);
		else set.delete(stepId);
	},

	applyRemoteEvent(payload) {
		if (!payload || !this.rawData) return;
		const scenes = this.rawData.base.scenes;

		switch (payload.type) {
			case "step:patch": {
				const scene = scenes[payload.sceneId];
				if (!scene?.steps) return;
				const wasNew = !scene.steps[payload.stepId];
				scene.steps[payload.stepId] = payload.step;
				this.markDirty("scenes");
				this._notifyScenes({ ...payload, _wasNew: wasNew });
				break;
			}
			case "step:rename": {
				const scene = scenes[payload.sceneId];
				if (!scene?.steps?.[payload.oldId]) return;
				scene.steps[payload.newId] = scene.steps[payload.oldId];
				delete scene.steps[payload.oldId];
				if (scene.start === payload.oldId) scene.start = payload.newId;
				this.markDirty("scenes");
				this._notifyScenes(payload);
				break;
			}
			case "step:delete": {
				const scene = scenes[payload.sceneId];
				if (!scene?.steps) return;
				delete scene.steps[payload.stepId];
				this.markDirty("scenes");
				this._notifyScenes(payload);
				break;
			}
			case "scene:meta": {
				const scene = scenes[payload.sceneId];
				if (!scene) return;
				if (payload.start !== undefined) scene.start = payload.start;
				this.markDirty("scenes");
				this._notifyScenes(payload);
				break;
			}
			case "scene:reload": {
				if (!payload.scene) return;
				scenes[payload.sceneId] = payload.scene;
				this.markDirty("scenes");
				this._notifyScenes(payload);
				break;
			}
			case "scene:add": {
				if (!payload.scene) return;
				scenes[payload.sceneId] = payload.scene;
				this.markDirty("scenes");
				this._notifyScenes(payload);
				break;
			}
			case "scene:delete": {
				if (!scenes[payload.sceneId]) return;
				delete scenes[payload.sceneId];
				this.markDirty("scenes");
				this._notifyScenes(payload);
				break;
			}
			case "scene:rename": {
				if (!scenes[payload.oldId] || scenes[payload.newId]) return;
				scenes[payload.newId] = scenes[payload.oldId];
				delete scenes[payload.oldId];
				this.markDirty("scenes");
				this._notifyScenes(payload);
				break;
			}
			case "popout:opened": {
				this._setLock(payload.sceneId, payload.stepId, true);
				this._notifyScenes(payload);
				break;
			}
			case "popout:closed": {
				this._setLock(payload.sceneId, payload.stepId, false);
				this._notifyScenes(payload);
				break;
			}
			default:
				break;
		}
	},
};
