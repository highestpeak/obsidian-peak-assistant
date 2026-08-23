import type { PeakSheetDatasetDraft, PeakSheetFieldDefinition, PeakSheetRow, PeakSheetScriptDefinition } from '@/core/sheet';

export function createPeakSheetStarterDrafts(now: string): readonly PeakSheetDatasetDraft[] {
	return [launchTracker(now), betaFeedback(), launchContent()];
}

function launchTracker(now: string): PeakSheetDatasetDraft {
	const fields: PeakSheetFieldDefinition[] = [
		text('task', 'Task', 260),
		select('area', 'Area', ['Product', 'RAG', 'Agent', 'UI', 'Performance', 'Launch', 'Growth']),
		select('priority', 'Priority', ['P0', 'P1', 'P2']),
		select('status', 'Status', ['Backlog', 'Todo', 'Doing', 'Blocked', 'Done']),
		date('due-date', 'Due Date'),
		text('blocker', 'Blocker', 220),
		text('notes', 'Notes', 280),
		date('created-at', 'Created At'),
		date('updated-at', 'Updated At'),
	];
	const rows: PeakSheetRow[] = [
		row('release-readiness', fields, { Task: 'Review release readiness', Area: 'Launch', Priority: 'P0', Status: 'Todo', 'Created At': now, 'Updated At': now }),
		row('beta-blockers', fields, { Task: 'Triage beta blockers', Area: 'Product', Priority: 'P0', Status: 'Doing', 'Created At': now, 'Updated At': now }),
		row('onboarding', fields, { Task: 'Polish onboarding', Area: 'UI', Priority: 'P1', Status: 'Backlog', 'Created At': now, 'Updated At': now }),
	];
	return { name: 'Peak Assistant Launch Tracker', fields, rows, scripts: starterScripts(now), diagnostics: [], source: 'manual' };
}

function starterScripts(now: string): PeakSheetScriptDefinition[] {
	return [
		{ id: 'normalize-priority', name: 'Normalize priority', summary: 'Priority → normalize text for analysis', steps: [{ op: 'cast', fieldId: 'priority', target: 'text' }], createdAt: now, updatedAt: now },
		{ id: 'release-risk-count', name: 'Count release risks', summary: 'Status → group → count open work', steps: [{ op: 'group', fieldId: 'status' }, { op: 'aggregate', metrics: [{ id: 'count', operation: 'count' }] }], createdAt: now, updatedAt: now },
		{ id: 'area-chart', name: 'Chart work by area', summary: 'Area → grouped count → bar chart', steps: [{ op: 'chart', chartType: 'bar', categoryFieldId: 'area', metrics: [{ id: 'count', operation: 'count' }] }], createdAt: now, updatedAt: now },
	];
}

function betaFeedback(): PeakSheetDatasetDraft {
	return {
		name: 'Beta Feedback',
		fields: [
			text('user', 'User'), text('feedback', 'Feedback', 320),
			select('category', 'Category', ['Product', 'Bug', 'UX', 'Performance', 'Request']),
			select('severity', 'Severity', ['Critical', 'High', 'Medium', 'Low']),
			{ id: 'reproducible', name: 'Reproducible', type: 'checkbox', width: 120 },
			select('status', 'Status', ['New', 'Triaged', 'Doing', 'Resolved']),
			{ id: 'related-task', name: 'Related Task', type: 'link', width: 200 },
			text('notes', 'Notes', 280),
		],
		rows: [], diagnostics: [], source: 'manual',
	};
}

function launchContent(): PeakSheetDatasetDraft {
	return {
		name: 'Launch Content',
		fields: [
			select('channel', 'Channel', ['Website', 'Blog', 'X', 'LinkedIn', 'Reddit', 'Email']),
			select('content-type', 'Content Type', ['Announcement', 'Demo', 'Guide', 'Update']),
			text('topic', 'Topic', 260),
			select('status', 'Status', ['Idea', 'Drafting', 'Review', 'Scheduled', 'Published']),
			date('publish-date', 'Publish Date'),
			{ id: 'link', name: 'Link', type: 'link', width: 220 },
			{ id: 'result', name: 'Result', type: 'number', width: 120 },
		],
		rows: [], diagnostics: [], source: 'manual',
	};
}

function text(id: string, name: string, width = 160): PeakSheetFieldDefinition {
	return { id, name, type: 'text', width };
}

function date(id: string, name: string): PeakSheetFieldDefinition {
	return { id, name, type: 'date', width: 150 };
}

function select(id: string, name: string, labels: readonly string[]): PeakSheetFieldDefinition {
	return { id, name, type: 'singleSelect', width: 140, options: labels.map((label) => ({ id: label, label })) };
}

function row(id: string, fields: readonly PeakSheetFieldDefinition[], values: Readonly<Record<string, string>>): PeakSheetRow {
	return { id, cells: Object.fromEntries(fields.map((field) => [field.id, values[field.name] ?? null])) };
}
