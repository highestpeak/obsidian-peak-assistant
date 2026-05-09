# Onboarding Index Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tiered index level configuration to onboarding wizard and settings, with smart provider-aware defaults, progress UI, error handling, and intelligent upgrade prompts for existing users.

**Architecture:** New onboarding Step 2 (IndexConfigStep) lets users pick fast/semantic/full indexing tier with inline embedding config. IndexInitializer gains a `level` parameter to conditionally skip embedding/LLM steps. Settings gets a SearchIndexSection panel. Existing users see a subtle upgrade prompt after 10+ searches without semantic search configured.

**Tech Stack:** React 18, Zustand, Obsidian Plugin API, SQLite (better-sqlite3), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-09-onboarding-index-config-design.md`

---

## Task 1: IndexLevel Type + Settings Fields

**Files:**
- Modify: `src/service/search/index/types.ts:18-106`
- Modify: `src/app/settings/types.ts:33-55,190-242`

- [ ] **Step 1: Add IndexLevel type to index types**

In `src/service/search/index/types.ts`, after the `IndexDocumentReason` type (line 24), add:

```ts
/**
 * User-facing index level, controlling which enrichment steps run.
 * - fast: FTS + graph only (pure local, no API calls)
 * - semantic: fast + embedding vectors (needs embedding endpoint)
 * - full: semantic + LLM tags + summaries (needs LLM model)
 */
export type IndexLevel = 'fast' | 'semantic' | 'full';
```

- [ ] **Step 2: Add `defaultIndexDocumentOptionsForLevel` function**

After the existing `defaultIndexDocumentOptions` function (line 106), add:

```ts
/**
 * Map IndexLevel to IndexDocumentOptions for incremental indexing.
 * Used when new files are detected and need indexing at the user's configured level.
 */
