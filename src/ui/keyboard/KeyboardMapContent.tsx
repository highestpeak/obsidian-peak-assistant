import React, { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import {
	KEYBOARD_MAP_STRINGS,
	PEAK_KEYBOARD_SURFACE_LABELS,
} from './config/KeyboardNavigationDefaults';
import type {
	PeakKeyboardMapContext,
	PeakKeyboardMapEntry,
} from './KeyboardNavigationPort';

interface KeyboardMapContentProps {
	context: PeakKeyboardMapContext;
	contextEntries: PeakKeyboardMapEntry[];
	allEntries: PeakKeyboardMapEntry[];
	onClose: () => void;
	onOpenHotkeys: (commandId: string) => void;
}

export const KeyboardMapContent: React.FC<KeyboardMapContentProps> = ({
	context,
	contextEntries,
	allEntries,
	onClose,
	onOpenHotkeys,
}) => {
	const [query, setQuery] = useState('');
	const [showAll, setShowAll] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const source = showAll ? allEntries : contextEntries;
	const normalized = query.trim().toLocaleLowerCase();
	const entries = useMemo(() => source.filter((entry) => {
		if (!normalized) return true;
		return [
			entry.label,
			entry.binding,
			entry.context,
			entry.category,
			entry.conflict ?? '',
		].some((value) => value.toLocaleLowerCase().includes(normalized));
	}), [normalized, source]);
	const surfaceLabel = context.surfaceId
		? PEAK_KEYBOARD_SURFACE_LABELS[context.surfaceId]
		: KEYBOARD_MAP_STRINGS.defaultSurface;

	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div
			className="pk-keyboard-map"
			role="dialog"
			aria-modal="true"
			aria-label={KEYBOARD_MAP_STRINGS.title}
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return;
				event.preventDefault();
				event.stopPropagation();
				onClose();
			}}
		>
			<div className="pk-keyboard-map__header">
				<div>
					<span className="pk-keyboard-map__title">{KEYBOARD_MAP_STRINGS.title}</span>
					<span className="pk-keyboard-map__context">
						{surfaceLabel}{context.zoneId ? ` · ${context.zoneId}` : ''}
					</span>
				</div>
				<Button variant="ghost" size="sm" geometry="toolbar" onClick={onClose}>
					{KEYBOARD_MAP_STRINGS.close}
				</Button>
			</div>
			<label className="pk-keyboard-map__search">
				<Search aria-hidden="true" />
				<input
					ref={inputRef}
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={KEYBOARD_MAP_STRINGS.searchPlaceholder}
					aria-label={KEYBOARD_MAP_STRINGS.searchPlaceholder}
				/>
			</label>
			<div className="pk-keyboard-map__scope" role="group" aria-label="Keyboard map scope">
				<Button
					variant={!showAll ? 'secondary' : 'ghost'}
					size="sm"
					geometry="toolbar"
					aria-pressed={!showAll}
					onClick={() => setShowAll(false)}
				>
					{KEYBOARD_MAP_STRINGS.currentContext}
				</Button>
				<Button
					variant={showAll ? 'secondary' : 'ghost'}
					size="sm"
					geometry="toolbar"
					aria-pressed={showAll}
					onClick={() => setShowAll(true)}
				>
					{KEYBOARD_MAP_STRINGS.showAll}
				</Button>
			</div>
			<div className="pk-keyboard-map__list" role="list">
				{entries.map((entry) => (
					<div className="pk-keyboard-map__row" role="listitem" key={entry.id}>
						<div className="pk-keyboard-map__description">
							<span className="pk-keyboard-map__label">{entry.label}</span>
							<span className="pk-keyboard-map__meta">
								{entry.category} · {entry.context}
								{entry.conflict
									? ` · ${KEYBOARD_MAP_STRINGS.conflictPrefix}: ${entry.conflict}`
									: ''}
							</span>
						</div>
						<kbd>{entry.binding || KEYBOARD_MAP_STRINGS.unbound}</kbd>
						{entry.commandId && (
							<Button
								variant="ghost"
								size="sm"
								geometry="toolbar"
								onClick={() => onOpenHotkeys(entry.commandId!)}
							>
								{KEYBOARD_MAP_STRINGS.openHotkeys}
							</Button>
						)}
					</div>
				))}
				{entries.length === 0 && (
					<div className="pk-keyboard-map__empty">{KEYBOARD_MAP_STRINGS.noMatches}</div>
				)}
			</div>
		</div>
	);
};
