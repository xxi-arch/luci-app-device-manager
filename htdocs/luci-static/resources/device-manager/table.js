'use strict';
'require device-manager.i18n as i18n';
'require baseclass';
'require device-manager.model as model';
'require dom';
'require device-manager.preferences as preferences';

return baseclass.extend({
	renderTabs: function() {
		if (!this.tabMenuNode) return;
		dom.content(this.tabMenuNode, null);

		const self = this;

		const matching = this.devices.filter(device => model.matchesDevice(device, this.groups, this.activeGroup, this.filterText));
		const total = matching.length;
		const online = matching.filter(device => device.status === 'online').length;
		const offline = matching.filter(device => device.status === 'offline').length;
		const unknown = total - online - offline;

		const tabs = [
			{ key: 'all',     label: i18n.t('All devices'), count: total },
			{ key: 'online',  label: i18n.t('Online devices'), count: online },
			{ key: 'offline', label: i18n.t('Offline devices'), count: offline },
			{ key: 'unknown', label: i18n.t('Unknown'), count: unknown }
		];

		tabs.forEach(function(t) {
			const isActive = (self.activeTab === t.key);
			const tabItem = E('button', {
				'type': 'button',
				'role': 'tab',
				'data-tab': t.key,
				'aria-selected': String(isActive),
				'class': 'dm-status-tab' + (isActive ? ' active' : ''),
				'click': function() {
					self.activeTab = t.key;
					preferences.save(self.activeTab, self.activeGroup);
					self.updateView();
					const current = Array.from(self.tabMenuNode.children).find(node => node.getAttribute('data-tab') === t.key);
					if (current) current.focus();
				}
			}, [
				t.label,
				E('span', { 'class': 'dm-tab-count' }, [ t.count ])
			]);
			self.tabMenuNode.appendChild(tabItem);
		});
	},

	renderGroupSelect: function() {
		if (!this.groupSelectNode) return;
		dom.content(this.groupSelectNode, null);

		const self = this;
		const options = [
			E('option', { 'value': 'all' }, [ i18n.t('All groups') ])
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
			const opt = E('option', { 'value': g.id }, [ '%s (%d)'.format(g.name, count) ]);
			if (self.activeGroup === g.id) opt.selected = true;
			options.push(opt);
		}

		const ungroupedOpt = E('option', { 'value': 'ungrouped' }, [ '%s (%d)'.format(i18n.t('Ungrouped'), ungroupedCount) ]);
		if (self.activeGroup === 'ungrouped') ungroupedOpt.selected = true;
		options.push(ungroupedOpt);

		dom.content(this.groupSelectNode, options);
	},

	renderTable: function() {
		if (!this.tableBodyNode) return;
		dom.content(this.tableBodyNode, null);

		const filtered = this.devices.filter(device =>
			(this.activeTab === 'all' || device.status === this.activeTab) &&
			model.matchesDevice(device, this.groups, this.activeGroup, this.filterText));

		if (filtered.length === 0) {
			let emptyMsg = i18n.t('No devices found. Refresh the list to try again.');
			if (this.filterText)
				emptyMsg = i18n.t('No devices match "%s"').format(this.filterText);
			else if (this.activeTab === 'online')
				emptyMsg = i18n.t('No online devices');
			else if (this.activeTab === 'offline')
				emptyMsg = i18n.t('No offline devices');
			else if (this.activeTab === 'unknown')
				emptyMsg = i18n.t('No devices with unknown status');
			else if (this.activeGroup !== 'all')
				emptyMsg = i18n.t('No devices in this group');

			this.tableBodyNode.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 7, 'style': 'text-align:center; padding:36px 16px; color:#888;' }, [ emptyMsg ])
			]));
			return;
		}

		for (let i = 0; i < filtered.length; i++) {
			this.tableBodyNode.appendChild(this.renderDeviceRow(filtered[i]));
		}
	},

	renderDeviceRow: function(dev) {
		const self = this;

		// 0. Device type icon column
		const lang = i18n.detectLanguage();
		const typeInfo = model.getTypeInfo(dev.type);
		const typeLabel = model.getTypeLabel(dev.type, lang);
		const iconNode = E('span', {
			'class': 'dm-device-icon-wrap',
			'title': typeLabel
		}, [
			E('img', {
				'class': 'dm-device-icon',
				'src': L.resource('device-manager/device-icons/' + typeInfo.icon),
				'alt': typeLabel
			})
		]);

		// 1. Device name column
		const displayName = dev.customName || dev.hostname || i18n.t('Unknown device');
		const nameChildren = [
			E('div', { 'class': 'dm-device-title' }, [ displayName ])
		];

		// Status badge with tooltip explanation
		let badgeClass = 'dm-badge-unknown';
		let badgeText = i18n.t('Unknown');

		if (dev.status === 'online') {
			badgeClass = 'dm-badge-online';
			badgeText = i18n.t('Online');
		} else if (dev.status === 'offline') {
			badgeClass = 'dm-badge-offline';
			badgeText = i18n.t('Offline');
		}

		nameChildren.push(E('div', {}, [
			E('span', {
				'class': 'dm-badge ' + badgeClass,
				'title': dev.statusDetail || badgeText
			}, [ badgeText ])
		]));

		if (dev.customName && dev.hostname && dev.customName !== dev.hostname) {
			nameChildren.push(E('div', { 'class': 'dm-device-subtitle' }, [
				i18n.t('Hostname: '),
				E('span', {}, [ dev.hostname ])
			]));
		} else if (!dev.customName && !dev.hostname) {
			nameChildren.push(E('div', { 'class': 'dm-device-subtitle' }, [ i18n.t('No hostname detected') ]));
		}

		// 2. IP address column
		const ipChildren = [];
		if (dev.ipv4) {
			ipChildren.push(E('div', {}, [ dev.ipv4 ]));
		} else {
			ipChildren.push(E('div', { 'style': 'color:#999;' }, [ '—' ]));
		}
		if (dev.ipv6) {
			ipChildren.push(E('div', {
				'class': 'dm-device-subtitle',
				'title': dev.ipv6,
				'style': 'max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'
			}, [ dev.ipv6 ]));
		}

		// 3. MAC address column
		const macNode = E('span', { 'class': 'dm-mac-code' }, [ dev.mac ]);

		// 4. Group column
		const groupName = this.getGroupName(dev.group);
		const groupNode = (dev.group && dev.group !== 'ungrouped')
			? E('span', { 'class': 'dm-group-badge' }, [ groupName ])
			: E('span', { 'class': 'dm-group-ungrouped' }, [ i18n.t('Ungrouped') ]);

		// 5. Remark column
		const remarkNode = dev.remark
			? E('span', {}, [ dev.remark ])
			: E('em', { 'style': 'color:#aaa;' }, [ '—' ]);

		// 6. Action column
		const actions = self.readonly ? [ E('em', {}, [ i18n.t('Read-only') ]) ] : [
			E('button', { 'type': 'button',
				'class': 'btn cbi-button cbi-button-neutral',
				'click': function() { self.showEditModal(dev); }
			}, [ i18n.t('Edit') ])
		];

		if (dev.isSaved && !self.readonly) {
			actions.push(E('button', { 'type': 'button',
				'class': 'btn cbi-button cbi-button-remove',
				'click': function() { self.confirmDelete(dev); }
			}, [ i18n.t('Delete') ]));
		}

		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td dm-type-cell', 'style': 'text-align:center; vertical-align:middle;' }, [ iconNode ]),
			E('td', { 'class': 'td' }, nameChildren),
			E('td', { 'class': 'td' }, ipChildren),
			E('td', { 'class': 'td' }, macNode),
			E('td', { 'class': 'td' }, groupNode),
			E('td', { 'class': 'td' }, remarkNode),
			E('td', { 'class': 'td cbi-section-actions dm-actions', 'style': 'text-align:center;' }, actions)
		]);
	}
});
