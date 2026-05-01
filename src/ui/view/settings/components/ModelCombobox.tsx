import * as React from 'react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { modelRegistry } from '@/core/providers/model-registry';
import type { ProfileKind } from '@/core/profiles/types';
import type { ModelMetaData, ModelCapabilities } from '@/core/providers/types';
import { ChevronDown } from 'lucide-react';

export interface ModelComboboxProps {
	value: string;
	onChange: (modelId: string) => void;
	providerKind: ProfileKind;
	allowFreeText?: boolean;
	placeholder?: string;
	label?: string;
}

/** Map ProfileKind to catalog provider id(s). */
const PROVIDER_CATALOG_MAP: Record<string, string | null> = {
	anthropic: 'claude',
	openai: 'openai',
	google: 'gemini',
	perplexity: 'perplexity',
	ollama: 'ollama',
	openrouter: 'openrouter',
};

const GROUPED_KINDS = new Set<ProfileKind>(['openrouter', 'litellm', 'custom']);

interface ModelItem {
	id: string;
	capabilities?: ModelCapabilities;
	group?: string;
}

function buildModelList(providerKind: ProfileKind): ModelItem[] {
	const catalogId = PROVIDER_CATALOG_MAP[providerKind];

	if (providerKind === 'litellm' || providerKind === 'custom') {
		// Combine all providers
		const allIds = modelRegistry.getAllProviderIds();
		const items: ModelItem[] = [];
		for (const pid of allIds) {
			for (const m of modelRegistry.getModelsForProvider(pid)) {
				const group = m.id.includes('/') ? m.id.split('/')[0] : undefined;
				items.push({ id: m.id, capabilities: m.capabilities, group });
			}
		}
		return items;
	}

	if (catalogId) {
		const models = modelRegistry.getModelsForProvider(catalogId);
		const needsGrouping = GROUPED_KINDS.has(providerKind);
		return models.map((m) => ({
			id: m.id,
			capabilities: m.capabilities,
			group: needsGrouping && m.id.includes('/') ? m.id.split('/')[0] : undefined,
		}));
	}

	return [];
}

function formatCtx(maxCtx?: number): string | null {
	if (!maxCtx) return null;
	if (maxCtx >= 1_000_000) return `${Math.round(maxCtx / 1_000_000)}M`;
	if (maxCtx >= 1_000) return `${Math.round(maxCtx / 1_000)}K`;
	return `${maxCtx}`;
}

function CapTags({ caps }: { caps?: ModelCapabilities }) {
	if (!caps) return null;
	const tags: { label: string; cls: string }[] = [];
	if (caps.reasoning) tags.push({ label: 'reason', cls: 'pktw-bg-yellow-500/20 pktw-text-yellow-700 dark:pktw-text-yellow-400' });
	if (caps.vision) tags.push({ label: 'vision', cls: 'pktw-bg-blue-500/20 pktw-text-blue-700 dark:pktw-text-blue-400' });
	if (caps.webSearch) tags.push({ label: 'search', cls: 'pktw-bg-green-500/20 pktw-text-green-700 dark:pktw-text-green-400' });
	const ctx = formatCtx(caps.maxCtx);
	if (ctx) tags.push({ label: ctx, cls: 'pktw-bg-pk-border/40 pktw-text-pk-muted-foreground' });
	if (tags.length === 0) return null;
	return (
		<span className="pktw-flex pktw-gap-1 pktw-shrink-0">
			{tags.map((t) => (
				<span key={t.label} className={cn('pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-text-[10px] pktw-font-medium pktw-leading-none', t.cls)}>
					{t.label}
				</span>
			))}
		</span>
	);
}

function highlightMatch(text: string, query: string): React.ReactNode {
	if (!query) return text;
	const lower = text.toLowerCase();
	const idx = lower.indexOf(query.toLowerCase());
	if (idx < 0) return text;
	return (
		<>
			{text.slice(0, idx)}
			<span className="pktw-text-pk-accent pktw-font-semibold">{text.slice(idx, idx + query.length)}</span>
			{text.slice(idx + query.length)}
		</>
	);
}

