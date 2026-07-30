import * as React from 'react';
import { Modal, Notice } from 'obsidian';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import {
	DEFAULT_TRANSACTION_CONFIG,
	type ComposerDocumentSnapshot,
} from '@/core/composer';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import {
	DEFAULT_COMPOSER_CONFIG,
	loadComposerConfig,
	type ComposerConfig,
} from '@/ui/view/composer';
import { createDefaultCandidateRendererRegistry } from '@/ui/view/composer/candidates';
import {
	ComposerChromeProvider,
	resolveProjection,
	type ComposerChromeValue,
} from '@/ui/view/composer/chrome/ComposerChromeContext';
import {
	IntelligenceSidecar,
	buildFocusRunContext,
	resolveRelatedFocus,
} from '@/ui/view/composer/sidecar';
import type { ComposerEditingRuntime } from './DocumentComposerController';
import type { DocumentComposerController } from './DocumentComposerController';
import { DEFAULT_COMPOSER_NAVIGATION_STRINGS } from './ComposerNavigationDefaults';

/**
 * Native Markdown companion host for the same app-owned Composer Intelligence
 * runtime. It does not create a second Copilot system: acquiring the document
 * controller reuses the document runtime, candidates, History and Frozen Runs
 * already owned by {@link DocumentComposerRuntime}.
 */
export class NativeMarkdownIntelligenceModal extends Modal {
	private renderer: ReactRenderer | null = null;
	private controller: DocumentComposerController | null = null;
	private controllerSubscription: (() => void) | null = null;
	private closed = true;
	private config: ComposerConfig = DEFAULT_COMPOSER_CONFIG;
	private readonly originHostId = `markdown-intelligence-${crypto.randomUUID()}`;

	constructor(
		private readonly appContext: AppContext,
		private readonly filePath: string,
	) {
		super(appContext.app);
	}

	async onOpen(): Promise<void> {
		this.closed = false;
		this.contentEl.empty();
		this.modalEl.addClass('pk-native-intelligence-modal');
		this.modalEl.addClass('peak-design-root');
		this.contentEl.addClass('peak-composer-root');
		this.contentEl.setAttribute('data-with-sidecar', 'true');

		const owner = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		if (!owner) {
			new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.intelligenceUnavailable);
			this.close();
			return;
		}

		this.controller = owner.createController(this.originHostId, 'markdown');
		this.controller.start(this.filePath);
		await this.controller.settled();
		if (this.closed) return;

		const editing = this.controller.getRuntime();
		if (!editing?.intelligence) {
			new Notice(DEFAULT_COMPOSER_NAVIGATION_STRINGS.intelligenceBindFailed);
			this.close();
			return;
		}

		this.config = await loadComposerConfig();
		if (this.closed) return;
		this.renderer = new ReactRenderer(this.containerEl);
		this.controllerSubscription = this.controller.subscribe(() => this.renderPanel());
		this.renderPanel();
	}

	onClose(): void {
		this.closed = true;
		this.controllerSubscription?.();
		this.controllerSubscription = null;
		this.controller?.stop();
		this.controller = null;
		const renderer = this.renderer;
		this.renderer = null;
		if (renderer) {
			setTimeout(() => {
				renderer.unmount();
				this.contentEl.empty();
			}, 0);
			return;
		}
		this.contentEl.empty();
	}

	private renderPanel(): void {
		if (this.closed || !this.renderer || !this.controller) return;
		const editing = this.controller.getRuntime();
		if (!editing?.intelligence) return;
		const snapshot = editing.session.snapshot;
		this.renderer.render(
			createReactElementWithServices(
				NativeMarkdownIntelligencePanel,
				{
					editing,
					snapshot,
					config: this.config,
					onClose: () => this.close(),
					onOpenSource: (path) => {
						void this.appContext.vaultNavigation.openLink(path, {
							sourcePath: snapshot.filePath,
							newLeaf: false,
						});
					},
					onOpenExternal: (url) => {
						this.contentEl.ownerDocument.defaultView?.open(url, '_blank');
					},
				},
				this.appContext,
			),
		);
	}
}

function NativeMarkdownIntelligencePanel({
	editing,
	snapshot,
	config,
	onClose,
	onOpenSource,
	onOpenExternal,
}: {
	editing: ComposerEditingRuntime;
	snapshot: ComposerDocumentSnapshot;
	config: ComposerConfig;
	onClose(): void;
	onOpenSource(path: string): void;
	onOpenExternal(url: string): void;
}): React.ReactElement {
	const [candidateRegistry] = React.useState(createDefaultCandidateRendererRegistry);
	const chromeValue = React.useMemo<ComposerChromeValue>(
		() => ({
			runtime: editing,
			projection: resolveProjection(editing),
			candidateRegistry,
			config,
			snapshot,
			burstWindowMs:
				editing.transactionConfig?.burstWindowMs
				?? DEFAULT_TRANSACTION_CONFIG.burstWindowMs,
			scrollGuardGestureWindowMs:
				editing.transactionConfig?.scrollGuardGestureWindowMs
				?? DEFAULT_TRANSACTION_CONFIG.scrollGuardGestureWindowMs,
			registerFlusher: () => () => undefined,
			flushAll: async () => undefined,
			onOpenLink: (kind, target) => {
				if (kind === 'external') {
					onOpenExternal(target);
					return;
				}
				onOpenSource(target);
			},
		}),
		[candidateRegistry, config, editing, onOpenExternal, onOpenSource, snapshot],
	);
	const intelligence = editing.intelligence!;
	return (
		<ComposerChromeProvider value={chromeValue}>
			<IntelligenceSidecar
				runtime={intelligence}
				workspaceRuntime={editing.workspaceIntelligence}
				documentId={snapshot.documentId}
				hub={editing.hub}
				documentFilePath={snapshot.filePath}
				open
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				onOpenSource={onOpenSource}
				getFocusedBlockId={() => null}
				resolveFocusContext={() => buildFocusRunContext(snapshot, null)}
				resolveRelatedFocus={() => resolveRelatedFocus(snapshot, null)}
			/>
		</ComposerChromeProvider>
	);
}
