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

// Extract core logic functions directly matching devices.js implementation
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

// 1. MAC Normalization Tests
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
    assert.strictEqual(normalizeMac('AABBCC112233'), 'AA:BB:CC:11:22:33');
});

runTest('Whitespace padding handling', () => {
    assert.strictEqual(normalizeMac('  aa:bb:cc:11:22:33  \t'), 'AA:BB:CC:11:22:33');
});

runTest('Invalid MAC address formats', () => {
    assert.strictEqual(normalizeMac(''), null);
    assert.strictEqual(normalizeMac(null), null);
    assert.strictEqual(normalizeMac(undefined), null);
    assert.strictEqual(normalizeMac('invalid'), null);
    assert.strictEqual(normalizeMac('AA:BB:CC'), null);
    assert.strictEqual(normalizeMac('ZZ:BB:CC:11:22:33'), null);
    assert.strictEqual(normalizeMac('AA:BB:CC:11:22:33:44'), null);
});

// 2. UCI Section ID Derivation Tests
console.log('\n--- 2. UCI Section ID Generation ---');

runTest('Stable and deterministic section ID generation', () => {
    assert.strictEqual(getSectionId('AA:BB:CC:11:22:33'), 'dev_aabbcc112233');
    assert.strictEqual(getSectionId('aa:bb:cc:11:22:33'), 'dev_aabbcc112233');
    assert.strictEqual(getSectionId('00:11:22:33:44:55'), 'dev_001122334455');
});

// 3. String Sanitization & UTF-8 Tests
console.log('\n--- 3. Sanitization & Internationalization ---');

runTest('Sanitize control characters while preserving UTF-8 Chinese characters', () => {
    assert.strictEqual(sanitizeInput('客厅电视'), '客厅电视');
    assert.strictEqual(sanitizeInput('55寸安卓智能电视\n一楼客厅'), '55寸安卓智能电视 一楼客厅');
    assert.strictEqual(sanitizeInput('  工作电脑 (MacBook Pro) \r\n'), '工作电脑 (MacBook Pro)');
    assert.strictEqual(sanitizeInput(null), '');
});

// 4. Data Merging, Deduplication & Host Hints Logic Tests
console.log('\n--- 4. Device Discovery & Data Merging ---');

function mockParseDevices(hostHintsObj, rawHints, dhcpLeases, uciSections) {
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
                sid: null,
                isSaved: false,
                isDiscovered: false
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
        }
    }

    return Array.from(devicesMap.values());
}

runTest('Merge host hints with UCI remarks correctly', () => {
    const hostHints = {
        hosts: {
            'AA:BB:CC:11:22:33': { name: 'android-tv', ipaddrs: ['192.168.1.100'] }
        }
    };
    const uciSections = [
        { '.name': 'dev_aabbcc112233', mac: 'AA:BB:CC:11:22:33', name: '客厅电视', remark: '55寸安卓电视' }
    ];

    const result = mockParseDevices(hostHints, null, null, uciSections);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].mac, 'AA:BB:CC:11:22:33');
    assert.strictEqual(result[0].hostname, 'android-tv');
    assert.strictEqual(result[0].customName, '客厅电视');
    assert.strictEqual(result[0].remark, '55寸安卓电视');
    assert.strictEqual(result[0].isDiscovered, true);
    assert.strictEqual(result[0].isSaved, true);
});

runTest('IP change retains existing device remarks', () => {
    // Original IP 192.168.1.100 changed to 192.168.1.150
    const hostHints = {
        hosts: {
            'AA:BB:CC:11:22:33': { name: 'android-tv', ipaddrs: ['192.168.1.150'] }
        }
    };
    const uciSections = [
        { '.name': 'dev_aabbcc112233', mac: 'AA:BB:CC:11:22:33', name: '客厅电视', remark: '55寸安卓电视' }
    ];

    const result = mockParseDevices(hostHints, null, null, uciSections);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].ipv4, '192.168.1.150');
    assert.strictEqual(result[0].customName, '客厅电视');
    assert.strictEqual(result[0].remark, '55寸安卓电视');
});

