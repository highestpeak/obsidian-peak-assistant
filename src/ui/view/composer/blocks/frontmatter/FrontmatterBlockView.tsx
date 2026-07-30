import * as React from 'react';
import { Check, Plus, RotateCcw, Sparkles } from 'lucide-react';
import type {
	ComposerBlock,
	ComposerCandidate,
	ComposerCandidateRuntimePort,
	ComposerContextSnapshot,
	ComposerResultEnvelope,
} from '@/core/composer';
import type {
	ComposerMetadataFieldPatchPayload,
	ComposerMetadataOrigin,
	ComposerMetadataValueKind,
} from '@/core/schemas/composer';
import {
	parseFrontmatterModel,
	computeVaultPropertyInventory,
	buildMetadataFieldPatchOperations,
	SUGGEST_PROPERTIES_CAPABILITY_ID,
	type FrontmatterField,
	type FrontmatterModelConfig,
	type VaultPropertyInventory,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { DEFAULT_FRONTMATTER_CONFIG, type FrontmatterConfig } from './frontmatterConfig';
import { FrontmatterPropertyPicker } from './FrontmatterPropertyPicker';

/**
 * Peak Composer — frontmatter property grid (WP5, §8).
 *
 * Replaces the raw YAML mono box with a typed property grid (scalar / list /
 * boolean / date / link / unknown) tagged by provenance (程序 / 人工 / AI 建议 /
 * 规范建议). A small, persistent "添加属性" row opens the task-focused property
 * picker without expanding the whole Vault inventory into the document. The
 * block action row keeps the two concrete AI quick actions; the compact state
 * row above the grid retains the aggregate AI-suggestion trigger. All paths
 * create per-document candidates only, and nothing writes YAML without
 * confirmation.
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

/**
 * A metadata candidate stays inside the Frontmatter grid instead of replacing
 * the complete block with the generic candidate card. The app/root owns the
 * candidate discovery; this view only projects its pending field at the real
 * field position and routes confirmation through the narrow runtime port.
 */
export interface FrontmatterCandidatePort {
	runtime: ComposerCandidateRuntimePort;
	candidate: ComposerCandidate;
}

interface FrontmatterFieldDraft {
	key: string;
	value: string | string[] | boolean;
	valueKind: ComposerMetadataValueKind;
	origin: ComposerMetadataOrigin;
}

export function FrontmatterBlockView({
	block,
	config = DEFAULT_FRONTMATTER_CONFIG,
	modelConfig,
	ports,
	candidate: candidatePort,
	libraryOpen = false,
	propertyPickerEnabled = false,
	onLibraryOpenChange,
}: {
	block: ComposerBlock;
	config?: FrontmatterConfig;
	modelConfig?: FrontmatterModelConfig;
	ports?: FrontmatterBlockPorts;
	candidate?: FrontmatterCandidatePort;
	libraryOpen?: boolean;
	propertyPickerEnabled?: boolean;
	onLibraryOpenChange?(open: boolean): void;
}): React.ReactElement {
	const model = React.useMemo(
		() => parseFrontmatterModel(block.renderModel.raw, modelConfig),
		[block.renderModel.raw, modelConfig],
	);
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
	const candidate = useFrontmatterCandidate(candidatePort);
	const candidatePayload = metadataCandidatePayload(candidate);
	const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
	const [candidateReviewOpen, setCandidateReviewOpen] = React.useState(false);
	const [fieldDraft, setFieldDraft] = React.useState<FrontmatterFieldDraft | null>(null);
	const [draftCommitPending, setDraftCommitPending] = React.useState(false);
	const [draftCommitFailed, setDraftCommitFailed] = React.useState(false);
	const pickerTriggerRef = React.useRef<HTMLButtonElement | null>(null);
	const pickerAvailable = Boolean(ports?.loadInventory && ports.commitField);
	React.useEffect(() => {
		if (!fieldDraft) return;
		if (!model.fields.some((field) => field.key === fieldDraft.key)) return;
		setFieldDraft(null);
		setDraftCommitFailed(false);
	}, [fieldDraft, model.fields]);
	React.useEffect(() => {
		if (candidate) return;
		setCandidateReviewOpen(false);
	}, [candidate]);
	const openSuggestions = () => {
		setSuggestionsOpen(true);
		if (!candidate) suggest?.run();
	};
	const closePicker = () => {
		onLibraryOpenChange?.(false);
		requestAnimationFrame(() => pickerTriggerRef.current?.focus());
	};
	const selectField = (payload: ComposerMetadataFieldPatchPayload) => {
		setFieldDraft({
			key: payload.key,
			value: payload.value,
			valueKind: payload.valueKind,
			origin: payload.origin,
		});
		setDraftCommitFailed(false);
		onLibraryOpenChange?.(false);
	};
	const commitDraft = async () => {
		if (!fieldDraft || !ports?.commitField || draftCommitPending) return;
		setDraftCommitPending(true);
		setDraftCommitFailed(false);
		try {
			const result = await ports.commitField(
				fieldDraftPayload(fieldDraft, config.picker.listValueSeparator),
			);
			if (result.committed) {
				setFieldDraft(null);
				return;
			}
			setDraftCommitFailed(true);
		} catch {
			setDraftCommitFailed(true);
		} finally {
			setDraftCommitPending(false);
		}
	};

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
					disabled={suggestDisabled}
					title={suggestReason}
					aria-expanded={suggestionsOpen}
					onClick={openSuggestions}
				>
					<Sparkles size={12} />
					{config.grid.aiSuggest}
					{candidatePayload ? ` · 1` : ''}
				</Button>
			</div>

			<PropertyGrid
				fields={model.fields}
				config={config}
				candidate={candidateReviewOpen ? candidatePayload : null}
				draft={fieldDraft}
				draftCommitPending={draftCommitPending}
				draftCommitFailed={draftCommitFailed}
				onDraftChange={setFieldDraft}
				onDraftCancel={() => {
					setFieldDraft(null);
					setDraftCommitFailed(false);
				}}
				onDraftCommit={() => void commitDraft()}
			/>
			{suggestionsOpen && (
				<MetadataSuggestionPanel
					candidate={candidate}
					payload={candidatePayload}
					runtime={candidatePort?.runtime}
					config={config}
					onClose={() => setSuggestionsOpen(false)}
					onAdd={() => {
						setCandidateReviewOpen(true);
						setSuggestionsOpen(false);
					}}
				/>
			)}
			{propertyPickerEnabled && (
				<div
					className="pk-fm-picker-anchor"
					data-chrome="true"
					data-composer-surface-owner={block.blockId}
				>
					<Button
						ref={pickerTriggerRef}
						variant="ghost"
						size="sm"
						className="pk-fm-add-property"
						aria-haspopup="dialog"
						aria-expanded={libraryOpen}
						disabled={!pickerAvailable}
						title={!pickerAvailable ? config.library.unavailable : undefined}
						onClick={() => onLibraryOpenChange?.(!libraryOpen)}
					>
						<Plus size={13} />
						{config.grid.addProperty}
					</Button>
					{libraryOpen && pickerAvailable && ports?.loadInventory && (
						<FrontmatterPropertyPicker
							config={config}
							loadInventory={() => ports.loadInventory!(currentMap)}
							onSelect={selectField}
							onClose={closePicker}
						/>
					)}
				</div>
			)}
			{candidateReviewOpen && candidate && candidatePort && (
				<FrontmatterCandidateReview
					candidate={candidate}
					payload={candidatePayload}
					runtime={candidatePort.runtime}
					config={config}
				/>
			)}

		</div>
	);
}

