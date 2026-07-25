/**
 * Peak Composer — view registration + active-file lifecycle (WP1,
 * CMP-HOST-01 / CMP-HOST-02).
 *
 * Covers the stable view id (registration contract) and the full lifecycle the
 * DocumentComposerController drives: open active file → switch → rename →
 * external modify (stale) → revalidate → delete → empty. The controller has no
 * runtime `obsidian` dependency, so it is exercised directly with fake ports.
 */

import { DOCUMENT_COMPOSER_VIEW_TYPE } from '@/app/composer/viewType';
import {
	CHAT_VIEW_TYPE,
	CHAT_STUDIO_VIEW_TYPE,
	RELATED_NOTES_VIEW_TYPE,
} from '@/app/ui-host/views/types';
import { DocumentComposerController } from '@/app/composer/DocumentComposerController';
import type {
	ComposerFileEvent,
	ComposerFileEventsPort,
	ComposerSourcePort,
} from '@/service/composer';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

// ── fakes ───────────────────────────────────────────────────────────────────

class FakeSource implements ComposerSourcePort {
	readonly files = new Map<string, string>();
	async readSource(filePath: string): Promise<string> {
		const content = this.files.get(filePath);
		if (content === undefined) throw new Error(`missing: ${filePath}`);
		return content;
	}
}

class FakeEvents implements ComposerFileEventsPort {
	private active: string | null = null;
	private activeCbs = new Set<(p: string | null) => void>();
	private fileCbs = new Set<(e: ComposerFileEvent) => void>();

	getActiveFilePath(): string | null {
		return this.active;
	}
	onActiveFileChange(cb: (p: string | null) => void): () => void {
		this.activeCbs.add(cb);
		return () => this.activeCbs.delete(cb);
	}
	onFileEvent(cb: (e: ComposerFileEvent) => void): () => void {
		this.fileCbs.add(cb);
		return () => this.fileCbs.delete(cb);
	}
	setActive(path: string | null): void {
		this.active = path;
		for (const cb of this.activeCbs) cb(path);
	}
	emit(event: ComposerFileEvent): void {
		for (const cb of this.fileCbs) cb(event);
	}
}

const DOC_A = '# Alpha\n\nFirst paragraph.\n';
const DOC_B = '# Beta\n\n- one\n- two\n';
const DOC_B_EDITED = '# Beta\n\n- one\n- two\n- three\n\nExtra paragraph.\n';

async function main(): Promise<void> {
	// ── registration contract ────────────────────────────────────────────────
	check('view id is stable', DOCUMENT_COMPOSER_VIEW_TYPE === 'peak-document-composer-view', DOCUMENT_COMPOSER_VIEW_TYPE);
	const others = [CHAT_VIEW_TYPE, CHAT_STUDIO_VIEW_TYPE, RELATED_NOTES_VIEW_TYPE];
	check('view id is unique', !others.includes(DOCUMENT_COMPOSER_VIEW_TYPE));

	// ── lifecycle ─────────────────────────────────────────────────────────────
	const source = new FakeSource();
	source.files.set('A.md', DOC_A);
	source.files.set('B.md', DOC_B);
	const events = new FakeEvents();
	events.setActive('A.md');

	const controller = new DocumentComposerController({ source, events });
	const seen: string[] = [];
	controller.subscribe((s) => seen.push(s.status));

	controller.start();
	await controller.settled();
	check('opens active file → loaded', controller.getState().status === 'loaded', controller.getState().status);
	check('loaded snapshot has blocks', (controller.getState().snapshot?.blocks.length ?? 0) > 0);
	check('loaded filePath is A.md', controller.getState().filePath === 'A.md');

	// switch active file.
	events.setActive('B.md');
	await controller.settled();
	check('switch active file → loaded B', controller.getState().filePath === 'B.md' && controller.getState().status === 'loaded');
	const bBlocks = controller.getState().snapshot?.blocks.length ?? 0;

	// rename the open file.
	source.files.set('B2.md', DOC_B);
	events.emit({ type: 'rename', path: 'B2.md', oldPath: 'B.md' });
	await controller.settled();
	check('rename updates filePath', controller.getState().filePath === 'B2.md', controller.getState().filePath ?? 'null');
	check('rename keeps snapshot', controller.getState().status === 'loaded');

	// external modification → stale.
	source.files.set('B2.md', DOC_B_EDITED);
	events.emit({ type: 'modify', path: 'B2.md' });
	await controller.settled();
	check('external modify → stale', controller.getState().status === 'stale', controller.getState().status);

	// revalidate adopts the new source.
	controller.revalidate();
	await controller.settled();
	check('revalidate → loaded', controller.getState().status === 'loaded', controller.getState().status);
	const editedBlocks = controller.getState().snapshot?.blocks.length ?? 0;
	check('revalidate reflects new content', editedBlocks > bBlocks, `${bBlocks} → ${editedBlocks}`);

	// delete the open file.
	events.emit({ type: 'delete', path: 'B2.md' });
	await controller.settled();
	check('delete → missing', controller.getState().status === 'missing', controller.getState().status);
	check('missing clears snapshot', controller.getState().snapshot === null);

	// no active file → empty.
	events.setActive(null);
	await controller.settled();
	check('no active file → empty', controller.getState().status === 'empty', controller.getState().status);

	// subscribers observed a stale transition (not silently overwritten).
	check('emitted a stale status', seen.includes('stale'), seen.join(','));

	controller.stop();

	console.log(`composer-view-lifecycle: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
