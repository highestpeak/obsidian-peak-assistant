import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSearchSessionStore } from '../../store/searchSessionStore';
import { V2StepCard } from './V2StepCard';
import type { V2ToolStep } from '../../types/search-steps';

/** Group consecutive read_note steps into batched display items */
type DisplayItem = {
	kind: 'single';
	step: V2ToolStep;
} | {
	kind: 'batch';
	steps: V2ToolStep[];
};

function groupSteps(steps: V2ToolStep[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	let i = 0;
	while (i < steps.length) {
		const step = steps[i];
		if (step.toolName.endsWith('vault_read_note')) {
			// Collect consecutive read_note
			const batch: V2ToolStep[] = [step];
			while (i + 1 < steps.length && steps[i + 1].toolName.endsWith('vault_read_note')) {
				i++;
				batch.push(steps[i]);
			}
			if (batch.length >= 2) {
				items.push({ kind: 'batch', steps: batch });
			} else {
				items.push({ kind: 'single', step: batch[0] });
			}
		} else {
			items.push({ kind: 'single', step });
		}
		i++;
	}
	return items;
}

const BatchCard: React.FC<{ steps: V2ToolStep[] }> = ({ steps }) => {
	const allDone = steps.every((s) => s.status === 'done');
	const running = steps.filter((s) => s.status === 'running').length;
	const names = steps.map((s) => {
		const path = String(s.input.path ?? s.input.paths?.[0] ?? '');
		return path.split('/').pop()?.replace(/\.md$/, '') || 'note';
	});
	const maxShow = 6;
	const shown = names.slice(0, maxShow);
	const extra = names.length - maxShow;

	// Synthesize a virtual step for display
	const virtual: V2ToolStep = {
		id: `batch-${steps[0].id}`,
		toolName: 'batch_read_note',
		displayName: `Reading ${steps.length} notes in depth`,
		icon: '📄',
		input: {},
		status: allDone ? 'done' : 'running',
		startedAt: steps[0].startedAt,
		endedAt: allDone ? steps[steps.length - 1].endedAt : undefined,
		summary: allDone
			? shown.join(', ') + (extra > 0 ? ` +${extra} more` : '')
			: `${running} reading...`,
	};

	return <V2StepCard step={virtual} />;
};

export const V2StepList: React.FC = () => {
	const v2Steps = useSearchSessionStore((s) => s.v2Steps);
	if (v2Steps.length === 0) return null;

	const items = groupSteps(v2Steps);

	return (
		<div className="pktw-flex pktw-flex-col pktw-divide-y pktw-divide-gray-100">
			<AnimatePresence initial={false}>
				{items.map((item, i) =>
					item.kind === 'single'
						? <V2StepCard key={item.step.id} step={item.step} />
						: <BatchCard key={`batch-${i}`} steps={item.steps} />
				)}
			</AnimatePresence>
		</div>
	);
};
