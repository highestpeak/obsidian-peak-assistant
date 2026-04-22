import React, { useState, useCallback } from 'react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createPresetProfile } from '@/core/profiles/presets';
import type { Profile, ProfileKind } from '@/core/profiles/types';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import { InputWithConfirm } from '@/ui/component/mine/input-with-confirm';
import { Trash2, Plus, ChevronDown, ChevronRight, Shield, Zap, Globe, Settings2 } from 'lucide-react';

// ─── Kind badge ─────────────────────────────────────────────────────────

const KIND_META: Record<ProfileKind, { label: string; color: string; Icon: React.FC<{ className?: string; size?: number }> }> = {
	'anthropic-direct': { label: 'Anthropic', color: 'pktw-bg-amber-100 pktw-text-amber-800', Icon: Shield },
	openrouter: { label: 'OpenRouter', color: 'pktw-bg-purple-100 pktw-text-purple-800', Icon: Globe },
	litellm: { label: 'LiteLLM', color: 'pktw-bg-blue-100 pktw-text-blue-800', Icon: Zap },
	custom: { label: 'Custom', color: 'pktw-bg-gray-100 pktw-text-gray-800', Icon: Settings2 },
};

function KindBadge({ kind }: { kind: ProfileKind }) {
	const meta = KIND_META[kind];
	return (
		<span className={cn('pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-rounded-full pktw-text-[10px] pktw-font-medium', meta.color)}>
			<meta.Icon size={10} />
			{meta.label}
		</span>
	);
}

// ─── Active profile selector ────────────────────────────────────────────

function ActiveProfileSelect({
	label,
	profiles,
	activeId,
	onChange,
}: {
	label: string;
	profiles: Profile[];
	activeId: string | null;
	onChange: (id: string | null) => void;
}) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-3">
			<span className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-whitespace-nowrap">{label}</span>
			<select
				className="pktw-flex-1 pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-border pktw-border-border pktw-rounded-md pktw-bg-background pktw-text-foreground focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring"
				value={activeId ?? ''}
				onChange={(e) => onChange(e.target.value || null)}
			>
				<option value="">-- None --</option>
				{profiles.map((p) => (
					<option key={p.id} value={p.id}>
						{p.name} ({KIND_META[p.kind].label})
					</option>
				))}
			</select>
		</div>
	);
}

// ─── Profile editor (expandable card) ──────────────────────────────────

function ProfileEditorCard({
	profile,
	isActive,
	onDelete,
	onChange,
}: {
	profile: Profile;
	isActive: { agent: boolean; embedding: boolean };
	onDelete: () => void;
	onChange: () => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const registry = ProfileRegistry.getInstance();

	const updateField = useCallback(
		<K extends keyof Profile>(field: K, value: Profile[K]) => {
			registry.updateProfile(profile.id, { [field]: value } as Partial<Profile>);
			onChange();
		},
		[profile.id, onChange],
	);

	const activeLabels: string[] = [];
	if (isActive.agent) activeLabels.push('Agent');
	if (isActive.embedding) activeLabels.push('Embedding');

	return (
		<div className={cn(
			'pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden pktw-transition-colors',
			activeLabels.length > 0 && 'pktw-border-accent/50',
		)}>
			{/* Card header */}
			<div
				className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-muted/50 pktw-transition-colors"
				onClick={() => setExpanded((v) => !v)}
			>
				{expanded
					? <ChevronDown className="pktw-size-4 pktw-text-muted-foreground pktw-flex-shrink-0" />
					: <ChevronRight className="pktw-size-4 pktw-text-muted-foreground pktw-flex-shrink-0" />
				}
				<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-flex-1 pktw-min-w-0 pktw-truncate">
					{profile.name}
				</span>
				<KindBadge kind={profile.kind} />
				{activeLabels.length > 0 && (
					<span className="pktw-text-[10px] pktw-font-medium pktw-text-accent pktw-whitespace-nowrap">
						Active: {activeLabels.join(', ')}
					</span>
				)}
				<Button
					variant="ghost"
					size="icon"
					className="pktw-size-7 pktw-flex-shrink-0 pktw-text-muted-foreground hover:pktw-text-destructive"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
				>
					<Trash2 size={14} />
				</Button>
			</div>

			{/* Expanded editor */}
			{expanded && (
				<div className="pktw-px-4 pktw-pb-4 pktw-space-y-4 pktw-border-t pktw-border-border pktw-pt-4">
					<EditorField label="Name">
						<InputWithConfirm
							value={profile.name}
							onConfirm={(v) => updateField('name', v)}
							placeholder="Profile name"
						/>
					</EditorField>
					<EditorField label="Base URL">
						<InputWithConfirm
							value={profile.baseUrl}
							onConfirm={(v) => updateField('baseUrl', v)}
							placeholder="https://api.example.com"
						/>
					</EditorField>
					<EditorField label="API Key">
						<InputWithConfirm
							type="password"
							value={profile.apiKey ?? ''}
							onConfirm={(v) => updateField('apiKey', v || null)}
							placeholder="sk-..."
						/>
					</EditorField>
					<EditorField label="Auth Token" description="Optional bearer token (e.g. LiteLLM)">
						<InputWithConfirm
							type="password"
							value={profile.authToken ?? ''}
							onConfirm={(v) => updateField('authToken', v || null)}
							placeholder="Bearer token"
						/>
					</EditorField>
					<EditorField label="Primary Model">
						<InputWithConfirm
							value={profile.primaryModel}
							onConfirm={(v) => updateField('primaryModel', v)}
							placeholder="claude-opus-4-6"
						/>
					</EditorField>
					<EditorField label="Fast Model">
						<InputWithConfirm
							value={profile.fastModel}
							onConfirm={(v) => updateField('fastModel', v)}
							placeholder="claude-haiku-4-5"
						/>
					</EditorField>
					<EditorField label="Embedding Endpoint" description="Optional. Leave empty to use base URL.">
						<InputWithConfirm
							value={profile.embeddingEndpoint ?? ''}
							onConfirm={(v) => updateField('embeddingEndpoint', v || null)}
							placeholder="https://api.example.com/embeddings"
						/>
					</EditorField>
					<EditorField label="Embedding Model" description="Optional.">
						<InputWithConfirm
							value={profile.embeddingModel ?? ''}
							onConfirm={(v) => updateField('embeddingModel', v || null)}
							placeholder="text-embedding-3-small"
						/>
					</EditorField>
				</div>
			)}
		</div>
	);
}

function EditorField({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
	return (
		<div>
			<span className="pktw-block pktw-text-xs pktw-font-medium pktw-text-foreground pktw-mb-1">{label}</span>
			{description && <span className="pktw-block pktw-text-[10px] pktw-text-muted-foreground pktw-mb-1">{description}</span>}
			{children}
		</div>
	);
}

// ─── Preset picker ──────────────────────────────────────────────────────

const PRESET_OPTIONS: { kind: ProfileKind; label: string }[] = [
	{ kind: 'anthropic-direct', label: 'Anthropic Direct' },
	{ kind: 'openrouter', label: 'OpenRouter' },
	{ kind: 'litellm', label: 'LiteLLM' },
	{ kind: 'custom', label: 'Custom' },
];

function PresetPicker({ onAdd, onCancel }: { onAdd: (kind: ProfileKind) => void; onCancel: () => void }) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-flex-wrap">
			{PRESET_OPTIONS.map((opt) => {
				const meta = KIND_META[opt.kind];
				return (
					<Button
						key={opt.kind}
						variant="outline"
						size="sm"
						className="pktw-text-xs pktw-gap-1"
						onClick={() => onAdd(opt.kind)}
					>
						<meta.Icon size={12} />
						{opt.label}
					</Button>
				);
			})}
			<Button variant="ghost" size="sm" className="pktw-text-xs pktw-text-muted-foreground" onClick={onCancel}>
				Cancel
			</Button>
		</div>
	);
}

