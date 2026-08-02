import { ButtonComponent, Component, MarkdownRenderer, Modal, Notice, type App } from 'obsidian';
import type { HubDraft } from '@/core/schemas/agents/hubMaterialization';
import type { HubGenerationRuntime } from '@/service/hub/HubGenerationRuntime';

export class HubDetailModal extends Modal {
	private readonly renderer = new Component();
	constructor(
		app: App,
		private readonly runtime: HubGenerationRuntime,
		private readonly hubId: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.renderer.load();
		void this.renderDetail();
	}

	onClose(): void {
		this.renderer.unload();
	}

	private async renderDetail(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('peak-hub-detail');
		const manifest = await this.runtime.readManifest(this.hubId);
		if (!manifest) {
			this.contentEl.createDiv({ text: 'Hub record not found.' });
			return;
		}

		this.titleEl.setText(manifest.label);
		const status = this.contentEl.createDiv({ cls: 'peak-hub-detail__status' });
		status.setText(
			manifest.materialization.state === 'materialized'
				? `Materialized · version ${manifest.summary.version}`
				: `Virtual · version ${manifest.summary.version}`,
		);
		const body = manifest.summary.draft
			? markdownFromDraft(manifest.summary.draft)
			: manifest.summary.legacyMarkdown ?? '_No synthesis body is available yet._';
		const bodyEl = this.contentEl.createDiv({ cls: 'peak-hub-detail__body' });
		await MarkdownRenderer.render(this.app, body, bodyEl, manifest.materialization.path ?? '', this.renderer);

		this.contentEl.createDiv({
			cls: 'peak-hub-detail__members',
			text: `${manifest.members.length} constituent documents`,
		});
		const actions = this.contentEl.createDiv({ cls: 'peak-hub-detail__actions' });
		if (manifest.materialization.path) {
			new ButtonComponent(actions)
				.setButtonText('Open Hub note')
				.onClick(() => {
					void this.app.workspace.openLinkText(manifest.materialization.path!, '', true);
					this.close();
				});
			return;
		}
		new ButtonComponent(actions)
			.setButtonText('Materialize as Markdown')
			.setCta()
			.onClick(async () => {
				try {
					await this.runtime.materializeHub(this.hubId);
					new Notice('Hub materialized as a Markdown note.');
					await this.renderDetail();
				} catch (error) {
					new Notice(error instanceof Error ? error.message : String(error), 8000);
				}
			});
	}
}

function markdownFromDraft(draft: HubDraft): string {
	return [
		`# ${draft.title}`,
		draft.summary,
		'## Core concepts',
		draft.coreConceptSection,
		'## Structure',
		draft.structureSection,
		'## Evolution',
		draft.evolutionSection,
		'## Open questions',
		draft.openQuestionsSection,
		'## Entry points',
		draft.entryPointsSection,
	].join('\n\n');
}
