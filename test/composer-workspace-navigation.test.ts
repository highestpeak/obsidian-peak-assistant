import assert from 'assert';
import { readFileSync } from 'fs';
import { ObsidianWorkspaceHistoryNavigation } from '@/app/composer/ObsidianWorkspaceHistoryNavigation';

type HistoryListener = () => void;

function createLeaf() {
	const listeners = new Set<HistoryListener>();
	const deltas: number[] = [];
	const history = {
		backHistory: [] as unknown[],
		forwardHistory: [] as unknown[],
		async go(delta: number): Promise<void> {
			deltas.push(delta);
		},
	};
	const leaf = {
		view: { navigation: true },
		history,
		on(name: string, listener: HistoryListener) {
			assert.equal(name, 'history-change');
			listeners.add(listener);
			return { name, listener };
		},
		offref(ref: { listener: HistoryListener }) {
			listeners.delete(ref.listener);
		},
	};
	return {
		leaf,
		history,
		deltas,
		emitHistoryChange: () => listeners.forEach((listener) => listener()),
		listenerCount: () => listeners.size,
	};
}

async function main(): Promise<void> {
	const fake = createLeaf();
	const navigation = new ObsidianWorkspaceHistoryNavigation(fake.leaf as never);
	const empty = navigation.getSnapshot();
	assert.deepEqual(empty, { canBack: false, canForward: false });
	assert.strictEqual(navigation.getSnapshot(), empty, 'unchanged snapshots keep stable identity');

	let notifications = 0;
	const unsubscribe = navigation.subscribe(() => {
		notifications += 1;
	});
	assert.equal(fake.listenerCount(), 1);

	fake.history.backHistory.push({ title: 'Previous note' });
	fake.emitHistoryChange();
	assert.deepEqual(navigation.getSnapshot(), { canBack: true, canForward: false });
	assert.equal(notifications, 1);
	await navigation.back();
	assert.deepEqual(fake.deltas, [-1], 'back uses the native leaf history delta');

	fake.history.forwardHistory.push({ title: 'Next note' });
	fake.emitHistoryChange();
	assert.deepEqual(navigation.getSnapshot(), { canBack: true, canForward: true });
	await navigation.forward();
	assert.deepEqual(fake.deltas, [-1, 1], 'forward uses the native leaf history delta');

	fake.leaf.view.navigation = false;
	fake.emitHistoryChange();
	assert.deepEqual(navigation.getSnapshot(), { canBack: false, canForward: false });
	await navigation.back();
	assert.deepEqual(fake.deltas, [-1, 1], 'non-navigation views cannot drive history');

	unsubscribe();
	assert.equal(fake.listenerCount(), 0);

	const view = readFileSync('src/app/composer/DocumentComposerView.ts', 'utf8');
	const chrome = readFileSync('src/ui/view/composer/chrome/UndoRedoBar.tsx', 'utf8');
	const css = readFileSync('src/styles/composer.css', 'utf8');
	assert.match(view, /this\.navigation\s*=\s*true/, 'Composer participates in Obsidian navigation history');
	assert.ok(view.includes('workspaceNavigation: this.workspaceNavigation'), 'the active Composer leaf owns the injected navigation port');
	const navigationIndex = chrome.indexOf('pk-composer-workspace-navigation');
	const displayIndex = chrome.indexOf('<DisplayStateSwitch');
	const undoIndex = chrome.indexOf('pk-undo-redo');
	assert.ok(navigationIndex > -1 && navigationIndex < displayIndex, 'workspace navigation stays left of the display switch');
	assert.ok(undoIndex > displayIndex, 'document undo/redo remains a separate right-side control');
	assert.ok(chrome.includes('<ArrowLeft size={16} />') && chrome.includes('<ArrowRight size={16} />'));
	assert.match(
		css,
		/\.pk-composer-workspace-navigation__btn\s*\{[\s\S]*?width:\s*28px !important;[\s\S]*?height:\s*28px !important;/,
		'navigation buttons defend their native-sized geometry from the Obsidian reset',
	);
	assert.match(
		css,
		/\.pk-composer-display-switch\.pk-segmented\[data-variant='animated-pill'\]\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-full\)/,
		'the Composer display group uses the same full pill radius as Vault Search',
	);
	assert.match(
		css,
		/\.pk-composer-display-switch\.pk-segmented\[data-variant='animated-pill'\][\s\S]*?\.pk-segmented__opt\s*\{[\s\S]*?border-radius:\s*var\(--pk-radius-full\) !important/,
		'each display option keeps a full pill selected thumb',
	);

	console.log('composer-workspace-navigation: passed');
}

void main();