function MetadataSuggestionPanel({
	candidate,
	payload,
	runtime,
	config,
	onClose,
	onAdd,
}: {
	candidate: ComposerCandidate | null;
	payload: ComposerMetadataFieldPatchPayload | null;
	runtime?: ComposerCandidateRuntimePort;
	config: FrontmatterConfig;
	onClose(): void;
	onAdd(): void;
}): React.ReactElement {
	const strings = config.suggestions;
	const statusText = candidate?.status === 'failed'
		? strings.failed
		: candidate?.status === 'stale'
			? strings.stale
			: strings.streaming;
	const canRetry = candidate?.status === 'failed' || candidate?.status === 'stale';
	const retry = () => {
		if (!candidate || !runtime) return;
		if (candidate.status === 'stale' && runtime.rerunStale) {
			runtime.rerunStale(candidate.candidateId);
			return;
		}
		runtime.regenerate(candidate.candidateId);
	};
	return (
		<section className="pk-fm-suggestions" data-chrome="true" aria-label={strings.title}>
			<div className="pk-fm-suggestions__head">
				<span>
					<strong>{strings.title}{payload ? ' · 1' : ''}</strong>
					<small>{strings.subtitle}</small>
				</span>
				<Button variant="ghost" size="sm" onClick={onClose}>{strings.close}</Button>
			</div>
			<div className="pk-fm-suggestions__body">
				{payload ? (
					<div className="pk-fm-suggestion-row">
						<span className="pk-fm-suggestion-row__copy">
							<strong>{payload.key}</strong>
							<span>{formatMetadataSuggestionValue(payload.value)}</span>
							<small>{strings.candidateDescription}</small>
						</span>
						<span className="pk-fm-suggestion-row__actions">
							<Button variant="primary" size="sm" onClick={onAdd}>
								<Plus size={13} />
								{strings.add}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									if (candidate && runtime) runtime.discard(candidate.candidateId);
									onClose();
								}}
							>
								{strings.reject}
							</Button>
						</span>
					</div>
				) : (
					<div className="pk-fm-suggestions__state">
						<span>{candidate ? statusText : strings.empty}</span>
						{canRetry && <Button variant="secondary" size="sm" onClick={retry}>{strings.retry}</Button>}
					</div>
				)}
			</div>
			<small className="pk-fm-suggestions__footer">{strings.footer}</small>
		</section>
	);
}

