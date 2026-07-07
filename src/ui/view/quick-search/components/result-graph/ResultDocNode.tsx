import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

/**
 * Result Graph View · result document node (spec 2026-07-07 §Content
 * Layers point 4). Uniform size; the match-score → color-intensity is
 * expressed by opacity on the accent tint background so the same node
 * type renders "hotter" for higher-scoring hits without pulling in extra
 * palettes.
 */
export interface ResultDocNodeData extends Record<string, unknown> {
	title: string;
	scoreIntensity: number; // 0..1, already normalised by the view
	selected?: boolean;
}

export type ResultDocNodeType = Node<ResultDocNodeData, 'resultDoc'>;

const HANDLE_CLASS = '!pktw-bg-transparent !pktw-border-0 !pktw-w-0 !pktw-h-0';

/** Map 0..1 score intensity to a legible alpha range (0.18..0.68). */
function alphaFromIntensity(t: number): number {
	const clamped = Math.min(1, Math.max(0, t));
	return 0.18 + clamped * 0.5;
}

export const ResultDocNode = memo(({ data }: NodeProps<ResultDocNodeType>) => {
	const alpha = alphaFromIntensity(data.scoreIntensity);
	const selected = !!data.selected;
	// Compose accent-tint at a dynamic alpha via color-mix so we avoid
	// hardcoding the accent hex here — palette lives in peak-tokens.css.
	const heat = `color-mix(in srgb, var(--pk-accent) ${(alpha * 100).toFixed(0)}%, transparent)`;
	return (
		<div
			className="pktw-rounded-md pktw-px-3 pktw-py-1.5 pktw-min-w-[100px] pktw-max-w-[180px] pktw-cursor-pointer pktw-transition-shadow pktw-shadow-sm hover:pktw-shadow-md pktw-text-center"
			style={{
				background: selected ? 'var(--pk-accent)' : heat,
				border: selected ? '2px solid var(--pk-accent)' : '1px solid var(--pk-border)',
				color: selected ? 'var(--pk-accent-fg)' : 'var(--pk-text-primary)',
			}}
			title={data.title}
		>
			<span className="pktw-text-[12px] pktw-font-medium pktw-truncate pktw-block">
				{data.title}
			</span>
			<Handle type="target" position={Position.Left} id="target-left" className={HANDLE_CLASS} />
			<Handle type="target" position={Position.Top} id="target-top" className={HANDLE_CLASS} />
			<Handle type="target" position={Position.Right} id="target-right" className={HANDLE_CLASS} />
			<Handle type="target" position={Position.Bottom} id="target-bottom" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Left} id="source-left" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Top} id="source-top" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Right} id="source-right" className={HANDLE_CLASS} />
			<Handle type="source" position={Position.Bottom} id="source-bottom" className={HANDLE_CLASS} />
		</div>
	);
});

ResultDocNode.displayName = 'ResultDocNode';
