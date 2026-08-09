import type { PeakSheetDatasetDraft, PeakSheetFieldDefinition, PeakSheetRow } from '@/core/sheet';

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
	return { name: 'Peak Assistant Launch Tracker', fields, rows, diagnostics: [], source: 'manual' };
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
