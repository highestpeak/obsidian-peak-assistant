import {
	DEFAULT_AMBIENT_PUSH_SETTINGS,
	type AmbientPushSettings,
} from '@/core/types/ambient';

export function shouldAutoOpenAmbientPushPanel(settings?: AmbientPushSettings): boolean {
	if (settings?.enabled === false) return false;
	return settings?.autoOpenedPanel !== true;
}

export function markAmbientPushPanelAutoOpened(settings?: AmbientPushSettings): AmbientPushSettings {
	return {
		...DEFAULT_AMBIENT_PUSH_SETTINGS,
		...(settings ?? {}),
		autoOpenedPanel: true,
	};
}
