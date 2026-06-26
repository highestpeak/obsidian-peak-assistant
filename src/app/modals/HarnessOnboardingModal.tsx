/**
 * Harness Onboarding Modal — Obsidian Modal shell that mounts the Curator
 * wizard React content from `@/ui/view/onboarding/HarnessOnboardingWizard`.
 *
 * Visual goals (per docs/superpowers/specs/2026-05-29-onboarding-design-brief):
 *   - 720px wide modal with progress indicator at top, footer with Back/Continue
 *   - Single-column body, max-width hugged by modal shell (mock uses 680px)
 */

import { Modal as ObsidianModal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { PrimaryStep } from '@/ui/view/onboarding/OnboardingStateMachine';
import { HarnessOnboardingWizard } from '@/ui/view/onboarding/HarnessOnboardingWizard';

export interface HarnessOnboardingOptions {
	/** True when the user is re-running, not in initial setup. */
	isReRun?: boolean;
	/** Optional starting primary step (re-run / repair-CTA deep link). */
	initialStep?: PrimaryStep;
}

export class HarnessOnboardingModal extends ObsidianModal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(
		private readonly appContext: AppContext,
		private readonly options: HarnessOnboardingOptions = {},
	) {
		super(appContext.app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-harness-onboarding-modal');
		contentEl.addClass('peak-design-root');
		contentEl.addClass('pktw-root');
		contentEl.addClass('pkonb-modal');
		contentEl.style.padding = '0';

		// Tag the outer Obsidian modalEl so our CSS can neutralize its default
		// theme border / scrollbar without leaking into other modals.
		modalEl.addClass('pkonb-modal-shell');

		// Mock's "modal--wide" = 680px; we use a comparable width that still
		// fits the 92vw safety. The pk-modal-shell tokens cover narrower views.
		modalEl.style.width = '720px';
		modalEl.style.maxWidth = '92vw';
		modalEl.style.padding = '0';

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				HarnessOnboardingWizard,
				{
					isReRun: !!this.options.isReRun,
					initialStep: this.options.initialStep,
					onClose: () => this.close(),
				},
				this.appContext,
			),
		);
	}

	onClose(): void {
		// Remove the shell tag we added in onOpen so we don't leak styling onto
		// a different modal that reuses the same DOM node.
		try {
			this.modalEl.removeClass('pkonb-modal-shell');
		} catch {
			/* best-effort */
		}
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) {
			setTimeout(() => {
				r.unmount();
				this.contentEl.empty();
			}, 0);
		} else {
			this.contentEl.empty();
		}
	}
}
