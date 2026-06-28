import * as React from 'react';
import { Modal, Chip } from '@/ui/components/primitives';
import { BrandAvatar } from '../components/charts';
import type { UsageLogRow } from '@/core/storage/sqlite/ddl';
import type { ProviderId } from '@/ui/components/primitives/types';
import type { DetailPanelStrings } from '../UsageDashboard';
import { useServiceContext } from '@/ui/context/ServiceContext';

export interface WhatWasThisAboutProps {
	open: boolean;
	onClose(): void;
	/** The usage_log row to render. Required when `open` is true. */
	row: UsageLogRow | null;
	strings: DetailPanelStrings;
	/**
	 * Optional override for the privacy flag (test seam). In production the
	 * value comes from `AppContext.getSettings().usagePreviewEnabled`.
	 */
	previewEnabled?: boolean;
}

/**
 * History → "What was this about" detail modal (spec §11.5).
 *
 * Renders feature-specific context BEFORE token / cost data, so the audit
 * trail answers "what was I doing" before "what did it cost". The per-feature
 * switch lives in `<FeatureBody>` below.
 *
 * Layout: chrome modal with `width='wide'`. Header carries the breadcrumb /
 * verbs; body carries the per-feature context; footer carries Open-in-X verb
 * (stubbed — full surface wire-up is per-surface worktree work).
 */
export function WhatWasThisAbout({
	open,
	onClose,
	row,
	strings,
	previewEnabled,
}: WhatWasThisAboutProps) {
	const { settings } = useServiceContext();
	const previewFlag = previewEnabled !== undefined
		? previewEnabled
		: (settings.usagePreviewEnabled ?? true);

	if (!row) return null;

	const metadata = parseMetadata(row.metadata_json);

	return (
		<Modal open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
			<Modal.Content
				width="wide"
				aria-label={strings.title}
				portalClassName="peak-design-root usage-dashboard"
			>
				<Modal.Header>
					<div className="pk-detail-head">
						<BrandAvatar
							provider={normalizeProvider(row.provider)}
							size="sm"
						/>
						<div className="pk-detail-head__text">
							<Modal.Title>{strings.title}</Modal.Title>
							<Modal.Subtitle>
								{row.feature} · {row.model}
								{row.action ? ` · ${row.action}` : ''}
							</Modal.Subtitle>
						</div>
					</div>
					<Modal.Close label={strings.close} />
				</Modal.Header>
				<Modal.Body>
					<FeatureBody
						feature={row.feature}
						metadata={metadata}
						strings={strings}
						previewEnabled={previewFlag}
					/>
				</Modal.Body>
			</Modal.Content>
		</Modal>
	);
}

// ── Per-feature body ────────────────────────────────────────────────────────

interface FeatureBodyProps {
	feature: string;
	metadata: Record<string, unknown> | null;
	strings: DetailPanelStrings;
	previewEnabled: boolean;
}

function FeatureBody({ feature, metadata, strings, previewEnabled }: FeatureBodyProps) {
	if (!metadata) {
		return <div className="pk-detail-empty">{strings.missingMetadata}</div>;
	}

	switch (feature) {
		case 'chat':
			return <ChatBody m={metadata} strings={strings} previewEnabled={previewEnabled} />;
		case 'search_analysis':
		case 'search':
			return <SearchBody m={metadata} strings={strings} />;
		case 'agent':
		case 'skill':
			return <AgentBody m={metadata} strings={strings} />;
		case 'copilot':
			return <CopilotBody m={metadata} strings={strings} previewEnabled={previewEnabled} />;
		case 'embed':
		case 'indexing':
			return <EmbedBody m={metadata} strings={strings} />;
		default:
			return (
				<div className="pk-detail-empty">
					{strings.unknownFeature.replace('{feature}', feature)}
				</div>
			);
	}
}

// ── chat ───────────────────────────────────────────────────────────────────

