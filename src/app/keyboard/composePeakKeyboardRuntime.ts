import type { AppContext } from '@/app/context/AppContext';
import { KeyboardMapModal } from './KeyboardMapModal';
import { PeakKeyboardRuntime } from './PeakKeyboardRuntime';

interface ObsidianHotkey {
	modifiers?: string[] | string;
	key?: string;
}

function formatHotkey(hotkey: ObsidianHotkey): string | null {
	if (!hotkey.key) return null;
	const modifiers = Array.isArray(hotkey.modifiers)
		? hotkey.modifiers
		: String(hotkey.modifiers ?? '').split(',').filter(Boolean);
	const ownerNavigator = typeof navigator === 'undefined' ? null : navigator;
	const isMac = /mac/i.test(ownerNavigator?.platform ?? '');
	const symbols: Record<string, string> = isMac
		? { Mod: '⌘', Meta: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
		: { Mod: 'Ctrl', Meta: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
	const parts = modifiers.map((modifier) => symbols[modifier] ?? modifier);
	parts.push(hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key);
	return isMac ? parts.join('') : parts.join('+');
}

export function composePeakKeyboardRuntime(appContext: AppContext): PeakKeyboardRuntime {
	let runtime: PeakKeyboardRuntime;
	runtime = new PeakKeyboardRuntime({
		openKeyboardMap: (context) => {
			new KeyboardMapModal(appContext, runtime, context).open();
		},
		resolveCommandBinding: (commandId) => {
			const app = appContext.app as typeof appContext.app & {
				hotkeyManager?: {
					getHotkeys?: (id: string) => ObsidianHotkey[] | null;
					getDefaultHotkeys?: (id: string) => ObsidianHotkey[] | null;
					getCommandsForHotkey?: (hotkey: ObsidianHotkey) => Array<{ id?: string; name?: string }>;
				};
			};
			const manager = app.hotkeyManager;
			const fullId = `${appContext.plugin.manifest.id}:${commandId}`;
			const hotkeys = manager?.getHotkeys?.(fullId)
				?? manager?.getDefaultHotkeys?.(fullId)
				?? [];
			const formatted = hotkeys
				.map(formatHotkey)
				.filter((binding): binding is string => Boolean(binding));
			const binding = formatted.length > 0 ? formatted.join(' / ') : null;
			const conflicts = hotkeys
				.flatMap((hotkey) => manager?.getCommandsForHotkey?.(hotkey) ?? [])
					.filter((command) => command.id && command.id !== fullId)
					.map((command) => command.name ?? command.id!);
			return {
				binding,
				conflict: conflicts.length > 0 ? [...new Set(conflicts)].join(', ') : null,
			};
		},
	});
	return runtime;
}
