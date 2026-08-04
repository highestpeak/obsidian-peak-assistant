import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileOutput, Filter, Search } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/ui/components/primitives';
import type { MyContentItem, MyContentPort } from '@/core/ports/MyContentPort';
import type { MyContentKind, MyContentSource } from '@/core/storage/generated-output';

interface MyContentProps {
	runtime: MyContentPort;
}

type QuickRange = 'all' | 'today' | 'week' | 'month';

const KIND_LABELS: Record<MyContentKind, string> = {
	profile: 'Profile',
	'ai-result': 'AI result',
	'chat-save': 'Saved chat',
	'ai-graph': 'AI Graph',
	hub: 'Hub',
	media: 'Media',
	'project-file': 'Project file',
};

const SOURCE_LABELS: Record<MyContentSource, string> = {
	'profile-settings': 'Profile settings',
	'ai-search': 'AI Search',
	chat: 'Chat',
	'ai-graph': 'AI Graph',
	hub: 'Hub',
	media: 'Media',
	project: 'Project',
};

function startForRange(range: QuickRange, now: Date): number | null {
	if (range === 'all') return null;
	if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	if (range === 'week') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
	return now.getTime() - 30 * 24 * 60 * 60 * 1000;
}

function formatDate(value: number): string {
	return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

export function MyContent({ runtime }: MyContentProps): React.ReactElement {
	const [items, setItems] = useState<readonly MyContentItem[]>([]);
	const [query, setQuery] = useState('');
	const [kind, setKind] = useState<MyContentKind | 'all'>('all');
	const [source, setSource] = useState<MyContentSource | 'all'>('all');
	const [range, setRange] = useState<QuickRange>('all');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			setItems(await runtime.list());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { void refresh(); }, []);

	const availableKinds = useMemo(() => [...new Set(items.map((item) => item.kind))], [items]);
	const availableSources = useMemo(() => [...new Set(items.map((item) => item.source))], [items]);
	const filtered = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase();
		const rangeStart = startForRange(range, new Date());
		const customFrom = from ? new Date(`${from}T00:00:00`).getTime() : null;
		const customTo = to ? new Date(`${to}T23:59:59`).getTime() : null;
		return items.filter((item) => {
			if (normalized && ![item.title, item.path, item.typeLabel].join(' ').toLocaleLowerCase().includes(normalized)) return false;
			if (kind !== 'all' && item.kind !== kind) return false;
			if (source !== 'all' && item.source !== source) return false;
			if (rangeStart !== null && item.updatedAt < rangeStart) return false;
			if (customFrom !== null && item.updatedAt < customFrom) return false;
			if (customTo !== null && item.updatedAt > customTo) return false;
			return true;
		});
	}, [from, items, kind, query, range, source, to]);

	const activeFilterCount = Number(kind !== 'all') + Number(source !== 'all') + Number(range !== 'all' || Boolean(from) || Boolean(to));
	return <div className="pktw-flex pktw-h-full pktw-min-h-0 pktw-flex-col pktw-bg-pk-background"><div className="pktw-flex pktw-items-center pktw-justify-between pktw-border-b pktw-border-pk-border pktw-px-5 pktw-py-3"><div className="pktw-flex pktw-flex-col pktw-gap-0.5"><span className="pktw-text-lg pktw-font-semibold">My Content</span><span className="pktw-text-xs pktw-text-pk-text-tertiary">The Peak files you explicitly saved or materialized. Ordinary Vault notes remain in Obsidian.</span></div><Button size="sm" variant="secondary" onClick={() => void refresh()}>Refresh</Button></div><div className="pktw-flex pktw-items-center pktw-gap-2 pktw-border-b pktw-border-pk-border pktw-px-5 pktw-py-3"><label className="pktw-flex pktw-max-w-md pktw-flex-1 pktw-items-center pktw-gap-2 pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2"><Search size={14} className="pktw-text-pk-text-tertiary" /><input aria-label="Search saved Peak content" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Peak content…" className="pktw-w-full pktw-border-0 pktw-bg-transparent pktw-py-1.5 pktw-text-sm pktw-outline-none" /></label><Popover><PopoverTrigger asChild><Button size="sm" variant="secondary"><Filter size={14} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</Button></PopoverTrigger><PopoverContent align="start" className="pktw-w-[360px] pktw-p-3"><div className="pktw-flex pktw-flex-col pktw-gap-3"><FilterSelect label="Output type" value={kind} values={availableKinds} labels={KIND_LABELS} onChange={setKind} /><FilterSelect label="Created by" value={source} values={availableSources} labels={SOURCE_LABELS} onChange={setSource} /><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">Created or saved</span><div className="pktw-flex pktw-flex-wrap pktw-gap-1">{(['all', 'today', 'week', 'month'] as QuickRange[]).map((value) => <Button key={value} size="sm" variant={range === value ? 'primary' : 'secondary'} onClick={() => setRange(value)}>{value === 'all' ? 'Any time' : value === 'today' ? 'Today' : value === 'week' ? 'Last 7 days' : 'Last 30 days'}</Button>)}</div></div><div className="pktw-grid pktw-grid-cols-2 pktw-gap-2"><label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-text-pk-text-tertiary">From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-1.5 pktw-text-xs" /></label><label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-text-pk-text-tertiary">To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-1.5 pktw-text-xs" /></label></div><Button size="sm" variant="ghost" onClick={() => { setKind('all'); setSource('all'); setRange('all'); setFrom(''); setTo(''); }}>Clear filters</Button></div></PopoverContent></Popover></div><div className="pktw-min-h-0 pktw-flex-1 pktw-overflow-y-auto pktw-p-5">{error ? <div className="pktw-mb-4 pktw-rounded-md pktw-border pktw-border-red-300 pktw-bg-red-50 pktw-p-3 pktw-text-sm pktw-text-red-700">{error}</div> : null}{loading ? <span className="pktw-text-sm pktw-text-pk-text-tertiary">Finding your saved Peak content…</span> : null}{!loading && filtered.length === 0 ? <EmptyState hasItems={items.length > 0} /> : null}<div className="pktw-grid pktw-grid-cols-[repeat(auto-fill,minmax(260px,1fr))] pktw-gap-3">{filtered.map((item) => <Button key={item.id} variant="secondary" className="pktw-flex pktw-h-auto pktw-flex-col pktw-items-start pktw-gap-2 pktw-p-4 pktw-text-left" onClick={() => void runtime.open(item.path)}><div className="pktw-flex pktw-w-full pktw-items-center pktw-justify-between pktw-gap-2"><FileOutput size={16} className="pktw-text-pk-accent" /><span className="pktw-rounded-full pktw-bg-pk-accent/10 pktw-px-2 pktw-py-0.5 pktw-text-[11px] pktw-font-medium pktw-text-pk-accent">{item.typeLabel}</span></div><span className="pktw-w-full pktw-truncate pktw-text-sm pktw-font-medium">{item.title}</span><span className="pktw-w-full pktw-truncate pktw-text-xs pktw-text-pk-text-tertiary">{item.path}</span><span className="pktw-flex pktw-items-center pktw-gap-1 pktw-text-xs pktw-text-pk-text-tertiary"><CalendarDays size={12} /> {SOURCE_LABELS[item.source]} · {formatDate(item.updatedAt)}</span></Button>)}</div></div></div>;
}

function FilterSelect<T extends string>({ label, value, values, labels, onChange }: { label: string; value: T | 'all'; values: readonly T[]; labels: Record<T, string>; onChange: (value: T | 'all') => void }): React.ReactElement {
	return <label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">{label}</span><select value={value} onChange={(event) => onChange(event.target.value as T | 'all')} className="pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-1.5 pktw-text-sm"><option value="all">All</option>{values.map((entry) => <option key={entry} value={entry}>{labels[entry]}</option>)}</select></label>;
}

function EmptyState({ hasItems }: { hasItems: boolean }): React.ReactElement {
	return <div className="pktw-flex pktw-min-h-[300px] pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-2 pktw-text-center"><FileOutput size={28} className="pktw-text-pk-text-tertiary" /><span className="pktw-text-base pktw-font-medium">{hasItems ? 'No saved Peak content matches these filters.' : 'No saved Peak content yet.'}</span><span className="pktw-max-w-md pktw-text-sm pktw-text-pk-text-tertiary">This page only includes files Peak can identify as an explicit saved result. It does not scan or relabel your ordinary Vault notes.</span></div>;
}
