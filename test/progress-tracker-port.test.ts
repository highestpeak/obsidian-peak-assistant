import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { IndexProgressTracker } from '@/service/search/support/progress-tracker';
import {
	clearDefaultProgressReporter,
	getDefaultProgressReporter,
	setDefaultProgressReporter,
	type ProgressHandle,
	type ProgressReporterPort,
} from '@/service/ports/ProgressReporterPort';

const PORT_SOURCE_PATH = path.resolve(
	process.cwd(),
	'src/service/ports/ProgressReporterPort.ts',
);

const TRACKER_SOURCE_PATH = path.resolve(
	process.cwd(),
	'src/service/search/support/progress-tracker.ts',
);

const PORT_FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /^obsidian(\/.*)?$/, reason: 'port must not import Obsidian' },
	{ pattern: /^@\/app\//, reason: 'port must not depend on the app shell' },
	{ pattern: /^@\/ui\//, reason: 'port must not depend on the UI layer' },
	{ pattern: /^@\/core\/storage\//, reason: 'port must not depend on storage adapters' },
	{ pattern: /^zustand(\/.*)?$/, reason: 'port must not depend on zustand' },
	{ pattern: /^react(\/.*)?$/, reason: 'port must not depend on React' },
	{ pattern: /^better-sqlite3$/, reason: 'port must not depend on the SQLite driver' },
];

function extractImportSpecifiers(source: string): string[] {
	const out: string[] = [];
	const re = /import\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1]!);
	const sideRe = /^\s*import\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
	while ((m = sideRe.exec(source)) !== null) out.push(m[1]!);
	return out;
}

type RecordedEvent =
	| { kind: 'show'; handleId: number; message: string; timeoutMs: number | undefined }
	| { kind: 'setMessage'; handleId: number; message: string }
	| { kind: 'hide'; handleId: number };

interface FakeReporter extends ProgressReporterPort {
	events: RecordedEvent[];
	openHandleCount(): number;
}

function makeFakeReporter(): FakeReporter {
	const events: RecordedEvent[] = [];
	let nextId = 0;
	const openHandles = new Set<number>();
	return {
		events,
		openHandleCount() { return openHandles.size; },
		show(message: string, timeoutMs?: number): ProgressHandle {
			const id = ++nextId;
			openHandles.add(id);
			events.push({ kind: 'show', handleId: id, message, timeoutMs });
			return {
				setMessage(next: string): void {
					events.push({ kind: 'setMessage', handleId: id, message: next });
				},
				hide(): void {
					events.push({ kind: 'hide', handleId: id });
					openHandles.delete(id);
				},
			};
		},
	};
}

