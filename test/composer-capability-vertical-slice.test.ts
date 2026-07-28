/**
 * Peak Composer — polish vertical slice over fake ports (WP3, CMP-AI-01
 * fake-port half + CMP-AI-07 variant lifecycle + CMP-REV-02/03/04).
 *
 * The full production loop with a deterministic executor:
 *
 *   projection port actionsFor/invoke
 *     → frozen snapshot + RunEnvelope run
 *     → typed streaming events (run-started / content-delta / variant-ready)
 *     → WP2 candidate (streaming → ready)
 *     → accept → text-patch writeback via the transaction hub
 *     → History visible (label from definition config) → undo reverses.
 *
 * Plus the review-loop rules: accept refused while streaming, regenerate
 * appends a variant (never overwrites) with a frozen instruction, repeat-
 * regenerate refused while streaming, variant navigation blocked while
 * streaming, cancel marks the variant failed and writes nothing.
 */

import { POLISH_CAPABILITY_ID, DEFAULT_COMPOSER_CAPABILITIES_CONFIG } from '@/service/composer';
import { ComposerConflictError, type ComposerResultEnvelope } from '@/core/composer';
import type { ComposerTextPatchPayload } from '@/core/schemas/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';
import { FakeComposerExecutor, makeCapabilityRuntime, nextRunEvent, collectRunEvents } from './helpers/capability-fakes';

const { check, done } = makeChecker();

const SOURCE = '# Note\n\nThis paragraf has speling issues.\n\nUntouched trailing paragraph.\n';
const POLISHED = 'This paragraph has spelling issues fixed.';

function setup() {
	const vault = new FakeVault();
	const session = openSession(vault, 'note.md', SOURCE);
	const hub = makeHub(vault, session);
	const executor = new FakeComposerExecutor();
	const runtime = makeCapabilityRuntime(session, hub, executor);
	return { vault, session, hub, executor, runtime };
}

async function testHappyPath(): Promise<void> {
	const { vault, session, hub, executor, runtime } = setup();
	const para = blockOfKind(session, 'paragraph');
	const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: para.blockId });

	// 1. The action projects before invocation.
	const action = runtime.actionsFor(snapshot, 'block-row').find((a) => a.capabilityId === POLISH_CAPABILITY_ID);
	check('slice: polish projected on the paragraph', !!action && !action.disabledReason);

	// 2. Invoke with streamed chunks.
	executor.queue({ chunks: ['This paragraph has ', 'spelling issues fixed.'] });
	const { events, stop } = collectRunEvents(runtime);
	const ready = nextRunEvent(runtime, 'variant-ready');
	const handle = runtime.invoke(POLISH_CAPABILITY_ID, snapshot);
	check('slice: invoke returns a run handle', typeof handle.runId === 'string' && handle.runId.length > 0);

	const readyEvent = await ready;
	stop();

	// 3. Typed event order and accumulation.
	const types = events.map((e) => e.type);
	check('slice: run-started first', types[0] === 'run-started', types.join(','));
	check('slice: two content deltas', types.filter((t) => t === 'content-delta').length === 2);
	check('slice: variant-ready last', types[types.length - 1] === 'variant-ready');
	const secondDelta = events.filter((e) => e.type === 'content-delta')[1];
	check(
		'slice: deltas accumulate',
		secondDelta?.type === 'content-delta' && secondDelta.text === POLISHED,
		secondDelta?.type === 'content-delta' ? secondDelta.text : '',
	);

	// 4. Executor received the PromptId + template variables (no inline prompt).
	const request = executor.requests[0];
	check('slice: executor got the registered PromptId', request?.promptId === 'doc-polish', request?.promptId);
	check('slice: variables carry the frozen target source', request?.variables.content === 'This paragraf has speling issues.');
	check('slice: scope is full for a block target', request?.variables.scope === 'full');

	// 5. Candidate is ready with a typed envelope; nothing written yet.
	const candidate = hub.projection().candidates[0];
	check('slice: candidate ready', candidate?.status === 'ready');
	const envelope = candidate?.proposedChange.result as ComposerResultEnvelope | undefined;
	check('slice: envelope kind text-patch', envelope?.resultKind === 'text-patch');
	check('slice: payload is the accumulated text', (envelope?.payload as ComposerTextPatchPayload)?.replacementText === POLISHED);
	check('slice: renderer id resolvable for the candidate', runtime.rendererIdFor(candidate!.candidateId) === 'composer.renderer.streaming-text');
	check(
		'slice: review metadata resolves the actual action title',
		runtime.candidateLabelFor(candidate!.candidateId) === DEFAULT_COMPOSER_CAPABILITIES_CONFIG.actions[POLISH_CAPABILITY_ID]?.title,
	);
	check('slice: pending candidate wrote nothing', vault.read('note.md') === SOURCE);
	check('slice: pending candidate not in History', hub.projection().history.length === 0);
	check('slice: variant-ready envelope matches candidate', readyEvent.envelope.resultKind === 'text-patch');

	// 6. Accept → atomic writeback + History + undo.
	await runtime.accept(candidate!.candidateId);
	check('slice: vault updated with the replacement', vault.read('note.md').includes(POLISHED));
	check('slice: surrounding blocks untouched', vault.read('note.md').includes('Untouched trailing paragraph.'));
	const history = hub.projection().history;
	check('slice: one History entry', history.length === 1);
	check('slice: History label from definition config', history[0]?.label === DEFAULT_COMPOSER_CAPABILITIES_CONFIG.actions[POLISH_CAPABILITY_ID]?.historyLabel, history[0]?.label);
	check('slice: History origin ai', history[0]?.origin === 'ai');
	check('slice: History carries the runId', history[0]?.runId === handle.runId, history[0]?.runId);

	const undone = await hub.undo();
	check('slice: undo restores exact bytes', undone && vault.read('note.md') === SOURCE);
}

