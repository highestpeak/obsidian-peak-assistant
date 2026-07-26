import * as React from 'react';
import { Library, Sparkles, X } from 'lucide-react';
import type { ComposerBlock, ComposerContextSnapshot } from '@/core/composer';
import type {
	ComposerMetadataFieldPatchPayload,
	ComposerMetadataOrigin,
} from '@/core/schemas/composer';
import {
	parseFrontmatterModel,
	customFieldCandidate,
	fieldCandidateFromVault,
	computeVaultPropertyInventory,
	buildMetadataFieldPatchOperations,
	SUGGEST_PROPERTIES_CAPABILITY_ID,
	type FrontmatterField,
	type FrontmatterModelConfig,
	type VaultPropertyInventory,
	type VaultPropertyStat,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { DEFAULT_FRONTMATTER_CONFIG, type FrontmatterConfig } from './frontmatterConfig';

/**
 * Peak Composer — frontmatter property grid (WP5, §8).
 *
 * Replaces the raw YAML mono box with a typed property grid (scalar / list /
 * boolean / date / link / unknown) tagged by provenance (程序 / 人工 / AI 建议 /
 * 规范建议). The block's hover action row is the ONLY entrance to the Vault
 * property library (§8.2) and the AI property suggestions (§8.3); both create
 * per-document candidates only, and nothing writes YAML without confirmation.
 *
 * Interactive paths (library scan, AI suggestion, field commit) arrive through
 * the optional {@link FrontmatterBlockPorts}; without them the grid renders
 * read-only and the entrances are disabled with a reason (never fake buttons).
 * {@link ConnectedFrontmatterBlockView} builds those ports from the app-composed
 * chrome runtime — the Vault inventory scan, the deterministic hub commit, and
 * the AI suggestion capability invoke.
 */
export interface FrontmatterSuggestPort {
	/** Present ⇒ render disabled with this explanation (never a fake button). */
	disabledReason?: string;
	/** Invoke the AI property-suggestion capability (candidate appears in the block slot). */
	run(): void;
}

export interface FrontmatterBlockPorts {
	/** Vault-wide inventory for the property library (app adapter over metadataCache). */
	loadInventory?(currentFrontmatter: Record<string, string | string[] | boolean>): Promise<VaultPropertyInventory>;
	/** Commit a confirmed field candidate deterministically (hub). Returns whether a shape review was needed. */
	commitField?(payload: ComposerMetadataFieldPatchPayload): Promise<{ requiresReview: boolean; committed: boolean }>;
	/** AI property suggestion via the capability projection (streams a candidate). */
	suggest?: FrontmatterSuggestPort;
	/** Field-level warnings (e.g. updated earlier than last edit) surfaced on the 属性告警 pill. */
	warnings?: readonly string[];
}

export function FrontmatterBlockView({
	block,
	config = DEFAULT_FRONTMATTER_CONFIG,
	modelConfig,
	ports,
}: {
	block: ComposerBlock;
	config?: FrontmatterConfig;
	modelConfig?: FrontmatterModelConfig;
	ports?: FrontmatterBlockPorts;
}): React.ReactElement {
	const model = React.useMemo(
		() => parseFrontmatterModel(block.renderModel.raw, modelConfig),
		[block.renderModel.raw, modelConfig],
	);
	const [libraryOpen, setLibraryOpen] = React.useState(false);

	if (model.malformed) {
		return (
			<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{block.renderModel.raw}
			</pre>
		);
	}

	const currentMap = frontmatterMap(model.fields);
	const warnings = ports?.warnings ?? [];
	const suggest = ports?.suggest;
	const suggestDisabled = !suggest || suggest.disabledReason !== undefined;
	const suggestReason = !suggest ? config.grid.aiSuggest : suggest.disabledReason;

	return (
		<div className="pk-fm-block" data-block-id={block.blockId} data-src-text-from={block.source.from}>
			<div className="pk-fm-actions" data-chrome="true">
				{warnings.length > 0 && (
					<span className="pk-fm-issue" role="status" title={warnings.join('\n')}>
						{config.grid.issueWarning}
					</span>
				)}
				<Button
					variant="ghost"
					size="sm"
					data-active={libraryOpen || undefined}
					disabled={!ports?.loadInventory}
					title={ports?.loadInventory ? undefined : config.grid.vaultLibrary}
					onClick={() => setLibraryOpen((v) => !v)}
				>
					<Library size={12} />
					{config.grid.vaultLibrary}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={suggestDisabled}
					title={suggestReason}
					onClick={() => suggest?.run()}
				>
					<Sparkles size={12} />
					{config.grid.aiSuggest}
				</Button>
			</div>

			<PropertyGrid fields={model.fields} config={config} />

			{libraryOpen && ports?.loadInventory && (
				<VaultPropertyLibrary
					config={config}
					loadInventory={() => ports.loadInventory!(currentMap)}
					commitField={ports.commitField}
					onClose={() => setLibraryOpen(false)}
				/>
			)}
		</div>
	);
}

function frontmatterMap(fields: readonly FrontmatterField[]): Record<string, string | string[] | boolean> {
	const out: Record<string, string | string[] | boolean> = {};
	for (const f of fields) out[f.key] = f.value;
	return out;
}

// ── connected view (chrome-composed ports) ──────────────────────────────────

/**
 * Frontmatter block wired to the app-composed chrome runtime. Builds the three
 * live ports from the chrome: the Vault inventory scan (§8.2), a deterministic
 * hub commit for library / custom fields (§8.4), and the AI suggestion
 * capability invoke (§8.3). Any port whose backing runtime is absent (read-only
 * host / harness) is simply omitted, so the presentational view disables that
 * entrance with a reason — no fake affordances.
 */
export function ConnectedFrontmatterBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const chrome = useComposerChrome();
	const { runtime, projection, snapshot } = chrome;
	const inventory = runtime.vaultInventory;
	const hub = runtime.hub;

	const ports = React.useMemo<FrontmatterBlockPorts>(() => {
		const built: FrontmatterBlockPorts = {};
		if (inventory) {
			built.loadInventory = async (current) => computeVaultPropertyInventory(inventory.scanFrontmatter(), current);
		}
		if (hub && snapshot) {
			built.commitField = async (payload) => {
				const from = block.source.from;
				const to = block.source.to;
				const source = snapshot.sourceText.slice(from, to);
				const build = buildMetadataFieldPatchOperations(source, from, to, { key: payload.key, value: payload.value });
				if (!build.ok) return { requiresReview: build.requiresReview, committed: false };
				await hub.commit({
					origin: 'deterministic',
					label: chrome.config.chrome.actions.directEdit,
					operations: build.operations,
					target: { kind: 'block', blockId: block.blockId },
					expectedBlockDelta: 0,
				});
				return { requiresReview: build.requiresReview, committed: true };
			};
		}
		const suggestAction = suggestActionFor(chrome, block, snapshot);
		if (suggestAction) built.suggest = suggestAction;
		return built;
	}, [chrome, projection, inventory, hub, snapshot, block]);

	return <FrontmatterBlockView block={block} ports={ports} />;
}

