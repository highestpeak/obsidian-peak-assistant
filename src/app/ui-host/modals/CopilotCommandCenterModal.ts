import { Modal, Setting, TFile, type App, Notice } from 'obsidian';
import type { CopilotCommandCenterService } from '@/service/copilot/CopilotCommandCenterService';
import type { CapabilityPlan, CapabilityPlanStep } from '@/core/schemas/agents/copilotCommandCenter';

// Two-phase modal for the Copilot Command Center: (1) collect user goal,
// (2) show the drafted plan and let the user execute or cancel per step.
// See docs/superpowers/specs/2026-05-14-copilot-command-center-user-centered-redesign.md

const MAX_EXCERPT = 800;

export interface CopilotCommandCenterModalDeps {
	app: App;
	service: CopilotCommandCenterService;
}

export class CopilotCommandCenterModal extends Modal {
	private goal = '';
	private plan: CapabilityPlan | null = null;
	private planning = false;

	constructor(private readonly deps: CopilotCommandCenterModalDeps) {
		super(deps.app);
	}

	onOpen(): void {
		this.contentEl.empty();
		// Bare-DOM modal: `pktw-root` ONLY (tokens + font pin). The plan/goal
		// phases use Obsidian `new Setting().setCta()` native buttons, so the
		// `peak-design-root` reset must NOT strip their chrome.
		this.contentEl.addClass('pktw-root');
		this.modalEl.addClass('peak-copilot-command-center-modal');
		this.modalEl.style.width = '640px';
		this.modalEl.style.maxWidth = '92vw';
		this.renderGoalPhase();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderGoalPhase(): void {
		this.contentEl.empty();
		this.contentEl.createEl('h2', { text: 'Capability Planner' });
		this.contentEl.createEl('p', {
			text: 'Describe what you want to accomplish. The planner will draft a capability sequence.',
		});
		const inputWrap = this.contentEl.createDiv();
		const input = inputWrap.createEl('textarea');
		input.rows = 4;
		input.style.width = '100%';
		input.style.padding = '8px';
		input.style.fontSize = '14px';
		input.value = this.goal;
		input.addEventListener('input', () => { this.goal = input.value; });
		input.focus();

		const buttonRow = this.contentEl.createDiv();
		buttonRow.style.marginTop = '12px';
		new Setting(buttonRow)
			.addButton((btn) =>
				btn
					.setButtonText(this.planning ? 'Planning...' : 'Draft Plan')
					.setCta()
					.setDisabled(this.planning)
					.onClick(() => void this.draftPlan()),
			)
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	private async draftPlan(): Promise<void> {
		const goal = this.goal.trim();
		if (!goal) {
			new Notice('Enter a goal first.', 3000);
			return;
		}
		this.planning = true;
		this.renderPlanningState();
		try {
			this.plan = await this.deps.service.planOnly({ userGoal: goal });
			this.planning = false;
			this.renderPlanPhase();
		} catch (err) {
			this.planning = false;
			new Notice(`Plan failed: ${(err as Error).message}`, 8000);
			this.renderGoalPhase();
		}
	}

	private renderPlanningState(): void {
		this.contentEl.empty();
		this.contentEl.createEl('h2', { text: 'Capability Planner' });
		this.contentEl.createEl('p', { text: 'Drafting capability plan…' });
	}

	private renderPlanPhase(): void {
		if (!this.plan) return;
		this.contentEl.empty();
		this.contentEl.createEl('h2', { text: this.plan.planTitle });
		this.contentEl.createEl('p', { text: this.plan.summary }).style.marginBottom = '8px';
		const restate = this.contentEl.createEl('p', { text: `Goal (as understood): ${this.plan.goalRestatement}` });
		restate.style.fontStyle = 'italic';
		restate.style.color = 'var(--pk-text-secondary, var(--text-muted))';
		restate.style.marginBottom = '12px';

		const stepsEl = this.contentEl.createEl('ol');
		stepsEl.style.paddingLeft = '20px';
		for (const step of this.plan.steps) {
			const li = stepsEl.createEl('li');
			li.style.marginBottom = '8px';
			const line1 = li.createEl('div');
			line1.createEl('strong', { text: step.commandLabel });
			line1.appendChild(document.createTextNode(step.readOnly ? '  · read-only' : '  · writes'));
			li.createEl('div', { text: step.rationale, cls: 'peak-cmdcenter-rationale' }).style.color = 'var(--pk-text-secondary, var(--text-muted))';
			if (step.reviewHint) {
				li.createEl('div', { text: `Review: ${step.reviewHint}` }).style.color = 'var(--pk-text-secondary, var(--text-muted))';
			}
		}

		const confidenceLine = this.contentEl.createEl('div');
		confidenceLine.style.margin = '12px 0';
		confidenceLine.style.fontSize = '12px';
		confidenceLine.style.color = 'var(--pk-text-secondary, var(--text-muted))';
		confidenceLine.setText(`Planner confidence: ${(this.plan.confidence * 100).toFixed(0)}%`);

		const buttonRow = this.contentEl.createDiv();
		new Setting(buttonRow)
			.addButton((btn) =>
				btn
					.setButtonText(`Execute ${this.plan!.steps.length} steps`)
					.setCta()
					.onClick(() => void this.executePlan()),
			)
			.addButton((btn) => btn.setButtonText('Revise Goal').onClick(() => this.renderGoalPhase()))
			.addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	private async executePlan(): Promise<void> {
		if (!this.plan) return;
		this.contentEl.empty();
		this.contentEl.createEl('h2', { text: 'Executing plan…' });
		try {
			const result = await this.deps.service.executePlan(this.plan);
			const succeeded = result.stepOutcomes.filter((o) => o.status === 'succeeded').length;
			const failed = result.stepOutcomes.filter((o) => o.status === 'failed').length;
			const skipped = result.stepOutcomes.filter((o) => o.status === 'skipped').length;
			new Notice(
				`Capability Planner: ${succeeded} succeeded · ${failed} failed · ${skipped} skipped`,
				10000,
			);
		} catch (err) {
			new Notice(`Capability Planner execution failed: ${(err as Error).message}`, 10000);
		}
		this.close();
	}
}

export async function readActiveFileExcerpt(app: App): Promise<{ path: string | null; excerpt: string }> {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile)) return { path: null, excerpt: '' };
	const raw = await app.vault.read(file);
	return { path: file.path, excerpt: raw.slice(0, MAX_EXCERPT) };
}
