/**
 * File Atlas — atlas bar (Phase 1).
 *
 * Preset segmented control (with modified-dot when filters diverge from the
 * preset), Filters popover (grouped kind toggles, headings never filterable),
 * and expand/collapse-all. Heading is intentionally absent from filters.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ListFilter, FoldVertical, UnfoldVertical, Check, Rows3, ListTree } from 'lucide-react';
import type { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { iconForKind } from '../config/kindIcons';
import { usePeakEscapeLayer } from '@/ui/keyboard/usePeakKeyboardSurface';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

interface AtlasBarProps {
	config: FileAtlasConfig;
	activePreset: string;
	presetModified: boolean;
	presetHasOverride: boolean;
	presetCustomizable: boolean;
	visibleKinds: Set<RawBlockKind>;
	onApplyPreset: (id: string) => void;
	onToggleKind: (kind: RawBlockKind) => void;
	onGroupSet: (groupId: string, on: boolean) => void;
	onSavePreset: () => void;
	onResetPreset: () => void;
	onExpandAll: () => void;
	onCollapseAll: () => void;
	flattened: boolean;
	onFlattenChange: (flattened: boolean) => void;
}

export const AtlasBar: React.FC<AtlasBarProps> = ({
	config,
	activePreset,
	presetModified,
	presetHasOverride,
	presetCustomizable,
	visibleKinds,
	onApplyPreset,
	onToggleKind,
	onGroupSet,
	onSavePreset,
	onResetPreset,
	onExpandAll,
	onCollapseAll,
	flattened,
	onFlattenChange,
}) => {
	const [filterOpen, setFilterOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const presetRef = useRef<HTMLDivElement>(null);
	usePeakEscapeLayer(
		filterOpen,
		popoverRef,
		'file-atlas-filter-menu',
		() => setFilterOpen(false),
		triggerRef.current,
	);
	useRovingComposite(popoverRef, {
		itemSelector: 'button:not([disabled])',
		enabled: filterOpen,
		orientation: 'vertical',
	});
	useRovingComposite(presetRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => {
			const presetId = item.dataset.presetId;
			if (presetId) onApplyPreset(presetId);
		},
	});
	useEffect(() => {
		if (!filterOpen) return;
		const popover = popoverRef.current;
		const win = popover?.ownerDocument.defaultView;
		win?.requestAnimationFrame(() => {
			popover?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
		});
	}, [filterOpen]);

	useEffect(() => {
		if (!filterOpen) return;
		const ownerDocument = menuRef.current?.ownerDocument;
		const NodeCtor = ownerDocument?.defaultView?.Node;
		if (!ownerDocument || !NodeCtor) return;
		const onDocClick = (e: MouseEvent): void => {
			if (e.target instanceof NodeCtor && menuRef.current && !menuRef.current.contains(e.target)) {
				setFilterOpen(false);
			}
		};
		ownerDocument.addEventListener('mousedown', onDocClick);
		return () => ownerDocument.removeEventListener('mousedown', onDocClick);
	}, [filterOpen]);

	const kindsInGroup = (groupId: string): RawBlockKind[] =>
		Object.entries(config.kinds)
			.filter(([, cfg]) => cfg.group === groupId && cfg.filterable !== false)
			.map(([kind]) => kind as RawBlockKind);

	const allKinds = Object.entries(config.kinds)
		.filter(([, cfg]) => cfg.filterable !== false)
		.map(([kind]) => kind as RawBlockKind);
	const onCount = allKinds.filter((k) => visibleKinds.has(k)).length;
	const setAll = (on: boolean): void => config.filterGroups.forEach((g) => onGroupSet(g.id, on));

	return (
		<section className="pkfa-atlas-bar">
			<div ref={presetRef} className="pkfa-preset-switch" role="tablist" aria-label="Layer presets">
				{config.presets.map((preset) => (
					<Button
						key={preset.id}
						variant="unstyled"
						type="button"
						role="tab"
						aria-selected={activePreset === preset.id}
						tabIndex={activePreset === preset.id ? 0 : -1}
						data-preset-id={preset.id}
						data-peak-focus-id={`file-atlas-preset-${preset.id}`}
						data-peak-keytip-key={activePreset === preset.id
							? PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.preset
							: undefined}
						data-peak-keytip-label={activePreset === preset.id ? 'Graph layer preset' : undefined}
						className={`pkfa-preset-tab${activePreset === preset.id ? ' is-active' : ''}`}
						onClick={() => onApplyPreset(preset.id)}
					>
						{preset.label}
						{activePreset === preset.id && presetModified && <span className="pkfa-mod-dot" />}
					</Button>
				))}
			</div>

			<div className="pkfa-filter-menu" ref={menuRef}>
				<Button
					ref={triggerRef}
					variant="unstyled"
					type="button"
					className="pkfa-bar-icon-btn"
					aria-expanded={filterOpen}
					aria-label={config.strings.filtersButton}
					title={config.strings.filtersButton}
					onClick={() => setFilterOpen((v) => !v)}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.filters}
					data-peak-keytip-label={config.strings.filtersButton}
				>
					<ListFilter />
				</Button>
				{filterOpen && (
					<div
						ref={popoverRef}
						className="pkfa-filter-popover"
						aria-label="Type filters"
						role="menu"
					>
						<div className="pkfa-filter-popover-head">
							<span>{config.strings.filtersTitle}</span>
							<span className="pkfa-hint">{config.strings.filtersHeadingHint}</span>
						</div>
						<div className="pkfa-filter-scroll">
							{config.filterGroups.map((group) => {
								const kinds = kindsInGroup(group.id);
								return (
									<section key={group.id} className="pkfa-filter-section">
										<div className="pkfa-filter-section-title">
											<span>{group.title}</span>
											<span className="pkfa-filter-actions">
												<Button
													variant="unstyled"
													type="button"
													className="pkfa-filter-action"
													onClick={() => onGroupSet(group.id, true)}
												>
													All
												</Button>
												<Button
													variant="unstyled"
													type="button"
													className="pkfa-filter-action"
													onClick={() => onGroupSet(group.id, false)}
												>
													None
												</Button>
											</span>
										</div>
										<div className="pkfa-filter-options">
											{kinds.map((kind) => {
												const Icon = iconForKind(kind);
												const on = visibleKinds.has(kind);
												return (
													<Button
														key={kind}
														variant="unstyled"
														type="button"
														aria-pressed={on}
														className={`pkfa-type-toggle${on ? ' is-on' : ''}`}
														onClick={() => onToggleKind(kind)}
													>
														<span className="pkfa-tt-icon">
															<Icon />
														</span>
														<span className="pkfa-tt-label">
															{config.kinds[kind].filterLabel ?? config.kinds[kind].label}
														</span>
														<span className="pkfa-tt-check">
															<Check />
														</span>
													</Button>
												);
											})}
										</div>
									</section>
								);
							})}
						</div>
						<div className="pkfa-filter-popover-foot">
							<span className="pkfa-filter-foot-count">
								{onCount} of {allKinds.length} types visible
							</span>
							<span className="pkfa-filter-footer-actions">
								{presetCustomizable && (presetModified || presetHasOverride) && (
									<span className="pkfa-filter-actions">
										{presetModified && (
											<Button
												variant="unstyled"
												type="button"
												className="pkfa-filter-action is-primary"
												onClick={onSavePreset}
											>
												{config.strings.filtersSaveDefault}
											</Button>
										)}
										{presetHasOverride && (
											<Button
												variant="unstyled"
												type="button"
												className="pkfa-filter-action"
												onClick={onResetPreset}
											>
												{config.strings.filtersResetDefault}
											</Button>
										)}
									</span>
								)}
								<span className="pkfa-filter-actions">
								<Button variant="unstyled" type="button" className="pkfa-filter-action" onClick={() => setAll(true)}>
									{config.strings.filtersSelectAll}
								</Button>
								<Button variant="unstyled" type="button" className="pkfa-filter-action" onClick={() => setAll(false)}>
									{config.strings.filtersClearAll}
								</Button>
								</span>
							</span>
						</div>
					</div>
				)}
			</div>

			<div className="pkfa-fold-actions">
				<Button
					variant="unstyled"
					type="button"
					className="pkfa-bar-icon-btn"
					aria-pressed={flattened}
					aria-label={flattened ? config.strings.treeView : config.strings.flattenView}
					title={flattened ? config.strings.treeView : config.strings.flattenView}
					onClick={() => onFlattenChange(!flattened)}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.flatten}
					data-peak-keytip-label={flattened ? config.strings.treeView : config.strings.flattenView}
				>
					{flattened ? <ListTree /> : <Rows3 />}
				</Button>
				<Button
					variant="unstyled"
					type="button"
					className="pkfa-fold-btn"
					title={config.strings.expandAll}
					aria-label={config.strings.expandAll}
					onClick={onExpandAll}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.expandAll}
					data-peak-keytip-label={config.strings.expandAll}
				>
					<UnfoldVertical />
				</Button>
				<Button
					variant="unstyled"
					type="button"
					className="pkfa-fold-btn"
					title={config.strings.collapseAll}
					aria-label={config.strings.collapseAll}
					onClick={onCollapseAll}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.collapseAll}
					data-peak-keytip-label={config.strings.collapseAll}
				>
					<FoldVertical />
				</Button>
			</div>
		</section>
	);
};
