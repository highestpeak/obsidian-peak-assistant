/**
 * File Atlas — atlas bar (Phase 1).
 *
 * Preset segmented control (with modified-dot when filters diverge from the
 * preset), Filters popover (grouped kind toggles, headings never filterable),
 * and expand/collapse-all. Heading is intentionally absent from filters.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ListFilter, FoldVertical, UnfoldVertical, Check } from 'lucide-react';
import type { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { iconForKind } from '../config/kindIcons';

interface AtlasBarProps {
	config: FileAtlasConfig;
	activePreset: string;
	presetModified: boolean;
	visibleKinds: Set<RawBlockKind>;
	onApplyPreset: (id: string) => void;
	onToggleKind: (kind: RawBlockKind) => void;
	onGroupSet: (groupId: string, on: boolean) => void;
	onExpandAll: () => void;
	onCollapseAll: () => void;
}

export const AtlasBar: React.FC<AtlasBarProps> = ({
	config,
	activePreset,
	presetModified,
	visibleKinds,
	onApplyPreset,
	onToggleKind,
	onGroupSet,
	onExpandAll,
	onCollapseAll,
}) => {
	const [filterOpen, setFilterOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!filterOpen) return;
		const onDocClick = (e: MouseEvent): void => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setFilterOpen(false);
		};
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
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
			<div className="pkfa-preset-switch" role="tablist" aria-label="Layer presets">
				{config.presets.map((preset) => (
					<Button
						key={preset.id}
						variant="unstyled"
						type="button"
						role="tab"
						aria-selected={activePreset === preset.id}
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
					variant="unstyled"
					type="button"
					className="pkfa-ghost-btn"
					aria-expanded={filterOpen}
					onClick={() => setFilterOpen((v) => !v)}
				>
					<ListFilter />
					{config.strings.filtersButton}
				</Button>
				{filterOpen && (
					<div className="pkfa-filter-popover" aria-label="Type filters">
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
														<span className="pkfa-tt-label">{config.kinds[kind].label}</span>
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
							<span className="pkfa-filter-actions">
								<Button variant="unstyled" type="button" className="pkfa-filter-action" onClick={() => setAll(true)}>
									{config.strings.filtersSelectAll}
								</Button>
								<Button variant="unstyled" type="button" className="pkfa-filter-action" onClick={() => setAll(false)}>
									{config.strings.filtersClearAll}
								</Button>
							</span>
						</div>
					</div>
				)}
			</div>

			<div className="pkfa-fold-actions">
				<Button
					variant="unstyled"
					type="button"
					className="pkfa-fold-btn"
					title={config.strings.expandAll}
					aria-label={config.strings.expandAll}
					onClick={onExpandAll}
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
				>
					<FoldVertical />
				</Button>
			</div>
		</section>
	);
};
