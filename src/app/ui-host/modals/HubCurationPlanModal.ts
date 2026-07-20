import { Modal, type App } from 'obsidian';
import type { HubCurationPlanRow } from '@/core/storage/sqlite/repositories/HubCurationPlanRepo';

// Minimal Modal showing the latest Hub Curation plan. Plain DOM (no React
// container) because the surface is a debug view — one plan snapshot, no
// interactive state beyond close.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 9.

export class HubCurationPlanModal extends Modal {
	constructor(app: App, private readonly plan: HubCurationPlanRow) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		// Bare-DOM modal: opt into `pktw-root` ONLY (not `peak-design-root`) so
		// the `--pk-*` tokens + design font pin resolve, WITHOUT the bare-tag
		// reset stripping Obsidian's native button chrome this modal relies on.
		this.contentEl.addClass('pktw-root');
		this.modalEl.addClass('peak-hub-curation-plan-modal');
		this.modalEl.style.width = '720px';
		this.modalEl.style.maxWidth = '92vw';

		this.contentEl.createEl('h2', { text: 'Hub Curation Plan' });

		const meta = this.contentEl.createDiv({ cls: 'peak-hub-plan-meta' });
		meta.style.marginBottom = '12px';
		meta.style.fontSize = '13px';
		meta.style.lineHeight = '1.6';
		const created = new Date(this.plan.curatedAt).toISOString().replace('T', ' ').slice(0, 19);
		meta.createEl('div', { text: `Plan ${this.plan.planId}` });
		meta.createEl('div', { text: `Curated at ${created} (${this.plan.trigger})` });
		meta.createEl('div', {
			text: `Iterations ${this.plan.iterations} · Coverage ${(this.plan.coveragePct * 100).toFixed(1)}% · Confidence ${(this.plan.confidence * 100).toFixed(1)}%`,
		});
		meta.createEl('div', {
			text: `Executor status: ${this.plan.executorStatus}${this.plan.executorError ? ' — ' + this.plan.executorError : ''}`,
		});

		const decisionsHeader = this.contentEl.createEl('h3', { text: `Decisions (${this.plan.totalHubs})` });
		decisionsHeader.style.margin = '12px 0 6px';

		const summary = {
			create: this.plan.decisions.filter((d) => d.action === 'create').length,
			keep: this.plan.decisions.filter((d) => d.action === 'keep').length,
			merge: this.plan.decisions.filter((d) => d.action === 'merge').length,
			retire: this.plan.decisions.filter((d) => d.action === 'retire').length,
		};
		this.contentEl.createEl('div', {
			text: `create ${summary.create} · keep ${summary.keep} · merge ${summary.merge} · retire ${summary.retire}`,
			cls: 'peak-hub-plan-summary',
		}).style.marginBottom = '10px';

		if (this.plan.decisions.length === 0) {
			this.contentEl.createEl('em', { text: '(no decisions in this plan)' });
			return;
		}

		const table = this.contentEl.createEl('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';
		table.style.fontSize = '12px';

		const thead = table.createEl('thead');
		const trHead = thead.createEl('tr');
		for (const label of ['Action', 'Path', 'Node', 'Members', 'Reason']) {
			const th = trHead.createEl('th', { text: label });
			th.style.textAlign = 'left';
			th.style.padding = '4px 6px';
			th.style.borderBottom = '1px solid var(--pk-border, var(--background-modifier-border))';
		}

		const tbody = table.createEl('tbody');
		for (const d of this.plan.decisions) {
			const tr = tbody.createEl('tr');
			tr.style.borderBottom = '1px solid var(--pk-border, var(--background-modifier-border))';
			const cells = [
				d.action,
				d.hubPath,
				d.nodeId.slice(0, 12),
				String(d.scope.memberNodeIds?.length ?? 0),
				d.reason,
			];
			for (const c of cells) {
				const td = tr.createEl('td', { text: c });
				td.style.padding = '4px 6px';
				td.style.verticalAlign = 'top';
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
