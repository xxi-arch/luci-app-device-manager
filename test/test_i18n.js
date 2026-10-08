'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { environment, loadModule, backend } = require('./helpers/runtime');

function context(setting, languages, initial = []) {
    const mocks = backend(initial);
    mocks.replies['luci.device-manager.get_language'] = setting instanceof Error ? setting : { language: setting };
    const env = environment(Object.assign({}, mocks, {
        window: { navigator: { languages, language: languages[0] }, localStorage: { getItem: () => null, setItem() {} } }
    }));
    const cache = new Map();
    const i18n = loadModule('device-manager.i18n', env, cache);
    const page = loadModule('view.device-manager.devices', env, cache);
    return { mocks, env, page, i18n };
}
async function render(ctx) { return ctx.page.render(await ctx.page.load()); }
function button(node, label) { return node.querySelectorAll('button').find(item => item.textContent === label); }

test('automatic mode recognizes Chinese variants and ordered browser preferences', () => {
    const ctx = context('auto', ['en-US']);
    for (const tag of ['zh', 'zh-CN', 'zh_Hans', 'zh-Hant', 'zh-TW', 'zh-HK']) {
        ctx.env.window.navigator.languages = [tag];
        assert.equal(ctx.i18n.detectLanguage('auto'), 'zh', tag);
    }
    ctx.env.window.navigator.languages = ['fr-FR', 'en-GB', 'zh-CN'];
    assert.equal(ctx.i18n.detectLanguage('auto'), 'en');
    ctx.env.window.navigator.languages = ['fr-FR', 'zh-CN', 'en-GB'];
    assert.equal(ctx.i18n.detectLanguage('auto'), 'zh');
});
test('explicit LuCI Chinese or English settings override the browser language', async () => {
    const english = context('en', ['zh-CN']); await english.i18n.load();
    assert.equal(english.i18n.t('Save'), 'Save');
    const chinese = context('zh_cn', ['en-US']); await chinese.i18n.load();
    assert.equal(chinese.i18n.t('Save'), '保存');
    const englishHeader = (await render(english)).querySelectorAll('th').find(th => th.getAttribute('data-sort') === 'name');
    const chineseHeader = (await render(chinese)).querySelectorAll('th').find(th => th.getAttribute('data-sort') === 'name');
    assert.equal(englishHeader.querySelector('button').attrs.title, 'Click to sort by Device name');
    assert.equal(chineseHeader.querySelector('button').attrs.title, '点击按设备名称排序');
});
test('Chinese page, status details, placeholders and dialogs work without a separate language package', async () => {
    const mac = 'AA:BB:CC:11:22:33';
    const ctx = context('auto', ['zh-CN'], [{ '.type': 'device', '.name': 'saved', mac, name: '客厅电视' }]);
    const node = await render(ctx);
    assert.ok(button(node, '刷新'));
    assert.ok(button(node, '添加设备'));
    assert.ok(button(node, '隐藏信息'));
    assert.ok(node.querySelector('#dm-search-input').attrs.placeholder.startsWith('搜索'));
    assert.match(ctx.page.devices[0].statusDetail, /已保存记录/);
    ctx.page.showEditModal(ctx.page.devices[0]);
    assert.equal(ctx.env.ui.modal.attrs.title, '编辑设备');
    assert.ok(button(ctx.env.ui.modal, '保存'));
    ctx.page.confirmDelete(ctx.page.devices[0]);
    assert.equal(ctx.env.ui.modal.attrs.title, '确认删除记录');
    ctx.page.showGroupModal();
    assert.equal(ctx.env.ui.modal.attrs.title, '设备分组管理');
    assert.ok(button(ctx.env.ui.modal, '添加分组'));
    assert.deepEqual(ctx.env.htmlSinks, []);
});
test('English page follows an explicit English setting even with Chinese browser/global translations', async () => {
    const ctx = context('en', ['zh-CN']); ctx.env._ = text => '中文:' + text;
    const node = await render(ctx);
    assert.ok(button(node, 'Refresh list')); assert.ok(node.textContent.includes('LAN Device Management'));
    assert.ok(!node.textContent.includes('局域网设备管理'));
});
test('language RPC failure falls back to the browser and does not prevent rendering', async () => {
    const ctx = context(new Error('method unavailable'), ['zh-CN']);
    const node = await render(ctx);
    assert.ok(button(node, '刷新'));
    assert.equal(ctx.mocks.state.commits, 0);
});
test('untouched default group names localize without modifying saved/custom names', async () => {
    const initial = [
        { '.type': 'group', '.name': 'smart_home', name: '智能家居' },
        { '.type': 'group', '.name': 'phone', name: 'My phones' },
        { '.type': 'group', '.name': 'grp_custom', name: '办公设备' }
    ];
    const ctx = context('en', ['zh-CN'], initial);
    await render(ctx);
    assert.deepEqual(ctx.page.groups.map(group => group.name), ['Smart home', 'My phones', '办公设备']);
    assert.deepEqual(ctx.mocks.state.saved, initial);
});
test('unknown strings and missing browser language fall back safely to English', async () => {
    const ctx = context('auto', []); await ctx.i18n.load();
    assert.equal(ctx.i18n.t('Save'), 'Save');
    assert.equal(ctx.i18n.t('unrecognized message'), 'unrecognized message');
    assert.equal(ctx.i18n.detectLanguage('de'), 'en');
});