runTest('Offline/historical device is preserved and marked as not discovered', () => {
    // No active host hints or leases
    const hostHints = { hosts: {} };
    const uciSections = [
        { '.name': 'dev_aabbcc112233', mac: 'AA:BB:CC:11:22:33', name: '客厅电视', remark: '55寸安卓电视' }
    ];

    const result = mockParseDevices(hostHints, null, null, uciSections);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].mac, 'AA:BB:CC:11:22:33');
    assert.strictEqual(result[0].customName, '客厅电视');
    assert.strictEqual(result[0].isDiscovered, false);
    assert.strictEqual(result[0].isSaved, true);
});

runTest('Deduplicate duplicate entries across host hints and DHCP leases', () => {
    const hostHints = {
        hosts: {
            'aa:bb:cc:11:22:33': { name: 'my-laptop', ipaddrs: ['192.168.1.50'] }
        }
    };
    const dhcpLeases = {
        dhcp_leases: [
            { macaddr: 'AA:BB:CC:11:22:33', hostname: 'my-laptop', ipaddr: '192.168.1.50' }
        ]
    };

    const result = mockParseDevices(hostHints, null, dhcpLeases, null);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].mac, 'AA:BB:CC:11:22:33');
});

runTest('Device without hostname or IP', () => {
    const hostHints = {
        hosts: {
            '11:22:33:44:55:66': { name: null, ipaddrs: [] }
        }
    };

    const result = mockParseDevices(hostHints, null, null, null);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].hostname, '');
    assert.strictEqual(result[0].ipv4, '');
    assert.strictEqual(result[0].isDiscovered, true);
    assert.strictEqual(result[0].isSaved, false);
});

// 5. Search and Filter Tests
console.log('\n--- 5. Search & Filter Functionality ---');

const testDevices = [
    { mac: 'AA:BB:CC:11:22:33', hostname: 'android-8fd231', customName: '客厅电视', remark: '55寸安卓电视', ipv4: '192.168.1.100', isDiscovered: true, isSaved: true },
    { mac: 'AA:BB:CC:44:55:66', hostname: 'pc-work', customName: '主力工作电脑', remark: '开发台式机', ipv4: '192.168.1.101', isDiscovered: true, isSaved: true },
    { mac: '11:22:33:44:55:66', hostname: 'iphone-guest', customName: '', remark: '', ipv4: '192.168.1.102', isDiscovered: true, isSaved: false },
    { mac: '99:88:77:66:55:44', hostname: '', customName: '旧打印机', remark: '已断开备用', ipv4: '', isDiscovered: false, isSaved: true }
];

function filterDevices(list, type, text) {
    const query = (text || '').trim().toLowerCase();
    return list.filter(dev => {
        if (type === 'active' && !dev.isDiscovered) return false;
        if (type === 'saved' && !dev.isSaved) return false;
        if (type === 'history' && dev.isDiscovered) return false;

        if (query) {
            const matched = (
                (dev.customName && dev.customName.toLowerCase().includes(query)) ||
                (dev.hostname && dev.hostname.toLowerCase().includes(query)) ||
                (dev.ipv4 && dev.ipv4.toLowerCase().includes(query)) ||
                (dev.mac && dev.mac.toLowerCase().includes(query)) ||
                (dev.remark && dev.remark.toLowerCase().includes(query))
            );
            if (!matched) return false;
        }
        return true;
    });
}

runTest('Search by custom name (Chinese)', () => {
    const res = filterDevices(testDevices, 'all', '客厅电视');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].mac, 'AA:BB:CC:11:22:33');
});

runTest('Search by detected hostname', () => {
    const res = filterDevices(testDevices, 'all', 'android-8fd231');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].mac, 'AA:BB:CC:11:22:33');
});