function formatMetadataSuggestionValue(value: ComposerMetadataFieldPatchPayload['value']): string {
	return Array.isArray(value) ? value.join(', ') : String(value);
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
export function ConnectedFrontmatterBlockView({
	block,
	candidate,
	libraryOpen = false,
	propertyPickerEnabled = false,
	onLibraryOpenChange,
}: {
	block: ComposerBlock;
	candidate?: FrontmatterCandidatePort;
	libraryOpen?: boolean;
	propertyPickerEnabled?: boolean;
	onLibraryOpenChange?(open: boolean): void;
}): React.ReactElement {
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

	return (
		<FrontmatterBlockView
			block={block}
			ports={ports}
			candidate={candidate}
			libraryOpen={libraryOpen}
			propertyPickerEnabled={propertyPickerEnabled}
			onLibraryOpenChange={onLibraryOpenChange}
		/>
	);
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
	const actions = chrome.projection.actionsFor(context, 'block-row');
	const action = actions.find((candidate) => candidate.capabilityId === SUGGEST_PROPERTIES_CAPABILITY_ID);
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

function PropertyGrid({
	fields,
	config,
	candidate,
	draft,
	draftCommitPending,
	draftCommitFailed,
	onDraftChange,
	onDraftCancel,
	onDraftCommit,
}: {
	fields: readonly FrontmatterField[];
	config: FrontmatterConfig;
	candidate: ComposerMetadataFieldPatchPayload | null;
	draft: FrontmatterFieldDraft | null;
	draftCommitPending: boolean;
	draftCommitFailed: boolean;
	onDraftChange(draft: FrontmatterFieldDraft): void;
	onDraftCancel(): void;
	onDraftCommit(): void;
}): React.ReactElement {
	const newCandidateField = candidate && !fields.some((field) => field.key === candidate.key)
		? {
				key: candidate.key,
				value: candidate.value,
				valueKind: candidate.valueKind,
				origin: candidate.origin,
			}
		: null;
	return (
		<div className="pk-fm-grid">
			{fields.map((field) => (
				<React.Fragment key={field.key}>
					<span className="pk-fm-grid__key" data-frontmatter-key={field.key}>
						{field.key}
						<OriginChip origin={field.origin} config={config} />
					</span>
					<FieldValue field={field} candidate={candidate?.key === field.key ? candidate : null} />
				</React.Fragment>
			))}
			{newCandidateField && (
				<React.Fragment key={`candidate:${newCandidateField.key}`}>
					<span className="pk-fm-grid__key">
						{newCandidateField.key}
						<OriginChip origin={newCandidateField.origin} config={config} />
					</span>
					<FieldValue field={newCandidateField} candidate={candidate} />
				</React.Fragment>
			)}
			{draft && !fields.some((field) => field.key === draft.key) && (
				<React.Fragment key={`draft:${draft.key}`}>
					<span className="pk-fm-grid__key pk-fm-grid__key--draft">
						{draft.key}
						<OriginChip origin={draft.origin} config={config} />
					</span>
					<DraftFieldValue
						draft={draft}
						config={config}
						pending={draftCommitPending}
						failed={draftCommitFailed}
						onChange={onDraftChange}
						onCancel={onDraftCancel}
						onCommit={onDraftCommit}
					/>
				</React.Fragment>
			)}
		</div>
	);
}

function DraftFieldValue({
	draft,
	config,
	pending,
	failed,
	onChange,
	onCancel,
	onCommit,
}: {
	draft: FrontmatterFieldDraft;
	config: FrontmatterConfig;
	pending: boolean;
	failed: boolean;
	onChange(draft: FrontmatterFieldDraft): void;
	onCancel(): void;
	onCommit(): void;
}): React.ReactElement {
	const inputRef = React.useRef<HTMLInputElement | null>(null);
	React.useEffect(() => {
		inputRef.current?.focus();
	}, [draft.key]);
	const value = Array.isArray(draft.value)
		? draft.value.join(`${config.picker.listValueSeparator} `)
		: draft.value;
	const updateTextValue = (text: string) => {
		onChange({ ...draft, value: text });
	};
	return (
		<span className="pk-fm-draft-value">
			{draft.valueKind === 'boolean' ? (
				<input
					ref={inputRef}
					type="checkbox"
					checked={Boolean(draft.value)}
					aria-label={config.library.valuePlaceholder}
					onChange={(event) => onChange({ ...draft, value: event.target.checked })}
				/>
			) : (
				<input
					ref={inputRef}
					type={draft.valueKind === 'date' ? 'date' : 'text'}
					value={String(value)}
					placeholder={config.library.valuePlaceholder}
					aria-label={`${draft.key} ${config.library.valuePlaceholder}`}
					onChange={(event) => updateTextValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							onCancel();
							return;
						}
						if (event.key !== 'Enter') return;
						event.preventDefault();
						onCommit();
					}}
				/>
			)}
			<span className="pk-fm-draft-value__actions">
				<Button variant="primary" size="sm" disabled={pending} onClick={onCommit}>
					<Check size={12} />
					{config.library.addToDoc}
				</Button>
				<Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
					{config.library.cancel}
				</Button>
			</span>
			{failed && <small role="alert">{config.library.commitFailed}</small>}
		</span>
	);
}

