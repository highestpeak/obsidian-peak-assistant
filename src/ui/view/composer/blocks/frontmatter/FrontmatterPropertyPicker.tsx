import * as React from 'react';
import { Plus, Search, X } from 'lucide-react';
import type {
	ComposerMetadataFieldPatchPayload,
	ComposerMetadataValueKind,
} from '@/core/schemas/composer';
import {
	customFieldCandidate,
	fieldCandidateFromVault,
	findVaultProperty,
	selectVaultPropertyFields,
	type VaultPropertyInventory,
	type VaultPropertyStat,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import type { FrontmatterConfig } from './frontmatterConfig';

export function FrontmatterPropertyPicker({
	config,
	loadInventory,
	onSelect,
	onClose,
}: {
	config: FrontmatterConfig;
	loadInventory: () => Promise<VaultPropertyInventory>;
	onSelect(payload: ComposerMetadataFieldPatchPayload): void;
	onClose(): void;
}): React.ReactElement {
	const [inventory, setInventory] = React.useState<VaultPropertyInventory | null>(null);
	const [loadFailed, setLoadFailed] = React.useState(false);
	const [query, setQuery] = React.useState('');
	const [showAll, setShowAll] = React.useState(false);
	const [includeHidden, setIncludeHidden] = React.useState(false);
	const inputRef = React.useRef<HTMLInputElement | null>(null);
	const optionsRef = React.useRef<HTMLDivElement | null>(null);
	React.useEffect(() => {
		let live = true;
		void loadInventory()
			.then((nextInventory) => {
				if (live) setInventory(nextInventory);
			})
			.catch(() => {
				if (live) setLoadFailed(true);
			});
		return () => {
			live = false;
		};
	}, [loadInventory]);
	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const lib = config.library;
	const normalizedQuery = query.trim();
	const exactField = inventory ? findVaultProperty(inventory, normalizedQuery) : undefined;
	const canCreate = normalizedQuery.length > 0 && !exactField;
	const fields = React.useMemo(
		() => inventory
			? selectVaultPropertyFields(inventory, query, config.picker, { showAll, includeHidden })
			: [],
		[inventory, query, config.picker, showAll, includeHidden],
	);
	const browseCount = React.useMemo(
		() => inventory
			? selectVaultPropertyFields(inventory, '', config.picker, { showAll: true, includeHidden }).length
			: 0,
		[inventory, config.picker, includeHidden],
	);
	const selectStat = (stat: VaultPropertyStat) => onSelect(draftCandidateFromStat(stat));
	const createCustom = () => {
		if (!canCreate) return;
		onSelect(customFieldCandidate(normalizedQuery, ''));
	};
	const focusFirstOption = () => {
		optionsRef.current?.querySelector<HTMLButtonElement>('[data-picker-option]')?.focus();
	};
	const toggleBrowseAll = () => {
		setQuery('');
		setShowAll((current) => !current);
		requestAnimationFrame(() => inputRef.current?.focus());
	};

	return (
		<section
			className="pk-fm-library pk-fm-picker"
			role="dialog"
			aria-modal="false"
			aria-label={lib.title}
			data-chrome="true"
			onKeyDown={(event) => {
				if (event.key !== 'Escape') return;
				event.preventDefault();
				onClose();
			}}
		>
			<header>
				<span>
					<b>{lib.title}</b>
					<small>{lib.subtitle}</small>
				</span>
				<Button variant="ghost" size="sm" aria-label={lib.close} onClick={onClose}>
					<X size={13} />
				</Button>
			</header>
			<div className="pk-fm-picker__search">
				<Search size={14} aria-hidden="true" />
				<input
					ref={inputRef}
					value={query}
					placeholder={lib.searchPlaceholder}
					aria-label={lib.searchPlaceholder}
					aria-controls="pk-fm-picker-options"
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'ArrowDown') {
							event.preventDefault();
							focusFirstOption();
							return;
						}
						if (event.key !== 'Enter') return;
						event.preventDefault();
						if (canCreate) {
							createCustom();
							return;
						}
						if (fields[0]) selectStat(fields[0]);
					}}
				/>
			</div>
			<div className="pk-fm-picker__section-label">
				{normalizedQuery.length > 0
					? lib.searchResultsTitle
					: showAll
						? lib.allTitle
						: lib.recommendedTitle}
			</div>
			<div
				ref={optionsRef}
				id="pk-fm-picker-options"
				className="pk-fm-picker__options"
				role="listbox"
				onKeyDown={(event) => movePickerOptionFocus(event)}
			>
				{canCreate && (
					<Button
						variant="ghost"
						className="pk-fm-picker__option pk-fm-picker__option--create"
						role="option"
						aria-selected="false"
						data-picker-option="true"
						onClick={createCustom}
					>
						<Plus size={14} />
						<span>
							<strong>{lib.createProperty.replace('{key}', normalizedQuery)}</strong>
							<small>{lib.customCandidateHint}</small>
						</span>
					</Button>
				)}
				{exactField?.presentInCurrent && (
					<span className="pk-fm-picker__already-present">
						<strong>{exactField.key}</strong>
						<small>{lib.alreadyPresent}</small>
					</span>
				)}
				{!inventory && !loadFailed && <span className="pk-fm-picker__empty">{lib.loading}</span>}
				{loadFailed && <span className="pk-fm-picker__empty" role="alert">{lib.loadFailed}</span>}
				{inventory && fields.length === 0 && !canCreate && !exactField?.presentInCurrent && (
					<span className="pk-fm-picker__empty">{lib.noResults}</span>
				)}
				{fields.map((stat) => (
					<PickerFieldOption
						key={stat.key}
						stat={stat}
						config={config}
						onSelect={() => selectStat(stat)}
					/>
				))}
			</div>
			{inventory && (
				<footer>
					<Button variant="ghost" size="sm" onClick={toggleBrowseAll}>
						{showAll
							? lib.showRecommended
							: lib.browseAll.replace('{count}', String(browseCount))}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setIncludeHidden((current) => !current)}>
						{includeHidden ? lib.hideSystemFields : lib.showSystemFields}
					</Button>
				</footer>
			)}
		</section>
	);
}

