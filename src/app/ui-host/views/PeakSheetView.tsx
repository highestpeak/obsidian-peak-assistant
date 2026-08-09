import React from 'react';
import type { IconName } from 'obsidian';

import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { PEAK_SHEET_VIEW_TYPE } from '@/app/ui-host/views/types';
import { PeakSheet } from '@/ui/view/peak-sheet/PeakSheet';
import { PeakSheetAttachmentAdapter } from '@/app/sheet/PeakSheetAttachmentAdapter';

export { PEAK_SHEET_VIEW_TYPE };

export class PeakSheetView extends ReactItemViewHost {
	protected readonly viewType = PEAK_SHEET_VIEW_TYPE;
	protected readonly displayText = 'Peak Sheet';
	public readonly icon: IconName = 'table-2';
	protected readonly rootClasses = ['peak-design-root', 'pktw-root', 'peak-sheet-view'] as const;

	protected renderElement(): React.ReactElement {
		const runtime = this.appContext.runtimeRegistry.tryGetPeakSheetRuntime();
		if (!runtime) return React.createElement('div', { className: 'peak-sheet-empty' }, 'Peak Sheet runtime is unavailable.');
		return createReactElementWithServices(PeakSheet, {
			runtime,
			attachmentPort: new PeakSheetAttachmentAdapter(this.appContext.app, this.appContext.settings.ai.rootFolder),
		}, this.appContext);
	}
}
