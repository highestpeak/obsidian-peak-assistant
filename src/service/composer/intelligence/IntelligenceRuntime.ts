/**
 * Peak Composer — Intelligence runtime (WP9 composition root, app-owned).
 *
 * Binds the four Sidecar concerns for ONE open document:
 *   - the shared {@link ComposerFindingStore} (body ⇄ brief identity, §5.4);
 *   - the {@link CopilotSessionMachine} (brief → session → running → review,
 *     §12.1–3);
 *   - the related-material port ({@link ComposerRelatedMaterialsPort}, §12.4);
 *   - privacy-safe telemetry ({@link IntelligenceTelemetryPort}, §12.7).
 *
 * It also bridges accepted changes into History: it subscribes to the WP2
 * transaction hub and, when an AI transaction commits under a run, links the
 * resulting History transaction back to that run's receipt and emits an outcome
 * event. History records the write; this runtime records the provenance link and
 * the finding-consume — it never writes source itself.
 *
 * Ownership: created by the app layer (DocumentComposerRuntime.composeEditing)
 * per document. No module-level state, no `AppContext.getInstance()`.
 */

import type { ComposerDocumentSnapshot, ComposerTransaction, ComposerTransactionEvent } from '@/core/composer';
import type { ComposerTransactionHub } from '../transactionHub';
import { ComposerFindingStore, type FindingIngestInput, type FindingSurface } from './findingIdentity';
import { CopilotSessionMachine } from './runSession';
import type { ComposerRelatedMaterialsPort } from './relatedMaterials';
import {
	NOOP_INTELLIGENCE_TELEMETRY,
	RedactingTelemetry,
	type IntelligenceTelemetryPort,
} from './telemetry';

export interface IntelligenceRuntimeDeps {
	hub: ComposerTransactionHub;
	related?: ComposerRelatedMaterialsPort;
	telemetry?: IntelligenceTelemetryPort;
}

export class IntelligenceRuntime {
	readonly findings = new ComposerFindingStore();
	readonly session = new CopilotSessionMachine();
	readonly related?: ComposerRelatedMaterialsPort;
	private readonly telemetry: IntelligenceTelemetryPort;
	private readonly unsubHub: () => void;

	constructor(deps: IntelligenceRuntimeDeps) {
		this.related = deps.related;
		this.telemetry = new RedactingTelemetry(deps.telemetry ?? NOOP_INTELLIGENCE_TELEMETRY);
		this.unsubHub = deps.hub.on((e) => this.onTransactionEvent(e));
	}

	/** Ingest a discovered finding (dedup + surface projection). */
	ingestFinding(input: FindingIngestInput): void {
		const before = this.findings.list().length;
		const finding = this.findings.ingest(input);
		const created = this.findings.list().length > before;
		this.telemetry.emit({
			dimension: 'relevance',
			event: 'finding_ingested',
			kind: 'ai',
			fields: { findingId: finding.findingId, deduped: !created },
		});
	}

	/** Accept in the body: the finding becomes consumed on both surfaces. */
	consumeFinding(findingId: string): void {
		this.findings.consume(findingId);
		this.telemetry.emit({
			dimension: 'outcome',
			event: 'finding_consumed',
			kind: 'ai',
			fields: { findingId },
		});
	}

	/** Ignore from either surface: dismissed on both. */
	dismissFinding(findingId: string, surface: FindingSurface): void {
		this.findings.dismiss(findingId, surface);
		this.telemetry.emit({
			dimension: 'control',
			event: 'finding_dismissed',
			fields: { findingId, surface },
		});
	}

	/** Carry a reparse through: re-anchor findings, count stale for reliability. */
	onReparse(prev: ComposerDocumentSnapshot, next: ComposerDocumentSnapshot): void {
		const staled = this.findings.revalidate(prev, next);
		if (staled.length > 0) {
			this.telemetry.emit({
				dimension: 'reliability',
				event: 'findings_staled',
				fields: { count: staled.length },
			});
		}
	}

	dispose(): void {
		this.unsubHub();
	}

	// ── History bridge ────────────────────────────────────────────────────────────

	private onTransactionEvent(e: ComposerTransactionEvent): void {
		if (e.type === 'committed') {
			this.linkCommitToRun(e.transaction);
			return;
		}
		if (e.type === 'conflict') {
			this.telemetry.emit({
				dimension: 'reliability',
				event: 'transaction_conflict',
				fields: { reason: e.reason },
			});
		}
	}

	private linkCommitToRun(txn: ComposerTransaction): void {
		if (!txn.runId) return;
		this.session.linkAcceptedTransaction(txn.runId, txn.transactionId);
		this.telemetry.emit({
			dimension: 'outcome',
			event: 'run_change_accepted',
			kind: txn.origin === 'ai' ? 'ai' : 'deterministic',
			fields: { runId: txn.runId, transactionId: txn.transactionId, origin: txn.origin },
		});
	}
}
