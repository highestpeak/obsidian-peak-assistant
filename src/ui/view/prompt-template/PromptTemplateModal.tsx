import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { PromptTemplateList } from './PromptTemplateList';

export class PromptTemplateModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;

    constructor(private appContext: AppContext) {
        super(appContext.app);
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.modalEl.addClass('peak-prompt-template-modal');
        this.contentEl.addClass('pktw-root');
        this.modalEl.style.width = '860px';
        this.modalEl.style.maxWidth = '92vw';

        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                PromptTemplateList,
                { onClose: () => this.close() },
                this.appContext,
            ),
        );
    }

    onClose(): void {
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
