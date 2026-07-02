import type { Kysely } from 'kysely';
import type { Database as DbSchema, UsageOutcomeRow } from '@/core/storage/sqlite/ddl';
import { UsageOutcomeRepo } from '@/core/storage/sqlite/repositories/UsageOutcomeRepo';
import {
	USAGE_OUTCOME_EVENT_TYPES,
	type RecordEventInput,
	type UsageOutcomeEventType,
} from './types';

/**
 * Telemetry-layer service for recording outcome events that follow a
 * `usage_log` row (vault save, copilot accept, search click, agent file emit,
 * continuation). Callers explicitly call `recordEvent` (or a convenience
 * wrapper) — there is no event-bus subscription, so this is intentionally
 * feature-agnostic and reusable from chat / copilot / search / agent-trace.
 *
 * Owned by the app layer via `AppRuntimeRegistry.usageServices`.
 * Consumers reach it through `AppContext.getUsageServices().outcome`.
 * Lifecycle mirrors UsageTrackingService: `init` → `destroy`.
 */
export class UsageOutcomeService {
	private repo: UsageOutcomeRepo | null = null;

	/** Two-arg form used by tests or call sites that already constructed a repo. */
	static fromRepo(repo: UsageOutcomeRepo): UsageOutcomeService {
		const svc = new UsageOutcomeService();
		svc.repo = repo;
		return svc;
	}

	/** Initialize with a chat-tenant Kysely instance (matches usage_log placement). */
	init(db: Kysely<DbSchema>): void {
		this.repo = new UsageOutcomeRepo(db);
	}

	destroy(): void {
		this.repo = null;
	}

	// ── Ingestion ───────────────────────────────────────────

	/**
	 * Record a single outcome event. Validates `event_type` against the closed
	 * enum (throws on unknown — internal callers only, so throwing is correct).
	 */
	async recordEvent(input: RecordEventInput): Promise<void> {
		if (!USAGE_OUTCOME_EVENT_TYPES.includes(input.event_type)) {
			throw new Error(
				`[UsageOutcomeService] Unknown event_type: ${String(input.event_type)} ` +
				`(allowed: ${USAGE_OUTCOME_EVENT_TYPES.join(', ')})`,
			);
		}

		const row: Omit<UsageOutcomeRow, 'id'> = {
			message_id: input.message_id,
			session_id: input.session_id,
			event_type: input.event_type,
			occurred_at: input.occurred_at ?? Date.now(),
			target: input.target ?? null,
			metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
		};

		try {
			await this.getRepo().insert(row);
		} catch (e) {
			console.error('[UsageOutcomeService] Failed to record outcome:', e);
			throw e;
		}
	}

	// ── Convenience wrappers (thin — just sets event_type) ──

	async recordVaultSave(
		message_id: string,
		session_id: string,
		vault_path: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		return this.recordEvent({
			message_id,
			session_id,
			event_type: 'vault_save',
			target: vault_path,
			metadata,
		});
	}

	async recordCopilotAccept(
		message_id: string,
		session_id: string,
		file_path: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		return this.recordEvent({
			message_id,
			session_id,
			event_type: 'copilot_accept',
			target: file_path,
			metadata,
		});
	}

	async recordSearchClick(
		message_id: string,
		session_id: string,
		result_path: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		return this.recordEvent({
			message_id,
			session_id,
			event_type: 'search_click',
			target: result_path,
			metadata,
		});
	}

	async recordAgentFileEmit(
		message_id: string,
		session_id: string,
		output_path: string,
		metadata?: Record<string, unknown>,
	): Promise<void> {
		return this.recordEvent({
			message_id,
			session_id,
			event_type: 'agent_file_emit',
			target: output_path,
			metadata,
		});
	}

	async recordContinuation(
		prev_message_id: string,
		session_id: string,
		next_message_id: string,
	): Promise<void> {
		return this.recordEvent({
			message_id: prev_message_id,
			session_id,
			event_type: 'continuation',
			metadata: { next_message_id },
		});
	}

	// ── Query helpers (service-layer ergonomics) ────────────

	async outcomesForMessage(message_id: string): Promise<UsageOutcomeRow[]> {
		return this.getRepo().findByMessage(message_id);
	}

	async outcomesForSession(session_id: string, since_ms?: number): Promise<UsageOutcomeRow[]> {
		return this.getRepo().findBySession(session_id, since_ms);
	}

	async countByType(range: { from: number; to: number }): Promise<Array<{ event_type: UsageOutcomeEventType; count: number }>> {
		return this.getRepo().countByType(range);
	}

	async countUsefulMessages(range: { from: number; to: number }): Promise<number> {
		return this.getRepo().countUsefulMessages(range);
	}

	/**
	 * Distinct `message_id`s in range whose outcomes include ≥1 "strong" event
	 * (vault_save / copilot_accept / agent_file_emit). Powers the dashboard
	 * Overview's funnel stage-3 (adopted). See repo for the rationale on
	 * excluding search_click + continuation.
	 */
	async countAdoptedMessages(range: { from: number; to: number }): Promise<number> {
		return this.getRepo().countAdoptedMessages(range);
	}

	/**
	 * Distinct `message_id`s in range with ≥1 outcome (any type). Used by
	 * the Outcome Value screen to intersect with per-feature message_id sets
	 * for per-feature MPG.
	 */
	async usefulMessageIds(range: { from: number; to: number }): Promise<string[]> {
		return this.getRepo().usefulMessageIds(range);
	}

	/**
	 * Distinct `message_id`s in range with ≥1 strong outcome. Sibling of
	 * {@link countAdoptedMessages}.
	 */
	async adoptedMessageIds(range: { from: number; to: number }): Promise<string[]> {
		return this.getRepo().adoptedMessageIds(range);
	}

	/**
	 * Per-day strong-outcome message count for sparkline trio (cost-per-saved
	 * series in the dashboard's "This week" card).
	 */
	async adoptedCountByDay(startMs: number, endMs: number): Promise<Array<{ date: string; count: number }>> {
		return this.getRepo().adoptedCountByDay(startMs, endMs);
	}

	// ── Private ─────────────────────────────────────────────

	private getRepo(): UsageOutcomeRepo {
		if (!this.repo) {
			throw new Error('[UsageOutcomeService] Not initialized — call init() first');
		}
		return this.repo;
	}
}
