import React from 'react';
import type { CommandCenterCatalogEntry, CommandCenterRuntimePort } from '@/core/command-center';
import { Button } from '@/ui/components/primitives';
import { CommandCenterCatalogPinControl } from './CommandCenterCatalogPinControl';
import { commandCenterCatalogFocusId } from './CommandCenterGlobalResults';
import { CommandCenterIcon } from './CommandCenterIcon';

export function CommandCenterViewResults({
	runtime,
	entries,
	activeId,
	onFocus,
	onInvoke,
}: {
	runtime: CommandCenterRuntimePort;
	entries: CommandCenterCatalogEntry[];
	activeId: string | null;
	onFocus: (id: string) => void;
	onInvoke: (entry: CommandCenterCatalogEntry) => void;
}): React.ReactElement | null {
	if (entries.length === 0) return null;
	return (
		<div className="pk-cc-global-results pk-cc-view-results">
			<span className="pk-cc-global-results__head"><span>Peak views</span><span>{entries.length}</span></span>
			<div className="pk-cc-global-results__list" role="list" aria-label="Matching Peak views">
				{entries.map((entry) => {
					const focusId = commandCenterCatalogFocusId(entry);
					return (
						<div key={entry.key} className="pk-cc-global-results__item pk-cc-view-result" role="listitem">
							<Button
								variant="ghost"
								size="sm"
								className="pk-cc-global-result"
								data-action-id={focusId}
								data-active={activeId === focusId ? 'true' : 'false'}
								disabled={!entry.available}
								title={[entry.label, entry.sourceLabel].filter(Boolean).join(' · ')}
								onMouseEnter={() => onFocus(focusId)}
								onFocus={() => onFocus(focusId)}
								onClick={() => onInvoke(entry)}
							>
								<span className="pk-cc-view-result__icon"><CommandCenterIcon icon={entry.icon} size={16} /></span>
								<span className="pk-cc-global-result__copy">
									<span className="pk-cc-global-result__label">{entry.label}</span>
									<span className="pk-cc-global-result__source">{entry.sourceLabel}</span>
								</span>
							</Button>
							<CommandCenterCatalogPinControl runtime={runtime} entry={entry} />
						</div>
					);
				})}
			</div>
		</div>
	);
}