function OriginChip({ origin, config }: { origin: ComposerMetadataOrigin; config: FrontmatterConfig }): React.ReactElement {
	return (
		<i className="pk-fm-origin" data-origin={origin}>
			{config.grid.origin[origin]}
		</i>
	);
}

function FieldValue({
	field,
	candidate,
}: {
	field: FrontmatterField;
	candidate: ComposerMetadataFieldPatchPayload | null;
}): React.ReactElement {
	if (field.valueKind === 'list' && Array.isArray(field.value)) {
		return (
			<strong className="pk-fm-grid__value pk-fm-taglist">
				{field.value.map((item, i) => (
					<span key={`${item}-${i}`} className="pk-fm-tag">
						{item}
					</span>
				))}
				{candidate && <CandidateFieldValue field={field} candidate={candidate} />}
			</strong>
		);
	}
	if (field.valueKind === 'boolean') {
		return (
			<strong className="pk-fm-grid__value">
				{String(field.value)}
				{candidate && <CandidateFieldValue field={field} candidate={candidate} />}
			</strong>
		);
	}
	return (
		<strong className="pk-fm-grid__value">
			{candidate && field.key === candidate.key ? null : String(field.value)}
			{candidate && <CandidateFieldValue field={field} candidate={candidate} />}
		</strong>
	);
}

