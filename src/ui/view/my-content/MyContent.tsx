import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileOutput, Filter, FolderOpen, Search } from 'lucide-react';
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
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			const next = await runtime.list();
			setItems(next);
			setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
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

	useEffect(() => {
		if (selectedId && filtered.some((item) => item.id === selectedId)) return;
		setSelectedId(filtered[0]?.id ?? null);
	}, [filtered, selectedId]);

	const activeFilterCount = Number(kind !== 'all') + Number(source !== 'all') + Number(range !== 'all' || Boolean(from) || Boolean(to));
	const selected = filtered.find((item) => item.id === selectedId) ?? null;
	return <div className="pktw-flex pktw-h-full pktw-min-h-0 pktw-flex-col pktw-bg-pk-background"><div className="pktw-flex pktw-items-center pktw-justify-between pktw-border-b pktw-border-pk-border pktw-px-5 pktw-py-3"><div className="pktw-flex pktw-flex-col pktw-gap-0.5"><span className="pktw-text-lg pktw-font-semibold">My Content</span><span className="pktw-text-xs pktw-text-pk-text-tertiary">Things you explicitly saved or materialized with Peak. Ordinary Vault files remain managed in Obsidian.</span></div><Button size="sm" variant="secondary" onClick={() => void refresh()}>Refresh</Button></div><div className="pktw-grid pktw-min-h-0 pktw-flex-1 pktw-grid-cols-[390px_minmax(0,1fr)]"><div className="pktw-flex pktw-min-h-0 pktw-flex-col pktw-border-r pktw-border-pk-border"><div className="pktw-flex pktw-items-center pktw-gap-2 pktw-border-b pktw-border-pk-border pktw-p-3"><label className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-items-center pktw-gap-2 pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2"><Search size={14} className="pktw-text-pk-text-tertiary" /><input aria-label="Search saved Peak content" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Peak content…" className="pktw-w-full pktw-border-0 pktw-bg-transparent pktw-py-1.5 pktw-text-sm pktw-outline-none" /></label><FilterMenu activeCount={activeFilterCount} kind={kind} source={source} range={range} from={from} to={to} availableKinds={availableKinds} availableSources={availableSources} onKind={setKind} onSource={setSource} onRange={setRange} onFrom={setFrom} onTo={setTo} onClear={() => { setKind('all'); setSource('all'); setRange('all'); setFrom(''); setTo(''); }} /></div><div className="pktw-min-h-0 pktw-flex-1 pktw-overflow-y-auto pktw-p-2">{error ? <div className="pktw-m-2 pktw-rounded-md pktw-border pktw-border-red-300 pktw-bg-red-50 pktw-p-3 pktw-text-sm pktw-text-red-700">{error}</div> : null}{loading ? <span className="pktw-block pktw-p-3 pktw-text-sm pktw-text-pk-text-tertiary">Finding your saved Peak content…</span> : null}{!loading && filtered.length === 0 ? <ListEmpty hasItems={items.length > 0} /> : null}{filtered.map((item) => <ContentRow key={item.id} item={item} active={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}</div></div><div className="pktw-min-h-0 pktw-overflow-y-auto pktw-p-6">{selected ? <ContentInspector item={selected} onOpen={() => void runtime.open(selected.path)} /> : !loading ? <InspectorEmpty /> : null}</div></div></div>;
}

function FilterMenu({ activeCount, kind, source, range, from, to, availableKinds, availableSources, onKind, onSource, onRange, onFrom, onTo, onClear }: { activeCount: number; kind: MyContentKind | 'all'; source: MyContentSource | 'all'; range: QuickRange; from: string; to: string; availableKinds: readonly MyContentKind[]; availableSources: readonly MyContentSource[]; onKind: (value: MyContentKind | 'all') => void; onSource: (value: MyContentSource | 'all') => void; onRange: (value: QuickRange) => void; onFrom: (value: string) => void; onTo: (value: string) => void; onClear: () => void }): React.ReactElement {
	return <Popover><PopoverTrigger asChild><Button size="sm" variant="secondary" aria-label="Filter saved Peak content"><Filter size={14} />{activeCount ? ` ${activeCount}` : ''}</Button></PopoverTrigger><PopoverContent align="end" className="pktw-w-[360px] pktw-p-3"><div className="pktw-flex pktw-flex-col pktw-gap-3"><FilterSelect label="Output type" value={kind} values={availableKinds} labels={KIND_LABELS} onChange={onKind} /><FilterSelect label="Created by" value={source} values={availableSources} labels={SOURCE_LABELS} onChange={onSource} /><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">Created or saved</span><div className="pktw-flex pktw-flex-wrap pktw-gap-1">{(['all', 'today', 'week', 'month'] as QuickRange[]).map((value) => <Button key={value} size="sm" variant={range === value ? 'primary' : 'secondary'} onClick={() => onRange(value)}>{value === 'all' ? 'Any time' : value === 'today' ? 'Today' : value === 'week' ? 'Last 7 days' : 'Last 30 days'}</Button>)}</div></div><div className="pktw-grid pktw-grid-cols-2 pktw-gap-2"><label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-text-pk-text-tertiary">From</span><input type="date" value={from} onChange={(event) => onFrom(event.target.value)} className="pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-1.5 pktw-text-xs" /></label><label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-text-pk-text-tertiary">To</span><input type="date" value={to} onChange={(event) => onTo(event.target.value)} className="pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-1.5 pktw-text-xs" /></label></div><Button size="sm" variant="ghost" onClick={onClear}>Clear filters</Button></div></PopoverContent></Popover>;
}

function ContentRow({ item, active, onSelect }: { item: MyContentItem; active: boolean; onSelect: () => void }): React.ReactElement {
	return <Button variant="ghost" className={`pktw-mb-1 pktw-flex pktw-h-auto pktw-w-full pktw-items-start pktw-gap-2 pktw-p-3 pktw-text-left ${active ? 'pktw-bg-pk-accent/10' : ''}`} onClick={onSelect}><FileOutput size={16} className="pktw-mt-0.5 pktw-text-pk-accent" /><span className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col pktw-gap-0.5"><span className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2"><span className="pktw-truncate pktw-text-sm pktw-font-medium">{item.title}</span><span className="pktw-shrink-0 pktw-rounded-full pktw-bg-pk-accent/10 pktw-px-2 pktw-py-0.5 pktw-text-[11px] pktw-font-medium pktw-text-pk-accent">{item.typeLabel}</span></span><span className="pktw-text-xs pktw-text-pk-text-tertiary">{SOURCE_LABELS[item.source]} · {formatDate(item.updatedAt)}</span></span></Button>;
}

function ContentInspector({ item, onOpen }: { item: MyContentItem; onOpen: () => void }): React.ReactElement {
	return <div className="pktw-flex pktw-max-w-3xl pktw-flex-col pktw-gap-6"><div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3"><div className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary">{item.typeLabel}</span><span className="pktw-text-2xl pktw-font-semibold">{item.title}</span><span className="pktw-text-sm pktw-text-pk-text-secondary">Saved by {SOURCE_LABELS[item.source]}.</span></div><Button size="sm" variant="primary" onClick={onOpen}><FolderOpen size={14} /> Open in Obsidian</Button></div><div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-surface"><DetailRow label="Created or saved" value={formatDate(item.createdAt)} /><DetailRow label="Last updated" value={formatDate(item.updatedAt)} /><DetailRow label="Saved location" value={item.path} mono /></div></div>;
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
	return <div className="pktw-grid pktw-grid-cols-[180px_minmax(0,1fr)] pktw-border-b pktw-border-pk-border last:pktw-border-b-0"><span className="pktw-bg-pk-surface-muted pktw-px-4 pktw-py-3 pktw-text-xs pktw-text-pk-text-tertiary">{label}</span><span className={`pktw-break-words pktw-px-4 pktw-py-3 pktw-text-sm ${mono ? 'pktw-font-mono pktw-text-xs' : ''}`}>{value}</span></div>;
}

function FilterSelect<T extends string>({ label, value, values, labels, onChange }: { label: string; value: T | 'all'; values: readonly T[]; labels: Record<T, string>; onChange: (value: T | 'all') => void }): React.ReactElement {
	return <label className="pktw-flex pktw-flex-col pktw-gap-1"><span className="pktw-text-xs pktw-font-medium">{label}</span><select value={value} onChange={(event) => onChange(event.target.value as T | 'all')} className="pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-2 pktw-py-1.5 pktw-text-sm"><option value="all">All</option>{values.map((entry) => <option key={entry} value={entry}>{labels[entry]}</option>)}</select></label>;
}

function ListEmpty({ hasItems }: { hasItems: boolean }): React.ReactElement {
	return <div className="pktw-flex pktw-min-h-[220px] pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-2 pktw-p-4 pktw-text-center"><FileOutput size={26} className="pktw-text-pk-text-tertiary" /><span className="pktw-text-sm pktw-font-medium">{hasItems ? 'No saved content matches these filters.' : 'No saved Peak content yet.'}</span><span className="pktw-text-xs pktw-text-pk-text-tertiary">This page only lists items Peak can verify were explicitly saved or materialized.</span></div>;
}

function InspectorEmpty(): React.ReactElement {
	return <div className="pktw-flex pktw-h-full pktw-min-h-[280px] pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-2 pktw-text-center"><FileOutput size={28} className="pktw-text-pk-text-tertiary" /><span className="pktw-text-base pktw-font-medium">Select saved content</span><span className="pktw-max-w-sm pktw-text-sm pktw-text-pk-text-tertiary">Its location and explicit open action will appear here.</span></div>;
}
