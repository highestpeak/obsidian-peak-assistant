import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import type { LensType } from '@/core/types/lens-graph';
import type { AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { GraphWorkspaceConfig } from './graphWorkspaceDefaults';
import { DEFAULT_GRAPH_WORKSPACE_CONFIG } from './graphWorkspaceDefaults';

type ProjectionValue = AtlasGraphPreset | LensType;

export interface GraphProjectionControlProps {
	hostId: string;
	kind: 'physical' | 'ai';
	physicalOptions: readonly AtlasGraphPreset[];
	aiOptions: readonly LensType[];
	physicalValue: AtlasGraphPreset;
	aiValue: LensType;
	onPhysicalChange: (value: AtlasGraphPreset) => void;
	onAIChange: (value: LensType) => void;
	config?: GraphWorkspaceConfig;
	keyTipKeys?: Partial<Record<ProjectionValue, string>>;
	className?: string;
}

export const GraphProjectionControl: React.FC<GraphProjectionControlProps> = ({
	hostId, kind, physicalOptions, aiOptions, physicalValue, aiValue,
	onPhysicalChange, onAIChange, config = DEFAULT_GRAPH_WORKSPACE_CONFIG, keyTipKeys, className,
}) => {
	const reduceMotion = useReducedMotion();
	const rootRef = useRef<HTMLDivElement>(null);
	const values: readonly ProjectionValue[] = kind === 'ai' ? aiOptions : physicalOptions;
	const value: ProjectionValue = kind === 'ai' ? aiValue : physicalValue;
	const select = (next: ProjectionValue): void => {
		if (kind === 'ai') {
			onAIChange(next as LensType);
			return;
		}
		onPhysicalChange(next as AtlasGraphPreset);
	};
	useRovingComposite(rootRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => select(item.dataset.graphProjection as ProjectionValue),
	});
	if (!values.length) return null;
	return (
		<div
			ref={rootRef}
			role="tablist"
			aria-label={kind === 'ai' ? 'AI Graph lens' : 'Graph projection'}
			data-graph-workspace-projection={kind}
			className={cn('pk-graph-workspace__projection pktw-inline-flex pktw-min-w-0 pktw-items-center pktw-gap-0.5 pktw-rounded-full pktw-border pktw-border-pk-border pktw-bg-pk-surface-sunken pktw-p-0.5', className)}
		>
			{values.map((option) => {
				const active = value === option;
				const label = kind === 'ai'
					? config.labels.aiLenses[option as LensType]
					: config.labels.physicalProjections[option as AtlasGraphPreset];
				return (
					<Button
						key={option}
						type="button"
						variant="unstyled"
						size="sm"
						geometry="toolbar"
						role="tab"
						aria-selected={active}
						tabIndex={active ? 0 : -1}
						data-graph-projection={option}
						data-peak-keytip-key={keyTipKeys?.[option]}
						data-peak-keytip-label={`${label} ${kind === 'ai' ? 'lens' : 'graph layout'}`}
						onClick={() => select(option)}
						className={cn('pktw-relative pktw-inline-flex pktw-items-center pktw-justify-center pktw-rounded-full pktw-px-2.5 pktw-text-xs pktw-font-medium', active ? 'pktw-text-white' : 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent')}
					>
						{active && (
							<motion.span
								layoutId={`${hostId}-graph-projection-thumb`}
								className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
								transition={reduceMotion ? { duration: 0 } : { duration: config.motion.projectionThumbMs / 1000, ease: config.motion.easing }}
							/>
						)}
						<span className="pktw-relative pktw-z-10 pktw-whitespace-nowrap">{label}</span>
					</Button>
				);
			})}
		</div>
	);
};