function CandidateFieldValue({
	field,
	candidate,
}: {
	field: FrontmatterField;
	candidate: ComposerMetadataFieldPatchPayload;
}): React.ReactElement {
	const values = Array.isArray(candidate.value) ? candidate.value : [candidate.value];
	if (field.key === 'tags') {
		return (
			<>
				{values.map((value) => (
					<span key={`candidate:${value}`} className="pk-fm-tag pk-fm-tag--candidate" data-ai-suggestion="true">
						+ {value}
					</span>
				))}
			</>
		);
	}
	return <span className="pk-fm-field-candidate" data-ai-suggestion="true">+ {values.join(', ')}</span>;
}

function useFrontmatterCandidate(port?: FrontmatterCandidatePort): ComposerCandidate | null {
	const [candidate, setCandidate] = React.useState<ComposerCandidate | null>(port?.candidate ?? null);
	React.useEffect(() => {
		if (!port) {
			setCandidate(null);
			return;
		}
		setCandidate(port.candidate);
		return port.runtime.subscribe((candidates) => {
			setCandidate(candidates.find((item) => item.candidateId === port.candidate.candidateId) ?? null);
		});
	}, [port]);
	return candidate;
}

function metadataCandidatePayload(candidate: ComposerCandidate | null): ComposerMetadataFieldPatchPayload | null {
	const envelope = candidate?.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'metadata-field-patch') return null;
	return envelope.payload as ComposerMetadataFieldPatchPayload;
}

function FrontmatterCandidateReview({
	candidate,
	payload,
	runtime,
	config,
}: {
	candidate: ComposerCandidate;
	payload: ComposerMetadataFieldPatchPayload | null;
	runtime: ComposerCandidateRuntimePort;
	config: FrontmatterConfig;
}): React.ReactElement {
	const strings = config.suggestions;
	const tagCandidate = payload?.key === 'tags';
	const ready = candidate.status === 'ready' && payload !== null;
	const retry = () => {
		if (candidate.status === 'stale') {
			if (runtime.rerunStale) runtime.rerunStale(candidate.candidateId);
			return;
		}
		runtime.regenerate(candidate.candidateId);
	};
	const statusText = candidate.status === 'streaming'
		? strings.streaming
		: candidate.status === 'failed'
			? strings.failed
			: candidate.status === 'stale'
				? strings.stale
				: strings.candidateDescription;
	return (
		<div className="pk-fm-candidate-review" data-chrome="true" data-status={candidate.status}>
			<span className="pk-fm-candidate-review__summary">
				<span className="pk-fm-candidate-review__dot" aria-hidden="true" />
				<b>{tagCandidate ? strings.candidateTagTitle : strings.candidateTitle}</b>
				<span>{statusText}</span>
			</span>
			<span className="pk-fm-candidate-review__actions">
				{(candidate.status === 'failed' || candidate.status === 'stale') && (
					<Button variant="secondary" size="sm" onClick={retry}>
						<RotateCcw size={14} />
						{strings.retry}
					</Button>
				)}
				{ready && (
					<Button variant="primary" size="sm" onClick={() => void runtime.accept(candidate.candidateId)}>
						<Check size={14} />
						{strings.accept}
					</Button>
				)}
				<Button variant="secondary" size="sm" onClick={() => runtime.discard(candidate.candidateId)}>
					<RotateCcw size={14} />
					{strings.restore}
				</Button>
			</span>
		</div>
	);
}

function fieldDraftPayload(
	draft: FrontmatterFieldDraft,
	listValueSeparator: string,
): ComposerMetadataFieldPatchPayload {
	if (draft.valueKind !== 'list' || typeof draft.value !== 'string') return draft;
	return {
		...draft,
		value: draft.value
			.split(listValueSeparator)
			.map((part) => part.trim())
			.filter((part) => part.length > 0),
	};
}
