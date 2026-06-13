// T8: settings adapter. The runtime reads ambient settings as a
// snapshot at each trigger (so live settings edits are picked up
// without re-binding); the adapter wraps `AppContext.getSettings()`
// and forwards the `markAmbientPushPanelAutoOpened` write back through
// the plugin's `saveSettings` path.

import { AppContext } from '@/app/context/AppContext';
import type { AmbientSettingsPort } from '@/service/ambient/ports/AmbientPorts';
import type { AmbientPushSettings } from '@/service/ambient/types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from '@/service/ambient/types';
import { markAmbientPushPanelAutoOpened } from '@/service/ambient/ambientPanelStartup';

export class ObsidianAmbientSettingsAdapter implements AmbientSettingsPort {
	getSettings(): AmbientPushSettings {
		return AppContext.getSettings().ambientPush ?? DEFAULT_AMBIENT_PUSH_SETTINGS;
	}

	async markPanelAutoOpened(): Promise<void> {
		const plugin = AppContext.getPlugin();
		plugin.settings.ambientPush = markAmbientPushPanelAutoOpened(plugin.settings.ambientPush);
		await plugin.saveSettings();
	}
}
