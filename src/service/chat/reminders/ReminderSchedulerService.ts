/**
 * ReminderSchedulerService — polls persisted reminder receipts, fires a
 * user-facing notice at the due time, and marks the reminder done.
 * (Chat Studio zero-gap Track D, 2026-07-21.)
 *
 * A reminder is a real vault artifact (Markdown note in
 * ChatFolder/Artifacts/Reminders/*.md with `peak-reminder: true`
 * frontmatter) — this service is the runtime that keeps them alive.
 *
 * Ownership: composed in `main.ts` at plugin boot, disposed on unload.
 * NEVER a service-side module singleton. The `AppContext.getInstance()`
 * shortcut is explicitly forbidden here — deps flow through the
 * constructor.
 */

import type { NotifierPort } from '@/core/ports/NotifierPort';
import type { ArtifactVaultWriterPort } from '@/core/ports/ArtifactVaultWriterPort';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';

export interface ReminderReceiptSource {
	/** Snapshot all reminder receipts (open + done). Ordered arbitrary. */
	listReminderReceipts(): Promise<ChatArtifactReceipt[]>;
	/** Persist a receipt update (used to flip state → 'saved' when fired). */
	saveReceipt(receipt: ChatArtifactReceipt): Promise<void>;
}

export interface ReminderSchedulerDeps {
	source: ReminderReceiptSource;
	writer: ArtifactVaultWriterPort;
	notifier: NotifierPort;
	/** Poll cadence in ms. Defaults to 60 000 (one minute). */
	intervalMs?: number;
	/** Injected clock for tests. */
	now?: () => number;
	/**
	 * Optional callback triggered every time a reminder fires. Used for
	 * telemetry and by the test harness to observe deterministic wall-clock
	 * behavior without wall-clock waiting.
	 */
	onFire?: (receipt: ChatArtifactReceipt) => void;
	/** Optional open-in-Obsidian callback for the notice's action. */
	onOpen?: (vaultPath: string) => void;
	/** Warn hook so tests can assert non-fatal errors don't stop the loop. */
	onError?: (err: unknown) => void;
}

interface ReminderFrontmatter {
	title: string;
	due: string;
	status: string;
}

export class ReminderSchedulerService {
	private timer: ReturnType<typeof setInterval> | null = null;
	private disposed = false;
	private ticking = false;
	// artifactId → last-fired timestamp so a single instance of the scheduler
	// doesn't re-fire the same reminder if the receipt update happens on the
	// next event loop turn (write-then-read latency).
	private readonly firedInMemory = new Set<string>();

	constructor(private readonly deps: ReminderSchedulerDeps) {}

	get intervalMs(): number {
		return this.deps.intervalMs ?? 60_000;
	}

	/** Start the poll loop. Safe to call multiple times (no-op on subsequent). */
	start(): void {
		if (this.timer || this.disposed) return;
		this.timer = setInterval(() => {
			void this.tick();
		}, this.intervalMs);
		// Kick immediately so an already-due reminder fires without waiting a
		// full interval on plugin load.
		void this.tick();
	}

	/** Stop the poll loop. Idempotent. */
	dispose(): void {
		this.disposed = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	/** One poll pass. Exported for deterministic test invocation. */
	async tick(): Promise<void> {
		if (this.ticking || this.disposed) return;
		this.ticking = true;
		try {
			const receipts = await this.deps.source.listReminderReceipts();
			const nowMs = (this.deps.now ?? Date.now)();
			for (const receipt of receipts) {
				if (!this.isPendingReminder(receipt)) continue;
				if (this.firedInMemory.has(receipt.artifactId)) continue;
				const dueMs = extractDueMs(receipt, this.deps.writer, nowMs);
				const dueValue = await dueMs;
				if (dueValue == null) continue;
				if (dueValue > nowMs) continue;
				await this.fire(receipt);
			}
		} catch (err) {
			this.deps.onError?.(err);
		} finally {
			this.ticking = false;
		}
	}

	private isPendingReminder(receipt: ChatArtifactReceipt): boolean {
		return receipt.kind === 'reminder' && receipt.state === 'ready';
	}

	private async fire(receipt: ChatArtifactReceipt): Promise<void> {
		this.firedInMemory.add(receipt.artifactId);
		const notice = this.deps.notifier.notify(`Reminder: ${receipt.title}`, 10_000);
		if (receipt.vaultPath) {
			// The concrete Notifier does not expose click handlers today; the
			// onOpen hook lets the app layer attach a dedicated action button
			// or Notice interception if desired.
			this.deps.onOpen?.(receipt.vaultPath);
		}
		// Flip the receipt to `saved` (terminal, non-pending) so subsequent
		// polls skip it and the UI badge switches from Ready → Saved. We also
		// update the frontmatter status → done best-effort.
		const updated: ChatArtifactReceipt = {
			...receipt,
			state: 'saved',
			availableActions: ['open'],
		};
		try {
			await this.deps.source.saveReceipt(updated);
		} catch (err) {
			this.deps.onError?.(err);
		}
		// Best-effort frontmatter flip on disk. The receipt is the truth; a
		// missing file, a locked vault, or a writer that rejects the write must
		// NEVER stop the receipt from moving to `saved`. Any error goes to
		// `onError` (test harness observes; production logs a warn).
		if (receipt.vaultPath) {
			try {
				await this.deps.writer.modifyFrontmatterField(receipt.vaultPath, 'status', 'done');
			} catch (err) {
				this.deps.onError?.(err);
				console.warn('[reminder-scheduler] failed to flip frontmatter status:', err);
			}
		}
		this.deps.onFire?.(updated);
		// Notice will auto-hide after the duration.
		void notice;
	}
}

async function extractDueMs(
	receipt: ChatArtifactReceipt,
	_writer: ArtifactVaultWriterPort,
	nowMs: number,
): Promise<number | null> {
	// Prefer preview.text hint (`title — dueIso`) because it avoids a vault
	// read. Fall back to createdAt-only when malformed.
	const text = receipt.preview?.text ?? '';
	const match = text.match(/—\s*(\S+)$/);
	if (match) {
		const t = Date.parse(match[1]);
		if (!Number.isNaN(t)) return t;
	}
	// Legacy path: parse the file frontmatter. This is best-effort; malformed
	// files are skipped and revisited next tick.
	if (receipt.vaultPath) {
		try {
			const body = await _writer.readTextFile(receipt.vaultPath);
			if (body) {
				const dueLine = body.match(/^due:\s*(.+)$/m);
				if (dueLine) {
					const t = Date.parse(dueLine[1].trim());
					if (!Number.isNaN(t)) return t;
				}
			}
		} catch {
			/* fall through */
		}
	}
	// Nothing usable — treat as not-yet-due (never fire) rather than fire-now,
	// so a bad receipt cannot spam the user.
	void nowMs;
	return null;
}

/** Minimal parser (exported for tests). */
export function parseReminderFrontmatter(body: string): ReminderFrontmatter | null {
	const match = body.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const front = match[1];
	const title = /^title:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^"|"$/g, '') ?? '';
	const due = /^due:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? '';
	const status = /^status:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? '';
	if (!title || !due) return null;
	return { title, due, status };
}
