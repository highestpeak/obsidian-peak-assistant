import { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { RELATED_NOTES_VIEW_TYPE } from '@/app/ui-host/views/types';

export { RELATED_NOTES_VIEW_TYPE };

/**
 * Stable Ambient / Related Notes surface. Replaces the old attention-grabbing
 * status-bar + Morning Briefing pop-up as the primary Ambient carrier. Users
 * open it from the ribbon or command palette; the runtime keeps updating the
 * store, this view just reflects it.
 */
export class RelatedNotesView extends ReactItemViewHost {
	protected readonly viewType = RELATED_NOTES_VIEW_TYPE;
	protected readonly displayText = 'Related Notes';
	protected readonly icon: IconName = 'sparkles';
	protected readonly rootClasses = ['peak-design-root', 'peak-related-notes-root'] as const;

	protected renderElement(): React.ReactElement {
		const { RelatedNotesPanel } = require('@/ui/view/ambient-panel/RelatedNotesPanel');
		// The panel now sources its link-open path from ServiceContext's
		// `vaultNavigation` port; no direct `app` prop is needed.
		return createReactElementWithServices(RelatedNotesPanel, {}, this.appContext);
	}
}
