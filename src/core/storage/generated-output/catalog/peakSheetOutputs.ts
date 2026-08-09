import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, outputPath } from './helpers';

export const PEAK_SHEET_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	{
		documentationId: 'UA-16',
		id: 'peak-sheet.dataset',
		owner: 'peak-sheet',
		lifecycle: 'active',
		outputClass: 'user-artifact',
		carrier: 'json',
		syncPolicy: 'required',
		peakIndexPolicy: 'exclude',
		materializationPolicy: 'explicit',
		retentionPolicy: 'user-managed',
		userSurface: { visibility: 'hidden' },
		path: outputPath('data-store', 'artifacts/peak-sheets/{datasetId}/dataset.json'),
		schemaVersion: 1,
		writerEvidence: ['src/app/sheet/AppPeakSheetRepository.ts'],
	},
	durableRecord({
		documentationId: 'DR-25',
		id: 'peak-sheet.events',
		owner: 'peak-sheet',
		carrier: 'jsonl',
		path: outputPath('data-store', 'records/peak-sheets/{datasetId}/events.jsonl'),
		writerEvidence: ['src/app/sheet/AppPeakSheetRepository.ts'],
		lifecycle: 'active',
	}),
];
