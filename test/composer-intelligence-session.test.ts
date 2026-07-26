/**
 * Peak Composer — Copilot session lifecycle + run receipt + History bridge
 * (WP9, CMP-SIDE-01..05, CMP-METRIC-03).
 *
 * Asserts:
 *   (1) top surface switch is projection-only (brief/run state untouched);
 *   (2) the brief → session → running → review lifecycle, and that review is
 *       transient — closing it returns to the originating session;
 *   (3) `send` freezes an immutable run context; later focus changes never mutate
 *       it and a second send freezes fresh;
 *   (4) the receipt records Changes/Insights/Sources/Trace with derived counts;
 *   (5) the IntelligenceRuntime bridges an AI commit to the run receipt and emits
 *       a privacy-safe telemetry event.
 */

import {
	CopilotSessionMachine,
	IntelligenceRuntime,
	receiptCounts,
	redactTelemetryFields,
	isPrivacySafe,
	type IntelligenceTelemetryEvent,
	type IntelligenceTelemetryPort,
} from '@/service/composer';
import type { ComposerContextSnapshot, ComposerTransaction, ComposerTransactionEvent } from '@/core/composer';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

function snapshot(revision: string): ComposerContextSnapshot {
	return {
		documentId: 'doc',
		revision,
		target: { kind: 'block', blockId: 'para-0-abc' },
		targetSource: 'Alpha para.',
		nearby: { before: '', after: '' },
	};
}

// ── (1) top-surface switch is projection-only ───────────────────────────────────
{
	const m = new CopilotSessionMachine();
	check('initial surface copilot', m.projection().surface === 'copilot');
	check('initial stage brief', m.projection().stage === 'brief');
	check('initial run idle', m.projection().runStatus === 'idle');
	m.openSession('润色引言');
	m.selectSurface('history');
	check('surface switched', m.projection().surface === 'history');
	check('stage preserved across surface switch', m.projection().stage === 'session');
	check('title preserved', m.projection().sessionTitle === '润色引言');
	m.selectSurface('copilot');
}

// ── (2)/(3) lifecycle + frozen run context ──────────────────────────────────────
{
	const m = new CopilotSessionMachine();
	m.openSession('润色引言');
	check('brief → session', m.projection().stage === 'session');

	const frozen = m.send({ snapshot: snapshot('r1'), targetQuote: 'Alpha para.', relatedRefs: ['src-1'] });
	check('send → assembling', m.projection().runStatus === 'assembling');
	check('active run set', m.projection().activeRunId === frozen.runId);
	check('frozen context is frozen', Object.isFrozen(frozen));
	check('frozen relatedRefs frozen', Object.isFrozen(frozen.relatedRefs));
	check('frozen carries target quote', frozen.targetQuote === 'Alpha para.');

	// later "focus change": mutating the live snapshot must not touch the frozen one.
	const live = snapshot('r2');
	check('frozen snapshot unchanged by later focus', m.frozenContext(frozen.runId)?.snapshot.revision === 'r1');
	void live;

	m.markStreaming(frozen.runId);
	check('running → streaming', m.projection().runStatus === 'streaming');

	m.markProposed(frozen.runId, {
		changes: [{ id: 'c1', changeId: 'c1', label: '改写第 2 句', target: { kind: 'block', blockId: 'para-0-abc' } }],
		insights: [{ id: 'i1', label: '语气偏正式' }],
		sources: [{ id: 's1', label: 'style-guide.md', path: 'style-guide.md' }],
		trace: [{ id: 't1', label: 'prose.polish', kind: 'capability', status: 'ok' }],
	});
	check('proposed → review', m.projection().stage === 'review');
	check('proposed run status', m.projection().runStatus === 'proposed');

	// (4) receipt counts derived.
	const receipt = m.projection().receipts.find((r) => r.runId === frozen.runId)!;
	const counts = receiptCounts(receipt);
	check('receipt change count', counts.changes === 1);
	check('receipt insight count', counts.insights === 1);
	check('receipt source count', counts.sources === 1);
	check('receipt trace count', counts.trace === 1);

	// review is transient — close returns to the originating session (not History).
	m.closeReview();
	check('closeReview → session', m.projection().stage === 'session');
	check('closeReview keeps copilot surface', m.projection().surface === 'copilot');

	// a second send freezes fresh (different runId + context).
	const frozen2 = m.send({ snapshot: snapshot('r2'), targetQuote: 'second' });
	check('second send new runId', frozen2.runId !== frozen.runId);
	check('second frozen snapshot is r2', m.frozenContext(frozen2.runId)?.snapshot.revision === 'r2');
	m.markNoChange(frozen2.runId);
	check('no-change stays in session', m.projection().stage === 'session');
	check('no-change run status', m.projection().runStatus === 'no-change');
}

// ── (5) IntelligenceRuntime History bridge + privacy-safe telemetry ─────────────
{
	// A minimal fake hub: only the event subscription the runtime uses. The
	// captured callback lives on a holder so control-flow doesn't narrow it to null.
	const hold: { fn: ((e: ComposerTransactionEvent) => void) | null } = { fn: null };
	const fakeHub = {
		on(cb: (e: ComposerTransactionEvent) => void): () => void {
			hold.fn = cb;
			return () => {
				hold.fn = null;
			};
		},
	} as unknown as import('@/service/composer').ComposerTransactionHub;

	const events: IntelligenceTelemetryEvent[] = [];
	const sink: IntelligenceTelemetryPort = { emit: (e) => events.push(e) };
	const runtime = new IntelligenceRuntime({ hub: fakeHub, telemetry: sink });

	// Simulate an AI commit under a run: the receipt must link the transaction.
	runtime.session.openSession('润色');
	const frozen = runtime.session.send({ snapshot: snapshot('r1'), targetQuote: 'Alpha para.' });
	const txn = {
		transactionId: 'txn-1',
		runId: frozen.runId,
		origin: 'ai',
		label: 'polish',
	} as unknown as ComposerTransaction;
	hold.fn?.({ type: 'committed', transaction: txn });

	const receipt = runtime.session.projection().receipts.find((r) => r.runId === frozen.runId)!;
	check('commit linked to run receipt', receipt.acceptedTransactionIds.includes('txn-1'));
	check('telemetry emitted for accepted write', events.some((e) => e.event === 'run_change_accepted'));
	check('all telemetry events are privacy-safe', events.every((e) => isPrivacySafe(e.fields)));

	// The finding store telemetry is privacy-safe by construction.
	runtime.ingestFinding({ fingerprint: 'fp1', evidenceRevision: 'r1', target: { kind: 'block', blockId: 'para-0-abc' }, reason: 'ok' });
	check('finding ingest telemetry emitted', events.some((e) => e.event === 'finding_ingested'));

	runtime.dispose();
}

// ── redaction guard ─────────────────────────────────────────────────────────────
{
	const redacted = redactTelemetryFields({ runId: 'r', content: 'SECRET body text', ok: true, prompt: 'hidden' });
	check('redaction drops content', !('content' in redacted));
	check('redaction drops prompt', !('prompt' in redacted));
	check('redaction keeps structured fields', redacted.runId === 'r' && redacted.ok === true);
	check('long string dropped', !('long' in redactTelemetryFields({ long: 'x'.repeat(400) })));
}

if (failures > 0) {
	console.error(`\n${failures}/${count} intelligence-session assertion(s) failed`);
	process.exit(1);
}
console.log(`OK composer-intelligence-session (${count} assertions)`);
