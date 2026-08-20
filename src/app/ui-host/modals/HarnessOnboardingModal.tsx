/**
 * Harness Onboarding Modal — Obsidian Modal shell that mounts the Curator
 * wizard React content from `@/ui/view/onboarding/HarnessOnboardingWizard`.
 *
 * Visual goals (per docs/superpowers/specs/2026-08-19-command-invoked-compact-setup-assistant.md):
 *   - Compact command-invoked assistant with a readable five-step rail
 *   - Single-column body and a stable action footer
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
	private static current: HarnessOnboardingModal | null = null;
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
		width: '1080px',
		maxWidth: 'calc(100vw - 64px)',
		maxHeight: 'calc(100vh - 64px)',
	};

	constructor(
		appContext: AppContext,
		private readonly options: HarnessOnboardingOptions = {},
	) {
		super(appContext);
	}

	static openSingleton(appContext: AppContext, options: HarnessOnboardingOptions = {}): HarnessOnboardingModal {
		if (HarnessOnboardingModal.current) {
			HarnessOnboardingModal.current.modalEl.focus();
			return HarnessOnboardingModal.current;
		}
		const modal = new HarnessOnboardingModal(appContext, options);
		HarnessOnboardingModal.current = modal;
		modal.open();
		return modal;
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
		if (HarnessOnboardingModal.current === this) HarnessOnboardingModal.current = null;
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
