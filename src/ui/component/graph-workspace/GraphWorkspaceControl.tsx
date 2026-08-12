import React, { useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { List, ListTree, Network } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import type { LensType } from '@/core/types/lens-graph';
import type { AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { ResultBrowserView } from '@/ui/component/result-browser/model/types';
import type { GraphWorkspaceConfig } from './graphWorkspaceDefaults';
import { useGraphWorkspaceConfig } from './useGraphWorkspaceConfig';
import type { GraphWorkspaceManifest, GraphWorkspaceScope } from './GraphWorkspaceManifest';
import { GraphProjectionControl } from './GraphProjectionControl';

const VIEW_ICONS = { list: List, tree: ListTree, graph: Network } as const;

export interface GraphWorkspaceControlProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	manifest: GraphWorkspaceManifest;
	view: ResultBrowserView;
	onViewChange: (view: ResultBrowserView) => void;
	scope: GraphWorkspaceScope;
	onScopeChange: (scope: GraphWorkspaceScope) => void;
	physicalProjection: AtlasGraphPreset;
	onPhysicalProjectionChange: (projection: AtlasGraphPreset) => void;
	aiLens: LensType;
	onAILensChange: (lens: LensType) => void;
	config?: GraphWorkspaceConfig;
	keyTipKeys?: {
		view?: Partial<Record<ResultBrowserView, string>>;
		scope?: Partial<Record<GraphWorkspaceScope, string>>;
		physicalProjection?: Partial<Record<AtlasGraphPreset, string>>;
		aiLens?: Partial<Record<LensType, string>>;
	};
	nonGraphTrailingSlot?: React.ReactNode;
	graphTrailingSlot?: React.ReactNode;
	className?: string;
}

export const GraphWorkspaceControl: React.FC<GraphWorkspaceControlProps> = ({
	manifest, view, onViewChange, scope, onScopeChange,
	physicalProjection, onPhysicalProjectionChange, aiLens, onAILensChange,
	config: suppliedConfig, keyTipKeys,
	nonGraphTrailingSlot, graphTrailingSlot, className,
	...rootProps
}) => {
	const reduceMotion = useReducedMotion();
	const config = useGraphWorkspaceConfig(suppliedConfig);
	const viewRef = useRef<HTMLDivElement>(null);
	const scopeRef = useRef<HTMLDivElement>(null);
	const graphActive = view === 'graph';
	const scopeVisible = graphActive && manifest.scopes.length > 1;
	useRovingComposite(viewRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => onViewChange(item.dataset.graphWorkspaceView as ResultBrowserView),
	});
	useRovingComposite(scopeRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => onScopeChange(item.dataset.graphWorkspaceScope as GraphWorkspaceScope),
	});
	const fastTransition = (durationMs: number) => reduceMotion
		? { duration: 0 }
		: { duration: durationMs / 1000, ease: config.motion.easing };
	return (
		<div
			{...rootProps}
			className={cn('pk-graph-workspace__control pktw-flex pktw-min-w-0 pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-1.5', className)}
			data-graph-workspace-host={manifest.hostId}
			data-graph-active={graphActive ? 'true' : 'false'}
		>
			<motion.div
				layout
				className="pk-graph-workspace__primary pktw-inline-flex pktw-flex-none pktw-items-center pktw-gap-0.5 pktw-overflow-hidden pktw-rounded-full pktw-border pktw-border-pk-border pktw-bg-pk-surface-sunken pktw-p-0.5"
				transition={fastTransition(config.motion.scopeExpandMs)}
			>
				<div ref={viewRef} role="tablist" aria-label="Result view" className="pktw-inline-flex pktw-items-center pktw-gap-0.5">
					{manifest.views.map((option) => {
						const active = view === option;
						const Icon = VIEW_ICONS[option];
						const label = config.labels.views[option];
						return (
							<Button
								key={option}
								type="button"
								variant="unstyled"
								size="sm"
								geometry="toolbar"
								role="tab"
								aria-selected={active}
								aria-label={`${label} view`}
								title={`${label} view`}
								tabIndex={active ? 0 : -1}
								data-graph-workspace-view={option}
								data-peak-keytip-key={keyTipKeys?.view?.[option]}
								data-peak-keytip-label={`${label} view`}
								onClick={() => onViewChange(option)}
								className={cn(
									'pktw-relative pktw-inline-flex pktw-items-center pktw-justify-center pktw-gap-1.5 pktw-rounded-full pktw-px-2.5 pktw-text-xs pktw-font-medium',
									graphActive && 'pktw-w-8 pktw-px-0',
									active ? 'pktw-text-white' : 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent',
								)}
							>
								{active && (
									<motion.span
										layoutId={`${manifest.hostId}-graph-view-thumb`}
										className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
										transition={fastTransition(config.motion.viewThumbMs)}
									/>
								)}
								<span className="pktw-relative pktw-z-10 pktw-inline-flex pktw-items-center pktw-gap-1.5">
									<Icon className="pktw-h-3.5 pktw-w-3.5" />
									<AnimatePresence initial={false}>
										{!graphActive && (
											<motion.span
												initial={{ opacity: 0, width: 0 }}
												animate={{ opacity: 1, width: 'auto' }}
												exit={{ opacity: 0, width: 0 }}
												transition={fastTransition(config.motion.labelCompressMs)}
												className="pktw-overflow-hidden pktw-whitespace-nowrap"
											>
												{label}
											</motion.span>
										)}
									</AnimatePresence>
								</span>
							</Button>
						);
					})}
				</div>

				<AnimatePresence initial={false}>
					{scopeVisible && (
						<motion.div
							ref={scopeRef}
							role="tablist"
							aria-label="Graph scope"
							data-graph-workspace-scope-extension
							initial={{ opacity: 0, width: 0 }}
							animate={{ opacity: 1, width: 'auto' }}
							exit={{ opacity: 0, width: 0 }}
							transition={fastTransition(config.motion.scopeExpandMs)}
							className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-overflow-hidden pktw-border-l pktw-border-pk-border pktw-pl-0.5"
						>
							{manifest.scopes.map((option, index) => {
								const active = scope === option;
								const label = config.labels.scopes[option];
								return (
									<motion.div
										key={option}
										initial={{ opacity: 0, scaleX: 0.86 }}
										animate={{ opacity: 1, scaleX: 1 }}
										exit={{ opacity: 0, scaleX: 0.86 }}
										transition={reduceMotion ? { duration: 0 } : { ...fastTransition(config.motion.scopeThumbMs), delay: (index * config.motion.scopeStaggerMs) / 1000 }}
									>
										<Button
											type="button"
											variant="unstyled"
											size="sm"
											geometry="toolbar"
											role="tab"
											aria-selected={active}
											tabIndex={active ? 0 : -1}
											data-graph-workspace-scope={option}
											data-peak-keytip-key={keyTipKeys?.scope?.[option]}
											data-peak-keytip-label={label}
											onClick={() => onScopeChange(option)}
											className={cn('pktw-relative pktw-inline-flex pktw-items-center pktw-justify-center pktw-rounded-full pktw-px-2.5 pktw-text-xs pktw-font-medium', active ? 'pktw-text-white' : 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent')}
										>
											{active && (
												<motion.span
													layoutId={`${manifest.hostId}-graph-scope-thumb`}
													className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
													transition={fastTransition(config.motion.scopeThumbMs)}
												/>
											)}
											<span className="pktw-relative pktw-z-10 pktw-whitespace-nowrap">{label}</span>
										</Button>
									</motion.div>
								);
							})}
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>

			<div className="pktw-min-w-0 pktw-flex-1" />
			{graphActive ? (
				<>
					<GraphProjectionControl
						hostId={manifest.hostId}
						kind={scope === 'ai' ? 'ai' : 'physical'}
						physicalOptions={manifest.physicalProjections}
						aiOptions={manifest.aiLenses}
						physicalValue={physicalProjection}
						aiValue={aiLens}
						onPhysicalChange={onPhysicalProjectionChange}
						onAIChange={onAILensChange}
						keyTipKeys={scope === 'ai' ? keyTipKeys?.aiLens : keyTipKeys?.physicalProjection}
						config={config}
					/>
					{graphTrailingSlot}
				</>
			) : nonGraphTrailingSlot}
		</div>
	);
};
