// B1 Command Gateway wire-in — compose GatewayBindings for the palette
// commands.
//
// Each palette command becomes a `GatewayBinding` so the Obsidian
// callback path is uniform:
//
//   Obsidian palette → callback → gateway.dispatch(id) → runCapability
//     → strategy(execute)
//
// The strategy is a thin adapter around the original UI-open handler
// (`openQuickSearch`, `openSettingsModal`, ...). Wire-in stays behavior-
// neutral: same callback runs, but now RunSession/RunEvent are recorded
// via the CapabilityRunner.
//
// Once B3 lands live backend strategies (hermes-harness /
// provider-direct), these `execute` closures can shift to real backend
// dispatch without touching the manifest or the palette registration.

import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { GatewayBinding } from '@/service/capabilities/CommandGateway';
import type { CapabilityRunContext, CapabilityExecutionOutput } from '@/service/capabilities/CapabilityRunner';
import {
	AI_CONTROL_CENTER_MANIFEST,
	CHAT_STUDIO_MANIFEST,
	COMMAND_CENTER_MANIFEST,
	DOCUMENT_COMPOSER_MANIFEST,
	FILE_ATLAS_MANIFEST,
	HARNESS_WIZARD_MANIFEST,
	MY_CONTENT_MANIFEST,
	QUICK_SEARCH_MANIFEST,
	SETTINGS_MODAL_MANIFEST,
	SHOW_KEYBOARD_MAP_MANIFEST,
	USAGE_DASHBOARD_MANIFEST,
} from './manifests';

/**
 * Placeholder CompiledSkill used by palette commands until each surface
 * defines a real skill. Permissive quarantine — palette commands do not
 * dispatch tools, so allowedTools stays empty and the harness quarantine
 * check simply passes through.
 */
const SURFACE_OPEN_SKILL: CompiledSkill = {
	skillId: 'ui.surface-open.v1',
	systemPrompt: '',
	quarantine: 'permissive',
	allowedTools: [],
};

const KEYBOARD_NAVIGATION_SKILL: CompiledSkill = {
	skillId: 'ui.keyboard-navigation.v1',
	systemPrompt: '',
	quarantine: 'permissive',
	allowedTools: [],
};

/**
 * Callbacks the palette commands need to run. Passed in from `main.ts`
 * (or the composition site) so this factory stays free of Obsidian /
 * plugin-lifecycle references.
 */
export interface PaletteCommandActions {
	readonly openCommandCenter: () => void | Promise<void>;
	readonly openAIControlCenter: () => void | Promise<void>;
	readonly openMyContent: () => void | Promise<void>;
	readonly openSettingsModal: () => void | Promise<void>;
	readonly openHarnessSetupWizard: () => void | Promise<void>;
	readonly openQuickSearch: () => void | Promise<void>;
	readonly openFileAtlas: () => void | Promise<void>;
	readonly openUsageDashboard: () => void | Promise<void>;
	readonly openChatStudio: () => void | Promise<void>;
	readonly openDocumentComposer: () => void | Promise<void>;
	readonly showKeyboardMap: () => void | Promise<void>;
}

function surfaceOpenStrategy(
	action: () => void | Promise<void>,
): (input: unknown, ctx: CapabilityRunContext) => Promise<CapabilityExecutionOutput<void>> {
	return async (_input, _ctx) => {
		await action();
		return { result: undefined };
	};
}

/**
 * Produce one GatewayBinding per palette command. The returned list is
 * ordered so `Object.keys(PALETTE_COMMAND_MANIFESTS)` and this array
 * stay in the same sequence (asserted by wire-in test).
 */
export function composeCommandGatewayBindings(
	actions: PaletteCommandActions,
): GatewayBinding[] {
	return [
		{
			commandId: 'peak-open-command-center',
			commandLabel: 'Open Peak Command Center',
			manifest: COMMAND_CENTER_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openCommandCenter),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-ai-control-center',
			commandLabel: 'Open AI Control Center',
			manifest: AI_CONTROL_CENTER_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openAIControlCenter),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-my-content',
			commandLabel: 'Open My Content',
			manifest: MY_CONTENT_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openMyContent),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-settings',
			commandLabel: 'Settings',
			manifest: SETTINGS_MODAL_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openSettingsModal),
			trigger: 'manual',
		},
		{
			commandId: 'peak-harness-setup-wizard',
			commandLabel: 'Setup Wizard',
			manifest: HARNESS_WIZARD_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openHarnessSetupWizard),
			trigger: 'manual',
		},
		{
			commandId: 'peak-quick-search',
			commandLabel: 'Quick Search',
			manifest: QUICK_SEARCH_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openQuickSearch),
			trigger: 'manual',
		},
		{
			commandId: 'peak-file-atlas-open',
			commandLabel: 'Open File Atlas',
			manifest: FILE_ATLAS_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openFileAtlas),
			trigger: 'manual',
		},
		{
			commandId: 'peak-usage-dashboard',
			commandLabel: 'Usage Dashboard',
			manifest: USAGE_DASHBOARD_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openUsageDashboard),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-chat-studio',
			commandLabel: 'Open Chat Studio',
			manifest: CHAT_STUDIO_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openChatStudio),
			trigger: 'manual',
		},
		{
			commandId: 'peak-open-document-composer',
			commandLabel: 'Open document in Peak Composer',
			manifest: DOCUMENT_COMPOSER_MANIFEST,
			compiledSkill: SURFACE_OPEN_SKILL,
			execute: surfaceOpenStrategy(actions.openDocumentComposer),
			trigger: 'manual',
		},
		{
			commandId: 'peak-show-keyboard-map',
			commandLabel: 'Show keyboard map',
			manifest: SHOW_KEYBOARD_MAP_MANIFEST,
			compiledSkill: KEYBOARD_NAVIGATION_SKILL,
			execute: surfaceOpenStrategy(actions.showKeyboardMap),
			trigger: 'manual',
		},
	];
}
