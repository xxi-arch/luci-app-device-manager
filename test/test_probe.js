'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { root } = require('./helpers/runtime');

function fixture(t, command, prefix) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'device-manager-probe-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const clock = path.join(directory, 'uptime');
    fs.writeFileSync(clock, '100.00 0.00\n');
    fs.writeFileSync(path.join(directory, 'arp'), '192.168.1.200 0x1 0x2 aa:bb:cc:11:22:33 * br-lan\n');
    fs.writeFileSync(path.join(directory, 'leases'), '123 aa:bb:cc:11:22:33 192.168.1.200 known *\n123 aa:bb:cc:11:22:44 192.168.3.20 other *\n');
    const source = fs.readFileSync(path.join(root, 'root/usr/libexec/rpcd/luci.device-manager'), 'utf8')
        .replaceAll('. /usr/share/libubox/jshn.sh', '. "$AUDIT_JSHN"')
        .replaceAll('/tmp/luci-device-manager-probe', path.join(directory, 'probe'))
        .replaceAll('/proc/uptime', clock)
        .replaceAll('/proc/net/arp', path.join(directory, 'arp'))
        .replaceAll('/tmp/dhcp.leases', path.join(directory, 'leases'))
        .replaceAll('/var/dhcp.leases', path.join(directory, 'leases'));
    const wrapper = `
ip() {
    if [ "$1" = -4 ]; then
        printf '%s\\n' '192.168.1.0/24 dev br-lan scope link' '192.168.2.0/24 dev br-guest scope link'
    else
        printf '%s\\n' '192.168.1.200 dev br-lan lladdr aa:bb:cc:11:22:33 REACHABLE'
    fi
}
uci() { return 1; }
ping() {
    for argument in "$@"; do target="$argument"; done
    printf 'start %s\\n' "$target" >> "$AUDIT_PING_LOG"
    sleep "$AUDIT_PING_DELAY"
    if [ -n "$AUDIT_ADVANCE" ]; then printf '%s.00 0.00\\n' "$AUDIT_ADVANCE" > "$AUDIT_CLOCK"; fi
    printf 'end %s\\n' "$target" >> "$AUDIT_PING_LOG"
    return 1
}
` + source;
    let sequence = 0;
    return {
        clock,
        directory,
        run(extra = {}) {
            const id = sequence++;
            const log = path.join(directory, 'pings-' + id);
            const child = spawn(command, [...prefix, '-c', wrapper, 'probe-test', 'call', 'get_online_status'], {
                env: Object.assign({}, process.env, {
                    AUDIT_JSHN: path.join(root, 'test/helpers/jshn.sh'),
                    AUDIT_NODE: process.execPath,
                    AUDIT_JSON_ENCODER: path.join(root, 'test/helpers/json-encoder.js'),
                    AUDIT_JSON_LOG: path.join(directory, 'json-' + id),
                    AUDIT_PING_LOG: log, AUDIT_PING_DELAY: '0.02', AUDIT_ADVANCE: '', AUDIT_CLOCK: clock
                }, extra)
            });
            let stdout = '', stderr = '';
            child.stdout.on('data', data => { stdout += data; });
            child.stderr.on('data', data => { stderr += data; });
            const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
            const done = new Promise((resolve, reject) => {
                child.on('error', reject);
                child.on('close', code => {
                    clearTimeout(timer);
                    if (code !== 0) { reject(new Error(stderr || 'RPC exit: ' + code)); return; }
                    resolve({ reply: JSON.parse(stdout), log });
                });
            });
            return { done, log };
        }
    };
}

function starts(log) {
    if (!fs.existsSync(log)) return [];
    return fs.readFileSync(log, 'utf8').trim().split('\n')
        .filter(line => line.startsWith('start ')).map(line => line.slice(6));
}

for (const [command, prefix] of [['sh', []], ['busybox', ['sh']]]) {
    const available = spawnSync(command, [...prefix, '-c', 'command -v flock >/dev/null']).status === 0;
    test(`${command}: active probes are bounded, deduplicated, cooled down and resume the sweep`, { skip: !available }, async t => {
        const f = fixture(t, command, prefix);
        const seen = new Set();
        for (let pass = 0; pass < 4; pass++) {
            fs.writeFileSync(f.clock, `${100 + pass * 30}.00 0.00\n`);
            const result = await f.run().done;
            assert.equal(result.reply.ok, true); // Failed ICMP must still return the neighbor snapshot.
            const addresses = starts(result.log);
            assert.equal(addresses.length, 128);
            assert.equal(new Set(addresses).size, 128);
            if (pass === 0) assert.deepEqual(addresses.slice(0, 2).sort(), ['192.168.1.200', '192.168.3.20']);
            if (pass === 1) assert.ok(addresses.every(ip => !seen.has(ip)), 'second pass must resume, not restart');
            addresses.forEach(ip => seen.add(ip));
            let active = 0, peak = 0;
            for (const line of fs.readFileSync(result.log, 'utf8').trim().split('\n')) {
                active += line.startsWith('start ') ? 1 : -1;
                peak = Math.max(peak, active);
            }
            assert.ok(peak <= 16, `peak concurrency was ${peak}`);
            assert.equal(active, 0, 'all probes must finish before releasing the lock');
            const cooldown = await f.run().done;
            assert.equal(cooldown.reply.ok, true);
            assert.deepEqual(starts(cooldown.log), []);
        }
        assert.equal(seen.size, 509, 'both /24 subnets plus the extra known host must eventually be scanned');
    });

    test(`${command}: overlapping RPCs share one scan and the lock is released afterwards`, { skip: !available }, async t => {
        const f = fixture(t, command, prefix);
        const first = f.run({ AUDIT_PING_DELAY: '0.05' });
        for (let attempt = 0; attempt < 100 && starts(first.log).length === 0; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(starts(first.log).length > 0, 'first request must have acquired the scan lock');
        const second = await f.run().done;
        assert.equal(second.reply.ok, true);
        assert.deepEqual(starts(second.log), []);
        await first.done;
        fs.writeFileSync(f.clock, '130.00 0.00\n');
        const next = await f.run().done;
        assert.equal(starts(next.log).length, 128, 'next eligible request must acquire the released lock');
    });

    test(`${command}: elapsed-time budget stops a scan before its address limit`, { skip: !available }, async t => {
        const f = fixture(t, command, prefix);
        const result = await f.run({ AUDIT_ADVANCE: '108' }).done;
        assert.equal(result.reply.ok, true);
        assert.equal(starts(result.log).length, 16);
        assert.equal(fs.readFileSync(path.join(f.directory, 'probe.state'), 'utf8'), '108 16\n');
        fs.writeFileSync(f.clock, '130.00 0.00\n');
        assert.deepEqual(starts((await f.run().done).log), [], 'cooldown starts after the scan finishes');
    });
}