/** Resolve the AI suggest capability descriptor for this frontmatter block, if projected. */
function suggestActionFor(
	chrome: ReturnType<typeof useComposerChrome>,
	block: ComposerBlock,
	snapshot: ReturnType<typeof useComposerChrome>['snapshot'],
): FrontmatterSuggestPort | undefined {
	if (!snapshot) return undefined;
	const context: ComposerContextSnapshot = {
		documentId: snapshot.documentId,
		revision: snapshot.revision,
		target: { kind: 'block', blockId: block.blockId },
		targetSource: snapshot.sourceText.slice(block.source.from, block.source.to),
		// The document body (everything after the frontmatter block) is the evidence
		// the suggestion reasons over — §8.3 / the pack's buildPromptVariables.
		nearby: { before: '', after: snapshot.sourceText.slice(block.source.to) },
	};
	const action = chrome.projection
		.actionsFor(context, 'block-row')
		.find((a) => a.capabilityId === SUGGEST_PROPERTIES_CAPABILITY_ID);
	if (!action) return undefined;
	return {
		...(action.disabledReason !== undefined ? { disabledReason: action.disabledReason } : {}),
		run: () => {
			try {
				chrome.projection.invoke(SUGGEST_PROPERTIES_CAPABILITY_ID, context);
			} catch {
				// Only a mis-wired port lands here — the stub projects no suggest action.
			}
		},
	};
}

// ── property grid ─────────────────────────────────────────────────────────────

function PropertyGrid({ fields, config }: { fields: readonly FrontmatterField[]; config: FrontmatterConfig }): React.ReactElement {
	return (
		<div className="pk-fm-grid">
			{fields.map((field) => (
				<React.Fragment key={field.key}>
					<span className="pk-fm-grid__key">
						{field.key}
						<OriginChip origin={field.origin} config={config} />
					</span>
					<FieldValue field={field} />
				</React.Fragment>
			))}
		</div>
	);
}

function OriginChip({ origin, config }: { origin: ComposerMetadataOrigin; config: FrontmatterConfig }): React.ReactElement {
	return (
		<i className="pk-fm-origin" data-origin={origin}>
			{config.grid.origin[origin]}
		</i>
	);
}

