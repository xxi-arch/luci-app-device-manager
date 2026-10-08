/**
 * Automated test suite for luci-app-device-manager
 * Run with: node test/test_device_manager.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Starting luci-app-device-manager Test Suite ===\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`  ✓ [PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`    Error: ${err.message}`);
        failCount++;
    }
}

// -------------------------------------------------------------
// Core logic functions matching devices.js
// -------------------------------------------------------------
function normalizeMac(mac) {
    if (!mac || typeof mac !== 'string')
        return null;
    const clean = mac.trim().toUpperCase().replace(/[:-]/g, '');
    if (clean.length !== 12 || !/^[0-9A-F]{12}$/.test(clean))
        return null;
    return clean.match(/.{2}/g).join(':');
}

function getSectionId(mac) {
    const clean = mac.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
    return 'dev_' + clean;
}

function sanitizeInput(str) {
    if (str == null)
        return '';
    return String(str).trim().replace(/[\r\n\t\0]/g, ' ');
}

const DEFAULT_GROUPS = [
    { id: 'smart_home', name: '智能家居' },
    { id: 'phone',      name: '手机设备' },
    { id: 'computer',   name: '电脑设备' },
    { id: 'network',    name: '网络设备' },
    { id: 'other',      name: '其他设备' }
];

const STORAGE_KEY = 'luci-device-manager-view';

function mockLoadViewState(storageMock, validGroupIds) {
    try {
        const raw = storageMock.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const tab = ['all', 'online', 'offline', 'unknown'].includes(parsed.tab) ? parsed.tab : 'all';
                let group = 'all';
                if (parsed.group === 'all' || parsed.group === 'ungrouped' || (validGroupIds && validGroupIds.includes(parsed.group))) {
                    group = parsed.group;
                }
                return { tab, group };
            }
        }
    } catch (e) {}
    return { tab: 'all', group: 'all' };
}

function mockSaveViewState(storageMock, tab, group) {
    try {
        storageMock.setItem(STORAGE_KEY, JSON.stringify({
            tab: tab || 'all',
            group: group || 'all'
        }));
    } catch (e) {}
}

function mockParseDevices(hostHintsObj, rawHints, dhcpLeases, onlineStatusData, wifiStations, arpEntries, uciSections, groups) {
    const devicesMap = new Map();

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

    if (hostHintsObj && hostHintsObj.hosts) {
        for (const rawMac in hostHintsObj.hosts) {
            const entry = getEntry(rawMac);
            if (!entry) continue;
            entry.isDiscovered = true;
            const h = hostHintsObj.hosts[rawMac];
            if (h.name && !entry.hostname) entry.hostname = h.name;
            const ipv4 = Array.isArray(h.ipaddrs) ? h.ipaddrs[0] : (h.ipv4 || '');
            if (ipv4 && !entry.ipv4) entry.ipv4 = ipv4;
            const ipv6 = Array.isArray(h.ip6addrs) ? h.ip6addrs[0] : (h.ipv6 || '');
            if (ipv6 && !entry.ipv6) entry.ipv6 = ipv6;
        }
    }

    if (dhcpLeases) {
        const leases = Array.isArray(dhcpLeases.dhcp_leases) ? dhcpLeases.dhcp_leases : [];
        for (let i = 0; i < leases.length; i++) {
            const l = leases[i];
            const entry = getEntry(l.macaddr);
            if (!entry) continue;
            entry.isDiscovered = true;
            if (l.ipaddr && !entry.ipv4) entry.ipv4 = l.ipaddr;
            if (l.hostname && !entry.hostname) entry.hostname = l.hostname;
        }
    }

    if (uciSections) {
        for (let i = 0; i < uciSections.length; i++) {
            const sec = uciSections[i];
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
            const groupExists = groups && groups.some(g => g.id === savedGroup);
            entry.group = (savedGroup && groupExists) ? savedGroup : 'ungrouped';
        }
    }

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

    devicesMap.forEach(function(dev) {
        const isWifi = wifiSet.has(dev.mac);
        const neighState = neighborMap.get(dev.mac);
        const arpFlag = arpMap.get(dev.mac);

        if (isWifi) {
            dev.status = 'online';
            dev.statusDetail = 'Wi-Fi 活跃连接';
        } else if (neighState === 'REACHABLE' || neighState === 'DELAY' || neighState === 'PROBE') {
            dev.status = 'online';
            dev.statusDetail = `网络邻居活跃 (${neighState})`;
        } else if (neighState === 'FAILED') {
            dev.status = 'offline';
            dev.statusDetail = '网络邻居探测失败 (FAILED)';
        } else if (!dev.isDiscovered && !neighState && dev.isSaved) {
            dev.status = 'offline';
            dev.statusDetail = '未在当前局域网发现 (仅历史记录)';
        } else if (neighState === 'STALE') {
            dev.status = 'unknown';
            dev.statusDetail = '网络邻居近期无活动 (STALE)';
        } else if (arpFlag === '0x2') {
            dev.status = 'unknown';
            dev.statusDetail = '存在 ARP 解析记录';
        } else if (dev.isDiscovered) {
            dev.status = 'unknown';
            dev.statusDetail = '仅主机探测记录，缺少近期活动证据';
        } else {
            dev.status = 'unknown';
            dev.statusDetail = '状态未知';
        }
    });

    return Array.from(devicesMap.values());
}

// -------------------------------------------------------------
// 1. MAC Normalization Tests
// -------------------------------------------------------------
console.log('--- 1. MAC Normalization & Validation ---');

runTest('Standard uppercase colon format', () => {
    assert.strictEqual(normalizeMac('AA:BB:CC:11:22:33'), 'AA:BB:CC:11:22:33');
});

runTest('Lowercase colon format to uppercase', () => {
    assert.strictEqual(normalizeMac('aa:bb:cc:11:22:33'), 'AA:BB:CC:11:22:33');
});

runTest('Hyphen-separated format to colon', () => {
    assert.strictEqual(normalizeMac('aa-bb-cc-11-22-33'), 'AA:BB:CC:11:22:33');
    assert.strictEqual(normalizeMac('AA-BB-CC-11-22-33'), 'AA:BB:CC:11:22:33');
});

runTest('Continuous hex characters without separators', () => {
    assert.strictEqual(normalizeMac('aabbcc112233'), 'AA:BB:CC:11:22:33');
});

runTest('Invalid MAC address formats', () => {
    assert.strictEqual(normalizeMac(''), null);
    assert.strictEqual(normalizeMac(null), null);
    assert.strictEqual(normalizeMac('ZZ:BB:CC:11:22:33'), null);
    assert.strictEqual(normalizeMac('AA:BB:CC:11:22:33:44'), null);
});

// -------------------------------------------------------------
// 2. UCI Section ID Generation
// -------------------------------------------------------------
console.log('\n--- 2. UCI Section ID Generation ---');

runTest('Stable and deterministic section ID generation', () => {
    assert.strictEqual(getSectionId('AA:BB:CC:11:22:33'), 'dev_aabbcc112233');
    assert.strictEqual(getSectionId('aa:bb:cc:11:22:33'), 'dev_aabbcc112233');
});

// -------------------------------------------------------------
// 3. Online Status Recognition Tests
// -------------------------------------------------------------
console.log('\n--- 3. Online Status Recognition Rules ---');

runTest('Wi-Fi associated device is marked online', () => {
    const hostHints = { hosts: { 'AA:BB:CC:11:22:33': { name: 'phone', ipaddrs: ['192.168.1.100'] } } };
    const wifiStations = ['AA:BB:CC:11:22:33'];
    const devs = mockParseDevices(hostHints, null, null, null, wifiStations, null, null, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].status, 'online');
    assert.ok(devs[0].statusDetail.includes('Wi-Fi'));
});

runTest('Neighbor state REACHABLE is marked online', () => {
    const hostHints = { hosts: { 'AA:BB:CC:11:22:33': { name: 'pc', ipaddrs: ['192.168.1.101'] } } };
    const onlineStatus = { neighbors: [{ mac: 'AA:BB:CC:11:22:33', state: 'REACHABLE' }] };
    const devs = mockParseDevices(hostHints, null, null, onlineStatus, null, null, null, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].status, 'online');
    assert.ok(devs[0].statusDetail.includes('REACHABLE'));
});

runTest('Neighbor state FAILED is marked offline', () => {
    const hostHints = { hosts: { 'AA:BB:CC:11:22:33': { name: 'tv', ipaddrs: ['192.168.1.102'] } } };
    const onlineStatus = { neighbors: [{ mac: 'AA:BB:CC:11:22:33', state: 'FAILED' }] };
    const devs = mockParseDevices(hostHints, null, null, onlineStatus, null, null, null, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].status, 'offline');
});

runTest('Historical saved device absent from network is marked offline', () => {
    const uciSections = [{ '.name': 'dev_aabbcc112233', mac: 'AA:BB:CC:11:22:33', name: '旧设备' }];
    const devs = mockParseDevices(null, null, null, null, null, null, uciSections, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].status, 'offline');
    assert.strictEqual(devs[0].isDiscovered, false);
    assert.strictEqual(devs[0].isSaved, true);
});

runTest('Neighbor state STALE is marked unknown (not assumed online)', () => {
    const hostHints = { hosts: { 'AA:BB:CC:11:22:33': { name: 'plug', ipaddrs: ['192.168.1.103'] } } };
    const onlineStatus = { neighbors: [{ mac: 'AA:BB:CC:11:22:33', state: 'STALE' }] };
    const devs = mockParseDevices(hostHints, null, null, onlineStatus, null, null, null, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].status, 'unknown');
    assert.ok(devs[0].statusDetail.includes('STALE'));
});

runTest('Host hints entry without recent neighbor activity is marked unknown', () => {
    const hostHints = { hosts: { 'AA:BB:CC:11:22:33': { name: 'printer', ipaddrs: ['192.168.1.104'] } } };
    const devs = mockParseDevices(hostHints, null, null, null, null, null, null, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].status, 'unknown');
});

// -------------------------------------------------------------
// 4. Custom Device Groups & Backward Compatibility
// -------------------------------------------------------------
console.log('\n--- 4. Device Groups & Legacy Compatibility ---');

runTest('Legacy device without group option defaults to ungrouped', () => {
    const uciSections = [
        { '.name': 'dev_aabbcc112233', mac: 'AA:BB:CC:11:22:33', name: '旧电脑', remark: '未设置分组' }
    ];
    const devs = mockParseDevices(null, null, null, null, null, null, uciSections, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].group, 'ungrouped');
});

runTest('Device with valid group associates properly', () => {
    const uciSections = [
        { '.name': 'dev_aabbcc112233', mac: 'AA:BB:CC:11:22:33', name: '电视', group: 'smart_home' }
    ];
    const devs = mockParseDevices(null, null, null, null, null, null, uciSections, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].group, 'smart_home');
});

runTest('Device with non-existent or deleted group falls back to ungrouped', () => {
    const uciSections = [
        { '.name': 'dev_aabbcc112233', mac: 'AA:BB:CC:11:22:33', name: '电视', group: 'deleted_group' }
    ];
    const devs = mockParseDevices(null, null, null, null, null, null, uciSections, DEFAULT_GROUPS);
    assert.strictEqual(devs.length, 1);
    assert.strictEqual(devs[0].group, 'ungrouped');
});

// -------------------------------------------------------------
// 5. Status Tab & Multi-Criteria Filtering
// -------------------------------------------------------------
console.log('\n--- 5. Status Tab & Combined Filtering ---');

const sampleDevices = [
    { mac: '11:11:11:11:11:11', customName: '客厅电视', hostname: 'tv', group: 'smart_home', status: 'online', ipv4: '192.168.1.10', remark: '55寸' },
    { mac: '22:22:22:22:22:22', customName: '主力电脑', hostname: 'pc', group: 'computer', status: 'online', ipv4: '192.168.1.20', remark: '开发' },
    { mac: '33:33:33:33:33:33', customName: '客房插座', hostname: 'plug', group: 'smart_home', status: 'unknown', ipv4: '192.168.1.30', remark: '' },
    { mac: '44:44:44:44:44:44', customName: '旧打印机', hostname: '', group: 'ungrouped', status: 'offline', ipv4: '', remark: '备用' },
    { mac: '55:55:55:55:55:55', customName: '苹果手机', hostname: 'iphone', group: 'phone', status: 'offline', ipv4: '192.168.1.50', remark: '' }
];

function filterList(devices, activeTab, activeGroup, query) {
    const q = (query || '').trim().toLowerCase();
    return devices.filter(dev => {
        if (activeTab !== 'all' && dev.status !== activeTab) return false;
        if (activeGroup !== 'all') {
            if (activeGroup === 'ungrouped') {
                if (dev.group && dev.group !== 'ungrouped') return false;
            } else {
                if (dev.group !== activeGroup) return false;
            }
        }
        if (q) {
            const matched = (
                (dev.customName && dev.customName.toLowerCase().includes(q)) ||
                (dev.hostname && dev.hostname.toLowerCase().includes(q)) ||
                (dev.ipv4 && dev.ipv4.toLowerCase().includes(q)) ||
                (dev.mac && dev.mac.toLowerCase().includes(q)) ||
                (dev.remark && dev.remark.toLowerCase().includes(q))
            );
            if (!matched) return false;
        }
        return true;
    });
}

function computeTabCounts(devices, activeGroup, query) {
    let total = 0, online = 0, offline = 0, unknown = 0;
    const q = (query || '').trim().toLowerCase();

    for (let i = 0; i < devices.length; i++) {
        const dev = devices[i];
        if (activeGroup !== 'all') {
            if (activeGroup === 'ungrouped') {
                if (dev.group && dev.group !== 'ungrouped') continue;
            } else {
                if (dev.group !== activeGroup) continue;
            }
        }
        if (q) {
            const matched = (
                (dev.customName && dev.customName.toLowerCase().includes(q)) ||
                (dev.hostname && dev.hostname.toLowerCase().includes(q)) ||
                (dev.ipv4 && dev.ipv4.toLowerCase().includes(q)) ||
                (dev.mac && dev.mac.toLowerCase().includes(q)) ||
                (dev.remark && dev.remark.toLowerCase().includes(q))
            );
            if (!matched) continue;
        }
        total++;
        if (dev.status === 'online') online++;
        else if (dev.status === 'offline') offline++;
        else unknown++;
    }
    return { total, online, offline, unknown };
}

runTest('Accurate tab counts for all devices', () => {
    const counts = computeTabCounts(sampleDevices, 'all', '');
    assert.strictEqual(counts.total, 5);
    assert.strictEqual(counts.online, 2);
    assert.strictEqual(counts.offline, 2);
    assert.strictEqual(counts.unknown, 1);
    assert.strictEqual(counts.total, counts.online + counts.offline + counts.unknown);
});

runTest('Tab counts update dynamically based on group selection', () => {
    const counts = computeTabCounts(sampleDevices, 'smart_home', '');
    assert.strictEqual(counts.total, 2);
    assert.strictEqual(counts.online, 1);
    assert.strictEqual(counts.offline, 0);
    assert.strictEqual(counts.unknown, 1);
});

runTest('Filter by online tab', () => {
    const onlineDevs = filterList(sampleDevices, 'online', 'all', '');
    assert.strictEqual(onlineDevs.length, 2);
    assert.ok(onlineDevs.every(d => d.status === 'online'));
});

runTest('Combine status tab + group filter + search query', () => {
    // Online tab + smart_home group + search "客厅"
    const res = filterList(sampleDevices, 'online', 'smart_home', '客厅');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].mac, '11:11:11:11:11:11');
});

runTest('Filter ungrouped devices', () => {
    const ungrouped = filterList(sampleDevices, 'all', 'ungrouped', '');
    assert.strictEqual(ungrouped.length, 1);
    assert.strictEqual(ungrouped[0].customName, '旧打印机');
});

// -------------------------------------------------------------
// 6. Browser Memory (localStorage) Tests
// -------------------------------------------------------------
console.log('\n--- 6. Browser Memory (localStorage) Resilience ---');

class MockLocalStorage {
    constructor() { this.store = {}; }
    getItem(key) { return this.store[key] !== undefined ? this.store[key] : null; }
    setItem(key, val) { this.store[key] = String(val); }
    removeItem(key) { delete this.store[key]; }
    clear() { this.store = {}; }
}

runTest('Save and restore view state correctly', () => {
    const storage = new MockLocalStorage();
    mockSaveViewState(storage, 'online', 'smart_home');
    const state = mockLoadViewState(storage, ['smart_home', 'phone']);
    assert.strictEqual(state.tab, 'online');
    assert.strictEqual(state.group, 'smart_home');
});

runTest('Default view state on first visit', () => {
    const storage = new MockLocalStorage();
    const state = mockLoadViewState(storage, ['smart_home']);
    assert.strictEqual(state.tab, 'all');
    assert.strictEqual(state.group, 'all');
});

runTest('Gracefully fallback if saved group was deleted', () => {
    const storage = new MockLocalStorage();
    mockSaveViewState(storage, 'online', 'old_deleted_group');
    const state = mockLoadViewState(storage, ['smart_home', 'phone']);
    assert.strictEqual(state.tab, 'online');
    assert.strictEqual(state.group, 'all'); // Falls back to all
});

runTest('Resilience against corrupted or invalid localStorage JSON', () => {
    const storage = new MockLocalStorage();
    storage.setItem(STORAGE_KEY, '{invalid_json');
    const state = mockLoadViewState(storage, ['smart_home']);
    assert.strictEqual(state.tab, 'all');
    assert.strictEqual(state.group, 'all');
});

runTest('No sensitive device data (MAC, IP, remarks) in localStorage', () => {
    const storage = new MockLocalStorage();
    mockSaveViewState(storage, 'online', 'smart_home');
    const raw = storage.getItem(STORAGE_KEY);
    assert.ok(!raw.includes('AA:BB:CC'));
    assert.ok(!raw.includes('192.168.'));
    assert.ok(!raw.includes('remark'));
});

// -------------------------------------------------------------
// 7. UCI Group Lifecycle & Group Deletion Safety
// -------------------------------------------------------------
console.log('\n--- 7. Group Lifecycle & Device Safety ---');

class MockUCI {
    constructor() { this.sections = []; }
    add(conf, type, sid) {
        this.sections.push({ '.name': sid, '.type': type });
        return sid;
    }
    set(conf, sid, opt, val) {
        const sec = this.sections.find(s => s['.name'] === sid);
        if (sec) sec[opt] = val;
    }
    unset(conf, sid, opt) {
        const sec = this.sections.find(s => s['.name'] === sid);
        if (sec) delete sec[opt];
    }
    remove(conf, sid) {
        this.sections = this.sections.filter(s => s['.name'] !== sid);
    }
    get(conf, sid, opt) {
        const sec = this.sections.find(s => s['.name'] === sid);
        return sec ? sec[opt] : null;
    }
}

runTest('Create, rename, and delete group without losing device remarks', () => {
    const uci = new MockUCI();

    // 1. Add group
    const grpId = 'grp_office';
    uci.add('device_manager', 'group', grpId);
    uci.set('device_manager', grpId, 'name', '办公室设备');

    // 2. Add device assigned to group
    const devSid = 'dev_aabbcc112233';
    uci.add('device_manager', 'device', devSid);
    uci.set('device_manager', devSid, 'mac', 'AA:BB:CC:11:22:33');
    uci.set('device_manager', devSid, 'name', '办公主机');
    uci.set('device_manager', devSid, 'remark', '工位A1');
    uci.set('device_manager', devSid, 'group', grpId);

    assert.strictEqual(uci.get('device_manager', grpId, 'name'), '办公室设备');
    assert.strictEqual(uci.get('device_manager', devSid, 'group'), grpId);

    // 3. Rename group
    uci.set('device_manager', grpId, 'name', '研发部设备');
    // Group ID does not change, device remains linked
    assert.strictEqual(uci.get('device_manager', grpId, 'name'), '研发部设备');
    assert.strictEqual(uci.get('device_manager', devSid, 'group'), grpId);

    // 4. Delete group: remove group section, unlink device to ungrouped
    uci.remove('device_manager', grpId);
    uci.unset('device_manager', devSid, 'group');

    // Group section removed
    assert.strictEqual(uci.get('device_manager', grpId, 'name'), null);
    // Device and its name/remark are 100% PRESERVED
    assert.strictEqual(uci.get('device_manager', devSid, 'name'), '办公主机');
    assert.strictEqual(uci.get('device_manager', devSid, 'remark'), '工位A1');
    assert.strictEqual(uci.get('device_manager', devSid, 'group'), undefined);
});

// -------------------------------------------------------------
// 8. OpenWrt Configuration & Package Compliance
// -------------------------------------------------------------
console.log('\n--- 8. OpenWrt Configuration & Package Compliance ---');

runTest('Verify rpcd helper script exists, executable, and valid', () => {
    const scriptPath = path.join(__dirname, '../root/usr/libexec/rpcd/luci.device-manager');
    assert.ok(fs.existsSync(scriptPath), 'rpcd helper script must exist');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('get_online_status'), 'Must expose get_online_status method');
});

runTest('Verify rpcd ACL grants get_online_status permission', () => {
    const aclPath = path.join(__dirname, '../root/usr/share/rpcd/acl.d/luci-app-device-manager.json');
    assert.ok(fs.existsSync(aclPath), 'ACL file must exist');
    const acl = JSON.parse(fs.readFileSync(aclPath, 'utf8'));
    assert.ok(acl['luci-app-device-manager'].read.ubus['luci.device-manager'].includes('get_online_status'));
    assert.ok(acl['luci-app-device-manager'].read.ubus.iwinfo.includes('assoclist'));
});

runTest('Verify uci-defaults creates default groups', () => {
    const uciDefPath = path.join(__dirname, '../root/etc/uci-defaults/80_device_manager');
    assert.ok(fs.existsSync(uciDefPath), '80_device_manager must exist');
    const content = fs.readFileSync(uciDefPath, 'utf8');
    assert.ok(content.includes('smart_home') && content.includes('phone'), 'Must initialize default groups');
});

runTest('Verify Makefile defines CONFFILES for user data persistence', () => {
    const makefilePath = path.join(__dirname, '../Makefile');
    assert.ok(fs.existsSync(makefilePath), 'Makefile must exist');
    const content = fs.readFileSync(makefilePath, 'utf8');
    assert.ok(content.includes('Package/$(PKG_NAME)/conffiles'));
    assert.ok(content.includes('/etc/config/device_manager'));
});

runTest('Verify deploy.sh uploads rpcd helper script', () => {
    const deployPath = path.join(__dirname, '../tools/deploy.sh');
    assert.ok(fs.existsSync(deployPath), 'deploy.sh must exist');
    const content = fs.readFileSync(deployPath, 'utf8');
    assert.ok(content.includes('root/usr/libexec/rpcd/luci.device-manager'), 'deploy.sh must upload rpcd helper');
});

console.log(`\n=== Test Results: ${passCount} Passed, ${failCount} Failed ===\n`);

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
