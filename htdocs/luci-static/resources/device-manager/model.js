'use strict';
'require device-manager.i18n as i18n';
'require baseclass';

const ACTIVE_STATES = [ 'REACHABLE', 'DELAY', 'PROBE' ];
const STATE_PRIORITY = { REACHABLE: 6, DELAY: 5, PROBE: 4, STALE: 3, PERMANENT: 2, NOARP: 2, INCOMPLETE: 1, FAILED: 0 };

// Localize untouched defaults; user-defined names remain literal configuration data.
const DEFAULT_GROUPS = {
	smart_home: { stored: [ '智能家居', 'Smart home' ], label: () => i18n.t('Smart home') },
	phone: { stored: [ '手机设备', 'Phones' ], label: () => i18n.t('Phones') },
	computer: { stored: [ '电脑设备', 'Computers' ], label: () => i18n.t('Computers') },
	network: { stored: [ '网络设备', 'Network devices' ], label: () => i18n.t('Network devices') },
	other: { stored: [ '其他设备', 'Other devices' ], label: () => i18n.t('Other devices') }
};

function normalizeMac(mac) {
	if (typeof mac !== 'string') return null;
	const value = mac.trim().toUpperCase().replace(/[:-]/g, '');
	if (!/^[0-9A-F]{12}$/.test(value) || /^(0{12}|F{12})$/.test(value)) return null;
	return value.match(/.{2}/g).join(':');
}

function sanitizeInput(value) {
	return value == null ? '' : String(value).replace(/[\x00-\x1f\x7f]/g, ' ').trim();
}

function sectionMac(section) {
	return normalizeMac(section.mac) || normalizeMac((section['.name'] || '').replace(/^dev_/, ''));
}

function groupName(groups, id) {
	const group = groups.find(g => g.id === id);
	return group ? group.name : i18n.t('Ungrouped');
}

function matchesDevice(device, groups, group, query) {
	if (group !== 'all' && device.group !== group) return false;
	if (!query) return true;
	return [ device.customName, device.hostname, device.ipv4, device.ipv6, device.mac,
		device.remark, groupName(groups, device.group) ].some(value => String(value || '').toLowerCase().includes(query));
}

