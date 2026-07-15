/**
 * File Atlas — Atlas Tree (Phase 1).
 *
 * Renders the ordered block tree with real collapse. Row layout:
 * [line gutter · start line only] [twisty] [type icon] [name+sub] [add-to-tray] [badge].
 * Collapsed heading rows show a "N blocks · N res" summary (the only allowed
 * count usage per the spec).
 */

import React from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { iconForKind } from '../config/kindIcons';
import { foldSummary } from '../atlasTreeModel';

interface AtlasTreeProps {
	blocks: DocumentBlock[];
	config: FileAtlasConfig;
	visible: Set<string>;
	collapsed: Set<string>;
	selectedId: string | null;
	trayIds: Set<string>;
	onSelect: (block: DocumentBlock) => void;
	onToggleFold: (id: string) => void;
	onAddToTray: (block: DocumentBlock) => void;
}

export const AtlasTree: React.FC<AtlasTreeProps> = (props) => {
	return (
		<div className="pkfa-tree">
			{props.blocks.map((block) => (
				<AtlasNode key={block.id} block={block} depth={0} {...props} />
			))}
		</div>
	);
};

interface AtlasNodeProps extends AtlasTreeProps {
	block: DocumentBlock;
	depth: number;
}

const AtlasNode: React.FC<AtlasNodeProps> = ({ block, depth, ...props }) => {
	const { config, visible, collapsed, selectedId, trayIds } = props;
	if (!visible.has(block.id)) return null;

	const isHeading = block.kind === RawBlockKind.Heading;
	const kindCfg = config.kinds[block.kind];
	const isCollapsed = collapsed.has(block.id);
	const Icon = iconForKind(block.kind);
	const hasChildren = Boolean(block.children && block.children.length);

	const badgeText = isHeading ? `H${block.level}` : kindCfg?.badge ?? block.kind;
	const badgeClass = isHeading ? 'pkfa-badge--h' : `pkfa-badge--${kindCfg?.badgeClass ?? 'block'}`;
	const typeClass = isHeading ? 'pkfa-type-heading' : `pkfa-type-${kindCfg?.type ?? 'block'}`;
	const inTray = trayIds.has(block.id);

	const onRowClick = (): void => props.onSelect(block);

	return (
		<>
			<div
				role="button"
				tabIndex={0}
				className={`pkfa-node ${typeClass}${selectedId === block.id ? ' is-selected' : ''}${
					isCollapsed ? ' is-collapsed' : ''
				}`}
				data-kind={block.kind}
				onClick={onRowClick}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onRowClick();
					}
				}}
			>
				<span className="pkfa-line-ref">{block.anchor.lineStart}</span>
				<div className="pkfa-node-body" style={{ paddingLeft: `${6 + depth * 16}px` }}>
					{isHeading && hasChildren ? (
						<Button
							variant="unstyled"
							type="button"
							className="pkfa-twisty"
							aria-label="Toggle section"
							onClick={(e) => {
								e.stopPropagation();
								props.onToggleFold(block.id);
							}}
						>
							<ChevronDown />
						</Button>
					) : (
						<span className="pkfa-twisty is-empty" />
					)}
					<span className="pkfa-icon">
						<Icon />
					</span>
					<span className="pkfa-label">
						<span className="pkfa-name">{block.title}</span>
						{block.sub && <span className="pkfa-sub">{block.sub}</span>}
					</span>
					{isHeading && isCollapsed && (
						<span className="pkfa-fold-sum">{foldSummary(block, config.kinds)}</span>
					)}
					<Button
						variant="unstyled"
						type="button"
						className={`pkfa-add-btn${inTray ? ' is-in-tray' : ''}`}
						aria-label="Add to tray"
						title="Add to tray"
						onClick={(e) => {
							e.stopPropagation();
							props.onAddToTray(block);
						}}
					>
						<Plus />
					</Button>
					<span className={`pkfa-badge ${badgeClass}`}>{badgeText}</span>
				</div>
			</div>

			{isHeading && hasChildren && (
				<div className={`pkfa-kids${isCollapsed ? ' is-collapsed' : ''}`}>
					{block.children!.map((child) => (
						<AtlasNode key={child.id} block={child} depth={depth + 1} {...props} />
					))}
				</div>
			)}
		</>
	);
};
