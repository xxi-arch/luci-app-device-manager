'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require rpc';
'require network';

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

return view.extend({
	devices: [],
	filterText: '',
	filterType: 'all',
	tableBodyNode: null,
	statsNode: null,

	load: function() {
		return Promise.all([
			L.resolveDefault(network.getHostHints(), null),
			L.resolveDefault(callHostHints(), {}),
			L.resolveDefault(callDHCPLeases(), {}),
			L.resolveDefault(uci.load('device_manager'), null)
		]);
	},

	/**
	 * Parse and merge devices from host hints, DHCP leases, and saved UCI configs.
	 */
	parseDevices: function(hostHintsObj, rawHints, dhcpLeases) {
		const devicesMap = new Map();

		// Helper to get or create device entry in map
		const getEntry = function(mac) {
			const normMac = normalizeMac(mac);
			if (!normMac)
				return null;

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

		// 1. Process network.getHostHints() instance if available
		if (hostHintsObj && hostHintsObj.hosts) {
			for (const rawMac in hostHintsObj.hosts) {
				const entry = getEntry(rawMac);
				if (!entry)
					continue;

				entry.isDiscovered = true;
				const h = hostHintsObj.hosts[rawMac];
				if (h.name && !entry.hostname)
					entry.hostname = h.name;

				const ipv4 = L.toArray(h.ipaddrs || h.ipv4)[0];
				if (ipv4 && !entry.ipv4)
					entry.ipv4 = ipv4;

				const ipv6 = L.toArray(h.ip6addrs || h.ipv6)[0];
				if (ipv6 && !entry.ipv6)
					entry.ipv6 = ipv6;
			}
		}

		// 2. Process raw getHostHints RPC output as supplementary
		if (rawHints && typeof rawHints === 'object') {
			for (const rawMac in rawHints) {
				const entry = getEntry(rawMac);
				if (!entry)
					continue;

				entry.isDiscovered = true;
				const h = rawHints[rawMac];
				if (h.name && !entry.hostname)
					entry.hostname = h.name;

				const ipv4 = L.toArray(h.ipaddrs || h.ipv4)[0];
				if (ipv4 && !entry.ipv4)
					entry.ipv4 = ipv4;

				const ipv6 = L.toArray(h.ip6addrs || h.ipv6)[0];
				if (ipv6 && !entry.ipv6)
					entry.ipv6 = ipv6;
			}
		}

		// 3. Process DHCP leases
		if (dhcpLeases) {
			const leases = Array.isArray(dhcpLeases.dhcp_leases) ? dhcpLeases.dhcp_leases : [];
			for (let i = 0; i < leases.length; i++) {
				const l = leases[i];
				if (!l.macaddr)
					continue;

				const entry = getEntry(l.macaddr);
				if (!entry)
					continue;

				entry.isDiscovered = true;
				if (l.ipaddr && !entry.ipv4)
					entry.ipv4 = l.ipaddr;
				if (l.hostname && !entry.hostname)
					entry.hostname = l.hostname;
			}

			const leases6 = Array.isArray(dhcpLeases.dhcp6_leases) ? dhcpLeases.dhcp6_leases : [];
			for (let i = 0; i < leases6.length; i++) {
				const l6 = leases6[i];
				if (!l6.macaddr)
					continue;

				const entry = getEntry(l6.macaddr);
				if (!entry)
					continue;

				entry.isDiscovered = true;
				const ip6 = Array.isArray(l6.ip6addrs) ? l6.ip6addrs[0] : l6.ip6addr;
				if (ip6 && !entry.ipv6)
					entry.ipv6 = ip6;
				if (l6.hostname && !entry.hostname)
					entry.hostname = l6.hostname;
			}
		}

		// 4. Process saved UCI records in /etc/config/device_manager
		const sections = uci.sections('device_manager', 'device') || [];
		for (let i = 0; i < sections.length; i++) {
			const sec = sections[i];
			let normMac = normalizeMac(sec.mac);

			// Support recovering MAC from section ID (e.g. dev_aabbcc112233)
			if (!normMac && sec['.name'] && sec['.name'].startsWith('dev_'))
				normMac = normalizeMac(sec['.name'].slice(4));

			if (!normMac)
				continue;

			const entry = getEntry(normMac);
			if (!entry)
				continue;

			entry.isSaved = true;
			entry.sid = sec['.name'];
			entry.customName = (sec.name || '').trim();
			entry.remark = (sec.remark || '').trim();
		}

		// 5. Convert map to array and sort
		const list = Array.from(devicesMap.values());
		list.sort(function(a, b) {
			// Discovered devices first, then historical
			if (a.isDiscovered !== b.isDiscovered)
				return a.isDiscovered ? -1 : 1;

			// Sort by IPv4 if both have IPv4
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

			// Fallback: sort by MAC
			return a.mac.localeCompare(b.mac);
		});

		return list;
	},

	render: function(data) {
		const self = this;
		this.devices = this.parseDevices(data[0], data[1], data[2]);

		const viewNode = E('div', { 'class': 'cbi-map' }, [
			// Inline scoped styles for seamless responsive layout
			E('style', {}, [
				'.dm-toolbar { display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center; margin-bottom:15px; }',
				'.dm-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex:1; min-width:260px; }',
				'.dm-btn-group { display:flex; gap:8px; align-items:center; }',
				'.dm-stats { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:15px; font-size:13px; color:#555; }',
				'.dm-stat-badge { background:rgba(0,0,0,0.06); padding:4px 10px; border-radius:4px; font-weight:500; }',
				'.dm-table-wrapper { overflow-x:auto; width:100%; -webkit-overflow-scrolling:touch; }',
				'.dm-device-title { font-weight:bold; font-size:14px; display:inline-block; }',
				'.dm-device-subtitle { font-size:12px; color:#777; margin-top:2px; }',
				'.dm-badge { display:inline-block; font-size:11px; padding:2px 6px; border-radius:3px; margin-left:6px; font-weight:normal; }',
				'.dm-badge-active { background:#e6f4ea; color:#137333; border:1px solid #ceead6; }',
				'.dm-badge-history { background:#f1f3f4; color:#5f6368; border:1px solid #dadce0; }',
				'.dm-mac-code { font-family:monospace; font-size:13px; font-weight:600; color:#1a73e8; }',
				'.dm-actions { white-space:nowrap; }',
				'.dm-actions button { margin-right:5px; }'
			]),

			E('h2', {}, _('局域网设备管理')),
			E('div', { 'class': 'cbi-map-descr' }, _('自动发现局域网已知设备，支持按 MAC 地址自定义显示名称与备注信息，配置永久生效。')),

			// Stats summary container
			E('div', { 'class': 'dm-stats' }, [
				E('span', { 'class': 'dm-stat-badge', 'id': 'stat-total' }, _('全部设备: 0')),
				E('span', { 'class': 'dm-stat-badge', 'id': 'stat-active' }, _('已发现: 0')),
				E('span', { 'class': 'dm-stat-badge', 'id': 'stat-saved' }, _('已保存备注: 0')),
				E('span', { 'class': 'dm-stat-badge', 'id': 'stat-showing' }, _('当前显示: 0'))
			]),

			// Toolbar: search, filter selector, add button, refresh button
			E('div', { 'class': 'cbi-section dm-toolbar' }, [
				E('div', { 'class': 'dm-controls' }, [
					E('input', {
						'type': 'text',
						'id': 'dm-search-input',
						'class': 'cbi-input-text',
						'placeholder': _('搜索设备名称、主机名、IP、MAC、备注...'),
						'style': 'flex:1; min-width:220px; max-width:380px;',
						'input': function(ev) {
							self.filterText = ev.target.value.trim().toLowerCase();
							self.updateTable();
						}
					}),
					E('select', {
						'id': 'dm-filter-select',
						'class': 'cbi-input-select',
						'style': 'min-width:140px;',
						'change': function(ev) {
							self.filterType = ev.target.value;
							self.updateTable();
						}
					}, [
						E('option', { 'value': 'all' }, _('全部设备')),
						E('option', { 'value': 'active' }, _('仅已发现设备')),
						E('option', { 'value': 'saved' }, _('仅已保存备注')),
						E('option', { 'value': 'history' }, _('仅历史/离线设备'))
					])
				]),
				E('div', { 'class': 'dm-btn-group' }, [
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

			// Device table
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'dm-table-wrapper' }, [
					E('table', { 'class': 'table dm-table', 'id': 'device_manager_table' }, [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th', 'style': 'width:26%;' }, _('设备名称')),
							E('th', { 'class': 'th', 'style': 'width:20%;' }, _('IP 地址')),
							E('th', { 'class': 'th', 'style': 'width:22%;' }, _('MAC 地址')),
							E('th', { 'class': 'th', 'style': 'width:20%;' }, _('备注')),
							E('th', { 'class': 'th cbi-section-actions', 'style': 'width:12%; text-align:center;' }, _('操作'))
						]),
						E('tbody', { 'id': 'device_manager_tbody' })
					])
				])
			])
		]);

		this.tableBodyNode = viewNode.querySelector('#device_manager_tbody');
		this.statsNode = viewNode.querySelector('.dm-stats');

		this.updateTable();
		return viewNode;
	},

	/**
	 * Update table contents and summary counters based on current filters.
	 */
	updateTable: function() {
		if (!this.tableBodyNode)
			return;

		dom.content(this.tableBodyNode, null);

		const self = this;
		let totalCount = this.devices.length;
		let activeCount = 0;
		let savedCount = 0;

		for (let i = 0; i < this.devices.length; i++) {
			if (this.devices[i].isDiscovered)
				activeCount++;
			if (this.devices[i].isSaved)
				savedCount++;
		}

		// Filter rows
		const filtered = this.devices.filter(function(dev) {
			// Type filter
			if (self.filterType === 'active' && !dev.isDiscovered)
				return false;
			if (self.filterType === 'saved' && !dev.isSaved)
				return false;
			if (self.filterType === 'history' && dev.isDiscovered)
				return false;

			// Text search filter
			if (self.filterText) {
				const query = self.filterText;
				const matched = (
					(dev.customName && dev.customName.toLowerCase().includes(query)) ||
					(dev.hostname && dev.hostname.toLowerCase().includes(query)) ||
					(dev.ipv4 && dev.ipv4.toLowerCase().includes(query)) ||
					(dev.ipv6 && dev.ipv6.toLowerCase().includes(query)) ||
					(dev.mac && dev.mac.toLowerCase().includes(query)) ||
					(dev.remark && dev.remark.toLowerCase().includes(query))
				);
				if (!matched)
					return false;
			}

			return true;
		});

		// Update stats in UI
		const statTotal = document.getElementById('stat-total');
		const statActive = document.getElementById('stat-active');
		const statSaved = document.getElementById('stat-saved');
		const statShowing = document.getElementById('stat-showing');

		if (statTotal) statTotal.textContent = _('全部设备: %d').format(totalCount);
		if (statActive) statActive.textContent = _('已发现: %d').format(activeCount);
		if (statSaved) statSaved.textContent = _('已保存备注: %d').format(savedCount);
		if (statShowing) statShowing.textContent = _('当前显示: %d').format(filtered.length);

		// Render rows
		if (filtered.length === 0) {
			let emptyMsg = _('暂无局域网设备数据，点击右上角【刷新】重试或【+ 手动添加设备】');
			if (this.filterText)
				emptyMsg = _('未找到与 “%s” 匹配的设备记录').format(this.filterText);
			else if (this.filterType === 'saved')
				emptyMsg = _('暂无已保存备注的设备记录');
			else if (this.filterType === 'history')
				emptyMsg = _('暂无历史离线设备记录');

			this.tableBodyNode.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 5, 'style': 'text-align:center; padding:32px 16px; color:#888;' }, emptyMsg)
			]));
			return;
		}

		for (let i = 0; i < filtered.length; i++) {
			const dev = filtered[i];
			const row = this.renderDeviceRow(dev);
			this.tableBodyNode.appendChild(row);
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

		// Status badge
		if (dev.isDiscovered) {
			nameChildren.push(E('span', {
				'class': 'dm-badge dm-badge-active',
				'title': _('当前已在局域网中发现')
			}, _('已发现')));
		} else {
			nameChildren.push(E('span', {
				'class': 'dm-badge dm-badge-history',
				'title': _('此前已保存备注，当前未被发现')
			}, _('历史记录')));
		}

		// Show system hostname subtitle if custom name is different
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
				'style': 'max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'
			}, dev.ipv6));
		}

		// 3. MAC address column
		const macNode = E('span', { 'class': 'dm-mac-code' }, dev.mac);

		// 4. Remark column
		const remarkNode = dev.remark
			? E('span', {}, dev.remark)
			: E('em', { 'style': 'color:#aaa;' }, '—');

		// 5. Action column
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
			E('td', { 'class': 'td' }, remarkNode),
			E('td', { 'class': 'td cbi-section-actions dm-actions', 'style': 'text-align:center;' }, actions)
		]);
	},

	/**
	 * Display edit modal dialog for creating or updating device custom name and remark.
	 */
	showEditModal: function(dev) {
		const self = this;
		const isEdit = (dev !== null);

		const curMac = isEdit ? dev.mac : '';
		const curHostname = isEdit ? (dev.hostname || _('未检测到')) : '';
		const curIp = isEdit ? (dev.ipv4 || _('未获取')) : '';
		const curName = isEdit ? (dev.customName || '') : '';
		const curRemark = isEdit ? (dev.remark || '') : '';

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
					E('div', { 'class': 'cbi-value-description' }, _('设备的物理地址，支持冒号或短横线分隔（不区分大小写）'))
				])
			]);
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

		// Buttons
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

				ev.currentTarget.classList.add('spinning');
				ev.currentTarget.disabled = true;

				self.handleSave(normMac, newName, newRemark, dev)
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

		// If it is an existing saved device, offer delete button in dialog
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
	 * Save device custom name and remark into UCI configuration /etc/config/device_manager.
	 */
	handleSave: function(mac, newName, newRemark, existingDev) {
		const targetSid = getSectionId(mac);

		return uci.load('device_manager').then(function() {
			// Find existing section matching this MAC if any
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

			// If both name and remark are cleared:
			// If already saved in UCI, remove the section
			if (!newName && !newRemark) {
				if (foundSid)
					uci.remove('device_manager', foundSid);
				return uci.save().then(function() {
					return callUCICommit('device_manager');
				});
			}

			// If section doesn't exist, create it with normalized section ID
			if (!foundSid) {
				uci.add('device_manager', 'device', targetSid);
				foundSid = targetSid;
			}

			// Update values
			uci.set('device_manager', foundSid, 'mac', mac);

			if (newName)
				uci.set('device_manager', foundSid, 'name', newName);
			else
				uci.unset('device_manager', foundSid, 'name');

			if (newRemark)
				uci.set('device_manager', foundSid, 'remark', newRemark);
			else
				uci.unset('device_manager', foundSid, 'remark');

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
			E('p', { 'class': 'cbi-value-description' }, _('删除后将恢复显示默认主机名，已保存的备注将被清空。')),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': ui.hideModal
				}, [ _('取消') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-remove',
					'click': function(ev) {
						ev.currentTarget.classList.add('spinning');
						ev.currentTarget.disabled = true;

						self.handleDelete(dev)
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
	handleDelete: function(dev) {
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
	 * Refresh data and update table without reloading the browser page.
	 */
	refresh: function() {
		const self = this;
		return this.load().then(function(data) {
			self.devices = self.parseDevices(data[0], data[1], data[2]);
			self.updateTable();
		});
	}
});
