import React from 'react';
import {
	Image as ImageIcon,
	AudioLines,
	Video,
	FileText,
	Link2,
	Folder,
	Table2,
	Code,
	Network,
	Database,
	Wrench,
	MessageSquare,
	ExternalLink,
	Search,
	Scissors,
	BellRing,
} from 'lucide-react';
import {
	formatTime,
	type ResourceRow,
	type ResourceRowKind,
	type ResourceRowDirection,
	type ResourceFilter,
} from './outlineModel';

/**
 * ResourcesTab — presentational list for the Resources projection.
 *
 * The filter chrome (direction segmented + type dropdown) lives in
 * `ResourcesFilterBar`, mounted by `ConversationIndex` OUTSIDE the scroll area
 * so it stays pinned while the list scrolls (mock `.right-filterbar`). This
 * file renders only the rows + empty state.
 *
 * Empty-state copy explains WHY the list is empty (active filters vs no data)
 * so the reader never has to check whether the filter is on.
 */

/** Icon for a resource row kind — shared with `ResourcesFilterBar`. */
export function iconForKind(kind: ResourceRowKind): React.ReactNode {
	switch (kind) {
		case 'image': return <ImageIcon aria-hidden />;
		case 'audio': return <AudioLines aria-hidden />;
		case 'video': return <Video aria-hidden />;
		case 'document': return <FileText aria-hidden />;
		case 'url': return <Link2 aria-hidden />;
		case 'vault': return <Folder aria-hidden />;
		case 'table': return <Table2 aria-hidden />;
		case 'code': return <Code aria-hidden />;
		case 'diagram': return <Network aria-hidden />;
		case 'base': return <Database aria-hidden />;
		case 'process': return <Wrench aria-hidden />;
		case 'message': return <MessageSquare aria-hidden />;
		case 'dataview': return <Search aria-hidden />;
		case 'extract': return <Scissors aria-hidden />;
		case 'reminder': return <BellRing aria-hidden />;
	}
}

export interface ResourcesTabStrings {
	directionAll: string;
	directionInput: string;
	directionGenerated: string;
	/** Section headers when rows are grouped by direction. */
	groupInput: string;
	groupGenerated: string;
	/** "All types" — the type dropdown's neutral option (distinct from `All`). */
	typeAll: string;
	typeMessage: string;
	typeImage: string;
	typeAudio: string;
	typeVideo: string;
	typeDocument: string;
	typeUrl: string;
	typeVault: string;
	typeTable: string;
	typeCode: string;
	typeDiagram: string;
	typeBase: string;
	typeProcess: string;
	typeDataview: string;
	typeExtract: string;
	typeReminder: string;
	emptyFiltered: string;
	emptyFilteredSub?: string;
	emptyEmpty: string;
	emptyEmptySub?: string;
	openLabel: string;
}

/** Label for a resource row kind — shared with `ResourcesFilterBar`. */
export function kindLabel(k: ResourceRowKind, s: ResourcesTabStrings): string {
	switch (k) {
		case 'message': return s.typeMessage;
		case 'image': return s.typeImage;
		case 'audio': return s.typeAudio;
		case 'video': return s.typeVideo;
		case 'document': return s.typeDocument;
		case 'url': return s.typeUrl;
		case 'vault': return s.typeVault;
		case 'table': return s.typeTable;
		case 'code': return s.typeCode;
		case 'diagram': return s.typeDiagram;
		case 'base': return s.typeBase;
		case 'process': return s.typeProcess;
		case 'dataview': return s.typeDataview;
		case 'extract': return s.typeExtract;
		case 'reminder': return s.typeReminder;
	}
}

/** Canonical order of the type filter / row kinds. */
export const KIND_ORDER: ResourceRowKind[] = [
	'message', 'image', 'audio', 'video', 'document', 'url', 'vault', 'table', 'code', 'diagram', 'base', 'process',
	'dataview', 'extract', 'reminder',
];