function ChatBody({
	m,
	strings,
	previewEnabled,
}: {
	m: Record<string, unknown>;
	strings: DetailPanelStrings;
	previewEnabled: boolean;
}) {
	const sessionTitle = asString(m.session_title);
	const turnIndex = asNumber(m.turn_index);
	const turnCount = asNumber(m.turn_count);
	const promptPreview = asString(m.prompt_preview);
	const responsePreview = asString(m.response_preview);
	const attachedFiles = asStringArray(m.attached_files);
	const toolsUsed = asToolList(m.tools_used);

	return (
		<div className="pk-detail-body">
			{sessionTitle && (
				<div className="pk-detail-breadcrumb">
					chat
					<span className="pk-detail-breadcrumb__sep">›</span>
					<span className="pk-detail-breadcrumb__title">{sessionTitle}</span>
					{turnIndex !== null && turnCount !== null && (
						<>
							<span className="pk-detail-breadcrumb__sep">›</span>
							turn {turnIndex} / {turnCount}
						</>
					)}
				</div>
			)}

			{previewEnabled ? (
				<>
					{promptPreview && (
						<QuoteBlock variant="user" label={strings.sections.prompt} text={promptPreview} />
					)}
					{responsePreview && (
						<QuoteBlock variant="assistant" label={strings.sections.response} text={responsePreview} />
					)}
				</>
			) : (
				<div className="pk-detail-privacy">{strings.privacyDisabled}</div>
			)}

			{attachedFiles.length > 0 && (
				<Section title={strings.sections.attachedFiles}>
					<ul className="pk-detail-list">
						{attachedFiles.map((f) => (
							<li key={f}>
								<code>{f}</code>
							</li>
						))}
					</ul>
				</Section>
			)}

			{toolsUsed.length > 0 && (
				<Section title={strings.sections.toolsUsed}>
					<div className="pk-detail-tools">
						{toolsUsed.map((t) => (
							<Chip key={t.name} variant="neutral">
								{t.name}
								{t.count > 1 && (
									<span className="pk-detail-tools__count">×{t.count}</span>
								)}
							</Chip>
						))}
					</div>
				</Section>
			)}
		</div>
	);
}

// ── search ────────────────────────────────────────────────────────────────

function SearchBody({
	m,
	strings,
}: {
	m: Record<string, unknown>;
	strings: DetailPanelStrings;
}) {
	const query = asString(m.query);
	const topResults = asResultList(m.top_results);
	const clicked = asString(m.clicked_result);

	return (
		<div className="pk-detail-body">
			{query && (
				<Section title={strings.sections.query}>
					<div className="pk-detail-query">{query}</div>
				</Section>
			)}
			{topResults.length > 0 && (
				<Section title={strings.sections.topResults}>
					<ol className="pk-detail-results">
						{topResults.slice(0, 3).map((r, i) => (
							<li
								key={`${r.path}-${i}`}
								className={
									clicked && r.path === clicked
										? 'pk-detail-results__item pk-detail-results__item--clicked'
										: 'pk-detail-results__item'
								}
							>
								<code className="pk-detail-results__path">{r.path}</code>
								{r.score !== null && (
									<span className="pk-detail-results__score">
										{r.score.toFixed(2)}
									</span>
								)}
								{clicked && r.path === clicked && (
									<span className="pk-detail-results__badge">
										{strings.sections.clicked}
									</span>
								)}
							</li>
						))}
					</ol>
				</Section>
			)}
		</div>
	);
}

// ── agent ─────────────────────────────────────────────────────────────────

function AgentBody({
	m,
	strings,
}: {
	m: Record<string, unknown>;
	strings: DetailPanelStrings;
}) {
	const taskGoal = asString(m.task_goal);
	const stepIndex = asNumber(m.step_index);
	const stepCount = asNumber(m.step_count);
	const stepName = asString(m.step_name);
	const toolsInStep = asStringArray(m.tools_in_step);
	const previousStep = asString(m.previous_step_summary);

	return (
		<div className="pk-detail-body">
			{taskGoal && (
				<Section title={strings.sections.taskGoal}>
					<div className="pk-detail-query">{taskGoal}</div>
				</Section>
			)}
			{(stepIndex !== null || stepName) && (
				<Section title={strings.sections.stepName}>
					<div className="pk-detail-stepline">
						{stepIndex !== null && stepCount !== null && (
							<span className="pk-detail-stepline__num">
								{stepIndex} / {stepCount}
							</span>
						)}
						{stepName && (
							<span className="pk-detail-stepline__name">{stepName}</span>
						)}
					</div>
				</Section>
			)}
			{toolsInStep.length > 0 && (
				<Section title={strings.sections.stepTools}>
					<div className="pk-detail-tools">
						{toolsInStep.map((t) => (
							<Chip key={t} variant="neutral">{t}</Chip>
						))}
					</div>
				</Section>
			)}
			{previousStep && (
				<Section title={strings.sections.previousStep}>
					<div className="pk-detail-prev">{previousStep}</div>
				</Section>
			)}
		</div>
	);
}

// ── copilot ───────────────────────────────────────────────────────────────

