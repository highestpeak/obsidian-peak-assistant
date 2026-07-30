/**
 * Peak Composer — durable History persistence contracts.
 *
 * The app layer owns physical DataStore paths. Service runtimes only append and
 * replay semantic document/Copilot records through this neutral port.
 */

import type { ComposerTransaction } from '@/core/composer';
import type { CopilotSessionStateSnapshot } from './intelligence/runSession';

export type ComposerDocumentHistoryEvent =
	| {
			type: 'document.transaction.committed';
			eventId: string;
			at: number;
			transaction: ComposerTransaction;
	  }
	| {
			type: 'document.transaction.rolled-back';
			eventId: string;
			at: number;
			transaction: ComposerTransaction;
			targetHistoryId: string;
	  };

export interface ComposerHistoryPersistencePort {
	loadDocumentHistory(
		documentId: string,
		filePath: string,
	): Promise<readonly ComposerDocumentHistoryEvent[]>;
	appendDocumentHistory(
		documentId: string,
		filePath: string,
		event: ComposerDocumentHistoryEvent,
	): Promise<void>;
	loadCopilotSession(
		documentId: string,
		filePath: string,
	): Promise<CopilotSessionStateSnapshot | null>;
	appendCopilotSession(
		documentId: string,
		filePath: string,
		state: CopilotSessionStateSnapshot,
	): Promise<void>;
	renameDocument(
		documentId: string,
		oldPath: string,
		newPath: string,
	): Promise<void>;
}
