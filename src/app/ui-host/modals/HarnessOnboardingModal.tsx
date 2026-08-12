/**
 * Harness Onboarding Modal — Obsidian Modal shell that mounts the Curator
 * wizard React content from `@/ui/view/onboarding/HarnessOnboardingWizard`.
 *
 * Visual goals (per docs/superpowers/specs/2026-05-29-onboarding-design-brief):
 *   - 720px wide modal with progress indicator at top, footer with Back/Continue
 *   - Single-column body, max-width hugged by modal shell (mock uses 680px)
 */

import { ReactModalHost, type ReactModalShellOptions } from '@/app/ui-host/ReactModalHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import type { PrimaryStep } from '@/ui/view/onboarding/OnboardingStateMachine';
import { HarnessOnboardingWizard } from '@/ui/view/onboarding/HarnessOnboardingWizard';

export interface HarnessOnboardingOptions {
	/** True when the user is re-running, not in initial setup. */
	isReRun?: boolean;
	/** Optional starting primary step (re-run / repair-CTA deep link). */
	initialStep?: PrimaryStep;
}

export class HarnessOnboardingModal extends ReactModalHost {
	protected readonly shell: ReactModalShellOptions = {
		contentClasses: [
			'peak-harness-onboarding-modal',
			'peak-design-root',
			'pktw-root',
			'pkonb-modal',
		],
		// Tag the outer modalEl so our CSS can neutralize Obsidian's default
		// theme border / scrollbar without leaking into other modals.
		modalClasses: ['pkonb-modal-shell'],
		// Mock's "modal--wide" = 680px; we use a comparable width that still
		// fits the 92vw safety. The pk-modal-shell tokens cover narrower views.
		width: '1080px',
		maxWidth: '94vw',
		maxHeight: 'calc(100vh - 48px)',
	};

	constructor(
		appContext: AppContext,
		private readonly options: HarnessOnboardingOptions = {},
	) {
		super(appContext);
	}

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(
			HarnessOnboardingWizard,
			{
				isReRun: !!this.options.isReRun,
				initialStep: this.options.initialStep,
				onClose: () => this.close(),
			},
			this.appContext,
		);
	}

	onClose(): void {
		// Remove the shell tag we added so we don't leak styling onto a
		// different modal that reuses the same DOM node.
		try {
			this.modalEl.removeClass('pkonb-modal-shell');
		} catch {
			/* best-effort */
		}
		super.onClose();
	}
}