function CopilotBody({
	m,
	strings,
	previewEnabled,
}: {
	m: Record<string, unknown>;
	strings: DetailPanelStrings;
	previewEnabled: boolean;
}) {
	const filePath = asString(m.file_path);
	const before = asString(m.selection_before_preview);
	const after = asString(m.selection_after_preview);
	const accepted = m.accepted === true || m.accepted === 1;

	return (
		<div className="pk-detail-body">
			{filePath && (
				<Section title={strings.sections.filePath}>
					<code className="pk-detail-filepath">{filePath}</code>
				</Section>
			)}
			<div className="pk-detail-accepted">
				<Chip variant={accepted ? 'success' : 'neutral'}>
					{accepted ? strings.sections.accepted : strings.sections.rejected}
				</Chip>
			</div>
			{previewEnabled ? (
				<div className="pk-detail-diff">
					{before && (
						<QuoteBlock variant="user" label={strings.sections.selectionBefore} text={before} />
					)}
					{after && (
						<QuoteBlock variant="assistant" label={strings.sections.selectionAfter} text={after} />
					)}
				</div>
			) : (
				<div className="pk-detail-privacy">{strings.privacyDisabled}</div>
			)}
		</div>
	);
}

// ── embed ─────────────────────────────────────────────────────────────────

function EmbedBody({
	m,
	strings,
}: {
	m: Record<string, unknown>;
	strings: DetailPanelStrings;
}) {
	const docTitle = asString(m.document_title);
	const chunkCount = asNumber(m.chunk_count);
	const model = asString(m.embedding_model);

	return (
		<div className="pk-detail-body">
			{docTitle && (
				<Section title={strings.sections.document}>
					<div className="pk-detail-query">{docTitle}</div>
				</Section>
			)}
			{chunkCount !== null && (
				<Section title={strings.sections.chunks}>
					<div className="pk-detail-stepline">
						<span className="pk-detail-stepline__num">{chunkCount}</span>
					</div>
				</Section>
			)}
			{model && (
				<Section title={strings.sections.embeddingModel}>
					<code>{model}</code>
				</Section>
			)}
		</div>
	);
}

// ── shared subcomponents ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="pk-detail-section">
			<div className="pk-detail-section__title">{title}</div>
			<div className="pk-detail-section__body">{children}</div>
		</div>
	);
}

function QuoteBlock({
	variant,
	label,
	text,
}: {
	variant: 'user' | 'assistant';
	label: string;
	text: string;
}) {
	return (
		<div className={`pk-detail-quote pk-detail-quote--${variant}`}>
			<div className="pk-detail-quote__label">{label}</div>
			<div className="pk-detail-quote__text">{text}</div>
		</div>
	);
}

// ── helpers ────────────────────────────────────────────────────────────────

function parseMetadata(json: string | null): Record<string, unknown> | null {
	if (!json) return null;
	try {
		const v = JSON.parse(json);
		return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function asString(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function asNumber(v: unknown): number | null {
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((x): x is string => typeof x === 'string');
}

interface ToolEntry { name: string; count: number; }
function asToolList(v: unknown): ToolEntry[] {
	if (!Array.isArray(v)) return [];
	return v
		.map((entry): ToolEntry | null => {
			if (typeof entry !== 'object' || entry === null) return null;
			const name = (entry as Record<string, unknown>).name;
			const count = (entry as Record<string, unknown>).count;
			if (typeof name !== 'string') return null;
			return {
				name,
				count: typeof count === 'number' && Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1,
			};
		})
		.filter((x): x is ToolEntry => x !== null);
}

interface SearchResult { path: string; score: number | null; }
function asResultList(v: unknown): SearchResult[] {
	if (!Array.isArray(v)) return [];
	return v
		.map((entry): SearchResult | null => {
			if (typeof entry !== 'object' || entry === null) return null;
			const path = (entry as Record<string, unknown>).path;
			const score = (entry as Record<string, unknown>).score;
			if (typeof path !== 'string') return null;
			return {
				path,
				score: typeof score === 'number' && Number.isFinite(score) ? score : null,
			};
		})
		.filter((x): x is SearchResult => x !== null);
}

/**
 * Map free-form provider strings to the closed `ProviderId` union the design
 * system tokens cover. Falls back to undefined (avatar gets its question-mark).
 */
function normalizeProvider(p: string): ProviderId | undefined {
	const normalized = p?.toLowerCase().trim();
	if (
		normalized === 'openai' ||
		normalized === 'anthropic' ||
		normalized === 'google' ||
		normalized === 'openrouter' ||
		normalized === 'perplexity' ||
		normalized === 'ollama'
	) {
		return normalized;
	}
	return undefined;
}
