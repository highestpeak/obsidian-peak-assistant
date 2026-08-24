import React from 'react';
import { createRoot } from 'react-dom/client';

import type { PeakSheetUiPort } from '@/core/ports/PeakSheetToolPort';
import { applyPeakSheetPatch, executePeakSheetAnalysis } from '@/core/sheet';
import type { PeakSheetDatasetPatch, PeakSheetDatasetSnapshot, PeakSheetPatchOperation } from '@/core/sheet';
import { createPeakSheetStarterDrafts } from '@/app/sheet/PeakSheetStarterDatasets';
import { PeakSheet } from '@/ui/view/peak-sheet/PeakSheet';

const now = '2026-08-24T00:00:00.000Z';
const draft = createPeakSheetStarterDrafts(now)[0];
let snapshot: PeakSheetDatasetSnapshot = {
	format: 'peak-sheet', version: 2, schemaVersion: 1, datasetId: 'parity-launch-tracker', name: draft.name,
	revision: 1, fields: draft.fields, rows: draft.rows, scripts: draft.scripts,
	views: [
		{ id: 'table-main', name: 'Table', type: 'table' },
		{ id: 'board-main', name: 'Board', type: 'board', laneFieldId: 'status', titleFieldId: 'task', cardFieldIds: ['blocker', 'due-date'] },
		{ id: 'calendar-main', name: 'Calendar', type: 'calendar', dateFieldId: 'due-date', titleFieldId: 'task' },
	],
	createdAt: now, updatedAt: now,
};
const listeners = new Set<() => void>();
const runtime = {
	getDataset: () => snapshot,
	query: () => snapshot,
	listDatasets: () => [{ datasetId: snapshot.datasetId, name: snapshot.name, revision: snapshot.revision, rowCount: snapshot.rows.length, fieldCount: snapshot.fields.length, updatedAt: snapshot.updatedAt }],
	analyze: (plan) => executePeakSheetAnalysis(snapshot, plan),
	mutate: async (_datasetId: string, operations: readonly PeakSheetPatchOperation[]) => {
		const patch: PeakSheetDatasetPatch = { patchId: crypto.randomUUID(), datasetId: snapshot.datasetId, baseRevision: snapshot.revision, operations, actor: { kind: 'user' }, createdAt: new Date().toISOString() };
		snapshot = applyPeakSheetPatch(snapshot, patch).snapshot; listeners.forEach((listener) => listener()); return snapshot;
	},
	applyPatch: async (patch: PeakSheetDatasetPatch) => { snapshot = applyPeakSheetPatch(snapshot, patch).snapshot; listeners.forEach((listener) => listener()); return snapshot; },
	subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
	canUndo: () => false, canRedo: () => false,
	undo: async () => snapshot, redo: async () => snapshot,
	renameFile: async (_datasetId: string, title: string) => { snapshot = { ...snapshot, name: title }; listeners.forEach((listener) => listener()); return `Product/Launch/${title}.peaksheet`; },
	trashFile: async () => undefined,
	exportCsv: () => 'Task,Area,Priority,Status', exportNative: () => JSON.stringify(snapshot), exportXlsx: async () => new ArrayBuffer(0),
} as PeakSheetUiPort;
const attachmentPort = { copyExternalFile: async (input: { name: string; mediaType?: string }) => ({ kind: 'external-copy' as const, vaultPath: `Peak/attachments/${input.name}`, mediaType: input.mediaType, displayName: input.name }) };

createRoot(document.getElementById('root')!).render(<PeakSheet runtime={runtime} datasetId={snapshot.datasetId} filePath="Product/Launch/Launch Tracker.peaksheet" attachmentPort={attachmentPort} onOpenFile={async () => undefined} />);
