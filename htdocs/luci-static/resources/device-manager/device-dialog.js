'use strict';
'require device-manager.i18n as i18n';
'require baseclass';
'require ui';
'require device-manager.model as model';

return baseclass.extend({
	showEditModal: function(dev) {
		if (this.readonly) return;
		const self = this;
		const isEdit = (dev !== null);

		const curMac = isEdit ? dev.mac : '';
		const curHostname = isEdit ? (dev.hostname || i18n.t('Not detected')) : '';
		const curIp = isEdit ? (dev.ipv4 || i18n.t('Unavailable')) : '';
		const curName = isEdit ? (dev.customName || '') : '';
		const curRemark = isEdit ? (dev.remark || '') : '';
		const curGroup = isEdit ? (dev.group || 'ungrouped') : 'ungrouped';

		const modalTitle = isEdit
			? i18n.t('Edit device')
			: i18n.t('Add device');

		let macInput = null;
		let macRow = null;

		if (isEdit) {
			macRow = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [ i18n.t('MAC address') ]),
				E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px;' }, [
					E('code', { 'class': 'dm-mac-code' }, [ curMac ])
				])
			]);
		} else {
			macInput = E('input', {
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': i18n.t('e.g. AA:BB:CC:11:22:33'),
				'maxlength': 17,
				'style': 'width:100%;'
			});
			macRow = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [
					i18n.t('MAC address'),
					E('span', { 'style': 'color:red;' }, [ ' *' ])
				]),
				E('div', { 'class': 'cbi-value-field' }, [
					macInput,
					E('div', { 'class': 'cbi-value-description' }, [ i18n.t('Hardware address; colon or hyphen separators are accepted') ])
				])
			]);
		}

		// Group dropdown options
		const groupSelect = E('select', { 'class': 'cbi-input-select', 'style': 'width:100%;' }, [
			E('option', { 'value': 'ungrouped' }, [ i18n.t('Ungrouped') ])
		]);
		for (let i = 0; i < this.groups.length; i++) {
			const g = this.groups[i];
			const opt = E('option', { 'value': g.id }, [ g.name ]);
			if (curGroup === g.id) opt.selected = true;
			groupSelect.appendChild(opt);
		}

		const curType = isEdit ? (dev.customType || dev.type || 'auto') : 'auto';
		const lang = i18n.detectLanguage();
		const typeSelect = E('select', { 'class': 'cbi-input-select', 'style': 'width:100%;' }, [
			E('option', { 'value': 'auto' }, [ lang === 'zh' ? '自动 (根据MAC识别)' : 'Auto (detect by MAC)' ])
		]);
		for (const [ typeKey, typeObj ] of Object.entries(model.DEVICE_TYPES)) {
			const opt = E('option', { 'value': typeKey }, [ lang === 'zh' ? typeObj.zh : typeObj.en ]);
			if (curType === typeKey) opt.selected = true;
			typeSelect.appendChild(opt);
		}

		const nameInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'value': curName,
			'placeholder': i18n.t('e.g. Living room TV, work computer'),
			'maxlength': 64,
			'style': 'width:100%;'
		});

		const remarkTextarea = E('textarea', {
			'class': 'cbi-input-textarea',
			'rows': 3,
			'placeholder': i18n.t('e.g. Living room TV'),
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
					E('label', { 'class': 'cbi-value-title' }, [ i18n.t('Current status') ]),
					E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px;' }, [
						E('span', { 'class': 'dm-badge ' + (dev.status === 'online' ? 'dm-badge-online' : (dev.status === 'offline' ? 'dm-badge-offline' : 'dm-badge-unknown')) },
							[ dev.status === 'online' ? i18n.t('Online') : (dev.status === 'offline' ? i18n.t('Offline') : i18n.t('Unknown')) ]),
						' ',
						E('span', { 'class': 'dm-device-subtitle', 'style': 'margin-left:6px;' }, [ dev.statusDetail ])
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, [ i18n.t('System hostname') ]),
					E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px; color:#666;' }, [ curHostname ])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, [ i18n.t('Current IP address') ]),
					E('div', { 'class': 'cbi-value-field', 'style': 'padding-top:6px; color:#666;' }, [ curIp ])
				])
			);
		}

		formFields.push(
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [ lang === 'zh' ? '设备类型' : 'Device type' ]),
				E('div', { 'class': 'cbi-value-field' }, [
					typeSelect,
					E('div', { 'class': 'cbi-value-description' }, [
						lang === 'zh'
							? '默认根据MAC地址自动识别，也可手动指定显示图标'
							: 'Automatically detected by MAC address, or customize manually'
					])
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [ i18n.t('Device group') ]),
				E('div', { 'class': 'cbi-value-field' }, [
					groupSelect,
					E('div', { 'class': 'cbi-value-description' }, [ i18n.t('Organize this device by purpose or location') ])
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [ i18n.t('Custom name') ]),
				E('div', { 'class': 'cbi-value-field' }, [
					nameInput,
					E('div', { 'class': 'cbi-value-description' }, [ i18n.t('Leave empty to display the default hostname') ])
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, [ i18n.t('Device remarks') ]),
				E('div', { 'class': 'cbi-value-field' }, [
					remarkTextarea,
					E('div', { 'class': 'cbi-value-description' }, [ i18n.t('Record the location, purpose or owner of this device') ])
				])
			])
		);

		const btnCancel = E('button', { 'type': 'button',
			'class': 'btn cbi-button',
			'click': ui.hideModal
		}, [ i18n.t('Cancel') ]);

		const btnSave = E('button', { 'type': 'button',
			'class': 'btn cbi-button cbi-button-positive',
			'click': function(ev) {
				const button = ev.currentTarget;
				const targetMac = isEdit ? curMac : (macInput ? macInput.value : '');
				const normMac = model.normalizeMac(targetMac);

				if (!normMac) {
					errorDiv.textContent = i18n.t('Enter a valid MAC address (e.g. AA:BB:CC:11:22:33)');
					errorDiv.style.display = 'block';
					if (macInput) macInput.focus();
					return;
				}

				errorDiv.style.display = 'none';
				const newName = model.sanitizeInput(nameInput.value);
				const newRemark = model.sanitizeInput(remarkTextarea.value);
				const newGroup = groupSelect.value || 'ungrouped';
				const newType = typeSelect.value || 'auto';

				button.classList.add('spinning');
				button.disabled = true;

				return self.handleSaveDevice(normMac, newName, newRemark, newGroup, dev, newType)
					.then(function() {
						ui.hideModal();
						ui.addNotification(null, E('p', [ i18n.t('Device "%s" saved.').format(newName || normMac) ]), 'info');
						return self.refresh();
					})
					.catch(function(err) {
						errorDiv.textContent = i18n.t('Save failed: %s').format(err.message || err);
						errorDiv.style.display = 'block';
					})
					.finally(function() {
						button.classList.remove('spinning');
						button.disabled = false;
					});
			}
		}, [ i18n.t('Save') ]);

		const buttonRow = [ btnCancel, ' ', btnSave ];

		if (isEdit && dev.isSaved) {
			const btnDelete = E('button', { 'type': 'button',
				'class': 'btn cbi-button cbi-button-remove',
				'style': 'float:left;',
				'click': function() {
					ui.hideModal();
					self.confirmDelete(dev);
				}
			}, [ i18n.t('Delete record') ]);
			buttonRow.unshift(btnDelete);
		}

		ui.showModal(modalTitle, [
			E('div', { 'class': 'cbi-section' }, formFields),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, buttonRow)
		]);
	},

	confirmDelete: function(dev) {
		if (this.readonly) return;
		const self = this;
		const name = dev.customName || dev.hostname || dev.mac;

		ui.showModal(i18n.t('Delete record'), [
			E('p', {}, [ i18n.t('Delete the saved record for "%s" (%s)?').format(name, dev.mac) ]),
			E('p', { 'class': 'cbi-value-description' }, [ i18n.t('The default hostname will be displayed. The saved record, remarks and group assignment will be removed.') ]),
			E('div', { 'class': 'button-row', 'style': 'margin-top:20px; text-align:right;' }, [
				E('button', { 'type': 'button', 'class': 'btn cbi-button', 'click': ui.hideModal }, [ i18n.t('Cancel') ]),
				' ',
				E('button', { 'type': 'button',
					'class': 'btn cbi-button cbi-button-remove',
					'click': function(ev) {
						const button = ev.currentTarget;
						button.classList.add('spinning');
						button.disabled = true;

						return self.handleDeleteDevice(dev)
							.then(function() {
								ui.hideModal();
								ui.addNotification(null, E('p', [ i18n.t('Saved record for "%s" deleted.').format(name) ]), 'info');
								return self.refresh();
							})
							.catch(function(err) {
								ui.hideModal();
								ui.addNotification(null, E('p', [ i18n.t('Delete failed: %s').format(err.message || err) ]), 'danger');
							}).finally(function() {
							button.classList.remove('spinning');
							button.disabled = false;
						});
					}
				}, [ i18n.t('Confirm delete') ])
			])
		]);
	}
});
