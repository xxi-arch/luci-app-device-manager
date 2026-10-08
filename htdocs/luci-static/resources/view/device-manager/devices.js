'use strict';
'require device-manager.i18n as i18n';
'require view';
'require ui';
'require device-manager.model as model';
'require device-manager.service as service';
'require device-manager.preferences as preferences';
'require device-manager.table as table';
'require device-manager.device-dialog as deviceDialog';
'require device-manager.group-dialog as groupDialog';

return view.extend({
	devices: [],
	groups: [],
	activeTab: 'online',
	activeGroup: 'all',
	maskInfo: false,
	filterText: '',
	readonly: true,
	sortKey: null,
	sortDir: 'asc',
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load: function() {
		return i18n.load().then(() => Promise.all([ service.load(), preferences.load() ]))
			.then(data => ({ snapshot: data[0], preferences: data[1] }));
	},

	acceptData: function(data) {
		this.groups = model.parseGroups(data.groups);
		this.devices = model.parseDevices(data, this.groups);
		this.sourceErrors = data.errors || [];
		if (this.activeGroup !== 'all' && this.activeGroup !== 'ungrouped' && !this.getGroupById(this.activeGroup)) {
			this.activeGroup = 'all';
			preferences.save(this.activeTab, this.activeGroup, this.maskInfo);
		}
	},

	render: function(data) {
		const self = this;

		this.readonly = L.hasViewPermission() !== true;
		this.acceptData(data.snapshot);
		const savedView = data.preferences || {};
		this.activeTab = ['all', 'online', 'offline', 'unknown'].includes(savedView.tab) ? savedView.tab : 'online';
		this.activeGroup = (savedView.group === 'all' || savedView.group === 'ungrouped' || this.getGroupById(savedView.group)) ? savedView.group : 'all';
		this.maskInfo = Boolean(savedView.maskInfo);

		const theadNode = E('thead', {}, [ E('tr', { 'class': 'tr table-titles' }, [
			E('th', {
				'class': 'th dm-type-th dm-sortable',
				'data-sort': 'type',
				'title': (i18n.detectLanguage() === 'zh' ? '点击按设备类型排序' : 'Click to sort by device type'),
				'style': 'width:56px; text-align:center;',
				'click': function() { self.handleSort('type'); }
			}, [
				(i18n.detectLanguage() === 'zh' ? '类型' : 'Type'),
				E('span', { 'class': 'dm-sort-icon' }, [ self.getSortIndicator('type') ])
			]),
			E('th', {
				'class': 'th dm-sortable',
				'data-sort': 'name',
				'title': (i18n.detectLanguage() === 'zh' ? '点击按设备名称排序' : 'Click to sort by device name'),
				'style': 'width:24%;',
				'click': function() { self.handleSort('name'); }
			}, [
				i18n.t('Device name'),
				E('span', { 'class': 'dm-sort-icon' }, [ self.getSortIndicator('name') ])
			]),
			E('th', {
				'class': 'th dm-sortable',
				'data-sort': 'ip',
				'title': (i18n.detectLanguage() === 'zh' ? '点击按 IP 地址排序' : 'Click to sort by IP address'),
				'style': 'width:18%;',
				'click': function() { self.handleSort('ip'); }
			}, [
				i18n.t('IP address'),
				E('span', { 'class': 'dm-sort-icon' }, [ self.getSortIndicator('ip') ])
			]),
			E('th', {
				'class': 'th dm-sortable',
				'data-sort': 'mac',
				'title': (i18n.detectLanguage() === 'zh' ? '点击按 MAC 地址排序' : 'Click to sort by MAC address'),
				'style': 'width:18%;',
				'click': function() { self.handleSort('mac'); }
			}, [
				i18n.t('MAC address'),
				E('span', { 'class': 'dm-sort-icon' }, [ self.getSortIndicator('mac') ])
			]),
			E('th', {
				'class': 'th dm-sortable',
				'data-sort': 'group',
				'title': (i18n.detectLanguage() === 'zh' ? '点击按分组排序' : 'Click to sort by group'),
				'style': 'width:14%;',
				'click': function() { self.handleSort('group'); }
			}, [
				i18n.t('Group'),
				E('span', { 'class': 'dm-sort-icon' }, [ self.getSortIndicator('group') ])
			]),
			E('th', { 'class': 'th', 'style': 'width:14%;' }, [ i18n.t('Remarks') ]),
			E('th', { 'class': 'th cbi-section-actions', 'style': 'width:12%; text-align:center;' }, [ i18n.t('Actions') ])
		]) ]);

		const viewNode = E('div', { 'class': 'cbi-map' }, [
			E('link', { 'rel': 'stylesheet', 'href': L.resource('device-manager/styles.css') }),

			E('h2', {}, [ i18n.t('LAN Device Management') ]),
			E('div', { 'class': 'cbi-map-descr' }, [ i18n.t('Discover network devices and save custom names, remarks and groups by MAC address.') ]),

			E('div', { 'id': 'dm-source-warning', 'class': 'alert-message warning dm-source-warning', 'style': 'display:none;' }),

			// Row 1: Status Tabs
			E('div', { 'class': 'dm-status-tabs', 'id': 'dm-tabs-container', 'role': 'tablist', 'aria-label': i18n.t('Device status') }),

			// Row 2: Controls Toolbar
			E('div', { 'class': 'cbi-section dm-toolbar' }, [
				E('div', { 'class': 'dm-controls' }, [
					E('input', {
						'type': 'text',
						'id': 'dm-search-input',
						'class': 'cbi-input-text',
						'placeholder': i18n.t('Search names, IP, MAC, remarks or groups...'),
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
							preferences.save(self.activeTab, self.activeGroup, self.maskInfo);
							self.updateView();
						}
					})
				]),
				E('div', { 'class': 'dm-btn-group' }, [
					E('button', { 'type': 'button',
						'class': 'cbi-button cbi-button-neutral',
						'disabled': self.readonly || null,
						'click': function() { self.showGroupModal(); }
					}, [ i18n.t('Manage groups') ]),
					E('button', { 'type': 'button',
						'class': 'cbi-button cbi-button-action dm-btn-blue',
						'disabled': self.readonly || null,
						'click': function() { self.showEditModal(null); }
					}, [ ((i18n.language || i18n.detectLanguage()) === 'zh' ? '添加设备' : i18n.t('+ Add device')) ]),
					E('button', { 'type': 'button',
						'class': 'cbi-button cbi-button-neutral',
						'id': 'dm-btn-mask',
						'title': ((i18n.language || i18n.detectLanguage()) === 'zh' ? '隐藏/显示 MAC 与 IPv6 地址' : 'Hide/Show MAC and IPv6'),
						'click': function() {
							self.maskInfo = !self.maskInfo;
							preferences.save(self.activeTab, self.activeGroup, self.maskInfo);
							self.updateView();
						}
					}, [ ((i18n.language || i18n.detectLanguage()) === 'zh' ? (self.maskInfo ? '显示信息' : '隐藏信息') : (self.maskInfo ? 'Show info' : 'Hide info')) ]),
					E('button', { 'type': 'button',
						'class': 'cbi-button cbi-button-neutral',
						'id': 'dm-btn-refresh',
						'click': function(ev) {
							const button = ev.currentTarget;
							button.classList.add('spinning');
							button.disabled = true;
							return self.refresh().finally(function() {
								button.classList.remove('spinning');
								button.disabled = false;
							});
						}
					}, [ ((i18n.language || i18n.detectLanguage()) === 'zh' ? '刷新' : i18n.t('Refresh list')) ])
				])
				// Catalogue references: i18n.t('+ Add device'); i18n.t('Refresh list');
			]),

			// Row 3: Device Table
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'dm-table-wrapper' }, [
					E('table', { 'class': 'table dm-table', 'id': 'device_manager_table' }, [
						theadNode,
						E('tbody', { 'id': 'device_manager_tbody' })
					])
				])
			])
		]);

		this.tableHeadNode = theadNode;
		this.warningNode = viewNode.querySelector('#dm-source-warning');
		this.tabMenuNode = viewNode.querySelector('#dm-tabs-container');
		this.tableBodyNode = viewNode.querySelector('#device_manager_tbody');
		this.groupSelectNode = viewNode.querySelector('#dm-group-select');
		this.maskBtnNode = viewNode.querySelector('#dm-btn-mask');

		this.updateView();
		return viewNode;
	},

	getGroupById: function(id) { return this.groups.find(group => group.id === id) || null; },
	getGroupName: function(id) { return model.groupName(this.groups, id); },
	renderTabs: function() { return table.renderTabs.call(this); },
	renderGroupSelect: function() { return table.renderGroupSelect.call(this); },
	renderTable: function() { return table.renderTable.call(this); },
	renderDeviceRow: function(device) { return table.renderDeviceRow.call(this, device); },
	handleSort: function(key) { return table.handleSort.call(this, key); },
	getSortIndicator: function(key) { return table.getSortIndicator.call(this, key); },
	updateSortHeaders: function() { return table.updateSortHeaders.call(this); },
	showEditModal: function(device) { return deviceDialog.showEditModal.call(this, device); },
	confirmDelete: function(device) { return deviceDialog.confirmDelete.call(this, device); },
	showGroupModal: function() { return groupDialog.showGroupModal.call(this); },
	promptRenameGroup: function(group) { return groupDialog.promptRenameGroup.call(this, group); },
	confirmDeleteGroup: function(group, count) { return groupDialog.confirmDeleteGroup.call(this, group, count); },
	handleSaveDevice: function(mac, name, remark, group, dev, type) { return service.saveDevice(mac, name, remark, group, type); },
	handleDeleteDevice: function(device) { return service.deleteDevice(device); },
	handleAddGroup: function(name) { return service.addGroup(name); },
	handleRenameGroup: function(id, name) { return service.renameGroup(id, name); },
	handleDeleteGroup: function(id) { return service.deleteGroup(id); },

	updateView: function() {
		this.renderTabs();
		this.renderGroupSelect();
		this.updateSortHeaders();
		if (this.maskBtnNode) {
			const isZh = (i18n.language || i18n.detectLanguage()) === 'zh';
			this.maskBtnNode.textContent = isZh
				? (this.maskInfo ? '显示信息' : '隐藏信息')
				: (this.maskInfo ? 'Show info' : 'Hide info');
		}
		this.renderTable();
		if (this.warningNode) {
			this.warningNode.textContent = this.sourceErrors.length
				? i18n.t('Some device data could not be read. Unconfirmed devices are shown as unknown: %s').format(this.sourceErrors.join('; ')) : '';
			this.warningNode.style.display = this.sourceErrors.length ? '' : 'none';
		}
	},

	refresh: function() {
		if (this.refreshing) return this.refreshing;
		this.refreshing = service.load().then(data => {
			this.acceptData(data);
			this.updateView();
		}).catch(error => {
			ui.addNotification(null, E('p', {}, [ i18n.t('Could not refresh the device list: %s').format(error.message || error) ]), 'danger');
		}).finally(() => { this.refreshing = null; });
		return this.refreshing;
	}
});