async function testStreamingGuards(): Promise<void> {
	const { vault, hub, session, executor, runtime } = setup();
	const para = blockOfKind(session, 'paragraph');
	const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: para.blockId });

	executor.queue({ chunks: ['partial ', 'never finishes'], holdAfter: 1 });
	const firstDelta = nextRunEvent(runtime, 'content-delta');
	runtime.invoke(POLISH_CAPABILITY_ID, snapshot);
	await firstDelta;

	const candidateId = hub.projection().candidates[0]!.candidateId;
	check('guards: runtime reports streaming', runtime.isStreaming(candidateId));

	// Accept refused while streaming.
	let acceptThrew: unknown = null;
	try {
		await runtime.accept(candidateId);
	} catch (err) {
		acceptThrew = err;
	}
	check('guards: accept refused while streaming', acceptThrew instanceof ComposerConflictError);
	check('guards: refused accept wrote nothing', vault.read('note.md') === SOURCE);

	// Repeat regenerate refused while streaming.
	let regenThrew = false;
	try {
		runtime.regenerate(candidateId);
	} catch {
		regenThrew = true;
	}
	check('guards: regenerate refused while streaming', regenThrew);

	// Variant navigation refused while streaming.
	let navThrew = false;
	try {
		runtime.setActiveVariant(candidateId, hub.projection().candidates[0]!.activeVariantId);
	} catch {
		navThrew = true;
	}
	check('guards: variant switch refused while streaming', navThrew);

	// Cancel is allowed: variant fails, nothing written, typed event fires.
	const cancelled = nextRunEvent(runtime, 'run-cancelled');
	runtime.cancel(candidateId);
	executor.release();
	await cancelled;
	// Let the run's finally block settle before probing the streaming flag.
	await new Promise((resolve) => setTimeout(resolve, 0));
	check('guards: cancelled candidate is failed', hub.projection().candidates[0]?.status === 'failed');
	check('guards: cancel wrote nothing', vault.read('note.md') === SOURCE);
	check('guards: streaming flag cleared after cancel', !runtime.isStreaming(candidateId));
}