function FieldValue({ field }: { field: FrontmatterField }): React.ReactElement {
	if (field.valueKind === 'list' && Array.isArray(field.value)) {
		return (
			<strong className="pk-fm-grid__value pk-fm-taglist">
				{field.value.map((item, i) => (
					<span key={`${item}-${i}`} className="pk-fm-tag">
						{item}
					</span>
				))}
			</strong>
		);
	}
	if (field.valueKind === 'boolean') {
		return <strong className="pk-fm-grid__value">{String(field.value)}</strong>;
	}
	return <strong className="pk-fm-grid__value">{String(field.value)}</strong>;
}

// ── vault property library ────────────────────────────────────────────────────

function VaultPropertyLibrary({
	config,
	loadInventory,
	commitField,
	onClose,
}: {
	config: FrontmatterConfig;
	loadInventory: () => Promise<VaultPropertyInventory>;
	commitField?: FrontmatterBlockPorts['commitField'];
	onClose: () => void;
}): React.ReactElement {
	const [inventory, setInventory] = React.useState<VaultPropertyInventory | null>(null);
	React.useEffect(() => {
		let live = true;
		void loadInventory().then((inv) => {
			if (live) setInventory(inv);
		});
		return () => {
			live = false;
		};
	}, [loadInventory]);

	const lib = config.library;
	const addField = (payload: ComposerMetadataFieldPatchPayload) => {
		if (commitField) void commitField(payload);
	};

	return (
		<section className="pk-fm-library" role="region" aria-label={lib.title} data-chrome="true">
			<header>
				<span>
					<b>{lib.title}</b>
					<small>{lib.subtitle}</small>
				</span>
				<Button variant="ghost" size="sm" aria-label={lib.close} onClick={onClose}>
					<X size={13} />
				</Button>
			</header>
			{inventory && (
				<div className="pk-fm-library__summary">
					<span><b>{inventory.fieldCount}</b> {lib.statFields}</span>
					<span><b>{inventory.tagCount}</b> {lib.statTags}</span>
					<span><b>{inventory.singleUseCount}</b> {lib.statSingle}</span>
					<span><b>{inventory.typeConflictCount}</b> {lib.statConflict}</span>
				</div>
			)}
			<div className="pk-fm-library__table" role="table" aria-label={lib.title}>
				<div role="row" className="pk-fm-library__head">
					<b role="columnheader">{lib.colField}</b>
					<b role="columnheader">{lib.colCoverage}</b>
					<b role="columnheader">{lib.colIssue}</b>
					<b role="columnheader">{lib.colAdd}</b>
				</div>
				{(inventory?.fields ?? []).map((stat) => (
					<LibraryRow key={stat.key} stat={stat} config={config} onAdd={() => addField(fieldCandidateFromVault({ key: stat.key }, ''))} canAdd={Boolean(commitField)} />
				))}
			</div>
			<CustomPropertyForm config={config} commitField={commitField} />
			<footer>{lib.footer}</footer>
		</section>
	);
}

function LibraryRow({
	stat,
	config,
	onAdd,
	canAdd,
}: {
	stat: VaultPropertyStat;
	config: FrontmatterConfig;
	onAdd: () => void;
	canAdd: boolean;
}): React.ReactElement {
	const lib = config.library;
	const issues: string[] = [];
	if (stat.typeConflict) issues.push(lib.typeConflict);
	if (stat.rare) issues.push(lib.rare);
	return (
		<div role="row">
			<span>
				<strong>{stat.key}</strong>
				<small>{stat.kinds.join(' / ')}</small>
			</span>
			<span>{Math.round(stat.coverage * 100)}%</span>
			<span>{issues.join(' · ')}</span>
			{stat.presentInCurrent ? (
				<button type="button" disabled>{lib.alreadyPresent}</button>
			) : (
				<button type="button" disabled={!canAdd} onClick={onAdd}>{lib.add}</button>
			)}
		</div>
	);
}

function CustomPropertyForm({
	config,
	commitField,
}: {
	config: FrontmatterConfig;
	commitField?: FrontmatterBlockPorts['commitField'];
}): React.ReactElement {
	const [key, setKey] = React.useState('');
	const [value, setValue] = React.useState('');
	const lib = config.library;
	const submit = (ev: React.FormEvent) => {
		ev.preventDefault();
		if (!commitField || key.trim().length === 0) return;
		void commitField(customFieldCandidate(key, value));
		setKey('');
		setValue('');
	};
	return (
		<form className="pk-fm-library__custom" onSubmit={submit}>
			<span>
				<b>{lib.customTitle}</b>
				<small>{lib.customSubtitle}</small>
			</span>
			<input value={key} aria-label={lib.customTitle} placeholder={lib.keyPlaceholder} onChange={(e) => setKey(e.target.value)} />
			<input value={value} aria-label={lib.valuePlaceholder} placeholder={lib.valuePlaceholder} onChange={(e) => setValue(e.target.value)} />
			<Button type="submit" variant="secondary" size="sm" disabled={!commitField || key.trim().length === 0}>
				{lib.addToDoc}
			</Button>
		</form>
	);
}
