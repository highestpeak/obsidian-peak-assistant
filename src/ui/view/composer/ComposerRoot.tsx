import * as React from 'react';
import { useStore } from 'zustand';
import { FileText, RefreshCw } from 'lucide-react';
import {
	sectionBlockIds,
	type ComposerBlock,
	type ComposerStateSource,
	type DocumentComposerState,
} from '@/core/composer';
import { Button } from '@/ui/components/primitives';
import {
	DEFAULT_COMPOSER_CONFIG,
	type ComposerConfig,
} from '@/ui/view/composer/config/composerConfig';
import { createComposerFoldStore, type ComposerFoldStore } from './foldStore';
import { DisclosureRail } from './DisclosureRail';
import { BlockKindView } from './blocks/BlockKindView';

/**
 * Peak Composer — read-only document host (WP1 skeleton).
 *
 * Subscribes to the framework-neutral {@link ComposerStateSource} (the app
 * lifecycle controller) and renders the parsed snapshot block-by-block with a
 * fold rail. No editing, no action row, no drag — those are WP4. Fold is pure
 * view state held in a per-instance zustand store.
 */
export interface ComposerRootProps {
	source: ComposerStateSource;
	config?: ComposerConfig;
	/** Optional revalidate handler surfaced on the stale banner. */
	onRevalidate?: () => void;
}

export function ComposerRoot({
	source,
	config = DEFAULT_COMPOSER_CONFIG,
	onRevalidate,
}: ComposerRootProps): React.ReactElement {
	const subscribe = React.useCallback((cb: () => void) => source.subscribe(cb), [source]);
	const getSnapshot = React.useCallback(() => source.getState(), [source]);
	const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const [foldStore] = React.useState(createComposerFoldStore);

	return (
		<div className="peak-design-root peak-composer-root">
			<ComposerBody state={state} config={config} foldStore={foldStore} onRevalidate={onRevalidate} />
		</div>
	);
}

interface BodyProps {
	state: DocumentComposerState;
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
	onRevalidate?: () => void;
}

function ComposerBody({ state, config, foldStore, onRevalidate }: BodyProps): React.ReactElement {
	const { strings } = config;
	if (state.status === 'empty') return <StateBanner title={strings.emptyTitle} hint={strings.emptyHint} />;
	if (state.status === 'missing') return <StateBanner title={strings.missingTitle} hint={strings.missingHint} />;
	if (state.status === 'error') return <StateBanner title={strings.errorTitle} hint={state.error ?? ''} tone="error" />;
	if (!state.snapshot) return <StateBanner title={strings.loading} hint="" />;

	return (
		<>
			<ComposerHeader state={state} config={config} />
			{state.status === 'stale' && <StaleBanner strings={strings} onRevalidate={onRevalidate} />}
			<BlockList blocks={state.snapshot.blocks} config={config} foldStore={foldStore} />
		</>
	);
}

function ComposerHeader({ state, config }: { state: DocumentComposerState; config: ComposerConfig }): React.ReactElement {
	const name = (state.filePath ?? '').split('/').pop() ?? config.strings.displayText;
	const count = state.snapshot?.blocks.length ?? 0;
	return (
		<div className="pk-composer-header">
			<FileText size={15} className="pk-composer-header__icon" />
			<span className="pk-composer-header__title">{name}</span>
			<span className="pk-composer-header__meta">{`${count} ${config.strings.blocksSuffix}`}</span>
			<span className="pk-composer-header__badge">{config.strings.readOnlyBadge}</span>
		</div>
	);
}

function StaleBanner({
	strings,
	onRevalidate,
}: {
	strings: ComposerConfig['strings'];
	onRevalidate?: () => void;
}): React.ReactElement {
	return (
		<div className="pk-composer-stale" role="status">
			<span className="pk-composer-stale__title">{strings.staleTitle}</span>
			<span className="pk-composer-stale__hint">{strings.staleHint}</span>
			{onRevalidate && (
				<Button variant="secondary" size="sm" onClick={onRevalidate} className="pk-composer-stale__action">
					<RefreshCw size={13} />
					{strings.revalidate}
				</Button>
			)}
		</div>
	);
}

function BlockList({
	blocks,
	config,
	foldStore,
}: {
	blocks: readonly ComposerBlock[];
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
}): React.ReactElement {
	const folded = useStore(foldStore, (s) => s.folded);
	const hidden = React.useMemo(() => hiddenBySections(blocks, folded), [blocks, folded]);
	return (
		<div className="pk-composer-blocks">
			{blocks
				.filter((b) => !hidden.has(b.blockId))
				.map((b) => (
					<ComposerBlockRow key={b.blockId} block={b} config={config} foldStore={foldStore} />
				))}
		</div>
	);
}

function ComposerBlockRow({
	block,
	config,
	foldStore,
}: {
	block: ComposerBlock;
	config: ComposerConfig;
	foldStore: ComposerFoldStore;
}): React.ReactElement {
	const folded = useStore(foldStore, (s) => s.folded.has(block.blockId));
	const isHeading = block.kind === 'heading';
	const showSummary = !isHeading && folded;
	const label = foldLabel(config, isHeading, folded);
	return (
		<div className="pk-composer-block" data-kind={block.kind} data-block-id={block.blockId} data-folded={folded}>
			<DisclosureRail folded={folded} label={label} onToggle={() => foldStore.getState().toggle(block.blockId)} />
			<div className="pk-composer-block__body">
				<div className="pk-composer-block__head">
					<span className="pk-composer-kind">{config.kinds[block.kind]}</span>
					{block.kind === 'unknown' && (
						<span className="pk-composer-kind-note">{config.strings.unknownFallback}</span>
					)}
				</div>
				{showSummary ? (
					<div className="pk-composer-summary">{block.renderModel.text || config.strings.emptyPreview}</div>
				) : (
					<BlockKindView block={block} />
				)}
			</div>
		</div>
	);
}

function StateBanner({
	title,
	hint,
	tone,
}: {
	title: string;
	hint: string;
	tone?: 'error';
}): React.ReactElement {
	return (
		<div className="pk-composer-state" data-tone={tone}>
			<span className="pk-composer-state__title">{title}</span>
			{hint && <span className="pk-composer-state__hint">{hint}</span>}
		</div>
	);
}

function foldLabel(config: ComposerConfig, isHeading: boolean, folded: boolean): string {
	const s = config.strings;
	if (isHeading) return folded ? s.expandSection : s.collapseSection;
	return folded ? s.expandBlock : s.collapseBlock;
}

/** Block ids hidden because their owning heading section is folded. */
function hiddenBySections(blocks: readonly ComposerBlock[], folded: ReadonlySet<string>): Set<string> {
	const hidden = new Set<string>();
	for (const b of blocks) {
		if (b.kind !== 'heading' || !folded.has(b.blockId)) continue;
		for (const id of sectionBlockIds(blocks, b.blockId)) hidden.add(id);
	}
	return hidden;
}
