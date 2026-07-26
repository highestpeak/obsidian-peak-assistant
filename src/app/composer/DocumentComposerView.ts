import { IconName, WorkspaceLeaf } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import type { AppContext } from '@/app/context/AppContext';
import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import { ComposerRoot, loadComposerConfig, type ComposerConfig } from '@/ui/view/composer';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from './viewType';
import type { DocumentComposerController } from './DocumentComposerController';

export { DOCUMENT_COMPOSER_VIEW_TYPE };

/** Static empty source used before the runtime binds (early startup restore). */
const EMPTY_STATE: DocumentComposerState = { status: 'empty', filePath: null, snapshot: null };
const EMPTY_SOURCE: ComposerStateSource = {
	getState: () => EMPTY_STATE,
	subscribe: () => () => undefined,
};

/**
 * Peak Composer — standalone main-area document host (WP1).
 *
 * Extends the shared React ItemView host. Owns one lifecycle controller (from
 * the app-owned runtime) that follows the active Markdown file and drives the
 * read-only {@link ComposerRoot}. CodeMirror is never touched; the Chat Studio
 * input `Composer` is a different component (handoff §2.3 / §4.3).
 */
export class DocumentComposerView extends ReactItemViewHost {
	protected readonly viewType = DOCUMENT_COMPOSER_VIEW_TYPE;
	protected readonly displayText = 'Composer';
	protected readonly icon: IconName = 'file-text';
	protected readonly rootClasses = ['peak-design-root', 'peak-composer-root-host'] as const;

	private controller: DocumentComposerController | null = null;
	private config: ComposerConfig = DEFAULT_COMPOSER_CONFIG;

	constructor(leaf: WorkspaceLeaf, appContext: AppContext) {
		super(leaf, appContext);
	}

	async onOpen(): Promise<void> {
		const runtime = this.appContext.runtimeRegistry.tryGetDocumentComposerRuntime();
		if (runtime) {
			this.controller = runtime.createController();
			this.controller.start();
		}
		await super.onOpen();
		// Load the runtime-editable config, then re-render once resolved.
		void loadComposerConfig().then((cfg) => {
			this.config = cfg;
			this.getReactRenderer()?.render(this.renderElement());
		});
	}

	async onClose(): Promise<void> {
		this.controller?.stop();
		this.controller = null;
		await super.onClose();
	}

	protected renderElement(): React.ReactElement {
		const controller = this.controller;
		const source: ComposerStateSource = controller ?? EMPTY_SOURCE;
		const onRevalidate = controller ? () => controller.revalidate() : undefined;
		const runtimeSource = controller ? { getRuntime: () => controller.getRuntime() } : undefined;
		const intelligenceSource = controller ? { getIntelligence: () => controller.getIntelligence() } : undefined;
		return createReactElementWithServices(
			ComposerRoot,
			{
				source,
				config: this.config,
				onRevalidate,
				runtimeSource,
				intelligenceSource,
				onOpenLink: (kind, target) => this.openLink(kind, target),
			},
			this.appContext,
		);
	}

	private openLink(kind: 'vault' | 'external', target: string): void {
		if (kind === 'external') {
			window.open(target, '_blank');
			return;
		}
		const sourcePath = this.controller?.getState().filePath ?? '';
		void this.appContext.app.workspace.openLinkText(target, sourcePath, false);
	}
}
