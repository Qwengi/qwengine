/**
 * Editor working state and persistence.
 *
 * Purpose:
 * Holds the raw data loaded from disk as the editor's single source of truth.
 * Tracks which files have unsaved changes and serialises each back to its
 * corresponding data/*.json file on save.
 *
 * Important APIs:
 * - EditorState.load()              — loads rawData via DataLoader
 * - EditorState.save(fileType)      — writes one file back to disk
 * - EditorState.markDirty(fileType) — flags a file as having unsaved changes
 */
const EditorState = {
	rawData: null,
	dirty: new Set(),

	async load() {
		this.rawData = await DataLoader.loadRaw();
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
		EditorNav.updateDirtyIndicators();
	},

	markDirty(fileType) {
		this.dirty.add(fileType);
		EditorNav.updateDirtyIndicators();
	},

	allLocationIds() {
		return Object.keys(this.rawData?.base?.locations || {});
	},

	allStatIds(entityId = "player") {
		return Object.keys(this.rawData?.base?.entities?.[entityId]?.stats || {});
	},

	allItemIds() {
		return Object.keys(this.rawData?.base?.items || {});
	},

	allNpcIds() {
		return Object.keys(this.rawData?.base?.npcs || {});
	},
};