async function testRegenerationVariants(): Promise<void> {
	const { hub, session, executor, runtime } = setup();
	const para = blockOfKind(session, 'paragraph');
	const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: para.blockId });

	executor.queue({ chunks: ['First version.'] });
	let ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(POLISH_CAPABILITY_ID, snapshot);
	await ready;

	const candidateId = hub.projection().candidates[0]!.candidateId;
	const firstVariantId = hub.projection().candidates[0]!.activeVariantId;

	executor.queue({ chunks: ['Shorter second version.'] });
	ready = nextRunEvent(runtime, 'variant-ready');
	runtime.regenerate(candidateId, 'use fewer words');
	await ready;

	const candidate = hub.projection().candidates[0]!;
	check('variants: regeneration APPENDS', candidate.variants.length === 2);
	check('variants: first variant retained', candidate.variants[0]?.variantId === firstVariantId);
	check('variants: new variant active', candidate.activeVariantId !== firstVariantId);
	check('variants: provenance recorded', candidate.variants[1]?.provenance === 'regeneration');
	check('variants: instruction frozen on the variant', candidate.variants[1]?.instruction === 'use fewer words');
	check(
		'variants: instruction reached the executor as run context',
		executor.requests[1]?.variables.instruction === 'use fewer words',
	);
	check(
		'variants: instruction never entered the candidate body',
		(candidate.proposedChange.result as ComposerResultEnvelope | undefined)?.payload &&
			(candidate.proposedChange.result as ComposerResultEnvelope).payload !== null &&
			((candidate.proposedChange.result as ComposerResultEnvelope).payload as ComposerTextPatchPayload)
				.replacementText === 'Shorter second version.',
	);

	// Switching back to variant 1 never writes the document.
	runtime.setActiveVariant(candidateId, firstVariantId);
	const switched = hub.projection().candidates[0]!;
	check('variants: switch changes the active proposal', ((switched.proposedChange.result as ComposerResultEnvelope).payload as ComposerTextPatchPayload).replacementText === 'First version.');
	check('variants: switching wrote nothing', hub.projection().history.length === 0);
}

async function testStaleRegenerateRefused(): Promise<void> {
	const { hub, session, executor, runtime } = setup();
	const para = blockOfKind(session, 'paragraph');
	const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: para.blockId });

	executor.queue({ chunks: ['Version one.'] });
	const ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(POLISH_CAPABILITY_ID, snapshot);
	await ready;
	const candidateId = hub.projection().candidates[0]!.candidateId;

	// A committed edit elsewhere advances the revision → candidate goes stale.
	const trailing = session.snapshot.blocks[session.snapshot.blocks.length - 1]!;
	await hub.commit({
		origin: 'direct',
		label: 'edit trailing',
		operations: [{ kind: 'replaceRange', from: trailing.source.from, to: trailing.source.to, text: 'Edited trailing paragraph.' }],
	});

	let threw: unknown = null;
	try {
		runtime.regenerate(candidateId);
	} catch (err) {
		threw = err;
	}
	check('stale: regenerate against a drifted base refused', threw instanceof ComposerConflictError && threw.reason === 'stale-candidate');

	// Invoking against the stale snapshot is refused too (revision guard).
	let invokeThrew: unknown = null;
	try {
		runtime.invoke(POLISH_CAPABILITY_ID, snapshot);
	} catch (err) {
		invokeThrew = err;
	}
	check('stale: invoke with a drifted snapshot refused', invokeThrew instanceof ComposerConflictError && invokeThrew.reason === 'revision-mismatch');
}

async function main(): Promise<void> {
	await testHappyPath();
	await testStreamingGuards();
	await testRegenerationVariants();
	await testStaleRegenerateRefused();
	done('composer-capability-vertical-slice');
}

void main();
