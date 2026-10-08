'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { environment, loadModule, backend, root } = require('./helpers/runtime');

const EXPECTED_ICONS = [
	'computer.svg', 'laptop.svg', 'phone.svg', 'tablet.svg',
	'tv.svg', 'tvbox.svg', 'nas.svg', 'printer.svg',
	'camera.svg', 'speaker.svg', 'game.svg', 'router.svg',
	'switch.svg', 'ap.svg', 'server.svg', 'plug.svg',
	'light.svg', 'sensor.svg', 'home.svg', 'watch.svg',
	'car.svg', 'vr.svg', 'network.svg', 'unknown.svg'
];

function pageContext(initial = []) {
	const mocks = backend(initial);
	const env = environment(mocks);
	const cache = new Map();
	const i18n = loadModule('device-manager.i18n', env, cache);
	const model = loadModule('device-manager.model', env, cache);
	const service = loadModule('device-manager.service', env, cache);
	const page = loadModule('view.device-manager.devices', env, cache);
	return Object.assign({ env, page, model, service }, mocks);
}

test('all 24 Lucide icons are present in device-icons/ and web resource directories', () => {
	const dir1 = path.join(root, 'device-icons');
	const dir2 = path.join(root, 'htdocs/luci-static/resources/device-manager/device-icons');

	assert.equal(fs.existsSync(dir1), true);
	assert.equal(fs.existsSync(dir2), true);

	for (const icon of EXPECTED_ICONS) {
		const file1 = path.join(dir1, icon);
		const file2 = path.join(dir2, icon);

		assert.equal(fs.existsSync(file1), true, `Missing ${file1}`);
		assert.equal(fs.existsSync(file2), true, `Missing ${file2}`);

		const content1 = fs.readFileSync(file1, 'utf8');
		const content2 = fs.readFileSync(file2, 'utf8');

		assert.match(content1, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		assert.match(content1, /<\/svg>/);
		assert.match(content2, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		assert.match(content2, /<\/svg>/);
	}
});

test('detectDeviceType correctly classifies device types by MAC address OUI', () => {
	const env = environment();
	const model = loadModule('device-manager.model', env);

	const cases = [
		{ mac: '00:11:32:11:22:33', expected: 'nas' },
		{ mac: '4C:FC:AA:11:22:33', expected: 'car' },
		{ mac: '2C:26:17:11:22:33', expected: 'vr' },
		{ mac: '00:1B:78:11:22:33', expected: 'printer' },
		{ mac: '10:12:FB:11:22:33', expected: 'camera' },
		{ mac: '00:09:BF:11:22:33', expected: 'game' },
		{ mac: '00:0E:58:11:22:33', expected: 'speaker' },
		{ mac: 'F4:F5:E8:11:22:33', expected: 'tvbox' },
		{ mac: '00:1A:9A:11:22:33', expected: 'tv' },
		{ mac: '18:FE:34:11:22:33', expected: 'plug' },
		{ mac: '00:17:88:11:22:33', expected: 'light' },
		{ mac: '54:EF:44:11:22:33', expected: 'sensor' },
		{ mac: '10:2C:6B:11:22:33', expected: 'home' },
		{ mac: '52:54:00:11:22:33', expected: 'server' },
		{ mac: '00:15:6D:11:22:33', expected: 'ap' },
		{ mac: '00:0F:E2:11:22:33', expected: 'switch' },
		{ mac: '00:0C:42:11:22:33', expected: 'router' },
		{ mac: 'B8:27:EB:11:22:33', expected: 'computer' },
		{ mac: 'F0:18:98:11:22:33', expected: 'phone' },
		{ mac: '12:34:56:78:9A:BC', expected: 'unknown' }
	];

	for (const c of cases) {
		const detected = model.detectDeviceType(c.mac, '', '', '');
		assert.equal(detected, c.expected, `MAC ${c.mac} should be ${c.expected}, got ${detected}`);
		const info = model.getTypeInfo(detected);
		assert.equal(info.icon, detected + '.svg');
	}
});

test('detectDeviceType refines classification using hostname or custom name clues', () => {
	const env = environment();
	const model = loadModule('device-manager.model', env);

	const appleMac = 'F0:18:98:11:22:33';
	assert.equal(model.detectDeviceType(appleMac, 'My-iPhone', '', ''), 'phone');
	assert.equal(model.detectDeviceType(appleMac, 'MacBook-Pro', '', ''), 'laptop');
	assert.equal(model.detectDeviceType(appleMac, 'iPad-Mini', '', ''), 'tablet');
	assert.equal(model.detectDeviceType(appleMac, 'Apple-Watch-Ultra', '', ''), 'watch');
	assert.equal(model.detectDeviceType(appleMac, 'Apple-TV-4K', '', ''), 'tvbox');
	assert.equal(model.detectDeviceType(appleMac, 'HomePod-LivingRoom', '', ''), 'speaker');

	const genericMac = '12:34:56:78:9A:BC';
	assert.equal(model.detectDeviceType(genericMac, 'DiskStation', '', ''), 'nas');
	assert.equal(model.detectDeviceType(genericMac, 'Tesla-Model-Y', '', ''), 'car');
	assert.equal(model.detectDeviceType(genericMac, 'Oculus-Quest-3', '', ''), 'vr');
	assert.equal(model.detectDeviceType(genericMac, 'HP-LaserJet', '', ''), 'printer');
	assert.equal(model.detectDeviceType(genericMac, 'Hikvision-IPC', '', ''), 'camera');
	assert.equal(model.detectDeviceType(genericMac, 'PlayStation-5', '', ''), 'game');
	assert.equal(model.detectDeviceType(genericMac, 'USW-Lite-16-PoE', '', ''), 'switch');
	assert.equal(model.detectDeviceType(genericMac, 'UniFi-U6-Pro', '', ''), 'ap');
});

test('device table renders the device icon in the first column', async () => {
	const ctx = pageContext();
	const nasMac = '00:11:32:11:22:33';
	ctx.replies['luci-rpc.getHostHints'] = {
		[nasMac]: { name: 'Synology-NAS', ipaddrs: ['192.168.1.50'] }
	};

	const data = await ctx.page.load();
	const viewNode = ctx.page.render(data);

	// Check table thead has type column
	const table = viewNode.querySelector('#device_manager_table');
	const thList = table.querySelectorAll('th');
	assert.equal(thList[0].classes.has('dm-type-th'), true);

	// Check tbody row has the icon in the first column
	const tbody = viewNode.querySelector('#device_manager_tbody');
	const rows = tbody.querySelectorAll('tr');
	assert.equal(rows.length, 1);

	const row = rows[0];
	const tdList = row.querySelectorAll('td');
	assert.equal(tdList[0].classes.has('dm-type-cell'), true);

	const iconImg = tdList[0].querySelector('img');
	assert.ok(iconImg);
	assert.equal(iconImg.classes.has('dm-device-icon'), true);
	assert.match(iconImg.attrs.src, /device-icons\/nas\.svg/);
});

test('custom device type override can be saved and displayed', async () => {
	const customMac = '00:11:32:55:66:77';
	const initial = [
		{ '.type': 'device', '.name': 'dev_001132556677', mac: customMac, name: 'Backup Server', type: 'server' }
	];
	const ctx = pageContext(initial);
	const data = await ctx.page.load();
	const viewNode = ctx.page.render(data);

	const row = viewNode.querySelector('#device_manager_tbody').querySelectorAll('tr')[0];
	const iconImg = row.querySelectorAll('td')[0].querySelector('img');
	assert.match(iconImg.attrs.src, /device-icons\/server\.svg/);

	// Test saving a new type via service
	await ctx.service.saveDevice(customMac, 'Backup Server', 'Rack 1', 'ungrouped', 'nas');
	assert.equal(ctx.state.saved[0].type, 'nas');
});
