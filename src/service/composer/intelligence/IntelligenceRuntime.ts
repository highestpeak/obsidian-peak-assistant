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
import {
	ComposerFindingStore,
	type FindingIngestInput,
	type FindingSurface,
	type SuggestionFinding,
} from './findingIdentity';
import { ComposerBriefState, type BriefFocus, type BriefSensingMode } from './briefState';
import { DEFAULT_BRIEF_SENSING_POLICY, type BriefSensingPolicy } from './briefSensingDefaults';
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
	/** App-owned current document snapshot; never resolved through a service singleton. */
	getSnapshot?: () => ComposerDocumentSnapshot;
	/** Real deterministic/AI finding producer composed by the app layer. */
	produceFindings?: (snapshot: ComposerDocumentSnapshot) => readonly FindingIngestInput[];
	/** Template-backed debounce/throttle policy for document sensing. */
	briefSensing?: BriefSensingPolicy;
	/** Only true when an app-owned candidate-preparation executor is available. */
	autoPrepareAvailable?: boolean;
}

export class IntelligenceRuntime {
	readonly findings = new ComposerFindingStore();
	readonly session = new CopilotSessionMachine();
	/** Observable document-adjacent Brief projection (focus, sensing, real insights). */
	readonly brief: ComposerBriefState;
	readonly related?: ComposerRelatedMaterialsPort;
	private readonly telemetry: IntelligenceTelemetryPort;
	private readonly unsubHub: () => void;
	private readonly unsubSession: () => void;
	private readonly getSnapshot?: () => ComposerDocumentSnapshot;
	private readonly produceFindings?: (snapshot: ComposerDocumentSnapshot) => readonly FindingIngestInput[];
	private readonly briefSensing: BriefSensingPolicy;
	private briefRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private lastBriefRefreshAt = 0;
	/** Only producer-created ids are reconciled on the next Brief refresh. */
	private producerFindingIds = new Set<string>();

	constructor(deps: IntelligenceRuntimeDeps) {
		this.related = deps.related;
		this.getSnapshot = deps.getSnapshot;
		this.produceFindings = deps.produceFindings;
		this.briefSensing = deps.briefSensing ?? DEFAULT_BRIEF_SENSING_POLICY;
		this.brief = new ComposerBriefState({ autoPrepareAvailable: deps.autoPrepareAvailable });
		this.telemetry = new RedactingTelemetry(deps.telemetry ?? NOOP_INTELLIGENCE_TELEMETRY);
		this.unsubHub = deps.hub.on((e) => this.onTransactionEvent(e));
		this.unsubSession = this.session.subscribe((projection) => {
			this.brief.syncReceiptInsights(projection.receipts);
		});
	}