// ─── Main component ─────────────────────────────────────────────────────

/**
 * Profile CRUD settings panel. Replaces the old ProviderSettings component.
 * Reads/writes to ProfileRegistry singleton which auto-persists.
 */
export function ProfileSettingsTab() {
	const registry = ProfileRegistry.getInstance();

	// Local render trigger — ProfileRegistry is the source of truth, we just need React to re-render.
	const [, setTick] = useState(0);
	const refresh = useCallback(() => setTick((t) => t + 1), []);

	const profiles = registry.getAllProfiles();
	const activeAgentId = registry.getActiveAgentProfile()?.id ?? null;
	const activeEmbeddingId = registry.getActiveEmbeddingProfile()?.id ?? null;

	const [showPresetPicker, setShowPresetPicker] = useState(false);

	const handleAdd = useCallback(
		(kind: ProfileKind) => {
			const profile = createPresetProfile(kind);
			registry.addProfile(profile);
			setShowPresetPicker(false);
			refresh();
		},
		[refresh],
	);

	const handleDelete = useCallback(
		(id: string) => {
			registry.deleteProfile(id);
			refresh();
		},
		[refresh],
	);

	const handleSetActiveAgent = useCallback(
		(id: string | null) => {
			registry.setActiveAgentProfile(id);
			refresh();
		},
		[refresh],
	);

	const handleSetActiveEmbedding = useCallback(
		(id: string | null) => {
			registry.setActiveEmbeddingProfile(id);
			refresh();
		},
		[refresh],
	);

	return (
		<div className="pktw-space-y-6">
			{/* Active profile selectors */}
			<div className="pktw-space-y-3 pktw-p-4 pktw-border pktw-border-border pktw-rounded-lg pktw-bg-muted/30">
				<span className="pktw-block pktw-text-xs pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-muted-foreground pktw-mb-2">
					Active Profiles
				</span>
				<ActiveProfileSelect label="Agent Profile" profiles={profiles} activeId={activeAgentId} onChange={handleSetActiveAgent} />
				<ActiveProfileSelect label="Embedding Profile" profiles={profiles} activeId={activeEmbeddingId} onChange={handleSetActiveEmbedding} />
			</div>

			{/* Profile list */}
			<div className="pktw-space-y-3">
				{profiles.length === 0 && (
					<div className="pktw-text-sm pktw-text-muted-foreground pktw-text-center pktw-py-8">
						No profiles configured. Add one to get started.
					</div>
				)}
				{profiles.map((p) => (
					<ProfileEditorCard
						key={p.id}
						profile={p}
						isActive={{
							agent: p.id === activeAgentId,
							embedding: p.id === activeEmbeddingId,
						}}
						onDelete={() => handleDelete(p.id)}
						onChange={refresh}
					/>
				))}
			</div>

			{/* Add profile */}
			<div>
				{showPresetPicker ? (
					<PresetPicker onAdd={handleAdd} onCancel={() => setShowPresetPicker(false)} />
				) : (
					<Button variant="outline" size="sm" className="pktw-gap-1" onClick={() => setShowPresetPicker(true)}>
						<Plus size={14} />
						Add Profile
					</Button>
				)}
			</div>
		</div>
	);
}
