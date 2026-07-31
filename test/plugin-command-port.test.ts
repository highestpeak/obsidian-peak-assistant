import assert from 'assert';
import { ObsidianPluginCommandPort } from '@/app/platform/commands/ObsidianPluginCommandPort';

function createApp() {
	let activePath = 'Inbox.md';
	const files = [
		{ path: 'Inbox.md', stat: { mtime: 1, size: 10 } },
	];
	const commands: Record<string, any> = {
		'calendar:open-week': {
			id: 'calendar:open-week',
			name: 'Open week',
			callback: () => {},
		},
		'periodic-notes:create-weekly': {
			// Some Obsidian builds retain the plugin-local id on the command
			// object while using the registry key as the canonical full id.
			id: 'create-weekly',
			name: 'Create weekly note',
			checkCallback: (checking: boolean) => checking,
		},
		'editor-tools:sort-selection': {
			id: 'sort-selection',
			name: 'Sort selection',
			editorCheckCallback: (
				checking: boolean,
				editor: { getSelection: () => string },
			) => checking && editor.getSelection().length > 0,
		},
		'disabled-plugin:action': {
			id: 'disabled-plugin:action',
			name: 'Disabled action',
			callback: () => {},
		},
		'obsidian-peak-assistant:peak-open-settings': {
			id: 'obsidian-peak-assistant:peak-open-settings',
			name: 'Peak settings',
			callback: () => {},
		},
		'core:open-settings': {
			id: 'core:open-settings',
			name: 'Core settings',
			callback: () => {},
		},
	};
	const ownerDocument = {
		querySelectorAll() {
			return { length: 0 };
		},
	};
	const app = {
		commands: {
			commands,
			executeCommandById(commandId: string) {
				if (commandId !== 'periodic-notes:create-weekly') return true;
				activePath = 'Weekly/2026-W31.md';
				files.push({
					path: activePath,
					stat: { mtime: 2, size: 20 },
				});
				return true;
			},
		},
		plugins: {
			enabledPlugins: new Set([
				'calendar',
				'periodic-notes',
				'editor-tools',
				'obsidian-peak-assistant',
			]),
			plugins: {
				calendar: { manifest: { id: 'calendar', name: 'Calendar', version: '1.0.0' } },
				'periodic-notes': {
					manifest: { id: 'periodic-notes', name: 'Periodic Notes', version: '2.0.0' },
				},
				'editor-tools': {
					manifest: { id: 'editor-tools', name: 'Editor Tools', version: '3.0.0' },
				},
				'disabled-plugin': {
					manifest: { id: 'disabled-plugin', name: 'Disabled', version: '1.0.0' },
				},
				'obsidian-peak-assistant': {
					manifest: { id: 'obsidian-peak-assistant', name: 'Peak', version: '1.0.0' },
				},
			},
		},
		workspace: {
			containerEl: { ownerDocument },
			activeLeaf: { view: { getViewType: () => 'markdown' } },
			activeEditor: {
				editor: { getSelection: () => 'selected text' },
				file: { path: activePath },
			},
			getActiveFile: () => ({ path: activePath }),
		},
		vault: {
			getFiles: () => files,
		},
	};
	return { app, commands };
}

async function testDiscoveryAndObservation(): Promise<void> {
	const { app, commands } = createApp();
	const port = new ObsidianPluginCommandPort(
		app as any,
		'obsidian-peak-assistant',
	);
	const descriptors = await port.discover();
	assert.deepStrictEqual(
		descriptors.map((entry) => entry.commandId).sort(),
		[
			'calendar:open-week',
			'editor-tools:sort-selection',
			'periodic-notes:create-weekly',
		].sort(),
	);
	assert.ok(descriptors.every((entry) => entry.pluginId !== 'obsidian-peak-assistant'));
	const periodic = descriptors.find((entry) => entry.pluginId === 'periodic-notes')!;
	assert.strictEqual(periodic.pluginName, 'Periodic Notes');
	assert.strictEqual(periodic.availability, 'available');
	assert.strictEqual(periodic.sourceHash.length, 64);
	const editorCommand = descriptors.find((entry) => entry.pluginId === 'editor-tools')!;
	assert.strictEqual(editorCommand.availability, 'available');
	(app.workspace as any).activeEditor = null;
	const unavailableWithoutEditor = await port.preflight(editorCommand.commandId);
	assert.strictEqual(unavailableWithoutEditor.availability, 'unavailable');
	assert.strictEqual(unavailableWithoutEditor.reason, 'active-editor-required');
	(app.workspace as any).activeEditor = {
		editor: { getSelection: () => 'selected text' },
		file: { path: 'Inbox.md' },
	};

	const observation = await port.execute(periodic.commandId, {
		settleDelayMs: 0,
		maxChangedPaths: 10,
	});
	assert.strictEqual(observation.activeFileChanged, true);
	assert.strictEqual(observation.vaultFileCountDelta, 1);
	assert.deepStrictEqual(observation.changedPaths, ['Weekly/2026-W31.md']);
	assert.strictEqual(observation.changedPathCount, 1);
	assert.strictEqual(observation.changedPathsTruncated, false);

	commands[periodic.commandId]!.checkCallback = () => false;
	const unavailable = await port.preflight(periodic.commandId);
	assert.strictEqual(unavailable.availability, 'unavailable');
	console.log('PASS: discoveryAndObservation');
}

testDiscoveryAndObservation().catch((error) => {
	console.error(error);
	process.exit(1);
});