function parseDevices(data, groups) {
	const devices = new Map();
	const addresses = new Map();
	const addressInterfaces = new Map();
	const neighborStates = new Map();
	const wifi = new Set();
	const arp = new Set();
	const getEntry = mac => {
		const normalized = normalizeMac(mac);
		if (!normalized) return null;
		if (!devices.has(normalized)) devices.set(normalized, {
			mac: normalized, hostname: '', ipv4: '', ipv6: '', customName: '', remark: '',
			group: 'ungrouped', sid: null, isSaved: false, isDiscovered: false,
			status: 'unknown', statusDetail: ''
		});
		return devices.get(normalized);
	};
	const addAddress = (device, ip, preferred, iface) => {
		if (!device || typeof ip !== 'string' || !ip) return;
		// DHCPv6 may include a prefix length. Keep address matching consistent.
		const address = ip.split('/')[0].toLowerCase();
		if (!addresses.has(address)) addresses.set(address, new Set());
		addresses.get(address).add(device.mac);
		if (iface) {
			if (!addressInterfaces.has(address)) addressInterfaces.set(address, new Set());
			addressInterfaces.get(address).add(iface);
		}
		const field = address.includes(':') ? 'ipv6' : 'ipv4';
		if (!device[field] || preferred) device[field] = address;
	};
	const toArray = value => Array.isArray(value) ? value : value == null ? [] : [ value ];
	const leases = data.leases || {};
	for (const lease of [ ...toArray(leases.dhcp_leases), ...toArray(leases.dhcp6_leases) ]) {
		const device = getEntry(lease.macaddr);
		if (!device) continue;
		device.isDiscovered = true;
		device.hostname = sanitizeInput(lease.hostname || device.hostname);
		for (const ip of [ ...toArray(lease.ipaddr), ...toArray(lease.ip6addrs || lease.ip6addr) ]) addAddress(device, ip);
	}
	for (const [ mac, hint ] of Object.entries(data.hints || {})) {
		const device = getEntry(mac);
		if (!device || !hint || typeof hint !== 'object') continue;
		device.isDiscovered = true;
		if (!device.hostname) device.hostname = sanitizeInput(hint.name);
		for (const ip of [ ...toArray(hint.ipaddrs || hint.ipv4), ...toArray(hint.ip6addrs || hint.ipv6) ]) addAddress(device, ip);
	}
	for (const section of data.devices || []) {
		const device = getEntry(sectionMac(section));
		if (!device) continue;
		device.isSaved = true;
		device.sid = section['.name'];
		device.customName = sanitizeInput(section.name);
		device.remark = sanitizeInput(section.remark);
		device.group = groups.some(g => g.id === section.group) ? section.group : 'ungrouped';
	}
	for (const station of data.wifi || []) {
		const device = getEntry(typeof station === 'string' ? station : station.mac);
		if (!device) continue;
		device.isDiscovered = true;
		wifi.add(device.mac);
	}
	for (const entry of data.arp || []) {
		const device = getEntry(entry.mac);
		if (!device) continue;
		device.isDiscovered = true;
		addAddress(device, entry.ip, false, entry.dev);
		if (Number(entry.flags) === 2) arp.add(device.mac);
	}
	const neighbors = (data.neighbors || {}).neighbors || [];
	// Index all resolved neighbors first, so FAILED association is order independent.
	for (const neighbor of neighbors) {
		const device = getEntry(neighbor.mac);
		if (!device) continue;
		device.isDiscovered = true;
		addAddress(device, neighbor.ip, ACTIVE_STATES.includes(neighbor.state), neighbor.dev);
	}
	for (const neighbor of neighbors) {
		let mac = normalizeMac(neighbor.mac);
		if (!mac && typeof neighbor.ip === 'string') {
			const address = neighbor.ip.split('/')[0].toLowerCase();
			const interfaces = addressInterfaces.get(address);
			if (neighbor.dev && interfaces && !interfaces.has(neighbor.dev)) continue;
			const owners = addresses.get(address);
			// Never attach a failure to an ambiguous or reassigned address.
			if (owners && owners.size === 1) mac = owners.values().next().value;
		}
		if (!mac || !devices.has(mac)) continue;
		const state = String(neighbor.state || '').toUpperCase();
		const previous = neighborStates.get(mac);
		if (previous == null || (STATE_PRIORITY[state] ?? -1) > (STATE_PRIORITY[previous] ?? -1)) neighborStates.set(mac, state);
	}
	const complete = data.discoveryComplete === true;
	for (const device of devices.values()) {
		const state = neighborStates.get(device.mac);
		if (wifi.has(device.mac)) {
			device.status = 'online';
			device.statusDetail = i18n.t('Active Wi-Fi association');
		} else if (ACTIVE_STATES.includes(state)) {
			device.status = 'online';
			device.statusDetail = i18n.t('Active network neighbor (%s)').format(state);
		} else if (state === 'FAILED') {
			device.status = 'offline';
			device.statusDetail = i18n.t('Network neighbor probe failed (FAILED)');
		} else if (!complete) {
			device.statusDetail = i18n.t('Some discovery sources are unavailable');
		} else if (!device.isDiscovered && !state && device.isSaved) {
			device.status = 'offline';
			device.statusDetail = i18n.t('Saved device not found in the current network');
		} else if (state) {
			device.statusDetail = i18n.t('No recent activity confirmed (%s)').format(state);
		} else if (arp.has(device.mac)) {
			device.statusDetail = i18n.t('ARP record exists without recent activity evidence');
		} else {
			device.statusDetail = i18n.t('Known device without recent activity evidence');
		}
	}
	const statusOrder = { online: 0, unknown: 1, offline: 2 };
	return Array.from(devices.values()).sort((a, b) => {
		if (a.status !== b.status) return statusOrder[a.status] - statusOrder[b.status];
		if (!!a.ipv4 !== !!b.ipv4) return a.ipv4 ? -1 : 1;
		if (a.ipv4 && b.ipv4) {
			const left = a.ipv4.split('.').map(Number), right = b.ipv4.split('.').map(Number);
			for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return left[i] - right[i];
		}
		return a.mac.localeCompare(b.mac);
	});
}

return baseclass.extend({
	normalizeMac: normalizeMac,
	sanitizeInput: sanitizeInput,
	sectionMac: sectionMac,
	getSectionId: mac => 'dev_' + normalizeMac(mac).replace(/:/g, '').toLowerCase(),
	groupName: groupName,
	matchesDevice: matchesDevice,
	parseDevices: parseDevices,
	parseGroups: sections => (sections || []).map(section => {
		const id = section['.name'], name = sanitizeInput(section.name) || id;
		const defaults = DEFAULT_GROUPS[id];
		return { id: id, name: defaults && defaults.stored.includes(name) ? defaults.label() : name };
	}),
	parseArp: content => String(content || '').trim().split('\n').slice(1).map(line => {
		const fields = line.trim().split(/\s+/);
		return { ip: fields[0], flags: fields[2], mac: fields[3], dev: fields[5] };
	}).filter(entry => entry.dev && normalizeMac(entry.mac))
});
