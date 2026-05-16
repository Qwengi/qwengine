const DataLoader = {
	loadRaw: async function () {
		if (window.api) {
			return await window.api.loadRawData();
		}
		return null;
	},

	saveGame: async function (state, slot) {
		if (window.api) {
			return await window.api.saveGame(state, slot);
		}
		return false;
	},

	loadGame: async function (slot) {
		if (window.api) {
			return await window.api.loadGame(slot);
		}
		return null;
	},

	listSaves: async function () {
		if (window.api && window.api.listSaves) {
			return await window.api.listSaves();
		}
		return [];
	},
};
