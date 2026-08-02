import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { CommandCenterItemIcon } from '@/core/command-center';
import { Button } from '@/ui/component/shared-ui/button';
import {
	COMMAND_CENTER_EMOJI,
	COMMAND_CENTER_LUCIDE_ICONS,
	CommandCenterIcon,
} from './CommandCenterIcon';

export interface IconBrowserProps {
	value?: CommandCenterItemIcon;
	onChange: (icon: CommandCenterItemIcon | undefined) => void;
	onClose: () => void;
}

export function IconBrowser({ value, onChange, onClose }: IconBrowserProps): React.ReactElement {
	const [source, setSource] = useState<'lucide' | 'emoji'>(value?.kind === 'emoji' ? 'emoji' : 'lucide');
	const [query, setQuery] = useState('');
	const lucideNames = useMemo(() => Object.keys(COMMAND_CENTER_LUCIDE_ICONS)
		.filter((name) => name.includes(query.trim().toLocaleLowerCase())), [query]);

	return (
		<div className="pk-cc-icon-browser" role="dialog" aria-label="Choose icon">
			<div className="pk-cc-icon-browser__head">
				<div className="pk-cc-segmented" role="tablist" aria-label="Icon source">
					<Button variant="unstyled" size="xs" role="tab" aria-selected={source === 'lucide'} onClick={() => setSource('lucide')}>Lucide</Button>
					<Button variant="unstyled" size="xs" role="tab" aria-selected={source === 'emoji'} onClick={() => setSource('emoji')}>Emoji</Button>
				</div>
				<Button variant="unstyled" size="xs" className="pk-cc-icon-button" aria-label="Close icon browser" onClick={onClose}>
					<X size={15} />
				</Button>
			</div>
			{source === 'lucide' ? (
				<label className="pk-cc-icon-search">
					<Search size={14} aria-hidden="true" />
					<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Lucide icons" autoFocus />
				</label>
			) : null}
			<div className="pk-cc-icon-options">
				<Button
					variant="unstyled"
					size="xs"
					className="pk-cc-icon-option pk-cc-icon-option--none"
					aria-label="No icon"
					aria-pressed={!value}
					onClick={() => onChange(undefined)}
				>
					<span>None</span>
				</Button>
				{source === 'lucide' ? lucideNames.map((name) => (
					<Button
						key={name}
						variant="unstyled"
						size="xs"
						className="pk-cc-icon-option"
						aria-label={name}
						aria-pressed={value?.kind === 'lucide' && value.name === name}
						title={name}
						onClick={() => onChange({ kind: 'lucide', name })}
					>
						<CommandCenterIcon icon={{ kind: 'lucide', name }} size={17} />
					</Button>
				)) : COMMAND_CENTER_EMOJI.map((emoji) => (
					<Button
						key={emoji}
						variant="unstyled"
						size="xs"
						className="pk-cc-icon-option"
						aria-label={`Use ${emoji}`}
						aria-pressed={value?.kind === 'emoji' && value.value === emoji}
						onClick={() => onChange({ kind: 'emoji', value: emoji })}
					>
						<span className="pk-cc-emoji">{emoji}</span>
					</Button>
				))}
			</div>
		</div>
	);
}