runTest('Search by IPv4 address', () => {
    const res = filterDevices(testDevices, 'all', '192.168.1.101');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].mac, 'AA:BB:CC:44:55:66');
});

runTest('Search by MAC address prefix', () => {
    const res = filterDevices(testDevices, 'all', 'AA:BB:CC');
    assert.strictEqual(res.length, 2);
});

runTest('Search by remark content', () => {
    const res = filterDevices(testDevices, 'all', '开发台式机');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].customName, '主力工作电脑');
});

runTest('Filter by type: active, saved, history', () => {
    const activeOnly = filterDevices(testDevices, 'active', '');
    assert.strictEqual(activeOnly.length, 3);

    const savedOnly = filterDevices(testDevices, 'saved', '');
    assert.strictEqual(savedOnly.length, 3);

    const historyOnly = filterDevices(testDevices, 'history', '');
    assert.strictEqual(historyOnly.length, 1);
    assert.strictEqual(historyOnly[0].customName, '旧打印机');
});

runTest('No match returns empty array', () => {
    const res = filterDevices(testDevices, 'all', 'nonexistent-query');
    assert.strictEqual(res.length, 0);
});

// 6. UCI Configuration Simulation Tests
console.log('\n--- 6. UCI Persistence & Lifecycle Simulation ---');