export interface ResourcesTabProps {
	rows: ResourceRow[];
	/** Row list AFTER filtering; separated so we can show "0 of N" empties. */
	filteredRows: ResourceRow[];
	filter: ResourceFilter;
	strings: ResourcesTabStrings;
	onSelect: (row: ResourceRow) => void;
	onOpen: (row: ResourceRow) => void;
}

/** Ordered direction sections — matches mock `本轮引用 / 本轮生成`. */
const DIRECTION_ORDER: ResourceRowDirection[] = ['input', 'generated'];

function ResourceRowItem({
	row,
	strings,
	onSelect,
	onOpen,
}: {
	row: ResourceRow;
	strings: ResourcesTabStrings;
	onSelect: (row: ResourceRow) => void;
	onOpen: (row: ResourceRow) => void;
}): React.ReactElement {
	return (
		<div
			className="pkchat-idx-row pkchat-idx-row--artifact"
			data-direction={row.direction}
			data-kind={row.kind}
		>
			<button
				type="button"
				className="pkchat-idx-row__main"
				data-peak-chat-index-item
				data-peak-focus-id={row.id}
				tabIndex={-1}
				onClick={() => onSelect(row)}
			>
				<span className="pkchat-idx-row__icon" data-kind={row.kind}>
					{iconForKind(row.kind)}
				</span>
				<span className="pkchat-idx-row__body">
					<span className="pkchat-idx-row__title">{row.title}</span>
					<span className="pkchat-idx-row__sub">
						<span className="pkchat-idx-row__kind">{kindLabel(row.kind, strings)}</span>
						{row.producer && (
							<>
								<span className="pkchat-idx-row__sub-sep" aria-hidden>·</span>
								<span className="pkchat-idx-row__meta-chip">{row.producer}</span>
							</>
						)}
					</span>
				</span>
				{row.createdAt ? (
					<span className="pkchat-idx-row__time">{formatTime(row.createdAt)}</span>
				) : null}
			</button>
			{row.target && (
				<button
					type="button"
					className="pkchat-idx-row__action"
					aria-label={strings.openLabel}
					title={strings.openLabel}
					tabIndex={-1}
					onClick={() => onOpen(row)}
				>
					<ExternalLink aria-hidden />
				</button>
			)}
		</div>
	);
}

export const ResourcesTab: React.FC<ResourcesTabProps> = ({
	rows,
	filteredRows,
	filter,
	strings,
	onSelect,
	onOpen,
}) => {
	const filtersActive =
		filter.direction !== 'all'
		|| filter.kind !== 'all'
		|| Boolean((filter.query ?? '').trim());

	if (filteredRows.length === 0) {
		const useFiltered = filtersActive || rows.length > 0;
		const title = useFiltered ? strings.emptyFiltered : strings.emptyEmpty;
		const sub = useFiltered ? strings.emptyFilteredSub : strings.emptyEmptySub;
		return (
			<div className="pkchat-idx__empty">
				<span className="pkchat-idx__empty-title">{title}</span>
				{sub && <span className="pkchat-idx__empty-sub">{sub}</span>}
			</div>
		);
	}

	const groupLabel: Record<ResourceRowDirection, string> = {
		input: strings.groupInput,
		generated: strings.groupGenerated,
	};

	return (
		<div className="pkchat-idx__list-inner">
			{DIRECTION_ORDER.map((dir) => {
				const items = filteredRows.filter((r) => r.direction === dir);
				if (!items.length) return null;
				return (
					<section className="pkchat-idx-resgroup" key={dir}>
						<div className="pkchat-idx-group-header">
							<span>{groupLabel[dir]}</span>
							<span className="pkchat-idx-group-header__count">{items.length}</span>
						</div>
						{items.map((row) => (
							<ResourceRowItem
								key={row.id}
								row={row}
								strings={strings}
								onSelect={onSelect}
								onOpen={onOpen}
							/>
						))}
					</section>
				);
			})}
		</div>
	);
};
