/**
 * Composition root for `ArtifactProducerService` + `ReminderSchedulerService`
 * (Chat Studio zero-gap Track D, 2026-07-21).
 *
 * Called once from `main.ts` at plugin boot. Wires:
 *   • the artifact producer (validate → save → receipt) so
 *     ConversationService can register the `artifact_create` ToolDef;
 *   • the reminder scheduler (poll → notify → flip status) so persisted
 *     reminder artifacts fire user-visible notices at their due time.
 *
 * Ownership stays at the app layer: producer + scheduler are constructor-
 * injected into whoever consumes them; there is no service-side singleton.
 * Dispose is the caller's responsibility (main.ts wraps the scheduler in
 * `plugin.register(...)`).
 */

import type { App } from 'obsidian';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { NotifierPort } from '@/core/ports/NotifierPort';
import { composeArtifactVaultWriter } from './composeArtifactVaultWriter';
import { ArtifactProducerService } from '@/service/chat/artifacts/artifactProducers';
import { loadArtifactCreateConfig } from '@/service/chat/artifacts/artifactCreateConfig';
import {
	ReminderSchedulerService,
	type ReminderReceiptSource,
} from '@/service/chat/reminders/ReminderSchedulerService';

export interface ComposeArtifactRuntimeDeps {
	app: App;
	getRootFolder: () => string;
	saveArtifactReceipt: (receipt: ChatArtifactReceipt) => Promise<void>;
	notifier: NotifierPort;
	reminderSource: ReminderReceiptSource;
	/** Optional interval override (ms). Defaults to 60_000 in the scheduler. */
	reminderIntervalMs?: number;
	/** Optional open-in-Obsidian callback used when a reminder fires. */
	onOpenReminderFile?: (vaultPath: string) => void;
}

export interface ComposedArtifactRuntime {
	producer: ArtifactProducerService;
	scheduler: ReminderSchedulerService;
}

export function composeArtifactRuntime(
	deps: ComposeArtifactRuntimeDeps,
): ComposedArtifactRuntime {
	const writer = composeArtifactVaultWriter(deps.app);
	const producer = new ArtifactProducerService({
		writer,
		receiptSink: { save: (r) => deps.saveArtifactReceipt(r) },
		getRootFolder: deps.getRootFolder,
		loadConfig: loadArtifactCreateConfig,
	});
	const scheduler = new ReminderSchedulerService({
		source: deps.reminderSource,
		writer,
		notifier: deps.notifier,
		intervalMs: deps.reminderIntervalMs,
		onOpen: deps.onOpenReminderFile,
	});
	return { producer, scheduler };
}
