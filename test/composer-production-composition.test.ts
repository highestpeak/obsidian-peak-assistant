/**
 * Peak Composer — production composition wiring (FIX-1 F2 regression).
 *
 * The harness (`.dev/harness/composer.tsx`) hands `ComposerRoot` a STATIC
 * runtime prop, whereas production goes through `DocumentComposerRuntime`:
 * `createController()` binds `editing: { compose: composeEditing }`, and the
 * view reads the live runtime via `controller.getRuntime()`. F2's QA showed
 * typing was dead in production; hypothesis #1 was "the DirectEditController /
 * editing runtime is not wired in the production composition". This test locks
 * that path structurally so a wiring regression can NEVER be the cause again:
 *
 *   - `composeEditing(session)` returns a runtime whose `hub` is present — the
 *     exact value `EditableText` reads to enable `contentEditable` and to
 *     construct the `DirectEditController`. No hub ⇒ read-only ⇒ dead keys.
 *   - `session` / `comments` are wired; `projection`/`candidateRuntime` are
 *     absent until a capability factory is bound, then BOTH appear (same
 *     object, implements both ports).
 *   - Driven through the REAL controller: after the active file loads,
 *     `controller.getRuntime()?.hub` is truthy and its identity is STABLE
 *     across a hub mutation (so the focused leaf is not remounted mid-edit).
 *
 * Uses the obsidian-stub alias (run-test.js) so importing the app-layer runtime
 * is safe; the Obsidian adapters are never constructed — fake ports are passed
 * directly, exactly the surface `composeEditing` / the controller touch.
 */

import { DocumentComposerRuntime } from '@/app/composer/DocumentComposerRuntime';
import {
	ComposerDocumentSession,
	ComposerSourceRevisionService,
	type ComposerCapabilityDocumentRuntime,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerSourcePort,
	type ComposerWritePort,
	type ComposerTransactionHub,
} from '@/service/composer';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

const DOC = '# Title\n\nFirst paragraph to edit.\n';
const PATH = 'Note.md';

class FakeSource implements ComposerSourcePort, ComposerWritePort {
	readonly files = new Map<string, string>([[PATH, DOC]]);
	async readSource(p: string): Promise<string> {
		const c = this.files.get(p);
		if (c === undefined) throw new Error(`missing: ${p}`);
		return c;
	}
	async writeSource(p: string, next: string): Promise<void> {
		this.files.set(p, next);
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
	setActive(p: string | null): void {
		this.active = p;
		for (const cb of this.activeCbs) cb(p);
	}
	dispose(): void {
		this.activeCbs.clear();
		this.fileCbs.clear();
	}
}

function makeRuntime(source: FakeSource, events: FakeEvents): DocumentComposerRuntime {
	// composeEditing / the controller only touch readSource/writeSource and the
	// events port — never anything Obsidian-specific — so the fakes stand in for
	// the real adapters without constructing them.
	return new DocumentComposerRuntime(
		source as unknown as never,
		source as unknown as never,
		events as unknown as never,
		new ComposerSourceRevisionService(),
	);
}

async function main(): Promise<void> {
	// ── composeEditing shape (no capability factory) ──────────────────────────
	{
		const source = new FakeSource();
		const runtime = makeRuntime(source, new FakeEvents());
		const session = ComposerDocumentSession.fromSource(PATH, DOC);
		const editing = runtime.composeEditing(session);
		check('composeEditing wires the same session', editing.session === session);
		check('composeEditing wires a hub (⇒ contentEditable enabled)', Boolean(editing.hub));
		check('composeEditing wires a comment store', Boolean(editing.comments));
		check('no capability factory ⇒ projection absent', editing.projection === undefined);
		check('no capability factory ⇒ candidateRuntime absent', editing.candidateRuntime === undefined);
	}

	// ── composeEditing shape (capability factory bound) ───────────────────────
	{
		const source = new FakeSource();
		const runtime = makeRuntime(source, new FakeEvents());
		const fakeCapRuntime = { __cap: true } as unknown as ComposerCapabilityDocumentRuntime;
		runtime.setCapabilityRuntimeFactory({
			forDocument: (_s: ComposerDocumentSession, _h: ComposerTransactionHub) => fakeCapRuntime,
		});
		const session = ComposerDocumentSession.fromSource(PATH, DOC);
		const editing = runtime.composeEditing(session);
		check('factory bound ⇒ projection present', editing.projection === fakeCapRuntime);
		check('factory bound ⇒ candidateRuntime present (same object, both ports)', editing.candidateRuntime === fakeCapRuntime);
	}

	// ── production controller path: getRuntime() exposes an editable runtime ───
	{
		const source = new FakeSource();
		const events = new FakeEvents();
		const runtime = makeRuntime(source, events);
		events.setActive(PATH);
		const controller = runtime.createController();
		controller.start();
		await controller.settled();

		check('active file loads through the production composer', controller.getState().status === 'loaded', controller.getState().status);
		const rt = controller.getRuntime();
		check('controller.getRuntime() returns the editing runtime', Boolean(rt));
		check('getRuntime().hub is present (EditableText → contentEditable=true)', Boolean(rt?.hub));

		// Identity must be stable across a hub mutation — otherwise React would
		// remount the focused leaf and drop the in-progress burst.
		const hubBefore = controller.getRuntime()?.hub;
		const block = controller.getState().snapshot?.blocks.find((b) => b.kind === 'paragraph');
		if (block && rt?.hub) {
			await rt.hub.commit({
				origin: 'direct',
				label: 'edit',
				operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text: 'Edited paragraph.' }],
				target: { kind: 'block', blockId: block.blockId },
			});
			await controller.settled();
		}
		check('getRuntime() identity is stable across a commit', controller.getRuntime()?.hub === hubBefore);

		controller.stop();
	}

	console.log(`composer-production-composition: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
