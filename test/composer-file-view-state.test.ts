import {
	normalizeComposerViewState,
	normalizeComposerContentWidth,
	normalizeDefaultDocumentView,
	type ComposerViewStateV2,
} from '@/core/composer';

let failures = 0;
let count = 0;
function check(name: string, condition: boolean, detail = ''): void {
	count += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ` — ${detail}` : ''}`);
}

function main(): void {
	const v2 = normalizeComposerViewState({
		version: 2,
		filePath: 'Projects/Alpha.md',
		displayMode: 'clean',
		selectedBlockId: 'p-1',
	});
	check('V2 keeps explicit file identity', v2?.filePath === 'Projects/Alpha.md');
	check('V2 keeps clean presentation', v2?.displayMode === 'clean');
	check('V2 keeps leaf-local selection', v2?.selectedBlockId === 'p-1');

	const legacyWork = normalizeComposerViewState({ file: 'Legacy.md', displayState: 'work' });
	check('legacy file key migrates', legacyWork?.filePath === 'Legacy.md');
	check('legacy work migrates to edit', legacyWork?.displayMode === 'edit');

	const legacyAll = normalizeComposerViewState({ filePath: 'Review.md', displayState: 'all' });
	check('legacy all migrates to edit', legacyAll?.displayMode === 'edit');
	check('normalization writes only V2', legacyAll?.version === 2);

	const fallback = normalizeComposerViewState({}, 'Fallback.md');
	check('legacy empty restore can use one-time fallback', fallback?.filePath === 'Fallback.md');
	check('missing file identity is rejected', normalizeComposerViewState({}) === null);

	const roundTrip: ComposerViewStateV2 = normalizeComposerViewState(v2)!;
	check('V2 round-trip remains stable', JSON.stringify(roundTrip) === JSON.stringify(v2));
	check('default view is fail-safe markdown', normalizeDefaultDocumentView('unknown') === 'markdown');
	check('composer default is accepted', normalizeDefaultDocumentView('composer') === 'composer');
	check('content width defaults readable', normalizeComposerContentWidth(undefined) === 'readable');
	check('wide content width is accepted', normalizeComposerContentWidth('wide') === 'wide');

	console.log(`composer-file-view-state: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
