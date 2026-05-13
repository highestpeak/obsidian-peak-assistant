// src/ui/view/modals/onboarding/IndexConfigStep.tsx

import React, { useState, useEffect } from 'react';
import { requestUrl } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { Database, Sparkles, Brain, CheckCircle2, XCircle } from 'lucide-react';
import type { IndexLevel } from '@/service/search/index/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { cn } from '@/ui/react/lib/utils';

type EmbeddingPreset = {
	endpoint: string;
	model: string;
	hint?: string;
};

const EMBEDDING_PRESETS: Record<string, EmbeddingPreset | null> = {
	openai: { endpoint: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
	google: { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'text-embedding-004' },
	ollama: { endpoint: 'http://localhost:11434/v1', model: 'nomic-embed-text', hint: 'Run: ollama pull nomic-embed-text' },
	anthropic: null,
	openrouter: null,
	perplexity: null,
	litellm: { endpoint: '', model: '', hint: 'Enter your LiteLLM embedding endpoint' },
	custom: { endpoint: '', model: '' },
};

type Props = {
	onNext: (level: IndexLevel, embeddingConfig?: { endpoint: string; model: string; apiKey: string }) => void;
	onBack: () => void;
	onSkip: () => void;
};

const TIERS: Array<{
	level: IndexLevel;
	label: string;
	description: string;
	time: string;
	Icon: React.FC<{ className?: string }>;
}> = [
	{
		level: 'fast',
		label: 'Quick Index',
		description: 'Full-text search + knowledge graph. Pure local, no API calls.',
		time: '~30 seconds',
		Icon: Database,
	},
	{
		level: 'semantic',
		label: '+ Semantic Search',
		description: 'Vector embeddings for meaning-based search. Requires embedding model.',
		time: '~5 minutes',
		Icon: Sparkles,
	},
	{
		level: 'full',
		label: '+ Smart Enrichment',
		description: 'LLM-generated tags and summaries. Improves Graph Inspector and Copilot.',
		time: '~30 minutes',
		Icon: Brain,
	},
];

export function IndexConfigStep({ onNext, onBack, onSkip }: Props) {
	const registry = ProfileRegistry.getInstance();
	const activeProfile = registry.getActiveAgentProfile();
	const providerKind = activeProfile?.kind ?? 'custom';
	const preset = EMBEDDING_PRESETS[providerKind] ?? null;
	const hasEmbeddingApi = preset !== null;

	const defaultLevel: IndexLevel =
		providerKind === 'openai' || providerKind === 'google' ? 'semantic' : 'fast';

	const [selectedLevel, setSelectedLevel] = useState<IndexLevel>(defaultLevel);
	const [embEndpoint, setEmbEndpoint] = useState(preset?.endpoint ?? '');
	const [embModel, setEmbModel] = useState(preset?.model ?? '');
	const [embApiKey, setEmbApiKey] = useState('');
	const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');

	const showEmbConfig = selectedLevel !== 'fast';

	useEffect(() => {
		if (selectedLevel === 'fast') {
			setTestStatus('idle');
		}
	}, [selectedLevel]);

	const handleTestConnection = async () => {
		if (!embEndpoint || !embModel) return;
		setTestStatus('testing');
		try {
			const res = await requestUrl({
				url: `${embEndpoint}/embeddings`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(embApiKey ? { Authorization: `Bearer ${embApiKey}` } : {}),
				},
				body: JSON.stringify({ model: embModel, input: ['test'] }),
				throw: false,
			});
			setTestStatus(res.status >= 200 && res.status < 300 ? 'success' : 'fail');
		} catch {
			setTestStatus('fail');
		}
	};

	const handleNext = () => {
		if (selectedLevel === 'fast') {
			onNext('fast');
		} else {
			onNext(selectedLevel, { endpoint: embEndpoint, model: embModel, apiKey: embApiKey });
		}
	};

	const noEmbeddingWarning = !hasEmbeddingApi && selectedLevel !== 'fast';

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
			<span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
				Index Configuration
			</span>
			<span className="pktw-text-sm pktw-text-[--text-muted]">
				Choose how deeply to index your vault. You can upgrade anytime in Settings.
			</span>

			<div className="pktw-flex pktw-flex-col pktw-gap-2">
				{TIERS.map(({ level, label, description, time, Icon }) => (
					<div
						key={level}
						onClick={() => setSelectedLevel(level)}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-3 pktw-p-3 pktw-rounded-md pktw-cursor-pointer pktw-border pktw-transition-colors peak-soft-hover-card',
							selectedLevel === level
								? 'is-selected pktw-border-pk-accent pktw-bg-pk-highlight'
								: 'pktw-border-[--background-modifier-border]',
						)}
					>
						<input
							type="radio"
							checked={selectedLevel === level}
							onChange={() => setSelectedLevel(level)}
							className="pktw-shrink-0"
							onClick={(e) => e.stopPropagation()}
						/>
						<div className="pktw-flex-1">
							<div className="pktw-flex pktw-items-center pktw-gap-2">
								<Icon className="pktw-w-4 pktw-h-4 pktw-text-pk-foreground-muted pktw-shrink-0 peak-card-icon" />
								<span className="pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">
									{label}
								</span>
								<span className="pktw-text-xs pktw-text-[--text-muted]">{time}</span>
							</div>
							<span className="pktw-text-xs pktw-text-[--text-muted]">{description}</span>
						</div>
					</div>
				))}
			</div>

			{/* Embedding config — shown when semantic or full is selected */}
			{showEmbConfig && (
				<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-p-3 pktw-rounded-md pktw-border pktw-border-[--background-modifier-border] pktw-bg-[--background-primary-alt]">
					<span className="pktw-text-sm pktw-font-medium pktw-text-[--text-normal]">
						Embedding Configuration
					</span>

					{noEmbeddingWarning && (
						<span className="pktw-text-xs pktw-text-[--text-warning]">
							{providerKind === 'anthropic'
								? "Anthropic doesn't provide embeddings. Use a separate embedding provider or stay with Quick Index."
								: "This provider doesn't have a default embedding endpoint. Enter one manually."}
						</span>
					)}

					{preset?.hint && (
						<span className="pktw-text-xs pktw-text-[--text-muted]">{preset.hint}</span>
					)}

					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<label className="pktw-text-xs pktw-text-[--text-muted]">Endpoint</label>
						<input
							type="text"
							value={embEndpoint}
							onChange={(e) => { setEmbEndpoint(e.target.value); setTestStatus('idle'); }}
							placeholder="https://api.openai.com/v1"
							className="pktw-w-full pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-rounded-md pktw-border pktw-border-[--background-modifier-border] pktw-bg-[--background-primary] pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent]"
						/>
					</div>

					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<label className="pktw-text-xs pktw-text-[--text-muted]">Model</label>
						<input
							type="text"
							value={embModel}
							onChange={(e) => { setEmbModel(e.target.value); setTestStatus('idle'); }}
							placeholder="text-embedding-3-small"
							className="pktw-w-full pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-rounded-md pktw-border pktw-border-[--background-modifier-border] pktw-bg-[--background-primary] pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent]"
						/>
					</div>

					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<label className="pktw-text-xs pktw-text-[--text-muted]">
							API Key <span className="pktw-opacity-60">(optional — uses provider key if blank)</span>
						</label>
						<input
							type="password"
							value={embApiKey}
							onChange={(e) => { setEmbApiKey(e.target.value); setTestStatus('idle'); }}
							placeholder="sk-..."
							className="pktw-w-full pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-rounded-md pktw-border pktw-border-[--background-modifier-border] pktw-bg-[--background-primary] pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent]"
						/>
					</div>

					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-pt-1">
						<Button
							variant="outline"
							size="sm"
							onClick={handleTestConnection}
							disabled={testStatus === 'testing' || !embEndpoint || !embModel}
						>
							{testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
						</Button>
						{testStatus === 'success' && (
							<span className="pktw-text-xs pktw-text-green-600 pktw-flex pktw-items-center pktw-gap-1">
								<CheckCircle2 className="pktw-w-3 pktw-h-3" /> Connected
							</span>
						)}
						{testStatus === 'fail' && (
							<span className="pktw-text-xs pktw-text-red-500 pktw-flex pktw-items-center pktw-gap-1">
								<XCircle className="pktw-w-3 pktw-h-3" /> Failed
							</span>
						)}
					</div>
				</div>
			)}

			<div className="pktw-flex pktw-justify-between pktw-pt-1">
				<Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
					Back
				</Button>
				<div className="pktw-flex pktw-gap-2">
					<Button variant="ghost" size="sm" onClick={onSkip}>
						Skip
					</Button>
					<Button size="sm" onClick={handleNext}>
						Start Indexing
					</Button>
				</div>
			</div>
		</div>
	);
}