class MockUCI {
    constructor() {
        this.sections = [];
    }
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

function handleSaveSimulation(uci, mac, newName, newRemark) {
    const normMac = normalizeMac(mac);
    if (!normMac) throw new Error('Invalid MAC');
    const sid = getSectionId(normMac);

    const existing = uci.sections.find(s => s['.name'] === sid || s.mac === normMac);

    // If both name and remark are cleared, delete the section
    if (!newName && !newRemark) {
        if (existing) uci.remove('device_manager', existing['.name']);
        return;
    }

    const targetSid = existing ? existing['.name'] : sid;
    if (!existing) {
        uci.add('device_manager', 'device', targetSid);
    }

    uci.set('device_manager', targetSid, 'mac', normMac);
    if (newName) uci.set('device_manager', targetSid, 'name', newName);
    else uci.unset('device_manager', targetSid, 'name');

    if (newRemark) uci.set('device_manager', targetSid, 'remark', newRemark);
    else uci.unset('device_manager', targetSid, 'remark');
}

runTest('Save new device with custom name and remark', () => {
    const uci = new MockUCI();
    handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', '客厅电视', '55寸安卓电视');
    assert.strictEqual(uci.sections.length, 1);
    assert.strictEqual(uci.sections[0]['.name'], 'dev_aabbcc112233');
    assert.strictEqual(uci.sections[0].mac, 'AA:BB:CC:11:22:33');
    assert.strictEqual(uci.sections[0].name, '客厅电视');
    assert.strictEqual(uci.sections[0].remark, '55寸安卓电视');
});

runTest('Update existing device custom name only', () => {
    const uci = new MockUCI();
    handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', '客厅电视', '旧备注');
    handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', '客厅主电视', '旧备注');
    assert.strictEqual(uci.sections.length, 1);
    assert.strictEqual(uci.sections[0].name, '客厅主电视');
    assert.strictEqual(uci.sections[0].remark, '旧备注');
});

runTest('Clear remark while keeping custom name', () => {
    const uci = new MockUCI();
    handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', '客厅电视', '有备注');
    handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', '客厅电视', '');
    assert.strictEqual(uci.sections.length, 1);
    assert.strictEqual(uci.sections[0].name, '客厅电视');
    assert.strictEqual(uci.sections[0].remark, undefined);
});

runTest('Clear both name and remark removes UCI section', () => {
    const uci = new MockUCI();
    handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', '客厅电视', '有备注');
    assert.strictEqual(uci.sections.length, 1);
    handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', '', '');
    assert.strictEqual(uci.sections.length, 0);
});

runTest('Repeated edits do not create duplicate sections', () => {
    const uci = new MockUCI();
    for (let i = 0; i < 5; i++) {
        handleSaveSimulation(uci, 'AA:BB:CC:11:22:33', `名称_${i}`, `备注_${i}`);
    }
    assert.strictEqual(uci.sections.length, 1);
    assert.strictEqual(uci.sections[0].name, '名称_4');
    assert.strictEqual(uci.sections[0].remark, '备注_4');
});

// 7. Project Files & OpenWrt Compliance Tests
console.log('\n--- 7. OpenWrt Configuration & Package Compliance ---');

runTest('Verify menu definition syntax and keys', () => {
    const menuPath = path.join(__dirname, '../root/usr/share/luci/menu.d/luci-app-device-manager.json');
    assert.ok(fs.existsSync(menuPath), 'Menu file must exist');
    const menu = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
    assert.ok(menu['admin/network/device-manager'], 'Must define admin/network/device-manager');
    assert.strictEqual(menu['admin/network/device-manager'].title, '设备管理');
    assert.strictEqual(menu['admin/network/device-manager'].action.path, 'device-manager/devices');
});

runTest('Verify rpcd ACL syntax and permissions', () => {
    const aclPath = path.join(__dirname, '../root/usr/share/rpcd/acl.d/luci-app-device-manager.json');
    assert.ok(fs.existsSync(aclPath), 'ACL file must exist');
    const acl = JSON.parse(fs.readFileSync(aclPath, 'utf8'));
    assert.ok(acl['luci-app-device-manager'], 'Must define luci-app-device-manager');
    assert.ok(acl['luci-app-device-manager'].read.ubus['luci-rpc'].includes('getHostHints'));
    assert.ok(acl['luci-app-device-manager'].read.uci.includes('device_manager'));
    assert.ok(acl['luci-app-device-manager'].write.uci.includes('device_manager'));
});

runTest('Verify Makefile defines CONFFILES for user data persistence', () => {
    const makefilePath = path.join(__dirname, '../Makefile');
    assert.ok(fs.existsSync(makefilePath), 'Makefile must exist');
    const content = fs.readFileSync(makefilePath, 'utf8');
    assert.ok(content.includes('PKG_NAME:=luci-app-device-manager'), 'Must have correct PKG_NAME');
    assert.ok(content.includes('Package/$(PKG_NAME)/conffiles'), 'Must define conffiles macro');
    assert.ok(content.includes('/etc/config/device_manager'), 'Must protect /etc/config/device_manager in conffiles');
});

runTest('Verify 80_device_manager does not overwrite existing configuration', () => {
    const uciDefPath = path.join(__dirname, '../root/etc/uci-defaults/80_device_manager');
    assert.ok(fs.existsSync(uciDefPath), '80_device_manager must exist');
    const content = fs.readFileSync(uciDefPath, 'utf8');
    assert.ok(content.includes('! -f /etc/config/device_manager') || content.includes('[ -f /etc/config/device_manager ]'), 'Must check if /etc/config/device_manager exists before creating');
});

runTest('Verify deploy.sh has required safety checks and target arguments', () => {
    const deployPath = path.join(__dirname, '../tools/deploy.sh');
    assert.ok(fs.existsSync(deployPath), 'deploy.sh must exist');
    const content = fs.readFileSync(deployPath, 'utf8');
    assert.ok(content.includes('set -euo pipefail'), 'Must use set -euo pipefail for safety');
    assert.ok(content.includes('rpcd restart'), 'Must restart rpcd');
    assert.ok(content.includes('luci-indexcache'), 'Must clear LuCI indexcache');
    assert.ok(content.includes('/etc/config/device_manager'), 'Must handle /etc/config/device_manager preserving data');
});

console.log(`\n=== Test Results: ${passCount} Passed, ${failCount} Failed ===\n`);

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