	/** Ingest a discovered finding (dedup + surface projection). */
	ingestFinding(input: FindingIngestInput): SuggestionFinding {
		const before = this.findings.list().length;
		const finding = this.findings.ingest(input);
		const created = this.findings.list().length > before;
		this.telemetry.emit({
			dimension: 'relevance',
			event: 'finding_ingested',
			kind: 'ai',
			fields: { findingId: finding.findingId, deduped: !created },
		});
		return finding;
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

	/** Move an active Brief finding later without dismissing either projection. */
	deferFinding(findingId: string): void {
		if (!this.findings.defer(findingId)) return;
		this.telemetry.emit({
			dimension: 'control',
			event: 'finding_deferred',
			fields: { findingId },
		});
	}

	/** Hide one producer finding until the next explicit/automatic Brief refresh. */
	ignoreFindingForCurrentRefresh(findingId: string): void {
		if (!this.findings.ignoreForCurrentRefresh(findingId)) return;
		this.telemetry.emit({
			dimension: 'control',
			event: 'finding_ignored',
			fields: { findingId },
		});
	}

	/** Update the real document object the Brief is currently describing. */
	updateBriefFocus(focus: BriefFocus): void {
		this.brief.updateFocus(focus);
		if (this.brief.projection().sensingMode === 'continuous') this.scheduleBriefRefresh('continuous');
	}

	/** Select whether document reparses should recompute Brief findings. */
	setSensingMode(mode: BriefSensingMode): void {
		this.brief.setSensingMode(mode);
		if (mode === 'manual') {
			this.clearScheduledBriefRefresh();
			return;
		}
		this.scheduleBriefRefresh(mode);
	}

	/** Toggle whether the surrounding UI may prepare suggestions proactively. */
	setAutoPrepare(autoPrepare: boolean): void {
		this.brief.setAutoPrepare(autoPrepare);
	}

	/**
	 * Recompute findings from the app-injected current snapshot and producer.
	 * The runtime deliberately has no fallback producer: an unwired host gets no
	 * fabricated suggestions and returns `false` instead.
	 */
	refreshBrief(): boolean {
		if (!this.getSnapshot || !this.produceFindings) return false;
		const snapshot = this.getSnapshot();
		const previousProducerFindings = this.producerFindingsByFingerprint();
		const nextProducerFindingIds = new Set<string>();
		for (const input of this.produceFindings(snapshot)) {
			const previous = previousProducerFindings.get(input.fingerprint);
			const preservedDeferred = previous?.deferredAt;
			const nextInput = preservedDeferred !== undefined && input.deferredAt === undefined
				? { ...input, deferredAt: preservedDeferred }
				: input;
			const finding = this.ingestFinding(nextInput);
			// Do not claim ownership of an unrelated caller's pre-existing record
			// merely because it happened to share this producer's dedup key.
			if (input.producerId === undefined || finding.producerId !== input.producerId) continue;
			if (previous?.state === 'ignored') this.findings.restoreIgnored(finding.findingId);
			nextProducerFindingIds.add(finding.findingId);
		}
		for (const findingId of this.producerFindingIds) {
			if (!nextProducerFindingIds.has(findingId)) this.findings.remove(findingId);
		}
		this.producerFindingIds = nextProducerFindingIds;
		this.brief.markRefreshed(snapshot.revision);
		this.lastBriefRefreshAt = Date.now();
		this.telemetry.emit({
			dimension: 'performance',
			event: 'brief_refreshed',
			kind: 'deterministic',
			fields: { revision: snapshot.revision },
		});
		return true;
	}

	/** Organise one receipt-backed thought so it leaves the active Brief list. */
	organizeThought(thoughtId: string): void {
		if (!this.brief.organizeThought(thoughtId)) return;
		this.telemetry.emit({
			dimension: 'control',
			event: 'brief_thought_organized',
			fields: { thoughtId },
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
		const sensingMode = this.brief.projection().sensingMode;
		if (sensingMode !== 'manual') this.scheduleBriefRefresh(sensingMode);
	}

	dispose(): void {
		this.clearScheduledBriefRefresh();
		this.unsubSession();
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

	private producerFindingsByFingerprint(): ReadonlyMap<string, SuggestionFinding> {
		const findings = new Map<string, SuggestionFinding>();
		for (const findingId of this.producerFindingIds) {
			const finding = this.findings.get(findingId);
			if (finding) findings.set(finding.fingerprint, finding);
		}
		return findings;
	}

	/** Debounced idle sensing and throttle-bounded continuous sensing. */
	private scheduleBriefRefresh(mode: Exclude<BriefSensingMode, 'manual'>): void {
		if (!this.getSnapshot || !this.produceFindings) return;
		if (this.briefRefreshTimer !== null) {
			// Idle means “after the user stopped editing”: every new reparse restarts
			// that quiet-period timer. Continuous keeps its already-scheduled throttle.
			if (mode === 'continuous') return;
			this.clearScheduledBriefRefresh();
		}
		const delay = mode === 'idle'
			? this.briefSensing.idleRefreshDelayMs
			: Math.max(0, this.briefSensing.continuousRefreshMinIntervalMs - (Date.now() - this.lastBriefRefreshAt));
		this.briefRefreshTimer = setTimeout(() => {
			this.briefRefreshTimer = null;
			this.refreshBrief();
		}, delay);
	}

	private clearScheduledBriefRefresh(): void {
		if (this.briefRefreshTimer === null) return;
		clearTimeout(this.briefRefreshTimer);
		this.briefRefreshTimer = null;
	}
}
