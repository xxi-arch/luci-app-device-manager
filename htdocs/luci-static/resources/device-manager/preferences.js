'use strict';
'require baseclass';

const STORAGE_KEY = 'luci-device-manager-view';
const DEFAULT_STATE = { tab: 'all', group: 'all' };

// Storage access and JSON parsing can throw synchronously; isolate them in promises.
return baseclass.extend({
	load: function() {
		return Promise.resolve().then(() => window.localStorage.getItem(STORAGE_KEY)).then(raw => {
			const state = raw ? JSON.parse(raw) : null;
			return state && typeof state === 'object' ? {
				tab: typeof state.tab === 'string' ? state.tab : 'all',
				group: typeof state.group === 'string' ? state.group : 'all'
			} : Object.assign({}, DEFAULT_STATE);
		}).catch(() => Object.assign({}, DEFAULT_STATE));
	},
	save: function(tab, group) {
		return Promise.resolve().then(() => window.localStorage.setItem(STORAGE_KEY,
			JSON.stringify({ tab: tab || 'all', group: group || 'all' }))).catch(() => {});
	}
});