export function defaultIndexDocumentOptionsForLevel(level: IndexLevel): IndexDocumentOptions {
  switch (level) {
    case 'fast':
      return defaultIndexDocumentOptions('listener_fast');
    case 'semantic':
      return {
        ...defaultIndexDocumentOptions('listener_fast'),
        includeEmbeddings: true,
        markVectorPendingWhenSkipped: false,
      };
    case 'full':
      return defaultIndexDocumentOptions('manual_full');
  }
}
```

- [ ] **Step 3: Add settings fields**

In `src/app/settings/types.ts`, add to `SearchSettings` interface (around line 55):

```ts
indexLevel: IndexLevel;
searchUpgradePromptDismissedAt: number | null;
```

Add the import at the top of the file:
```ts
import type { IndexLevel } from '@/service/search/index/types';
```

In the `DEFAULT_SEARCH_SETTINGS` object (around line 73-102), add:

```ts
indexLevel: 'fast' as IndexLevel,
searchUpgradePromptDismissedAt: null,
```

- [ ] **Step 4: Add settings migration for existing users**

In `main.ts` or the settings loading function, after loading settings, add migration logic. Find where settings are loaded (look for `loadData()` in `main.ts`) and after the merge with defaults, add:

```ts
// Auto-detect indexLevel for existing users who already configured embedding
if (!loadedSettings.search.indexLevel || loadedSettings.search.indexLevel === 'fast') {
  const registry = ProfileRegistry.getInstance();
  const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
  if (embProfile?.embeddingEndpoint && embProfile?.embeddingModel) {
    loadedSettings.search.indexLevel = 'semantic';
  }
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/service/search/index/types.ts src/app/settings/types.ts
git commit -m "feat(index): add IndexLevel type + settings fields for tiered indexing"
```

---

## Task 2: IndexInitializer — Level-Aware Staged Indexing

**Files:**
- Modify: `src/service/search/index/indexInitializer.ts:139-246`

- [ ] **Step 1: Add IndexLevel import and error handler type**

At the top of `indexInitializer.ts`, add:

```ts
import type { IndexLevel } from './types';
import { defaultIndexDocumentOptionsForLevel } from './types';

export type IndexErrorAction = 'continue' | 'retry' | 'cancel';
export type IndexErrorHandler = (error: {
  step: string;
  failedCount: number;
  error: Error;
}) => Promise<IndexErrorAction>;
```

- [ ] **Step 2: Update `performStagedFullIndexing` signature**

Change the method signature (around line 139) to accept level and error handler:

```ts
async performStagedFullIndexing(
  showNotification: boolean = true,
  level: IndexLevel = 'full',
  onError?: IndexErrorHandler,
): Promise<void> {
```

- [ ] **Step 3: Gate steps by level**

Inside `performStagedFullIndexing`, wrap the existing Step 2 (vector embeddings, around line 193-198) with a level check:

```ts
// Step 2: Vector embeddings (semantic or full only)
if (level === 'semantic' || level === 'full') {
  // ... existing vector enrichment code ...
  try {
    await this.indexService.runPendingVectorIndexEnrichment();
  } catch (error) {
    if (onError) {
      const action = await onError({ step: 'Embedding generation', failedCount: 0, error: error as Error });
      if (action === 'cancel') return;
      if (action === 'retry') {
        await this.indexService.runPendingVectorIndexEnrichment();
      }
      // 'continue' → proceed to next step
    }
  }
}
```

Wrap Step 3 (LLM enrichment, around line 200-207) similarly:

```ts
// Step 3: LLM tags + summaries (full only)
if (level === 'full') {
  try {
    await this.indexService.runPendingLlmIndexEnrichment();
  } catch (error) {
    if (onError) {
      const action = await onError({ step: 'LLM enrichment', failedCount: 0, error: error as Error });
      if (action === 'cancel') return;
      if (action === 'retry') {
        await this.indexService.runPendingLlmIndexEnrichment();
      }
    }
  }
}
```

- [ ] **Step 4: Update incremental indexing to respect level**

In `performIncrementalIndexing` (around line 234), find where `IndexDocumentOptions` are determined. Replace the hardcoded reason with level-aware options. Find `indexDocumentPaths` calls and update:

```ts
// Read the configured index level from settings
const settings = AppContext.getInstance().settings;
const level: IndexLevel = settings?.search?.indexLevel ?? 'fast';
// Use level-aware options instead of hardcoded 'manual_full'
const opts = defaultIndexDocumentOptionsForLevel(level);
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/service/search/index/indexInitializer.ts
git commit -m "feat(index): level-aware staged indexing with error callback"
```

---

## Task 3: IndexConfigStep Component

**Files:**
- Create: `src/ui/view/modals/onboarding/IndexConfigStep.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/ui/view/modals/onboarding/IndexConfigStep.tsx

import React, { useState, useEffect } from 'react';
import { Button } from '@/ui/component/shadcn/button';
import { Database, Sparkles, Brain, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import type { IndexLevel } from '@/service/search/index/types';
import { ProfileRegistry } from '@/app/settings/ProfileRegistry';
import { testProviderConnection } from '@/core/providers/testProviderConnection';

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

const TIERS: Array<{ level: IndexLevel; label: string; description: string; time: string; icon: React.ReactNode }> = [
  { level: 'fast', label: 'Quick Index', description: 'Full-text search + knowledge graph. Pure local, no API calls.', time: '~30 seconds', icon: <Database className="pktw-w-5 pktw-h-5" /> },
  { level: 'semantic', label: '+ Semantic Search', description: 'Vector embeddings for meaning-based search. Requires embedding model.', time: '~5 minutes', icon: <Sparkles className="pktw-w-5 pktw-h-5" /> },
  { level: 'full', label: '+ Smart Enrichment', description: 'LLM-generated tags and summaries. Improves Graph Inspector and Copilot.', time: '~30 minutes', icon: <Brain className="pktw-w-5 pktw-h-5" /> },
];

export function IndexConfigStep({ onNext, onBack, onSkip }: Props) {
  // Detect provider kind for smart defaults
  const registry = ProfileRegistry.getInstance();
  const activeProfile = registry.getActiveAgentProfile();
  const providerKind = activeProfile?.kind ?? 'custom';
  const preset = EMBEDDING_PRESETS[providerKind];
  const hasEmbeddingApi = preset !== null;

  // Default tier based on provider
  const defaultLevel: IndexLevel = (providerKind === 'openai' || providerKind === 'google') ? 'semantic' : 'fast';

  const [selectedLevel, setSelectedLevel] = useState<IndexLevel>(defaultLevel);
  const [embEndpoint, setEmbEndpoint] = useState(preset?.endpoint ?? '');
  const [embModel, setEmbModel] = useState(preset?.model ?? '');
  const [embApiKey, setEmbApiKey] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [showEmbConfig, setShowEmbConfig] = useState(selectedLevel !== 'fast');

  useEffect(() => {
    setShowEmbConfig(selectedLevel !== 'fast');
  }, [selectedLevel]);

  const handleTestConnection = async () => {
    setTestStatus('testing');
    try {
      const res = await fetch(`${embEndpoint}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(embApiKey ? { Authorization: `Bearer ${embApiKey}` } : {}),
        },
        body: JSON.stringify({ model: embModel, input: ['test'] }),
      });
      setTestStatus(res.ok ? 'success' : 'fail');
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
    <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-p-4">
      <span className="pktw-text-lg pktw-font-semibold">Index Configuration</span>
      <span className="pktw-text-sm pktw-text-muted-foreground">
        Choose how deeply to index your vault. You can upgrade anytime in Settings.
      </span>

      <div className="pktw-flex pktw-flex-col pktw-gap-2">
        {TIERS.map(tier => (
          <div
            key={tier.level}
            onClick={() => setSelectedLevel(tier.level)}
            className={`pktw-flex pktw-items-center pktw-gap-3 pktw-p-3 pktw-rounded-md pktw-cursor-pointer pktw-border ${
              selectedLevel === tier.level
                ? 'pktw-border-[var(--interactive-accent)] pktw-bg-[var(--background-modifier-active-hover)]'
                : 'pktw-border-[var(--background-modifier-border)] hover:pktw-bg-[var(--background-modifier-hover)]'
            }`}
          >
            <input
              type="radio"
              checked={selectedLevel === tier.level}
              onChange={() => setSelectedLevel(tier.level)}
              className="pktw-shrink-0"
            />
            <div className="pktw-flex-1">
              <div className="pktw-flex pktw-items-center pktw-gap-2">
                {tier.icon}
                <span className="pktw-font-medium">{tier.label}</span>
                <span className="pktw-text-xs pktw-text-muted-foreground">{tier.time}</span>
              </div>
              <span className="pktw-text-xs pktw-text-muted-foreground">{tier.description}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Embedding config (expanded when semantic or full selected) */}
      {showEmbConfig && (
        <div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-p-3 pktw-rounded-md pktw-border pktw-border-[var(--background-modifier-border)]">
          <span className="pktw-text-sm pktw-font-medium">Embedding Configuration</span>

          {noEmbeddingWarning && (
            <span className="pktw-text-xs pktw-text-[var(--text-warning)]">
              {providerKind === 'anthropic'
                ? "Anthropic doesn't provide embeddings. Use a separate embedding provider or stay with Quick Index."
                : "This provider doesn't have a default embedding endpoint. Enter one manually."}
            </span>
          )}

          {preset?.hint && (
            <span className="pktw-text-xs pktw-text-muted-foreground">{preset.hint}</span>
          )}

          <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
            <label className="pktw-text-xs pktw-text-muted-foreground">Endpoint</label>
            <input
              type="text"
              value={embEndpoint}
              onChange={e => { setEmbEndpoint(e.target.value); setTestStatus('idle'); }}
              placeholder="https://api.openai.com/v1"
              className="pktw-w-full pktw-px-2 pktw-py-1 pktw-text-sm pktw-rounded pktw-border pktw-border-[var(--background-modifier-border)] pktw-bg-[var(--background-primary)]"
            />
          </div>

          <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
            <label className="pktw-text-xs pktw-text-muted-foreground">Model</label>
            <input
              type="text"
              value={embModel}
              onChange={e => { setEmbModel(e.target.value); setTestStatus('idle'); }}
              placeholder="text-embedding-3-small"
              className="pktw-w-full pktw-px-2 pktw-py-1 pktw-text-sm pktw-rounded pktw-border pktw-border-[var(--background-modifier-border)] pktw-bg-[var(--background-primary)]"
            />
          </div>

          <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
            <label className="pktw-text-xs pktw-text-muted-foreground">API Key (optional, uses provider key if blank)</label>
            <input
              type="password"
              value={embApiKey}
              onChange={e => { setEmbApiKey(e.target.value); setTestStatus('idle'); }}
              placeholder="sk-..."
              className="pktw-w-full pktw-px-2 pktw-py-1 pktw-text-sm pktw-rounded pktw-border pktw-border-[var(--background-modifier-border)] pktw-bg-[var(--background-primary)]"
            />
          </div>

          <div className="pktw-flex pktw-items-center pktw-gap-2">
            <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testStatus === 'testing' || !embEndpoint || !embModel}>
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </Button>
            {testStatus === 'success' && <span className="pktw-text-xs pktw-text-green-600 pktw-flex pktw-items-center pktw-gap-1"><CheckCircle2 className="pktw-w-3 pktw-h-3" /> Connected</span>}
            {testStatus === 'fail' && <span className="pktw-text-xs pktw-text-red-600 pktw-flex pktw-items-center pktw-gap-1"><XCircle className="pktw-w-3 pktw-h-3" /> Failed</span>}
          </div>
        </div>
      )}

      <div className="pktw-flex pktw-justify-between pktw-pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <div className="pktw-flex pktw-gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip}>Skip</Button>
          <Button size="sm" onClick={handleNext}>Start Indexing</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the directory if needed**

```bash
mkdir -p src/ui/view/modals/onboarding
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/modals/onboarding/IndexConfigStep.tsx
git commit -m "feat(onboarding): add IndexConfigStep with tiered selection + embedding config"
```

---

## Task 4: IndexProgressDisplay + IndexErrorDialog

**Files:**
- Create: `src/ui/view/modals/onboarding/IndexProgressDisplay.tsx`
- Create: `src/ui/view/modals/onboarding/IndexErrorDialog.tsx`

- [ ] **Step 1: Create IndexProgressDisplay**

```tsx
// src/ui/view/modals/onboarding/IndexProgressDisplay.tsx

import React from 'react';
import { Loader2 } from 'lucide-react';

type Props = {
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  processedFiles: number;
  totalFiles: number;
  isComplete: boolean;
};

export function IndexProgressDisplay({ currentStep, totalSteps, stepLabel, processedFiles, totalFiles, isComplete }: Props) {
  const progress = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0;

  if (isComplete) {
    return (
      <div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-p-4 pktw-text-center">
        <span className="pktw-text-sm pktw-font-medium pktw-text-green-600">Indexing complete</span>
        <span className="pktw-text-xs pktw-text-muted-foreground">{totalFiles} files indexed</span>
      </div>
    );
  }

  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-p-4">
      <div className="pktw-flex pktw-items-center pktw-gap-2">
        <Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin" />
        <span className="pktw-text-sm pktw-font-medium">Indexing vault...</span>
      </div>
      <span className="pktw-text-xs pktw-text-muted-foreground">
        Step {currentStep}/{totalSteps}: {stepLabel}
      </span>
      <div className="pktw-w-full pktw-h-2 pktw-rounded-full pktw-bg-[var(--background-modifier-border)]">
        <div
          className="pktw-h-full pktw-rounded-full pktw-bg-[var(--interactive-accent)] pktw-transition-all pktw-duration-300"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="pktw-text-xs pktw-text-muted-foreground pktw-text-right">
        {processedFiles} / {totalFiles} files
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create IndexErrorDialog**

```tsx
// src/ui/view/modals/onboarding/IndexErrorDialog.tsx

import React from 'react';
import { Button } from '@/ui/component/shadcn/button';
import { AlertTriangle } from 'lucide-react';
import type { IndexErrorAction } from '@/service/search/index/indexInitializer';

type Props = {
  step: string;
  failedCount: number;
  errorMessage: string;
  onAction: (action: IndexErrorAction) => void;
};

export function IndexErrorDialog({ step, failedCount, errorMessage, onAction }: Props) {
  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-3 pktw-p-4 pktw-rounded-md pktw-border pktw-border-[var(--background-modifier-border)] pktw-bg-[var(--background-primary)]">
      <div className="pktw-flex pktw-items-center pktw-gap-2">
        <AlertTriangle className="pktw-w-5 pktw-h-5 pktw-text-[var(--text-warning)]" />
        <span className="pktw-text-sm pktw-font-medium">{step} failed</span>
      </div>
      <span className="pktw-text-xs pktw-text-muted-foreground">
        {failedCount > 0 ? `${failedCount} files could not be processed.` : 'Connection failed.'}
      </span>
      <span className="pktw-text-xs pktw-text-muted-foreground pktw-font-mono">
        {errorMessage}
      </span>
      <div className="pktw-flex pktw-gap-2 pktw-justify-end">
        <Button variant="ghost" size="sm" onClick={() => onAction('continue')}>Continue without</Button>
        <Button variant="outline" size="sm" onClick={() => onAction('retry')}>Retry</Button>
        <Button variant="outline" size="sm" onClick={() => onAction('cancel')}>Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/modals/onboarding/IndexProgressDisplay.tsx src/ui/view/modals/onboarding/IndexErrorDialog.tsx
git commit -m "feat(onboarding): add IndexProgressDisplay and IndexErrorDialog components"
```

---

## Task 5: OnboardingModal Integration

**Files:**
- Modify: `src/ui/view/modals/OnboardingModal.tsx:469-482`

- [ ] **Step 1: Update TOTAL_STEPS and add imports**

At the top of `OnboardingModal.tsx`, add imports:

```ts
import { IndexConfigStep } from './onboarding/IndexConfigStep';
import { IndexProgressDisplay } from './onboarding/IndexProgressDisplay';
import { IndexErrorDialog } from './onboarding/IndexErrorDialog';
import type { IndexLevel } from '@/service/search/index/types';
import type { IndexErrorAction } from '@/service/search/index/indexInitializer';
```

Change `TOTAL_STEPS` (line 469) from `3` to `4`.

- [ ] **Step 2: Add index-related state to OnboardingWizard**

In the `OnboardingWizard` component (around line 471), add state:

```ts
const [indexLevel, setIndexLevel] = useState<IndexLevel>('fast');
const [embeddingConfig, setEmbeddingConfig] = useState<{ endpoint: string; model: string; apiKey: string } | null>(null);
const [isIndexing, setIsIndexing] = useState(false);
const [indexProgress, setIndexProgress] = useState({ step: 0, total: 0, label: '', processed: 0, totalFiles: 0, complete: false });
const [indexError, setIndexError] = useState<{ step: string; failedCount: number; errorMessage: string } | null>(null);
const [errorResolver, setErrorResolver] = useState<((action: IndexErrorAction) => void) | null>(null);
```

- [ ] **Step 3: Add IndexConfigStep handler**

```ts
const handleIndexConfigNext = (level: IndexLevel, embConfig?: { endpoint: string; model: string; apiKey: string }) => {
  setIndexLevel(level);
  if (embConfig) {
    setEmbeddingConfig(embConfig);
    // Save embedding config to active profile
    const registry = ProfileRegistry.getInstance();
    const profile = registry.getActiveAgentProfile();
    if (profile) {
      registry.updateProfile(profile.id, {
        embeddingEndpoint: embConfig.endpoint,
        embeddingModel: embConfig.model,
        embeddingApiKey: embConfig.apiKey || null,
      });
    }
  }
  // Save index level to settings
  const ctx = AppContext.getInstance();
  if (ctx.settings) {
    ctx.settings.search.indexLevel = level;
    ctx.plugin.saveSettings();
  }
  setStep(2); // Move to System Check (now step 2)
};

const handleIndexSkip = () => {
  const ctx = AppContext.getInstance();
  if (ctx.settings) {
    ctx.settings.search.indexLevel = 'fast';
    ctx.plugin.saveSettings();
  }
  setStep(2);
};
```

- [ ] **Step 4: Update SystemCheckStep to trigger indexing after SQLite init**

In the `SystemCheckStep` component's success handler (after `initSqlite()` succeeds, around line 415-420), add indexing trigger:

```ts
// After SQLite init succeeds:
if (indexLevel !== 'fast' || true) { // Always index on first setup
  setIsIndexing(true);
  const initializer = IndexInitializer.getInstance();
  const errorHandler = async (err: { step: string; failedCount: number; error: Error }) => {
    return new Promise<IndexErrorAction>((resolve) => {
      setIndexError({ step: err.step, failedCount: err.failedCount, errorMessage: err.error.message });
      setErrorResolver(() => (action: IndexErrorAction) => {
        setIndexError(null);
        setErrorResolver(null);
        resolve(action);
      });
    });
  };
  try {
    await initializer.performStagedFullIndexing(false, indexLevel, errorHandler);
  } catch (error) {
    console.error('[Onboarding] Indexing failed:', error);
  }
  setIsIndexing(false);
  setIndexProgress(prev => ({ ...prev, complete: true }));
}
```

- [ ] **Step 5: Insert IndexConfigStep into step rendering**

Update the step rendering block (around line 471-482). Shift existing step numbers:

```tsx
{step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
{step === 1 && <ProviderStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
{step === 2 && <IndexConfigStep
  onNext={handleIndexConfigNext}
  onBack={() => setStep(1)}
  onSkip={handleIndexSkip}
/>}
{step === 3 && (
  <>
    <SystemCheckStep onClose={onClose} />
    {isIndexing && !indexError && (
      <IndexProgressDisplay
        currentStep={indexProgress.step}
        totalSteps={indexProgress.total}
        stepLabel={indexProgress.label}
        processedFiles={indexProgress.processed}
        totalFiles={indexProgress.totalFiles}
        isComplete={indexProgress.complete}
      />
    )}
    {indexError && errorResolver && (
      <IndexErrorDialog
        step={indexError.step}
        failedCount={indexError.failedCount}
        errorMessage={indexError.errorMessage}
        onAction={errorResolver}
      />
    )}
  </>
)}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/view/modals/OnboardingModal.tsx
git commit -m "feat(onboarding): integrate IndexConfigStep as step 2, trigger indexing after SQLite init"
```

---

## Task 6: SearchIndexSection in Settings

**Files:**
- Create: `src/ui/view/settings/SearchIndexSection.tsx`
- Modify: `src/ui/view/settings/SearchTab.tsx` (or equivalent search settings tab)

- [ ] **Step 1: Create SearchIndexSection**

```tsx
// src/ui/view/settings/SearchIndexSection.tsx

import React, { useState } from 'react';
import { Button } from '@/ui/component/shadcn/button';
import { Database, Sparkles, Brain, RefreshCw } from 'lucide-react';
import type { IndexLevel } from '@/service/search/index/types';
import { AppContext } from '@/app/AppContext';
import { ProfileRegistry } from '@/app/settings/ProfileRegistry';
import { IndexInitializer } from '@/service/search/index/indexInitializer';
import type { IndexErrorAction } from '@/service/search/index/indexInitializer';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

const LEVEL_LABELS: Record<IndexLevel, { label: string; icon: React.ReactNode; description: string }> = {
  fast: { label: 'Quick Index', icon: <Database className="pktw-w-4 pktw-h-4" />, description: 'Full-text search + graph only' },
  semantic: { label: 'Semantic Search', icon: <Sparkles className="pktw-w-4 pktw-h-4" />, description: 'Includes vector embeddings' },
  full: { label: 'Full Enrichment', icon: <Brain className="pktw-w-4 pktw-h-4" />, description: 'Includes LLM tags + summaries' },
};

export function SearchIndexSection() {
  const ctx = AppContext.getInstance();
  const settings = ctx.settings;
  const currentLevel: IndexLevel = settings?.search?.indexLevel ?? 'fast';

  const [isRebuilding, setIsRebuilding] = useState(false);

  const registry = ProfileRegistry.getInstance();
  const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
  const hasEmbedding = !!(embProfile?.embeddingEndpoint && embProfile?.embeddingModel);

  // Get index stats
  const getStats = () => {
    try {
      const repo = sqliteStoreManager.getIndexedDocumentRepo('vault');
      const total = repo?.countAll?.() ?? 0;
      return { total };
    } catch { return { total: 0 }; }
  };
  const stats = getStats();

  const handleLevelChange = async (newLevel: IndexLevel) => {
    if (!settings) return;
    if (newLevel !== 'fast' && !hasEmbedding) {
      // Can't upgrade without embedding configured
      return;
    }
    settings.search.indexLevel = newLevel;
    await ctx.plugin.saveSettings();

    // If upgrading, trigger enrichment for pending files
    if (newLevel === 'semantic' || newLevel === 'full') {
      setIsRebuilding(true);
      try {
        const initializer = IndexInitializer.getInstance();
        await initializer.performStagedFullIndexing(true, newLevel);
      } catch (error) {
        console.error('[Settings] Index upgrade failed:', error);
      }
      setIsRebuilding(false);
    }
  };

  const handleRebuild = async () => {
    setIsRebuilding(true);
    try {
      const initializer = IndexInitializer.getInstance();
      await initializer.performStagedFullIndexing(true, currentLevel);
    } catch (error) {
      console.error('[Settings] Index rebuild failed:', error);
    }
    setIsRebuilding(false);
  };

  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-4">
      <span className="pktw-text-base pktw-font-semibold">Search Index</span>

      {/* Current level */}
      <div className="pktw-flex pktw-items-center pktw-gap-3">
        <span className="pktw-text-sm pktw-text-muted-foreground">Current level:</span>
        <select
          value={currentLevel}
          onChange={e => handleLevelChange(e.target.value as IndexLevel)}
          disabled={isRebuilding}
          className="pktw-px-2 pktw-py-1 pktw-text-sm pktw-rounded pktw-border pktw-border-[var(--background-modifier-border)] pktw-bg-[var(--background-primary)]"
        >
          <option value="fast">Quick Index</option>
          <option value="semantic" disabled={!hasEmbedding}>+ Semantic Search{!hasEmbedding ? ' (configure embedding first)' : ''}</option>
          <option value="full" disabled={!hasEmbedding}>+ Full Enrichment{!hasEmbedding ? ' (configure embedding first)' : ''}</option>
        </select>
      </div>

      {!hasEmbedding && currentLevel === 'fast' && (
        <span className="pktw-text-xs pktw-text-muted-foreground">
          Configure embedding endpoint in your profile to enable semantic search.
        </span>
      )}

      {/* Stats */}
      <div className="pktw-text-xs pktw-text-muted-foreground">
        Indexed files: {stats.total}
      </div>

      {/* Rebuild button */}
      <div className="pktw-flex pktw-gap-2">
        <Button variant="outline" size="sm" onClick={handleRebuild} disabled={isRebuilding}>
          <RefreshCw className={`pktw-w-3 pktw-h-3 pktw-mr-1 ${isRebuilding ? 'pktw-animate-spin' : ''}`} />
          {isRebuilding ? 'Rebuilding...' : 'Rebuild Index'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add SearchIndexSection to SearchTab**

In `src/ui/view/settings/SearchTab.tsx`, import and render the new section:

```tsx
import { SearchIndexSection } from './SearchIndexSection';

// In the component's return, add at the top of the settings content:
<SearchIndexSection />
<div className="pktw-border-b pktw-border-[var(--background-modifier-border)] pktw-my-4" />
// ... existing search settings ...
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/settings/SearchIndexSection.tsx src/ui/view/settings/SearchTab.tsx
git commit -m "feat(settings): add Search Index section with level control and rebuild"
```

---

## Task 7: SearchUpgradePrompt

**Files:**
- Create: `src/ui/view/quick-search/components/SearchUpgradePrompt.tsx`
- Modify: `src/ui/view/quick-search/tab-VaultSearch.tsx:191-243`

- [ ] **Step 1: Create SearchUpgradePrompt component**

```tsx
// src/ui/view/quick-search/components/SearchUpgradePrompt.tsx

import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AppContext } from '@/app/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export function SearchUpgradePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const ctx = AppContext.getInstance();
      const settings = ctx.settings;
      if (!settings) return;

      // Only show if indexLevel is 'fast'
      if (settings.search.indexLevel !== 'fast') return;

      // Check dismiss cooldown (7 days)
      const dismissedAt = settings.search.searchUpgradePromptDismissedAt;
      if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;

      // Check search count (≥ 10)
      const db = sqliteStoreManager.getDatabase('vault');
      if (!db) return;
      const row = db.prepare('SELECT COUNT(*) as cnt FROM search_click').get() as { cnt: number } | undefined;
      if (!row || row.cnt < 10) return;

      setVisible(true);
    } catch {
      // Non-critical — don't show prompt if anything fails
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      const ctx = AppContext.getInstance();
      if (ctx.settings) {
        ctx.settings.search.searchUpgradePromptDismissedAt = Date.now();
        ctx.plugin.saveSettings();
      }
    } catch {}
  };

  const handleOpenSettings = () => {
    try {
      const ctx = AppContext.getInstance();
      // Open settings tab
      (ctx.app as any).setting?.open?.();
    } catch {}
  };

  if (!visible) return null;

  return (
    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-text-muted-foreground pktw-border-l-2 pktw-border-[var(--interactive-accent)]">
      <Sparkles className="pktw-w-3 pktw-h-3 pktw-shrink-0" />
      <span>
        Enable semantic search for better results
        <span
          className="pktw-ml-1 pktw-underline pktw-cursor-pointer hover:pktw-text-[var(--text-normal)]"
          onClick={handleOpenSettings}
        >
          → Settings
        </span>
      </span>
      <button onClick={handleDismiss} className="pktw-ml-auto pktw-p-0.5 pktw-rounded hover:pktw-bg-[var(--background-modifier-hover)]">
        <X className="pktw-w-3 pktw-h-3" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add SearchUpgradePrompt to tab-VaultSearch**

In `src/ui/view/quick-search/tab-VaultSearch.tsx`, add import:

```tsx
import { SearchUpgradePrompt } from './components/SearchUpgradePrompt';
```

Insert the prompt at the bottom of the results scroll container (around line 240, after the results map and before the closing `</div>` of the scroll container):

```tsx
{/* Smart upgrade prompt for existing users */}
<SearchUpgradePrompt />
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/SearchUpgradePrompt.tsx src/ui/view/quick-search/tab-VaultSearch.tsx
git commit -m "feat(search): add smart upgrade prompt for users without semantic search"
```

---

## Dependency Graph

```
Task 1 (Types + Settings) ──┐
                             ├── Task 2 (IndexInitializer) ──┐
                             ├── Task 3 (IndexConfigStep) ───┤
                             │                                ├── Task 5 (OnboardingModal)
                             ├── Task 4 (Progress + Error) ──┘
                             ├── Task 6 (SearchIndexSection)
                             └── Task 7 (SearchUpgradePrompt)
```

**Parallelizable:**
- Tasks 2, 3, 4, 6, 7 — all depend only on Task 1
- Task 5 — depends on 2, 3, 4 (integration)
