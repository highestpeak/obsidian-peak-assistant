import { Notice, type App } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { VaultAutoRunModal } from '@/app/copilot/modals/VaultAutoRunModal';

/**
 * Load a Vault review record into a fresh VaultAutoRunModal (read-only).
 *
 * Both `CopilotPickerModal` and `CopilotReviewHistoryModal` route their
 * "open vault review history" click here. Keeping it next to the modal it
 * opens avoids forcing those callers to know about the runtime adapter.
 */
export function openVaultReviewHistoryRecord(app: App, record: VaultReviewHistoryRecord): void {
	const runtime = AppContext.tryGetVaultReviewRuntime();
	if (!runtime) {
		new Notice('Vault Review runtime is still initialising. Try again in a moment.');
		return;
	}
	void runtime.loadReport(record).then(snapshot => {
		if (!snapshot) {
			new Notice('Could not load this vault review record.');
			return;
		}
		new VaultAutoRunModal(app, { mode: record.mode, initialSnapshot: snapshot }).open();
	});
}