function PickerFieldOption({
	stat,
	config,
	onSelect,
}: {
	stat: VaultPropertyStat;
	config: FrontmatterConfig;
	onSelect(): void;
}): React.ReactElement {
	const issues: string[] = [];
	if (stat.typeConflict) issues.push(config.library.typeConflict);
	if (stat.rare) issues.push(config.library.rare);
	const valueKind = preferredValueKind(stat);
	return (
		<Button
			variant="ghost"
			className="pk-fm-picker__option"
			role="option"
			aria-selected="false"
			data-picker-option="true"
			onClick={onSelect}
		>
			<span>
				<strong>{stat.key}</strong>
				<small>{valueKind}</small>
			</span>
			<span className="pk-fm-picker__option-meta">
				<small>{config.library.usedInNotes.replace('{count}', String(stat.count))}</small>
				{issues.length > 0 && <small data-warning="true">{issues.join(' · ')}</small>}
			</span>
		</Button>
	);
}

function draftCandidateFromStat(stat: VaultPropertyStat): ComposerMetadataFieldPatchPayload {
	const valueKind = preferredValueKind(stat);
	const value = valueKind === 'boolean' ? false : '';
	return {
		...fieldCandidateFromVault({ key: stat.key }, value),
		valueKind,
	};
}

function preferredValueKind(stat: VaultPropertyStat): ComposerMetadataValueKind {
	if (stat.kinds.length !== 1) return 'scalar';
	return stat.kinds[0];
}

function movePickerOptionFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
	if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
	const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-picker-option]')];
	if (options.length === 0) return;
	const active = event.currentTarget.ownerDocument.activeElement;
	const currentIndex = options.findIndex((option) => option === active);
	const delta = event.key === 'ArrowDown' ? 1 : -1;
	const nextIndex = currentIndex < 0
		? event.key === 'ArrowDown' ? 0 : options.length - 1
		: (currentIndex + delta + options.length) % options.length;
	event.preventDefault();
	options[nextIndex]?.focus();
}