export function ModelCombobox({ value, onChange, providerKind, allowFreeText, placeholder, label }: ModelComboboxProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [highlightIdx, setHighlightIdx] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const allModels = useMemo(() => buildModelList(providerKind), [providerKind]);

	const filtered = useMemo(() => {
		if (!query) return allModels;
		const q = query.toLowerCase();
		return allModels.filter((m) => m.id.toLowerCase().includes(q));
	}, [allModels, query]);

	// Group models for display
	const groups = useMemo(() => {
		const hasGroups = filtered.some((m) => m.group);
		if (!hasGroups) return [{ label: null, items: filtered }];
		const map = new Map<string | null, ModelItem[]>();
		for (const m of filtered) {
			const key = m.group ?? null;
			const arr = map.get(key);
			if (arr) arr.push(m);
			else map.set(key, [m]);
		}
		return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
	}, [filtered]);

	// Flat list for keyboard navigation
	const flatFiltered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
				setQuery('');
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [open]);

	// Scroll highlighted item into view
	useEffect(() => {
		if (!open || !listRef.current) return;
		const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
		if (el) el.scrollIntoView({ block: 'nearest' });
	}, [highlightIdx, open]);

	const handleOpen = () => {
		setOpen(true);
		setQuery('');
		setHighlightIdx(0);
		requestAnimationFrame(() => inputRef.current?.focus());
	};

	const select = (modelId: string) => {
		onChange(modelId);
		setOpen(false);
		setQuery('');
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setHighlightIdx((i) => Math.min(i + 1, flatFiltered.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setHighlightIdx((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (flatFiltered[highlightIdx]) {
				select(flatFiltered[highlightIdx].id);
			} else if (allowFreeText && query.trim()) {
				select(query.trim());
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			setOpen(false);
			setQuery('');
		}
	};

	// Reset highlight when filter changes
	useEffect(() => { setHighlightIdx(0); }, [query]);

	// Find capabilities for current value
	const currentModel = allModels.find((m) => m.id === value);

	let flatIdx = 0;

	return (
		<div ref={containerRef} className="pktw-relative">
			{label && (
				<span className="pktw-block pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1.5">{label}</span>
			)}
			{/* Closed / trigger state */}
			{!open && (
				<button
					type="button"
					onClick={handleOpen}
					className={cn(
						'pktw-flex pktw-items-center pktw-w-full pktw-gap-2 pktw-px-3 pktw-py-2',
						'pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-background',
						'pktw-text-sm pktw-text-left pktw-cursor-pointer',
						'hover:pktw-border-pk-accent/50 pktw-transition-colors',
					)}
				>
					<span className={cn('pktw-flex-1 pktw-truncate pktw-font-mono pktw-text-xs', !value && 'pktw-text-pk-muted-foreground')}>
						{value || placeholder || 'Select model...'}
					</span>
					<CapTags caps={currentModel?.capabilities} />
					<ChevronDown className="pktw-w-4 pktw-h-4 pktw-text-pk-muted-foreground pktw-shrink-0" />
				</button>
			)}
			{/* Open / editing state */}
			{open && (
				<>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={value || placeholder || 'Type to filter...'}
						className={cn(
							'pktw-w-full pktw-px-3 pktw-py-2 pktw-rounded-md',
							'pktw-border pktw-border-pk-accent pktw-bg-pk-background',
							'pktw-text-sm pktw-font-mono pktw-text-xs',
							'pktw-outline-none',
						)}
					/>
					<div
						ref={listRef}
						className={cn(
							'pktw-absolute pktw-z-50 pktw-left-0 pktw-right-0 pktw-mt-1',
							'pktw-max-h-[280px] pktw-overflow-y-auto',
							'pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-popover',
							'pktw-shadow-lg',
						)}
					>
						{groups.map((group) => (
							<div key={group.label ?? '__flat'}>
								{group.label && (
									<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-sticky pktw-top-0 pktw-bg-popover">
										<span className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-pk-accent" />
										<span className="pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-pk-muted-foreground">
											{group.label}
										</span>
									</div>
								)}
								{group.items.map((item) => {
									const idx = flatIdx++;
									return (
										<button
											key={item.id}
											type="button"
											data-idx={idx}
											onClick={() => select(item.id)}
											onMouseEnter={() => setHighlightIdx(idx)}
											className={cn(
												'pktw-flex pktw-items-center pktw-w-full pktw-gap-2 pktw-px-3 pktw-py-1.5',
												'pktw-text-left pktw-text-sm pktw-cursor-pointer pktw-transition-colors',
												idx === highlightIdx && 'pktw-bg-pk-accent/10',
												item.id === value && 'pktw-font-semibold',
											)}
										>
											<span className="pktw-flex-1 pktw-truncate pktw-font-mono pktw-text-xs">
												{highlightMatch(item.id, query)}
											</span>
											<CapTags caps={item.capabilities} />
										</button>
									);
								})}
							</div>
						))}
						{flatFiltered.length === 0 && (
							<div className="pktw-px-3 pktw-py-3 pktw-text-xs pktw-text-pk-muted-foreground pktw-text-center">
								{allowFreeText && query.trim()
									? (<>No matches &mdash; press <kbd className="pktw-px-1 pktw-py-0.5 pktw-rounded pktw-bg-pk-border/40 pktw-text-[10px]">Enter</kbd> to use <span className="pktw-font-mono pktw-text-pk-accent">{query.trim()}</span></>)
									: 'No models found'
								}
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}
