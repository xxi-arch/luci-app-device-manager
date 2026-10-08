'use strict';
'require baseclass';
'require rpc';
'require device-manager.translations as translations';

const callLanguage = rpc.declare({
	object: 'luci.device-manager', method: 'get_language', reject: true
});

function detectLanguage(setting) {
	const language = String(setting || 'auto').trim().toLowerCase().replace(/_/g, '-');
	if (language !== 'auto') return /^zh(?:-|$)/.test(language) ? 'zh' : 'en';
	const browser = window.navigator || {};
	const languages = [ ...(browser.languages || []), browser.language ];
	for (const value of languages) {
		if (/^zh(?:[-_]|$)/i.test(value || '')) return 'zh';
		if (/^en(?:[-_]|$)/i.test(value || '')) return 'en';
	}
	return 'en';
}

return baseclass.extend({
	detectLanguage: detectLanguage,
	load: function() {
		return callLanguage().then(reply => reply && typeof reply.language === 'string' ? reply.language : 'auto')
			.catch(() => 'auto').then(setting => { this.language = detectLanguage(setting); });
	},
	t: function(message) {
		const language = this.language || detectLanguage('auto');
		return language === 'zh' && Object.prototype.hasOwnProperty.call(translations.messages, message)
			? translations.messages[message] : message;
	}
});
