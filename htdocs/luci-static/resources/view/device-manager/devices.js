'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require rpc';
'require network';
'require fs';

/* RPC declarations */
const callHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

const callDHCPLeases = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPLeases',
	expect: { '': {} }
});

const callUCICommit = rpc.declare({
	object: 'uci',
	method: 'commit',
	params: [ 'config' ]
});

const callOnlineStatus = rpc.declare({
	object: 'luci.device-manager',
	method: 'get_online_status',
	expect: { '': {} }
});

/**
 * Default built-in device groups.
 */
const DEFAULT_GROUPS = [
	{ id: 'smart_home', name: '智能家居' },
	{ id: 'phone',      name: '手机设备' },
	{ id: 'computer',   name: '电脑设备' },
	{ id: 'network',    name: '网络设备' },
	{ id: 'other',      name: '其他设备' }
];

const STORAGE_KEY = 'luci-device-manager-view';

/**
 * Normalize MAC address to uppercase colon-separated format (e.g. AA:BB:CC:11:22:33).
 * Returns null if invalid.
 */
function normalizeMac(mac) {
	if (!mac || typeof mac !== 'string')
		return null;
	const clean = mac.trim().toUpperCase().replace(/[:-]/g, '');
	if (clean.length !== 12 || !/^[0-9A-F]{12}$/.test(clean))
		return null;
	return clean.match(/.{2}/g).join(':');
}

/**
 * Generate a valid UCI section ID from a normalized MAC address.
 * Example: AA:BB:CC:11:22:33 -> dev_aabbcc112233
 */
function getSectionId(mac) {
	const clean = mac.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
	return 'dev_' + clean;
}

/**
 * Sanitize user input to remove harmful ASCII control characters while preserving UTF-8 strings.
 */
function sanitizeInput(str) {
	if (str == null)
		return '';
	return String(str).trim().replace(/[\r\n\t\0]/g, ' ');
}

/**
 * Load tab & group view preferences safely from browser localStorage.
 */
function loadViewState() {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				return {
					tab: typeof parsed.tab === 'string' ? parsed.tab : 'all',
					group: typeof parsed.group === 'string' ? parsed.group : 'all'
				};
			}
		}
	} catch (e) {
		/* Ignore private browsing quota or parsing exceptions */
	}
	return { tab: 'all', group: 'all' };
}

/**
 * Save tab & group view preferences safely to browser localStorage.
 */
function saveViewState(tab, group) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
			tab: tab || 'all',
			group: group || 'all'
		}));
	} catch (e) {
		/* Ignore exceptions */
	}
}

/**
 * Query active Wi-Fi associated station MACs via LuCI network library.
 */
function getWifiAssocList() {
	return network.getWifiNetworks().then(function(networks) {
		const tasks = [];
		for (let i = 0; i < networks.length; i++) {
			tasks.push(networks[i].getAssocList().catch(function() { return []; }));
		}
		return Promise.all(tasks).then(function(results) {
			const stations = [];
			for (let i = 0; i < results.length; i++) {
				if (Array.isArray(results[i])) {
					for (let j = 0; j < results[i].length; j++) {
						if (results[i][j] && results[i][j].mac)
							stations.push(results[i][j].mac);
					}
				}
			}
			return stations;
		});
	}).catch(function() {
		return [];
	});
}

/**
 * Read /proc/net/arp as fallback for ARP entry information.
 */
function getArpTable() {
	const readFn = (fs && (fs.read || fs.read_file));
	if (typeof readFn !== 'function')
		return Promise.resolve([]);

	return readFn.call(fs, '/proc/net/arp').then(function(content) {
		const entries = [];
		const raw = (typeof content === 'string') ? content : (content && content.data ? content.data : '');
		if (!raw) return entries;
		const lines = raw.trim().split('\n');
		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].trim().split(/\s+/);
			if (parts.length >= 6) {
				entries.push({
					ip: parts[0],
					flags: parts[2],
					mac: parts[3],
					dev: parts[5]
				});
			}
		}
		return entries;
	}).catch(function() {
		return [];
	});
}

