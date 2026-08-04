import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { CommandCenterItemIcon } from '@/core/command-center';
import { Button, IconButton, Segmented } from '@/ui/components/primitives';
import {
	COMMAND_CENTER_EMOJI,
	CommandCenterIcon,
	getCommandCenterLucideNames,
} from './CommandCenterIcon';

const ICON_PAGE_SIZE = 120;

function normalizedEmoji(value: string): string {
	return Array.from(value.trim()).slice(0, 8).join('');
}

export interface IconBrowserProps {
	value?: CommandCenterItemIcon;
	onChange: (icon: CommandCenterItemIcon | undefined) => void;
	onClose: () => void;
}

export function IconBrowser({ value, onChange, onClose }: IconBrowserProps): React.ReactElement {
	const [source, setSource] = useState<'lucide' | 'emoji'>(value?.kind === 'emoji' ? 'emoji' : 'lucide');
	const [query, setQuery] = useState('');
	const [visibleCount, setVisibleCount] = useState(ICON_PAGE_SIZE);
	const [emojiDraft, setEmojiDraft] = useState(value?.kind === 'emoji' ? value.value : '');
	const allLucideNames = useMemo(() => getCommandCenterLucideNames(), []);
	const filteredLucideNames = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase().replace(/\s+/g, '-');
		if (!needle) return allLucideNames;
		return allLucideNames.filter((name) => name.toLocaleLowerCase().includes(needle));
	}, [allLucideNames, query]);
	const lucideNames = filteredLucideNames.slice(0, visibleCount);
	useEffect(() => setVisibleCount(ICON_PAGE_SIZE), [query, source]);
	useEffect(() => {
		if (value?.kind === 'emoji') setEmojiDraft(value.value);
	}, [value]);
	const customEmoji = normalizedEmoji(emojiDraft);

	return (
		<div className="pk-cc-icon-browser" role="dialog" aria-label="Choose icon">
			<div className="pk-cc-icon-browser__head">
				<Segmented
					value={source}
					onValueChange={(next) => setSource(next === 'emoji' ? 'emoji' : 'lucide')}
					options={[{ value: 'lucide', label: 'Lucide' }, { value: 'emoji', label: 'Emoji' }]}
					size="sm"
					aria-label="Icon source"
				/>
				<span className="pk-cc-icon-browser__count">{source === 'lucide' ? `${filteredLucideNames.length} icons` : 'Any emoji'}</span>
				<IconButton className="pk-cc-icon-button" label="Close icon browser" onClick={onClose}>
					<X size={15} />
				</IconButton>
			</div>
			{source === 'lucide' ? (
				<label className="pk-cc-icon-search">
					<Search size={14} aria-hidden="true" />
					<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Lucide icons" autoFocus />
				</label>
			) : (
				<div className="pk-cc-emoji-entry">
					<input value={emojiDraft} onChange={(event) => setEmojiDraft(event.target.value)} placeholder="Type or paste any emoji" autoFocus />
					<Button variant="secondary" size="sm" disabled={!customEmoji} onClick={() => onChange({ kind: 'emoji', value: customEmoji })}>Use</Button>
				</div>
			)}
			<div
				className="pk-cc-icon-options"
				onScroll={(event) => {
					if (source !== 'lucide') return;
					const target = event.currentTarget;
					if (target.scrollTop + target.clientHeight < target.scrollHeight - 32) return;
					setVisibleCount((current) => Math.min(filteredLucideNames.length, current + ICON_PAGE_SIZE));
				}}
			>
				<Button
					variant="ghost"
					size="sm"
					className="pk-cc-icon-option pk-cc-icon-option--none"
					aria-label="No icon"
					aria-pressed={!value}
					onClick={() => onChange(undefined)}
				>
					<span>None</span>
				</Button>
				{source === 'lucide' ? lucideNames.map((name) => (
					<IconButton
						key={name}
						className="pk-cc-icon-option"
						label={name}
						aria-pressed={value?.kind === 'lucide' && value.name === name}
						title={name}
						onClick={() => onChange({ kind: 'lucide', name })}
					>
						<CommandCenterIcon icon={{ kind: 'lucide', name }} size={17} />
					</IconButton>
				)) : COMMAND_CENTER_EMOJI.map((emoji) => (
					<IconButton
						key={emoji}
						className="pk-cc-icon-option"
						label={`Use ${emoji}`}
						aria-pressed={value?.kind === 'emoji' && value.value === emoji}
						onClick={() => onChange({ kind: 'emoji', value: emoji })}
					>
						<span className="pk-cc-emoji">{emoji}</span>
					</IconButton>
				))}
			</div>
			{source === 'lucide' && lucideNames.length < filteredLucideNames.length ? <span className="pk-cc-icon-browser__more">Scroll for more · search reaches the full registered library</span> : null}
			{source === 'emoji' ? <span className="pk-cc-icon-browser__more">Common choices below; the field accepts any Unicode emoji.</span> : null}
		</div>
	);
}
