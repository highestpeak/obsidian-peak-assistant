import * as React from 'react';
import { Library, Sparkles, X } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import type {
	ComposerMetadataFieldPatchPayload,
	ComposerMetadataOrigin,
} from '@/core/schemas/composer';
import {
	parseFrontmatterModel,
	customFieldCandidate,
	fieldCandidateFromVault,
	type FrontmatterField,
	type FrontmatterModelConfig,
	type VaultPropertyInventory,
	type VaultPropertyStat,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
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
 * Interactive paths (library scan, AI suggestions, field commit) arrive through
 * the optional {@link FrontmatterBlockPorts}; without them the grid renders
 * read-only and the entrances are disabled with a reason (never fake buttons).
 */
export interface FrontmatterAiSuggestion extends ComposerMetadataFieldPatchPayload {
	id: string;
}

export interface FrontmatterBlockPorts {
	/** Vault-wide inventory for the property library (app adapter over metadataCache). */
	loadInventory?(currentFrontmatter: Record<string, string | string[] | boolean>): Promise<VaultPropertyInventory>;
	/** Commit a confirmed field candidate deterministically (hub). Returns whether a shape review was needed. */
	commitField?(payload: ComposerMetadataFieldPatchPayload): Promise<{ requiresReview: boolean; committed: boolean }>;
	/** AI property suggestions for the current document (streamed then settled). */
	loadSuggestions?(): Promise<FrontmatterAiSuggestion[]>;
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
	const [panel, setPanel] = React.useState<'library' | 'suggestions' | null>(null);

	if (model.malformed) {
		return (
			<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{block.renderModel.raw}
			</pre>
		);
	}

	const currentMap = frontmatterMap(model.fields);
	const warnings = ports?.warnings ?? [];

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
					data-active={panel === 'library' || undefined}
					disabled={!ports?.loadInventory}
					title={ports?.loadInventory ? undefined : config.grid.vaultLibrary}
					onClick={() => setPanel(panel === 'library' ? null : 'library')}
				>
					<Library size={12} />
					{config.grid.vaultLibrary}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					data-active={panel === 'suggestions' || undefined}
					disabled={!ports?.loadSuggestions}
					title={ports?.loadSuggestions ? undefined : config.grid.aiSuggest}
					onClick={() => setPanel(panel === 'suggestions' ? null : 'suggestions')}
				>
					<Sparkles size={12} />
					{config.grid.aiSuggest}
				</Button>
			</div>

			<PropertyGrid fields={model.fields} config={config} />

			{panel === 'library' && ports?.loadInventory && (
				<VaultPropertyLibrary
					config={config}
					loadInventory={() => ports.loadInventory!(currentMap)}
					commitField={ports.commitField}
					onClose={() => setPanel(null)}
				/>
			)}
			{panel === 'suggestions' && ports?.loadSuggestions && (
				<AiSuggestionPanel
					config={config}
					loadSuggestions={ports.loadSuggestions}
					commitField={ports.commitField}
					onClose={() => setPanel(null)}
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

// ── AI property suggestions ───────────────────────────────────────────────────

function AiSuggestionPanel({
	config,
	loadSuggestions,
	commitField,
	onClose,
}: {
	config: FrontmatterConfig;
	loadSuggestions: () => Promise<FrontmatterAiSuggestion[]>;
	commitField?: FrontmatterBlockPorts['commitField'];
	onClose: () => void;
}): React.ReactElement {
	const [suggestions, setSuggestions] = React.useState<FrontmatterAiSuggestion[] | null>(null);
	const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(new Set());
	React.useEffect(() => {
		let live = true;
		void loadSuggestions().then((s) => {
			if (live) setSuggestions(s);
		});
		return () => {
			live = false;
		};
	}, [loadSuggestions]);

	const sug = config.suggestions;
	const visible = (suggestions ?? []).filter((s) => !dismissed.has(s.id));
	const reject = (id: string) => setDismissed((prev) => new Set(prev).add(id));

	return (
		<section className="pk-fm-suggestions" role="region" aria-label={sug.title} data-chrome="true">
			<header>
				<span>
					<b>{sug.title}</b>
					<small>{sug.subtitle}</small>
				</span>
				<Button variant="ghost" size="sm" aria-label={sug.close} onClick={onClose}>
					<X size={13} />
				</Button>
			</header>
			<div className="pk-fm-suggestions__list">
				{suggestions === null && <span className="pk-fm-suggestions__muted">{sug.streaming}</span>}
				{suggestions !== null && visible.length === 0 && <span className="pk-fm-suggestions__muted">{sug.empty}</span>}
				{visible.map((s) => (
					<div key={s.id}>
						<span>
							<strong>{s.key}</strong>
							<small>{Array.isArray(s.value) ? s.value.join(', ') : String(s.value)}{s.evidence ? ` · ${s.evidence}` : ''}</small>
						</span>
						<span className="pk-fm-suggestions__row-actions">
							<Button variant="secondary" size="sm" disabled={!commitField} onClick={() => commitField && void commitField(s)}>
								{sug.add}
							</Button>
							<Button variant="ghost" size="sm" onClick={() => reject(s.id)}>
								{sug.reject}
							</Button>
						</span>
					</div>
				))}
			</div>
			<footer>{sug.footer}</footer>
		</section>
	);
}
