/**
 * Cross-window editor sync.
 *
 * Both the primary editor window and any pop-out step-editor windows route
 * events through this module. Each window installs a snapshot serve handler
 * (the primary returns its EditorState.rawData; pop-outs decline) and adds
 * subscribers that react to incoming events.
 *
 * Wire format (payload of editor:event):
 *   { type: "step:patch",   sceneId, stepId, step }
 *   { type: "step:rename",  sceneId, oldId, newId }
 *   { type: "step:delete",  sceneId, stepId }
 *   { type: "scene:meta",   sceneId, start }
 *   { type: "scene:reload", sceneId, scene }
 *   { type: "popout:opened", sceneId, stepId }
 *   { type: "popout:closed", sceneId, stepId }
 */
const EditorSync = {
	_subs: new Set(),
	_offEvent: null,
	_offSnapshot: null,

	init({ provideSnapshot }) {
		if (!window.api?.onEditorEvent) {
			console.warn("[EditorSync] window.api unavailable");
			return;
		}

		this._offEvent = window.api.onEditorEvent((payload) => {
			this._subs.forEach((fn) => {
				try { fn(payload); } catch (err) { console.error("[EditorSync] subscriber threw:", err); }
			});
		});

		if (provideSnapshot && window.api.onSnapshotRequest) {
			this._offSnapshot = window.api.onSnapshotRequest(provideSnapshot);
		}
	},

	subscribe(fn) {
		this._subs.add(fn);
		return () => this._subs.delete(fn);
	},

	emit(payload) {
		if (!window.api?.broadcastEditorEvent) return;
		window.api.broadcastEditorEvent(payload);
	},

	async requestSnapshot() {
		if (!window.api?.requestEditorSnapshot) throw new Error("API unavailable");
		return window.api.requestEditorSnapshot();
	},

	openStepEditor(sceneId, stepId) {
		if (!window.api?.openStepEditor) return Promise.reject(new Error("API unavailable"));
		return window.api.openStepEditor(sceneId, stepId);
	},

	launchGame(sceneId, stepId) {
		if (!window.api?.launchGameAtScene) return Promise.reject(new Error("API unavailable"));
		return window.api.launchGameAtScene(sceneId, stepId);
	},
};