function testPortFileHasNoForbiddenImports(): void {
	const source = fs.readFileSync(PORT_SOURCE_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	for (const spec of specifiers) {
		for (const { pattern, reason } of PORT_FORBIDDEN_PATTERNS) {
			if (pattern.test(spec)) {
				assert.fail(`forbidden import '${spec}' in ProgressReporterPort.ts: ${reason}`);
			}
		}
	}
	console.log(`PASS: portFileHasNoForbiddenImports (${specifiers.length} import(s) checked)`);
}

function testTrackerFileNoLongerImportsObsidian(): void {
	const source = fs.readFileSync(TRACKER_SOURCE_PATH, 'utf8');
	const specifiers = extractImportSpecifiers(source);
	for (const spec of specifiers) {
		assert.ok(
			!/^obsidian(\/.*)?$/.test(spec),
			`tracker must not import obsidian; found '${spec}'`,
		);
	}
	assert.ok(
		!/\bNotice\b/.test(source),
		'tracker source must not reference the `Notice` identifier',
	);
	console.log('PASS: trackerFileNoLongerImportsObsidian');
}

function testShowStartOpensHandleWithZeroTimeout(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(undefined, fake);
	tracker.showStart('Building search index...');
	assert.strictEqual(fake.events.length, 1);
	assert.deepStrictEqual(fake.events[0], {
		kind: 'show',
		handleId: 1,
		message: 'Building search index...',
		timeoutMs: 0,
	});
	console.log('PASS: showStartOpensHandleWithZeroTimeout');
}

function testShowStartUsesCustomMessage(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(100, fake);
	tracker.showStart('Peak: Step 1/4 — Full-text (FTS), no embeddings…');
	assert.strictEqual(fake.events[0]?.kind, 'show');
	assert.strictEqual(
		(fake.events[0] as { message: string }).message,
		'Peak: Step 1/4 — Full-text (FTS), no embeddings…',
	);
	console.log('PASS: showStartUsesCustomMessage');
}

function testUpdateProgressFormatsMessageWithPercentAndElapsed(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(200, fake);
	tracker.showStart();
	tracker.updateProgress(50);
	const updateEvents = fake.events.filter((e) => e.kind === 'setMessage');
	assert.strictEqual(updateEvents.length, 1);
	const msg = (updateEvents[0] as { message: string }).message;
	assert.ok(msg.startsWith('Indexing: 50/200 files (25%)'), `unexpected message: ${msg}`);
	assert.ok(/ - \d+m?s? elapsed/.test(msg) || / - \dms? elapsed/.test(msg) || /elapsed/.test(msg), 'message must include elapsed');
	console.log('PASS: updateProgressFormatsMessageWithPercentAndElapsed');
}

function testUpdateProgressIsNoopBeforeShowStart(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(10, fake);
	tracker.updateProgress(3);
	assert.strictEqual(fake.events.length, 0, 'updateProgress before showStart must not emit any events');
	console.log('PASS: updateProgressIsNoopBeforeShowStart');
}

function testDismissHidesActiveHandleAndIsIdempotent(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(undefined, fake);
	tracker.showStart();
	tracker.dismiss();
	assert.strictEqual(fake.openHandleCount(), 0);
	tracker.dismiss();
	const hideEvents = fake.events.filter((e) => e.kind === 'hide');
	assert.strictEqual(hideEvents.length, 1, 'second dismiss must not emit another hide');
	console.log('PASS: dismissHidesActiveHandleAndIsIdempotent');
}

function testShowCompleteHidesPreviousAndOpensEightSecondHandle(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(undefined, fake);
	tracker.showStart('start');
	tracker.showComplete({ totalIndexed: 42, storageSize: 1024 * 1024 });
	const kinds = fake.events.map((e) => e.kind);
	assert.deepStrictEqual(kinds, ['show', 'hide', 'show']);
	const lastShow = fake.events.at(-1) as { message: string; timeoutMs: number };
	assert.strictEqual(lastShow.timeoutMs, 8000);
	assert.ok(lastShow.message.startsWith('Indexing complete!\n'), 'must announce completion');
	assert.ok(lastShow.message.includes('Documents: 42'), 'must include totalIndexed under Documents label');
	assert.ok(lastShow.message.includes('Storage: '), 'must include storageSize under Storage label');
	console.log('PASS: showCompleteHidesPreviousAndOpensEightSecondHandle');
}

function testShowErrorHidesPreviousAndOpensFiveSecondHandle(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(undefined, fake);
	tracker.showStart();
	tracker.showError('disk full');
	const lastShow = fake.events.at(-1) as { message: string; timeoutMs: number };
	assert.strictEqual(lastShow.timeoutMs, 5000);
	assert.strictEqual(lastShow.message, 'Indexing failed: disk full');
	console.log('PASS: showErrorHidesPreviousAndOpensFiveSecondHandle');
}

function testCancelHidesPreviousAndOpensThreeSecondHandleAndSetsFlag(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(undefined, fake);
	tracker.showStart();
	assert.strictEqual(tracker.isCancelled(), false);
	tracker.cancel();
	assert.strictEqual(tracker.isCancelled(), true);
	const lastShow = fake.events.at(-1) as { message: string; timeoutMs: number };
	assert.strictEqual(lastShow.timeoutMs, 3000);
	assert.strictEqual(lastShow.message, 'Indexing cancelled');
	console.log('PASS: cancelHidesPreviousAndOpensThreeSecondHandleAndSetsFlag');
}

function testCancelIsNoopOnVisibleSideWhenHandleAlreadyDismissed(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	const tracker = new IndexProgressTracker(undefined, fake);
	tracker.showStart();
	tracker.dismiss();
	const eventsBefore = fake.events.length;
	tracker.cancel();
	assert.strictEqual(tracker.isCancelled(), true, 'cancellation flag still flips');
	assert.strictEqual(fake.events.length, eventsBefore, 'no new show/hide should happen when handle is already gone');
	console.log('PASS: cancelIsNoopOnVisibleSideWhenHandleAlreadyDismissed');
}

function testGetDefaultThrowsBeforeRegistration(): void {
	clearDefaultProgressReporter();
	let threw = false;
	try { getDefaultProgressReporter(); } catch (err) {
		threw = true;
		assert.ok(err instanceof Error);
		assert.ok((err as Error).message.includes('no default reporter registered'));
	}
	assert.ok(threw, 'getDefaultProgressReporter must throw when none is registered');
	console.log('PASS: getDefaultThrowsBeforeRegistration');
}

function testConstructorFallsBackToRegisteredDefault(): void {
	clearDefaultProgressReporter();
	const fake = makeFakeReporter();
	setDefaultProgressReporter(fake);
	const tracker = new IndexProgressTracker(5); // no explicit reporter argument
	tracker.showStart('default-path');
	assert.strictEqual(fake.events.length, 1);
	assert.strictEqual((fake.events[0] as { message: string }).message, 'default-path');
	clearDefaultProgressReporter();
	console.log('PASS: constructorFallsBackToRegisteredDefault');
}

function testConstructorWithoutDefaultAndWithoutArgumentThrows(): void {
	clearDefaultProgressReporter();
	let threw = false;
	try { new IndexProgressTracker(5); } catch { threw = true; }
	assert.ok(threw, 'tracker construction must throw when no reporter is available');
	console.log('PASS: constructorWithoutDefaultAndWithoutArgumentThrows');
}

try {
	testPortFileHasNoForbiddenImports();
	testTrackerFileNoLongerImportsObsidian();
	testShowStartOpensHandleWithZeroTimeout();
	testShowStartUsesCustomMessage();
	testUpdateProgressFormatsMessageWithPercentAndElapsed();
	testUpdateProgressIsNoopBeforeShowStart();
	testDismissHidesActiveHandleAndIsIdempotent();
	testShowCompleteHidesPreviousAndOpensEightSecondHandle();
	testShowErrorHidesPreviousAndOpensFiveSecondHandle();
	testCancelHidesPreviousAndOpensThreeSecondHandleAndSetsFlag();
	testCancelIsNoopOnVisibleSideWhenHandleAlreadyDismissed();
	testGetDefaultThrowsBeforeRegistration();
	testConstructorFallsBackToRegisteredDefault();
	testConstructorWithoutDefaultAndWithoutArgumentThrows();
	clearDefaultProgressReporter();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