return view.extend({
	devices: [],
	groups: [],
	activeTab: 'all',     // 'all' | 'online' | 'offline' | 'unknown'
	activeGroup: 'all',   // 'all' | 'ungrouped' | <group_id>
	filterText: '',

	tableBodyNode: null,
	tabMenuNode: null,
	groupSelectNode: null,
	statsNode: null,

	load: function() {
		return Promise.all([
			L.resolveDefault(network.getHostHints(), null),
			L.resolveDefault(callHostHints(), {}),
			L.resolveDefault(callDHCPLeases(), {}),
			L.resolveDefault(callOnlineStatus(), {}),
			getWifiAssocList(),
			getArpTable(),
			L.resolveDefault(uci.load('device_manager'), null)
		]);
	},

	/**
	 * Parse configured groups from UCI /etc/config/device_manager.
	 * Falls back to DEFAULT_GROUPS if none configured.
	 */
	parseGroups: function() {
		const groups = [];
		const seenIds = new Set();
		const sections = uci.sections('device_manager', 'group') || [];

		for (let i = 0; i < sections.length; i++) {
			const sec = sections[i];
			const id = sec['.name'];
			const name = (sec.name || id).trim();
			groups.push({ id: id, name: name });
			seenIds.add(id);
		}

		if (groups.length === 0) {
			for (let i = 0; i < DEFAULT_GROUPS.length; i++) {
				groups.push({ id: DEFAULT_GROUPS[i].id, name: DEFAULT_GROUPS[i].name });
			}
		}

		return groups;
	},

	getGroupById: function(groupId) {
		if (!groupId || groupId === 'ungrouped')
			return null;
		for (let i = 0; i < this.groups.length; i++) {
			if (this.groups[i].id === groupId)
				return this.groups[i];
		}
		return null;
	},

	getGroupName: function(groupId) {
		const g = this.getGroupById(groupId);
		return g ? g.name : _('未分组');
	},

	/**
	 * Parse, deduplicate, merge devices and determine online status.
	 */
	parseDevices: function(hostHintsObj, rawHints, dhcpLeases, onlineStatusData, wifiStations, arpEntries) {
		const self = this;
		const devicesMap = new Map();

		// Helper to get or create entry by MAC
		const getEntry = function(mac) {
			const normMac = normalizeMac(mac);
			if (!normMac) return null;
			if (!devicesMap.has(normMac)) {
				devicesMap.set(normMac, {
					mac: normMac,
					hostname: '',
					ipv4: '',
					ipv6: '',
					customName: '',
					remark: '',
					group: 'ungrouped',
					sid: null,
					isSaved: false,
					isDiscovered: false,
					status: 'unknown',
					statusDetail: ''
				});
			}
			return devicesMap.get(normMac);
		};

		// 1. Host Hints instance
		if (hostHintsObj && hostHintsObj.hosts) {
			for (const rawMac in hostHintsObj.hosts) {
				const entry = getEntry(rawMac);
				if (!entry) continue;
				entry.isDiscovered = true;
				const h = hostHintsObj.hosts[rawMac];
				if (h.name && !entry.hostname) entry.hostname = h.name;
				const ipv4 = L.toArray(h.ipaddrs || h.ipv4)[0];
				if (ipv4 && !entry.ipv4) entry.ipv4 = ipv4;
				const ipv6 = L.toArray(h.ip6addrs || h.ipv6)[0];
				if (ipv6 && !entry.ipv6) entry.ipv6 = ipv6;
			}
		}

		// 2. Raw Host Hints RPC
		if (rawHints && typeof rawHints === 'object') {
			for (const rawMac in rawHints) {
				const entry = getEntry(rawMac);
				if (!entry) continue;
				entry.isDiscovered = true;
				const h = rawHints[rawMac];
				if (h.name && !entry.hostname) entry.hostname = h.name;
				const ipv4 = L.toArray(h.ipaddrs || h.ipv4)[0];
				if (ipv4 && !entry.ipv4) entry.ipv4 = ipv4;
				const ipv6 = L.toArray(h.ip6addrs || h.ipv6)[0];
				if (ipv6 && !entry.ipv6) entry.ipv6 = ipv6;
			}
		}

		// 3. DHCP leases
		if (dhcpLeases) {
			const leases = Array.isArray(dhcpLeases.dhcp_leases) ? dhcpLeases.dhcp_leases : [];
			for (let i = 0; i < leases.length; i++) {
				const l = leases[i];
				if (!l.macaddr) continue;
				const entry = getEntry(l.macaddr);
				if (!entry) continue;
				entry.isDiscovered = true;
				if (l.ipaddr && !entry.ipv4) entry.ipv4 = l.ipaddr;
				if (l.hostname && !entry.hostname) entry.hostname = l.hostname;
			}

			const leases6 = Array.isArray(dhcpLeases.dhcp6_leases) ? dhcpLeases.dhcp6_leases : [];
			for (let i = 0; i < leases6.length; i++) {
				const l6 = leases6[i];
				if (!l6.macaddr) continue;
				const entry = getEntry(l6.macaddr);
				if (!entry) continue;
				entry.isDiscovered = true;
				const ip6 = Array.isArray(l6.ip6addrs) ? l6.ip6addrs[0] : l6.ip6addr;
				if (ip6 && !entry.ipv6) entry.ipv6 = ip6;
				if (l6.hostname && !entry.hostname) entry.hostname = l6.hostname;
			}
		}

		// 4. Saved UCI device records
		const sections = uci.sections('device_manager', 'device') || [];
		for (let i = 0; i < sections.length; i++) {
			const sec = sections[i];
			let normMac = normalizeMac(sec.mac);
			if (!normMac && sec['.name'] && sec['.name'].startsWith('dev_'))
				normMac = normalizeMac(sec['.name'].slice(4));
			if (!normMac) continue;

			const entry = getEntry(normMac);
			if (!entry) continue;

			entry.isSaved = true;
			entry.sid = sec['.name'];
			entry.customName = (sec.name || '').trim();
			entry.remark = (sec.remark || '').trim();
			const savedGroup = (sec.group || '').trim();
			entry.group = (savedGroup && self.getGroupById(savedGroup)) ? savedGroup : 'ungrouped';
		}

		// 5. Index online evidence sources
		const wifiSet = new Set();
		if (Array.isArray(wifiStations)) {
			for (let i = 0; i < wifiStations.length; i++) {
				const m = normalizeMac(wifiStations[i]);
				if (m) wifiSet.add(m);
			}
		}

		const neighborMap = new Map();
		if (onlineStatusData && Array.isArray(onlineStatusData.neighbors)) {
			for (let i = 0; i < onlineStatusData.neighbors.length; i++) {
				const n = onlineStatusData.neighbors[i];
				const m = normalizeMac(n.mac);
				if (m) {
					// REACHABLE / DELAY / PROBE take highest priority if multiple IPs exist
					const cur = neighborMap.get(m);
					if (!cur || n.state === 'REACHABLE' || (cur !== 'REACHABLE' && n.state === 'DELAY'))
						neighborMap.set(m, n.state);
				}
			}
		}

		const arpMap = new Map();
		if (Array.isArray(arpEntries)) {
			for (let i = 0; i < arpEntries.length; i++) {
				const a = arpEntries[i];
				const m = normalizeMac(a.mac);
				if (m) arpMap.set(m, a.flags);
			}
		}

		// 6. Evaluate Online Status for each device
		devicesMap.forEach(function(dev) {
			const isWifi = wifiSet.has(dev.mac);
			const neighState = neighborMap.get(dev.mac);
			const arpFlag = arpMap.get(dev.mac);

			if (isWifi) {
				dev.status = 'online';
				dev.statusDetail = _('Wi-Fi 活跃连接');
			} else if (neighState === 'REACHABLE' || neighState === 'DELAY' || neighState === 'PROBE') {
				dev.status = 'online';
				dev.statusDetail = _('网络邻居活跃 (%s)').format(neighState);
			} else if (neighState === 'FAILED') {
				dev.status = 'offline';
				dev.statusDetail = _('网络邻居探测失败 (FAILED)');
			} else if (!dev.isDiscovered && !neighState && dev.isSaved) {
				dev.status = 'offline';
				dev.statusDetail = _('未在当前局域网发现 (仅历史记录)');
			} else if (neighState === 'STALE') {
				dev.status = 'unknown';
				dev.statusDetail = _('网络邻居近期无活动 (STALE)');
			} else if (arpFlag === '0x2') {
				dev.status = 'unknown';
				dev.statusDetail = _('存在 ARP 解析记录');
			} else if (dev.isDiscovered) {
				dev.status = 'unknown';
				dev.statusDetail = _('仅主机探测记录，缺少近期活动证据');
			} else {
				dev.status = 'unknown';
				dev.statusDetail = _('状态未知');
			}
		});

		// 7. Sort devices
		const list = Array.from(devicesMap.values());
		list.sort(function(a, b) {
			// Online first, then unknown, then offline
			const order = { 'online': 0, 'unknown': 1, 'offline': 2 };
			if (order[a.status] !== order[b.status])
				return order[a.status] - order[b.status];

			// IP sorting
			if (a.ipv4 && b.ipv4) {
				const ipA = a.ipv4.split('.').map(Number);
				const ipB = b.ipv4.split('.').map(Number);
				for (let i = 0; i < 4; i++) {
					if (ipA[i] !== ipB[i])
						return (ipA[i] || 0) - (ipB[i] || 0);
				}
			} else if (a.ipv4) {
				return -1;
			} else if (b.ipv4) {
				return 1;
			}

			return a.mac.localeCompare(b.mac);
		});

		return list;
	},

	render: function(data) {
		const self = this;

		this.groups = this.parseGroups();
		this.devices = this.parseDevices(data[0], data[1], data[2], data[3], data[4], data[5]);

		// Restore saved view preferences from localStorage
		const savedView = loadViewState();
		this.activeTab = ['all', 'online', 'offline', 'unknown'].includes(savedView.tab) ? savedView.tab : 'all';
		this.activeGroup = (savedView.group === 'all' || savedView.group === 'ungrouped' || this.getGroupById(savedView.group))
			? savedView.group : 'all';

		const viewNode = E('div', { 'class': 'cbi-map' }, [
			// Inline scoped styles
			E('style', {}, [
				'.dm-status-tabs { display:flex; flex-wrap:wrap; margin:0 0 16px 0; padding:0; border-bottom:2px solid #e0e0e0; list-style:none; gap:6px; }',
				'.dm-status-tab { cursor:pointer; padding:8px 16px; border-radius:6px 6px 0 0; font-weight:500; font-size:14px; color:#555; background:rgba(0,0,0,0.03); transition:all 0.15s ease; border-bottom:3px solid transparent; }',
				'.dm-status-tab:hover { background:rgba(0,0,0,0.06); color:#111; }',
				'.dm-status-tab.active { background:#fff; color:#1a73e8; font-weight:bold; border-bottom:3px solid #1a73e8; }',
				'.dm-tab-count { font-size:12px; margin-left:4px; padding:2px 7px; border-radius:10px; background:rgba(0,0,0,0.06); color:#555; font-weight:normal; }',
				'.dm-status-tab.active .dm-tab-count { background:#e8f0fe; color:#1a73e8; font-weight:bold; }',
				'.dm-toolbar { display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center; margin-bottom:15px; }',
				'.dm-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex:1; min-width:260px; }',
				'.dm-btn-group { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }',
				'.dm-table-wrapper { overflow-x:auto; width:100%; -webkit-overflow-scrolling:touch; }',
				'.dm-device-title { font-weight:bold; font-size:14px; display:inline-block; }',
				'.dm-device-subtitle { font-size:12px; color:#777; margin-top:2px; }',
				'.dm-badge { display:inline-block; font-size:11px; padding:2px 6px; border-radius:3px; margin-top:3px; font-weight:500; }',
				'.dm-badge-online { background:#e6f4ea; color:#137333; border:1px solid #ceead6; }',
				'.dm-badge-offline { background:#fce8e6; color:#c5221f; border:1px solid #fad2cf; }',
				'.dm-badge-unknown { background:#fef7e0; color:#b06000; border:1px solid #feefc3; }',
				'.dm-group-badge { display:inline-block; font-size:12px; padding:3px 8px; border-radius:4px; background:#f1f3f4; color:#3c4043; border:1px solid #dadce0; font-weight:500; }',
				'.dm-group-ungrouped { color:#888; font-style:italic; }',
				'.dm-mac-code { font-family:monospace; font-size:13px; font-weight:600; color:#1a73e8; }',
				'.dm-actions { white-space:nowrap; }',
				'.dm-actions button { margin-right:5px; }'
			]),

			E('h2', {}, _('局域网设备管理')),
			E('div', { 'class': 'cbi-map-descr' }, _('自动识别局域网设备在线状态，支持按 MAC 地址自定义显示名称、备注和自定义设备分组，配置永久保存。')),

			// Row 1: Status Tabs
			E('ul', { 'class': 'dm-status-tabs', 'id': 'dm-tabs-container' }),

			// Row 2: Controls Toolbar
			E('div', { 'class': 'cbi-section dm-toolbar' }, [
				E('div', { 'class': 'dm-controls' }, [
					E('input', {
						'type': 'text',
						'id': 'dm-search-input',
						'class': 'cbi-input-text',
						'placeholder': _('搜索设备名称、主机名、IP、MAC、备注、分组...'),
						'style': 'flex:1; min-width:200px; max-width:360px;',
						'value': self.filterText,
						'input': function(ev) {
							self.filterText = ev.target.value.trim().toLowerCase();
							self.updateView();
						}
					}),
					E('select', {
						'id': 'dm-group-select',
						'class': 'cbi-input-select',
						'style': 'min-width:140px;',
						'change': function(ev) {
							self.activeGroup = ev.target.value;
							saveViewState(self.activeTab, self.activeGroup);
							self.updateView();
						}
					})
				]),
				E('div', { 'class': 'dm-btn-group' }, [
					E('button', {
						'class': 'cbi-button cbi-button-neutral',
						'click': function() { self.showGroupModal(); }
					}, [ _('分组管理') ]),
					E('button', {
						'class': 'cbi-button cbi-button-action',
						'click': function() { self.showEditModal(null); }
					}, [ _('+ 手动添加设备') ]),
					E('button', {
						'class': 'cbi-button cbi-button-neutral',
						'id': 'dm-btn-refresh',
						'click': function(ev) {
							ev.currentTarget.classList.add('spinning');
							ev.currentTarget.disabled = true;
							self.refresh().finally(function() {
								ev.currentTarget.classList.remove('spinning');
								ev.currentTarget.disabled = false;
							});
						}
					}, [ _('刷新列表') ])
				])
			]),

			// Row 3: Device Table
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'dm-table-wrapper' }, [
					E('table', { 'class': 'table dm-table', 'id': 'device_manager_table' }, [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th', 'style': 'width:24%;' }, _('设备名称')),
							E('th', { 'class': 'th', 'style': 'width:18%;' }, _('IP 地址')),
							E('th', { 'class': 'th', 'style': 'width:18%;' }, _('MAC 地址')),
							E('th', { 'class': 'th', 'style': 'width:14%;' }, _('分组')),
							E('th', { 'class': 'th', 'style': 'width:14%;' }, _('备注')),
							E('th', { 'class': 'th cbi-section-actions', 'style': 'width:12%; text-align:center;' }, _('操作'))
						]),
						E('tbody', { 'id': 'device_manager_tbody' })
					])
				])
			])
		]);

		this.tabMenuNode = viewNode.querySelector('#dm-tabs-container');
		this.tableBodyNode = viewNode.querySelector('#device_manager_tbody');
		this.groupSelectNode = viewNode.querySelector('#dm-group-select');

		this.updateView();
		return viewNode;
	},

	/**
	 * Update Tab headers, Group selector options, and Table body in-place.
	 */
	updateView: function() {
		this.renderTabs();
		this.renderGroupSelect();
		this.renderTable();
	},

	/**
	 * Render dynamic status tabs with accurate device counters.
	 */
	renderTabs: function() {
		if (!this.tabMenuNode) return;
		dom.content(this.tabMenuNode, null);

		const self = this;

		// Calculate status counts for devices that match the current group filter and search query
		let total = 0, online = 0, offline = 0, unknown = 0;

		for (let i = 0; i < this.devices.length; i++) {
			const dev = this.devices[i];

			if (self.activeGroup !== 'all') {
				if (self.activeGroup === 'ungrouped') {
					if (dev.group && dev.group !== 'ungrouped') continue;
				} else {
					if (dev.group !== self.activeGroup) continue;
				}
			}

			if (self.filterText) {
				const q = self.filterText;
				const grpName = self.getGroupName(dev.group);
				const matched = (
					(dev.customName && dev.customName.toLowerCase().includes(q)) ||
					(dev.hostname && dev.hostname.toLowerCase().includes(q)) ||
					(dev.ipv4 && dev.ipv4.toLowerCase().includes(q)) ||
					(dev.ipv6 && dev.ipv6.toLowerCase().includes(q)) ||
					(dev.mac && dev.mac.toLowerCase().includes(q)) ||
					(dev.remark && dev.remark.toLowerCase().includes(q)) ||
					(grpName && grpName.toLowerCase().includes(q))
				);
				if (!matched) continue;
			}

			total++;
			if (dev.status === 'online') online++;
			else if (dev.status === 'offline') offline++;
			else unknown++;
		}

		const tabs = [
			{ key: 'all',     label: _('全部设备'), count: total },
			{ key: 'online',  label: _('在线设备'), count: online },
			{ key: 'offline', label: _('离线设备'), count: offline },
			{ key: 'unknown', label: _('状态未知'), count: unknown }
		];

		tabs.forEach(function(t) {
			const isActive = (self.activeTab === t.key);
			const tabItem = E('li', {
				'class': 'dm-status-tab' + (isActive ? ' active' : ''),
				'click': function() {
					self.activeTab = t.key;
					saveViewState(self.activeTab, self.activeGroup);
					self.updateView();
				}
			}, [
				t.label,
				E('span', { 'class': 'dm-tab-count' }, t.count)
			]);
			self.tabMenuNode.appendChild(tabItem);
		});
	},

	/**
	 * Populate the group filter dropdown with counts.
	 */
	renderGroupSelect: function() {
		if (!this.groupSelectNode) return;
		dom.content(this.groupSelectNode, null);

		const self = this;
		const options = [
			E('option', { 'value': 'all' }, _('全部分组'))
		];

		// Count devices per group
		const groupCounts = new Map();
		let ungroupedCount = 0;

		for (let i = 0; i < this.devices.length; i++) {
			const g = this.devices[i].group;
			if (!g || g === 'ungrouped') {
				ungroupedCount++;
			} else {
				groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
			}
		}

		for (let i = 0; i < this.groups.length; i++) {
			const g = this.groups[i];
			const count = groupCounts.get(g.id) || 0;
			const opt = E('option', { 'value': g.id }, '%s (%d)'.format(g.name, count));
			if (self.activeGroup === g.id) opt.selected = true;
			options.push(opt);
		}

		const ungroupedOpt = E('option', { 'value': 'ungrouped' }, '%s (%d)'.format(_('未分组'), ungroupedCount));
		if (self.activeGroup === 'ungrouped') ungroupedOpt.selected = true;
		options.push(ungroupedOpt);

		dom.content(this.groupSelectNode, options);
	},

	/**
	 * Render filtered devices into the table body.
	 */
	renderTable: function() {
		if (!this.tableBodyNode) return;
		dom.content(this.tableBodyNode, null);

		const self = this;

		const filtered = this.devices.filter(function(dev) {
			// 1. Status Tab filter
			if (self.activeTab !== 'all' && dev.status !== self.activeTab)
				return false;

			// 2. Group filter
			if (self.activeGroup !== 'all') {
				if (self.activeGroup === 'ungrouped') {
					if (dev.group && dev.group !== 'ungrouped') return false;
				} else {
					if (dev.group !== self.activeGroup) return false;
				}
			}

			// 3. Search query filter
			if (self.filterText) {
				const q = self.filterText;
				const grpName = self.getGroupName(dev.group);
				const matched = (
					(dev.customName && dev.customName.toLowerCase().includes(q)) ||
					(dev.hostname && dev.hostname.toLowerCase().includes(q)) ||
					(dev.ipv4 && dev.ipv4.toLowerCase().includes(q)) ||
					(dev.ipv6 && dev.ipv6.toLowerCase().includes(q)) ||
					(dev.mac && dev.mac.toLowerCase().includes(q)) ||
					(dev.remark && dev.remark.toLowerCase().includes(q)) ||
					(grpName && grpName.toLowerCase().includes(q))
				);
				if (!matched) return false;
			}

			return true;
		});

		if (filtered.length === 0) {
			let emptyMsg = _('暂无局域网设备数据，点击右上角【刷新】重试或【+ 手动添加设备】');
			if (this.filterText)
				emptyMsg = _('未找到与 “%s” 匹配的设备记录').format(this.filterText);
			else if (this.activeTab === 'online')
				emptyMsg = _('当前没有在线设备');
			else if (this.activeTab === 'offline')
				emptyMsg = _('当前没有离线设备');
			else if (this.activeTab === 'unknown')
				emptyMsg = _('当前没有状态未知的设备');
			else if (this.activeGroup !== 'all')
				emptyMsg = _('当前分组下暂无设备记录');

			this.tableBodyNode.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 6, 'style': 'text-align:center; padding:36px 16px; color:#888;' }, emptyMsg)
			]));
			return;
		}

		for (let i = 0; i < filtered.length; i++) {
			this.tableBodyNode.appendChild(this.renderDeviceRow(filtered[i]));
		}
	},

	/**
	 * Render a single table row for a device.
	 */
	renderDeviceRow: function(dev) {
		const self = this;

		// 1. Device name column
		const displayName = dev.customName || dev.hostname || _('未知设备');
		const nameChildren = [
			E('div', { 'class': 'dm-device-title' }, displayName)
		];

		// Status badge with tooltip explanation
		let badgeClass = 'dm-badge-unknown';
		let badgeText = _('状态未知');

		if (dev.status === 'online') {
			badgeClass = 'dm-badge-online';
			badgeText = _('在线');
		} else if (dev.status === 'offline') {
			badgeClass = 'dm-badge-offline';
			badgeText = _('离线');
		}

		nameChildren.push(E('div', {}, [
			E('span', {
				'class': 'dm-badge ' + badgeClass,
				'title': dev.statusDetail || badgeText
			}, badgeText)
		]));

		if (dev.customName && dev.hostname && dev.customName !== dev.hostname) {
			nameChildren.push(E('div', { 'class': 'dm-device-subtitle' }, [
				_('主机名: '),
				E('span', {}, dev.hostname)
			]));
		} else if (!dev.customName && !dev.hostname) {
			nameChildren.push(E('div', { 'class': 'dm-device-subtitle' }, _('无检测主机名')));
		}

		// 2. IP address column
		const ipChildren = [];
		if (dev.ipv4) {
			ipChildren.push(E('div', {}, dev.ipv4));
		} else {
			ipChildren.push(E('div', { 'style': 'color:#999;' }, '—'));
		}
		if (dev.ipv6) {
			ipChildren.push(E('div', {
				'class': 'dm-device-subtitle',
				'title': dev.ipv6,
				'style': 'max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'
			}, dev.ipv6));
		}

		// 3. MAC address column
		const macNode = E('span', { 'class': 'dm-mac-code' }, dev.mac);

		// 4. Group column
		const groupName = this.getGroupName(dev.group);
		const groupNode = (dev.group && dev.group !== 'ungrouped')
			? E('span', { 'class': 'dm-group-badge' }, groupName)
			: E('span', { 'class': 'dm-group-ungrouped' }, _('未分组'));

		// 5. Remark column
		const remarkNode = dev.remark
			? E('span', {}, dev.remark)
			: E('em', { 'style': 'color:#aaa;' }, '—');

		// 6. Action column
		const actions = [
			E('button', {
				'class': 'btn cbi-button cbi-button-neutral',
				'click': function() { self.showEditModal(dev); }
			}, [ _('编辑') ])
		];

		if (dev.isSaved) {
			actions.push(E('button', {
				'class': 'btn cbi-button cbi-button-remove',
				'click': function() { self.confirmDelete(dev); }
			}, [ _('删除') ]));
		}

		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, nameChildren),
			E('td', { 'class': 'td' }, ipChildren),
			E('td', { 'class': 'td' }, macNode),
			E('td', { 'class': 'td' }, groupNode),
			E('td', { 'class': 'td' }, remarkNode),
			E('td', { 'class': 'td cbi-section-actions dm-actions', 'style': 'text-align:center;' }, actions)
		]);
	},

	/**
	 * Display edit modal dialog for creating or updating device details.
	 */
	showEditModal: function(dev) {
		const self = this;
		const isEdit = (dev !== null);

		const curMac = isEdit ? dev.mac : '';
		const curHostname = isEdit ? (dev.hostname || _('未检测到')) : '';
		const curIp = isEdit ? (dev.ipv4 || _('未获取')) : '';
		const curName = isEdit ? (dev.customName || '') : '';
		const curRemark = isEdit ? (dev.remark || '') : '';
		const curGroup = isEdit ? (dev.group || 'ungrouped') : 'ungrouped';

		const modalTitle = isEdit
			? _('编辑设备: %s').format(dev.customName || dev.hostname || dev.mac)
			: _('手动添加设备');

		let macInput = null;
		let macRow = null;

		if (isEdit) {
			macRow = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('MAC 地址')),
				E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px;' }, [
					E('code', { 'class': 'dm-mac-code' }, curMac)
				])
			]);
		} else {
			macInput = E('input', {
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': '例如：AA:BB:CC:11:22:33',
				'maxlength': 17,
				'style': 'width:100%;'
			});
			macRow = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [
					_('MAC 地址'),
					E('span', { 'style': 'color:red;' }, ' *')
				]),
				E('div', { 'class': 'cbi-value-field' }, [
					macInput,
					E('div', { 'class': 'cbi-value-description' }, _('设备的物理硬件地址，支持冒号或短横线分隔（不区分大小写）'))
				])
			]);
		}

		// Group dropdown options
		const groupSelect = E('select', { 'class': 'cbi-input-select', 'style': 'width:100%;' }, [
			E('option', { 'value': 'ungrouped' }, _('未分组'))
		]);
		for (let i = 0; i < this.groups.length; i++) {
			const g = this.groups[i];
			const opt = E('option', { 'value': g.id }, g.name);
			if (curGroup === g.id) opt.selected = true;
			groupSelect.appendChild(opt);
		}

		const nameInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'value': curName,
			'placeholder': _('例如：客厅电视、主力工作电脑'),
			'maxlength': 64,
			'style': 'width:100%;'
		});

		const remarkTextarea = E('textarea', {
			'class': 'cbi-input-textarea',
			'rows': 3,
			'placeholder': _('例如：55寸安卓电视，安装在客厅'),
			'maxlength': 256,
			'style': 'width:100%;'
		}, [ curRemark ]);

		const errorDiv = E('div', {
			'class': 'alert-message danger',
			'style': 'display:none; margin-bottom:15px;'
		});

		const formFields = [
			errorDiv,
			macRow
		];

		if (isEdit) {
			formFields.push(
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('当前在线状态')),
					E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px;' }, [
						E('span', { 'class': 'dm-badge ' + (dev.status === 'online' ? 'dm-badge-online' : (dev.status === 'offline' ? 'dm-badge-offline' : 'dm-badge-unknown')) },
							dev.status === 'online' ? _('在线') : (dev.status === 'offline' ? _('离线') : _('状态未知'))),
						' ',
						E('span', { 'class': 'dm-device-subtitle', 'style': 'margin-left:6px;' }, dev.statusDetail)
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('系统主机名')),
					E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px; color:#666;' }, curHostname)
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('当前 IP 地址')),
					E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px; color:#666;' }, curIp)
				])
			);
		}

		formFields.push(
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('所属分组')),
				E('div', { 'class': 'cbi-value-field' }, [
					groupSelect,
					E('div', { 'class': 'cbi-value-description' }, _('为设备指定业务或摆放区域分类'))
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('设备显示名称')),
				E('div', { 'class': 'cbi-value-field' }, [
					nameInput,
					E('div', { 'class': 'cbi-value-description' }, _('自定义设备显示名称。若留空则恢复默认主机名'))
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('设备备注')),
				E('div', { 'class': 'cbi-value-field' }, [
					remarkTextarea,
					E('div', { 'class': 'cbi-value-description' }, _('记录设备位置、用途、所有者等备注信息'))
				])
			])
		);

		const btnCancel = E('button', {
			'class': 'btn cbi-button',
			'click': ui.hideModal
		}, [ _('取消') ]);

		const btnSave = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function(ev) {
				const targetMac = isEdit ? curMac : (macInput ? macInput.value : '');
				const normMac = normalizeMac(targetMac);

				if (!normMac) {
					errorDiv.textContent = _('请输入有效的 MAC 地址（格式如：AA:BB:CC:11:22:33）');
					errorDiv.style.display = 'block';
					if (macInput) macInput.focus();
					return;
				}

				errorDiv.style.display = 'none';
				const newName = sanitizeInput(nameInput.value);
				const newRemark = sanitizeInput(remarkTextarea.value);
				const newGroup = groupSelect.value || 'ungrouped';

				ev.currentTarget.classList.add('spinning');
				ev.currentTarget.disabled = true;

				self.handleSaveDevice(normMac, newName, newRemark, newGroup, dev)
					.then(function() {
						ui.hideModal();
						ui.addNotification(null, E('p', _('设备【%s】信息已保存并生效！').format(newName || normMac)), 'info');
						return self.refresh();
					})
					.catch(function(err) {
						errorDiv.textContent = _('保存失败: %s').format(err.message || err);
						errorDiv.style.display = 'block';
					})
					.finally(function() {
						ev.currentTarget.classList.remove('spinning');
						ev.currentTarget.disabled = false;
					});
			}
		}, [ _('保存') ]);

		const buttonRow = [ btnCancel, ' ', btnSave ];

		if (isEdit && dev.isSaved) {
			const btnDelete = E('button', {
				'class': 'btn cbi-button cbi-button-remove',
				'style': 'float:left;',
				'click': function() {
					ui.hideModal();
					self.confirmDelete(dev);
				}
			}, [ _('删除记录') ]);
			buttonRow.unshift(btnDelete);
		}

		ui.showModal(modalTitle, [
			E('div', { 'class': 'cbi-section' }, formFields),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, buttonRow)
		]);
	},

	/**
	 * Save device custom name, remark, and group into UCI /etc/config/device_manager.
	 */
	handleSaveDevice: function(mac, newName, newRemark, newGroup, existingDev) {
		const targetSid = getSectionId(mac);

		return uci.load('device_manager').then(function() {
			let foundSid = null;
			const sections = uci.sections('device_manager', 'device') || [];
			for (let i = 0; i < sections.length; i++) {
				const sec = sections[i];
				let secMac = normalizeMac(sec.mac);
				if (!secMac && sec['.name'] && sec['.name'].startsWith('dev_'))
					secMac = normalizeMac(sec['.name'].slice(4));

				if (secMac === mac) {
					foundSid = sec['.name'];
					break;
				}
			}

			// If name, remark, and group are all empty/ungrouped:
			// If already saved, remove section to prevent stale clutter
			const isDefaultGroup = (!newGroup || newGroup === 'ungrouped');
			if (!newName && !newRemark && isDefaultGroup) {
				if (foundSid)
					uci.remove('device_manager', foundSid);
				return uci.save().then(function() {
					return callUCICommit('device_manager');
				});
			}

			if (!foundSid) {
				uci.add('device_manager', 'device', targetSid);
				foundSid = targetSid;
			}

			uci.set('device_manager', foundSid, 'mac', mac);

			if (newName)
				uci.set('device_manager', foundSid, 'name', newName);
			else
				uci.unset('device_manager', foundSid, 'name');

			if (newRemark)
				uci.set('device_manager', foundSid, 'remark', newRemark);
			else
				uci.unset('device_manager', foundSid, 'remark');

			if (!isDefaultGroup)
				uci.set('device_manager', foundSid, 'group', newGroup);
			else
				uci.unset('device_manager', foundSid, 'group');

			return uci.save().then(function() {
				return callUCICommit('device_manager');
			});
		});
	},

	/**
	 * Prompt confirmation dialog before deleting device UCI record.
	 */
	confirmDelete: function(dev) {
		const self = this;
		const name = dev.customName || dev.hostname || dev.mac;

		ui.showModal(_('确认删除记录'), [
			E('p', {}, _('确定要删除设备【%s】(%s) 的自定义名称和备注记录吗？').format(name, dev.mac)),
			E('p', { 'class': 'cbi-value-description' }, _('删除后将恢复显示默认主机名，已保存的备注和分组将被清空。')),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, [ _('取消') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-remove',
					'click': function(ev) {
						ev.currentTarget.classList.add('spinning');
						ev.currentTarget.disabled = true;

						self.handleDeleteDevice(dev)
							.then(function() {
								ui.hideModal();
								ui.addNotification(null, E('p', _('已成功删除设备【%s】的备注记录。').format(name)), 'info');
								return self.refresh();
							})
							.catch(function(err) {
								ui.hideModal();
								ui.addNotification(null, E('p', _('删除失败: %s').format(err.message || err)), 'danger');
							});
					}
				}, [ _('确认删除') ])
			])
		]);
	},

	/**
	 * Delete device section from UCI configuration.
	 */
	handleDeleteDevice: function(dev) {
		return uci.load('device_manager').then(function() {
			let sidToDelete = dev.sid;

			if (!sidToDelete) {
				const sections = uci.sections('device_manager', 'device') || [];
				for (let i = 0; i < sections.length; i++) {
					const sec = sections[i];
					let secMac = normalizeMac(sec.mac);
					if (!secMac && sec['.name'] && sec['.name'].startsWith('dev_'))
						secMac = normalizeMac(sec['.name'].slice(4));

					if (secMac === dev.mac) {
						sidToDelete = sec['.name'];
						break;
					}
				}
			}

			if (sidToDelete)
				uci.remove('device_manager', sidToDelete);

			return uci.save().then(function() {
				return callUCICommit('device_manager');
			});
		});
	},

	/**
	 * Display Group Management Modal.
	 */
	showGroupModal: function() {
		const self = this;

		// Calculate count of devices per group
		const groupCounts = new Map();
		for (let i = 0; i < this.devices.length; i++) {
			const g = this.devices[i].group;
			if (g && g !== 'ungrouped') {
				groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
			}
		}

		const groupRows = this.groups.map(function(g) {
			const count = groupCounts.get(g.id) || 0;

			const btnRename = E('button', {
				'class': 'btn cbi-button cbi-button-neutral',
				'style': 'margin-right:6px;',
				'click': function() { self.promptRenameGroup(g); }
			}, [ _('重命名') ]);

			const btnDelete = E('button', {
				'class': 'btn cbi-button cbi-button-remove',
				'click': function() { self.confirmDeleteGroup(g, count); }
			}, [ _('删除') ]);

			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, g.name),
				E('td', { 'class': 'td' }, E('code', {}, g.id)),
				E('td', { 'class': 'td' }, '%d 台设备'.format(count)),
				E('td', { 'class': 'td', 'style': 'text-align:right;' }, [ btnRename, btnDelete ])
			]);
		});

		const newGroupInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': _('例如：智能影音、办公设备'),
			'maxlength': 32,
			'style': 'width:240px; margin-right:8px;'
		});

		const errorDiv = E('div', {
			'class': 'alert-message danger',
			'style': 'display:none; margin-bottom:12px;'
		});

		const btnAddGroup = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function(ev) {
				const name = sanitizeInput(newGroupInput.value);
				if (!name) {
					errorDiv.textContent = _('请输入有效的分组名称');
					errorDiv.style.display = 'block';
					newGroupInput.focus();
					return;
				}

				// Check duplicate name
				if (self.groups.some(g => g.name === name)) {
					errorDiv.textContent = _('已存在同名分组，请使用其他名称');
					errorDiv.style.display = 'block';
					newGroupInput.focus();
					return;
				}

				ev.currentTarget.classList.add('spinning');
				ev.currentTarget.disabled = true;

				self.handleAddGroup(name)
					.then(function() {
						ui.hideModal();
						ui.addNotification(null, E('p', _('成功创建分组【%s】！').format(name)), 'info');
						return self.refresh().then(function() {
							self.showGroupModal();
						});
					})
					.catch(function(err) {
						errorDiv.textContent = _('创建分组失败: %s').format(err.message || err);
						errorDiv.style.display = 'block';
					})
					.finally(function() {
						ev.currentTarget.classList.remove('spinning');
						ev.currentTarget.disabled = false;
					});
			}
		}, [ _('添加分组') ]);

		ui.showModal(_('设备分组管理'), [
			E('div', { 'class': 'cbi-section' }, [
				errorDiv,
				E('table', { 'class': 'table', 'style': 'width:100%; margin-bottom:20px;' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, _('分组名称')),
						E('th', { 'class': 'th' }, _('分组标识')),
						E('th', { 'class': 'th' }, _('包含设备数')),
						E('th', { 'class': 'th', 'style': 'text-align:right;' }, _('操作'))
					]),
					E('tbody', {}, groupRows)
				]),
				E('div', { 'class': 'cbi-value', 'style': 'padding-top:10px; border-top:1px solid #eee;' }, [
					E('label', { 'class': 'cbi-value-title' }, _('新增分组')),
					E('div', { 'class': 'cbi-value-field' }, [
						newGroupInput,
						btnAddGroup,
						E('div', { 'class': 'cbi-value-description' }, _('分组名称支持中文、英文及常用符号，稳定保存'))
					])
				])
			]),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': ui.hideModal
				}, [ _('关闭') ])
			])
		]);
	},

	/**
	 * Prompt modal to rename an existing group.
	 */
	promptRenameGroup: function(group) {
		const self = this;
		const nameInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'value': group.name,
			'maxlength': 32,
			'style': 'width:100%;'
		});

		const errorDiv = E('div', {
			'class': 'alert-message danger',
			'style': 'display:none; margin-bottom:12px;'
		});

		ui.showModal(_('重命名分组'), [
			E('div', { 'class': 'cbi-section' }, [
				errorDiv,
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('原分组名称')),
					E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px;' }, group.name)
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('新分组名称')),
					E('div', { 'class': 'cbi-value-field' }, [
						nameInput,
						E('div', { 'class': 'cbi-value-description' }, _('重命名不会改变分组 ID，已关联该分组的设备保持关联不变'))
					])
				])
			]),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, [
				E('button', { 'class': 'btn cbi-button', 'click': function() { self.showGroupModal(); } }, [ _('取消') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-positive',
					'click': function(ev) {
						const newName = sanitizeInput(nameInput.value);
						if (!newName) {
							errorDiv.textContent = _('请输入有效的分组名称');
							errorDiv.style.display = 'block';
							nameInput.focus();
							return;
						}

						if (newName === group.name) {
							self.showGroupModal();
							return;
						}

						ev.currentTarget.classList.add('spinning');
						ev.currentTarget.disabled = true;

						self.handleRenameGroup(group.id, newName)
							.then(function() {
								ui.addNotification(null, E('p', _('分组已成功重命名为【%s】！').format(newName)), 'info');
								return self.refresh().then(function() {
									self.showGroupModal();
								});
							})
							.catch(function(err) {
								errorDiv.textContent = _('重命名失败: %s').format(err.message || err);
								errorDiv.style.display = 'block';
							})
							.finally(function() {
								ev.currentTarget.classList.remove('spinning');
								ev.currentTarget.disabled = false;
							});
					}
				}, [ _('保存修改') ])
			])
		]);
	},

	/**
	 * Confirm before deleting a group.
	 */
	confirmDeleteGroup: function(group, deviceCount) {
		const self = this;

		ui.showModal(_('确认删除分组'), [
			E('p', {}, _('确定要删除分组【%s】吗？').format(group.name)),
			E('p', { 'class': 'cbi-value-description' }, _('删除分组后，该组下的 %d 台设备将自动转为【未分组】。设备名称、MAC 及备注将被完整保留，绝不删除设备。').format(deviceCount)),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, [
				E('button', { 'class': 'btn cbi-button', 'click': function() { self.showGroupModal(); } }, [ _('取消') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-remove',
					'click': function(ev) {
						ev.currentTarget.classList.add('spinning');
						ev.currentTarget.disabled = true;

						self.handleDeleteGroup(group.id)
							.then(function() {
								ui.addNotification(null, E('p', _('分组【%s】已删除，所属设备已转为未分组。').format(group.name)), 'info');
								return self.refresh().then(function() {
									self.showGroupModal();
								});
							})
							.catch(function(err) {
								ui.hideModal();
								ui.addNotification(null, E('p', _('删除分组失败: %s').format(err.message || err)), 'danger');
							});
					}
				}, [ _('确认删除') ])
			])
		]);
	},

	/**
	 * Add new group to UCI.
	 */
	handleAddGroup: function(name) {
		// Generate stable section ID
		const id = 'grp_' + Date.now().toString(36);

		return uci.load('device_manager').then(function() {
			uci.add('device_manager', 'group', id);
			uci.set('device_manager', id, 'name', name);
			return uci.save().then(function() {
				return callUCICommit('device_manager');
			});
		});
	},

	/**
	 * Rename group in UCI.
	 */
	handleRenameGroup: function(groupId, newName) {
		return uci.load('device_manager').then(function() {
			uci.set('device_manager', groupId, 'name', newName);
			return uci.save().then(function() {
				return callUCICommit('device_manager');
			});
		});
	},

	/**
	 * Delete group from UCI and unlink associated devices to 'ungrouped'.
	 */
	handleDeleteGroup: function(groupId) {
		const self = this;

		return uci.load('device_manager').then(function() {
			uci.remove('device_manager', groupId);

			// Unlink all devices that were in this group
			const devSections = uci.sections('device_manager', 'device') || [];
			for (let i = 0; i < devSections.length; i++) {
				const s = devSections[i];
				if (s.group === groupId) {
					uci.unset('device_manager', s['.name'], 'group');
				}
			}

			if (self.activeGroup === groupId) {
				self.activeGroup = 'all';
				saveViewState(self.activeTab, self.activeGroup);
			}

			return uci.save().then(function() {
				return callUCICommit('device_manager');
			});
		});
	},

	/**
	 * Refresh data and update view without reloading the page.
	 */
	refresh: function() {
		const self = this;
		return this.load().then(function(data) {
			self.groups = self.parseGroups();
			self.devices = self.parseDevices(data[0], data[1], data[2], data[3], data[4], data[5]);
			self.updateView();
		});
	}
});
