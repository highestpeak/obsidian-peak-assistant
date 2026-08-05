import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
	COMMAND_CENTER_CATALOG_DEFAULTS,
	type CommandCenterCatalogEntry,
} from '@/core/command-center';
import { Button } from '@/ui/components/primitives';

export const SHOW_ALL_COMMANDS_ID = 'catalog:show-all';

export function commandCenterCatalogFocusId(entry: CommandCenterCatalogEntry): string {
	return `catalog:${entry.key}`;
}

function GlobalCommandResult({ entry, active, onFocus, onInvoke }: {
	entry: CommandCenterCatalogEntry;
	active: boolean;
	onFocus: () => void;
	onInvoke: () => void;
}): React.ReactElement {
	return (
		<div className="pk-cc-global-results__item" role="listitem">
			<Button
				variant="ghost"
				size="sm"
				className="pk-cc-global-result"
				data-action-id={commandCenterCatalogFocusId(entry)}
				data-active={active ? 'true' : 'false'}
				disabled={!entry.available}
				title={[entry.label, entry.sourceLabel, entry.hotkey].filter(Boolean).join(' · ')}
				onMouseEnter={onFocus}
				onFocus={onFocus}
				onClick={onInvoke}
			>
				<span className="pk-cc-global-result__copy">
					<span className="pk-cc-global-result__label">{entry.label}</span>
					<span className="pk-cc-global-result__source">{entry.sourceLabel}</span>
				</span>
				{entry.hotkey ? <kbd>{entry.hotkey}</kbd> : null}
			</Button>
		</div>
	);
}

export function CommandCenterGlobalResults({ entries, total, expanded, activeId, onFocus, onInvoke, onToggle }: {
	entries: CommandCenterCatalogEntry[];
	total: number;
	expanded: boolean;
	activeId: string | null;
	onFocus: (id: string) => void;
	onInvoke: (entry: CommandCenterCatalogEntry) => void;
	onToggle: () => void;
}): React.ReactElement | null {
	if (entries.length === 0) return null;
	const canToggle = total > COMMAND_CENTER_CATALOG_DEFAULTS.launcherCommandPreviewLimit;
	return (
		<div className="pk-cc-global-results">
			<span className="pk-cc-global-results__head"><span>All commands</span><span>{total}</span></span>
			<div className="pk-cc-global-results__list" role="list" aria-label="All matching commands">
				{entries.map((entry) => (
					<GlobalCommandResult
						key={entry.key}
						entry={entry}
						active={activeId === commandCenterCatalogFocusId(entry)}
						onFocus={() => onFocus(commandCenterCatalogFocusId(entry))}
						onInvoke={() => onInvoke(entry)}
					/>
				))}
			</div>
			{canToggle ? (
				<Button
					variant="ghost"
					size="sm"
					className="pk-cc-global-results__toggle"
					data-action-id={SHOW_ALL_COMMANDS_ID}
					data-active={activeId === SHOW_ALL_COMMANDS_ID ? 'true' : 'false'}
					onMouseEnter={() => onFocus(SHOW_ALL_COMMANDS_ID)}
					onFocus={() => onFocus(SHOW_ALL_COMMANDS_ID)}
					onClick={onToggle}
				>
					<span>{expanded ? 'Show fewer commands' : <>Show all {total} commands</>}</span>
					{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
				</Button>
			) : null}
		</div>
	);
}
