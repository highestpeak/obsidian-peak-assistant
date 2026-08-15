import { ComposerDocumentSession, type ComposerSourcePort } from '@/service/composer';
import type { ComposerSourceRevisionService } from '@/service/composer';

interface PreparedSessionEntry {
	filePath: string;
	session: ComposerDocumentSession;
	expiresAt: number;
}

/**
 * App-owned, one-shot bridge between a live Markdown leaf and Composer.
 *
 * Preparing before `setViewState` keeps the native editor visible while source
 * IO + parsing happens. A token can be consumed only once and only by the same
 * file path, so a stale workspace state can never adopt another document.
 */
export class ComposerPreparedSessionStore {
	private readonly entries = new Map<string, PreparedSessionEntry>();

	constructor(
		private readonly source: ComposerSourcePort,
		private readonly revisionService: ComposerSourceRevisionService,
		private ttlMs: number,
		private readonly now: () => number = () => Date.now(),
	) {}

	setTtl(ttlMs: number): void {
		if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
		this.ttlMs = ttlMs;
		this.removeExpired();
	}

	async prepare(filePath: string): Promise<string> {
		this.removeExpired();
		const session = await ComposerDocumentSession.load(
			this.source,
			filePath,
			this.revisionService,
		);
		const preparationId = crypto.randomUUID();
		this.entries.set(preparationId, {
			filePath,
			session,
			expiresAt: this.now() + this.ttlMs,
		});
		return preparationId;
	}

	consume(preparationId: string | undefined, filePath: string): ComposerDocumentSession | null {
		if (!preparationId) return null;
		const entry = this.entries.get(preparationId);
		this.entries.delete(preparationId);
		if (!entry || entry.expiresAt <= this.now()) return null;
		if (entry.filePath !== filePath) return null;
		return entry.session;
	}

	dispose(): void {
		this.entries.clear();
	}

	private removeExpired(): void {
		const now = this.now();
		for (const [id, entry] of this.entries) {
			if (entry.expiresAt <= now) this.entries.delete(id);
		}
	}
}
