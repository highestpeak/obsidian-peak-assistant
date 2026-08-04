import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, FileText, Search, SlidersHorizontal } from 'lucide-react';
import type {
	CommandCenterCatalogEntry,
	CommandCenterRuntimePort,
	ResolvedCommandCenterItem,
} from '@/core/command-center';
import { Button } from '@/ui/components/primitives';
import { CommandCenterIcon } from './CommandCenterIcon';

function useHomeData(runtime: CommandCenterRuntimePort) {
	const [config, setConfig] = useState(() => runtime.getConfig());
	const [items, setItems] = useState<ResolvedCommandCenterItem[]>([]);
	useEffect(() => runtime.subscribe(() => setConfig(runtime.getConfig())), [runtime]);
	useEffect(() => {
		let cancelled = false;
		void Promise.all(config.groups.map((group) => runtime.resolveItems(group.id))).then((groups) => {
			if (!cancelled) setItems(groups.flat());
		});
		return () => { cancelled = true; };
	}, [runtime, config]);
	return { config, items };
}

export function CommandCenterHome({ runtime }: { runtime: CommandCenterRuntimePort }): React.ReactElement {
	const { config, items } = useHomeData(runtime);
	const pinnedIds = useMemo(() => new Set(config.home.quickAccessActionIds), [config.home.quickAccessActionIds]);
	const pinnedItems = items.filter((item) => item.pinnedToHome || pinnedIds.has(item.id));
	const quickAccess = pinnedItems.filter((item) => item.action.kind !== 'vault-target');
	const pinnedPages = pinnedItems.filter((item) => item.action.kind === 'vault-target');
	const recent = runtime.getRecentTargets();

	const openRecent = (path: string, label: string): void => {
		const entry: CommandCenterCatalogEntry = {
			key: `vault:${path}#`,
			action: { kind: 'vault-target', path },
			label,
			sourceLabel: path,
			icon: { kind: 'lucide', name: 'file-text' },
			layer: 'destination',
			available: true,
			hotkey: null,
		};
		void runtime.invokeCatalogEntry(entry);
	};

	return (
		<div className="pk-cc-home">
			<div className="pk-cc-home__masthead">
				<span className="pk-cc-home__eyebrow">Peak Command Center</span>
				<span className="pk-cc-home__title">Where do you want to go?</span>
				<label className="pk-cc-home-search">
					<Search size={18} aria-hidden="true" />
					<input
						value=""
						readOnly
						onClick={() => runtime.openLauncher()}
						onKeyDown={(event) => {
							if (event.key !== 'Enter') return;
							event.preventDefault();
							runtime.openLauncher();
						}}
						placeholder="Search your Command Center"
						aria-label="Open Command Center search"
					/>
					<kbd>↵</kbd>
				</label>
			</div>

			<div className="pk-cc-home__content">
				<section className="pk-cc-home-section" aria-labelledby="pk-cc-quick-title">
					<div className="pk-cc-home-section__head">
						<span id="pk-cc-quick-title">Quick access</span>
						<Button variant="ghost" size="sm" onClick={() => runtime.openCustomize()}><SlidersHorizontal size={14} /><span>Customize</span></Button>
					</div>
					<div className="pk-cc-home-quick">
						{quickAccess.map((item) => (
							<Button key={item.id} variant="ghost" size="sm" className="pk-cc-home-quick__item" disabled={!item.available} onClick={() => void runtime.invokeItem(item)}>
								<span className="pk-cc-home-quick__icon"><CommandCenterIcon icon={item.icon} size={19} /></span>
								<span>{item.shortLabel}</span>
								<ArrowRight size={14} />
							</Button>
						))}
						{quickAccess.length === 0 ? <span className="pk-cc-home-empty">Pin actions from Customize.</span> : null}
					</div>
				</section>

				<section className="pk-cc-home-section" aria-labelledby="pk-cc-continue-title">
					<div className="pk-cc-home-section__head"><span id="pk-cc-continue-title">Continue</span><Clock3 size={14} /></div>
					<div className="pk-cc-home-recents">
						{recent.map((target) => (
							<Button key={target.path} variant="ghost" size="sm" className="pk-cc-home-recent" onClick={() => openRecent(target.path, target.label)}>
								<FileText size={16} />
								<span className="pk-cc-home-recent__copy"><span>{target.label}</span><span>{target.parentPath || 'Vault'}</span></span>
								<ArrowRight size={14} />
							</Button>
						))}
						{recent.length === 0 ? <span className="pk-cc-home-empty">Recently opened Vault files will appear here.</span> : null}
					</div>
				</section>

				<section className="pk-cc-home-section" aria-labelledby="pk-cc-pages-title">
					<div className="pk-cc-home-section__head"><span id="pk-cc-pages-title">Pinned pages</span></div>
					<div className="pk-cc-home-pages">
						{pinnedPages.map((item) => (
							<Button key={item.id} variant="ghost" size="sm" className="pk-cc-home-page" onClick={() => void runtime.invokeItem(item)}>
								<CommandCenterIcon icon={item.icon} size={18} />
								<span><span>{item.shortLabel}</span><span>{item.sourceLabel}</span></span>
								<ArrowRight size={14} />
							</Button>
						))}
						{pinnedPages.length === 0 ? <span className="pk-cc-home-empty">Pin a Vault document from Customize to keep it here.</span> : null}
					</div>
				</section>
			</div>
		</div>
	);
}
