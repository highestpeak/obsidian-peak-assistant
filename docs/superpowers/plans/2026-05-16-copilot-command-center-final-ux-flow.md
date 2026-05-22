# Copilot Command Center Final UX Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the final Copilot / Command Center UX flow: image-first entry panel, one ReAct Agent Run, multi-artifact review shell, rendered document diff, interactive Insights, and complete Document / Vault / Setting routing.

**Architecture:** Keep the existing `CopilotActionRegistry`, `intent-hub`, `CopilotAutoPlanner`, and action execution backend. Add a shared artifact model and review shell above existing actions so Auto and manual intents both produce `Changes`, `Insights`, `Sources`, `Chat`, and `Trace` artifacts. Replace the current Auto run result list with one unified review surface whose default tab depends on whether change artifacts exist.

**Tech Stack:** React 18, Obsidian Modal, existing shadcn `Button` / `Input`, Lucide React icons, `CopilotActionRegistry`, `CopilotAutoPlanner`, `CopilotAutoRunModal`, `CopilotResultModal`, `V2ToolStep`, `CopilotStepTimeline`, existing diff components under `src/ui/component/diff/`, targeted `npm run test -- test/<file>.test.ts`, and `npm run build`.

**Spec:** `docs/superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md`

**Visual Source:** `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow.html`

---

## Current Code Map

Already present:

- `src/service/copilot/intent-hub.ts` defines `Document / Vault / Setting`.
- `src/service/copilot/CopilotAutoPlanner.ts` selects top capabilities for Auto.
- `src/ui/view/copilot/CopilotPickerModal.tsx` renders a tabbed entry panel.
- `src/ui/view/copilot/CopilotAutoRunModal.tsx` runs selected capabilities but currently displays per-capability cards.
- `src/ui/view/copilot/CopilotResultModal.tsx` runs one action and delegates to each action's `ResultPanel`.
- `src/ui/view/copilot/components/CopilotStepTimeline.tsx` renders AI Analysis-style steps.
- `src/ui/component/diff/DiffView.tsx` and `src/ui/component/diff/wordDiff.ts` provide existing diff primitives.

Main gaps:

- No shared run artifact model.
- Auto run does not merge capability results into one review shell.
- Manual write actions still rely on per-action panels.
- Insights are not a first-class interactive artifact with resizable layout.
- Sources/provenance are not unified across diff and insight artifacts.
- Vault and Setting flows are mapped at entry level, but not yet represented as full review workflows.

---

### Task 1: Add Shared Copilot Artifact Model

**Files:**
- Create: `src/service/copilot/CopilotRunArtifacts.ts`
- Test: `test/copilot-run-artifacts.test.ts`

- [ ] **Step 1: Write failing artifact tests**

Create `test/copilot-run-artifacts.test.ts`:

```ts
import assert from 'assert';
import {
	createEmptyCopilotRunArtifacts,
	getDefaultReviewTab,
	mergeCapabilityArtifact,
	type CopilotRunArtifacts,
} from '../src/service/copilot/CopilotRunArtifacts';

const empty = createEmptyCopilotRunArtifacts();
assert.equal(getDefaultReviewTab(empty), 'insights');

let artifacts: CopilotRunArtifacts = createEmptyCopilotRunArtifacts();
artifacts = mergeCapabilityArtifact(artifacts, {
	id: 'change-1',
	type: 'change',
	title: 'Improve paragraph',
	provenance: [{ capabilityId: 'polish', label: 'Improve note' }],
	blocks: [{
		id: 'block-1',
		heading: 'Current Focus',
		before: 'Old text',
		after: 'New text',
		provenance: [{ capabilityId: 'polish', label: 'Improve note' }],
	}],
});

assert.equal(artifacts.changes.length, 1);
assert.equal(getDefaultReviewTab(artifacts), 'changes');

artifacts = mergeCapabilityArtifact(artifacts, {
	id: 'insight-1',
	type: 'insight',
	title: 'Risk: weak evidence',
	severity: 'medium',
	body: 'The note makes a claim without source support.',
	provenance: [{ capabilityId: 'add-evidence', label: 'Add evidence' }],
	actions: [{ id: 'create-proposal', label: 'Create proposal', kind: 'create-proposal' }],
});

assert.equal(artifacts.insights.length, 1);
assert.equal(artifacts.allProvenance.length, 2);
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- test/copilot-run-artifacts.test.ts
```

Expected: FAIL because `CopilotRunArtifacts.ts` does not exist.

- [ ] **Step 3: Implement artifact model**

Create `src/service/copilot/CopilotRunArtifacts.ts`:

```ts
export type CopilotReviewTab = 'changes' | 'insights' | 'sources' | 'chat' | 'trace';

export interface ArtifactProvenance {
	capabilityId: string;
	label: string;
	sourcePath?: string;
	sourceTitle?: string;
	signal?: 'selection' | 'semantic' | 'graph' | 'backlink' | 'tag' | 'hub' | 'task' | 'agent';
	confidence?: number;
}

export interface ChangeBlockArtifact {
	id: string;
	heading?: string;
	before: string;
	after: string;
	provenance: ArtifactProvenance[];
	selected?: boolean;
}

export interface ChangeArtifact {
	id: string;
	type: 'change';
	title: string;
	provenance: ArtifactProvenance[];
	blocks: ChangeBlockArtifact[];
}

export interface InsightArtifact {
	id: string;
	type: 'insight';
	title: string;
	body: string;
	severity?: 'info' | 'low' | 'medium' | 'high';
	provenance: ArtifactProvenance[];
	actions?: Array<{
		id: string;
		label: string;
		kind: 'ask-follow-up' | 'open-source' | 'save-to-note' | 'create-proposal';
	}>;
}

export interface SourceArtifact {
	id: string;
	type: 'source';
	path: string;
	title: string;
	excerpt?: string;
	provenance: ArtifactProvenance[];
}

export interface TraceArtifact {
	id: string;
	type: 'trace';
	label: string;
	status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
	summary?: string;
}

export interface CopilotRunArtifacts {
	changes: ChangeArtifact[];
	insights: InsightArtifact[];
	sources: SourceArtifact[];
	trace: TraceArtifact[];
	allProvenance: ArtifactProvenance[];
}

export type CapabilityArtifact = ChangeArtifact | InsightArtifact | SourceArtifact | TraceArtifact;

export function createEmptyCopilotRunArtifacts(): CopilotRunArtifacts {
	return {
		changes: [],
		insights: [],
		sources: [],
		trace: [],
		allProvenance: [],
	};
}

export function mergeCapabilityArtifact(
	current: CopilotRunArtifacts,
	artifact: CapabilityArtifact,
): CopilotRunArtifacts {
	const allProvenance = [...current.allProvenance, ...('provenance' in artifact ? artifact.provenance : [])];
	if (artifact.type === 'change') return { ...current, changes: [...current.changes, artifact], allProvenance };
	if (artifact.type === 'insight') return { ...current, insights: [...current.insights, artifact], allProvenance };
	if (artifact.type === 'source') return { ...current, sources: [...current.sources, artifact], allProvenance };
	return { ...current, trace: [...current.trace, artifact] };
}

export function getDefaultReviewTab(artifacts: CopilotRunArtifacts): CopilotReviewTab {
	return artifacts.changes.length > 0 ? 'changes' : 'insights';
}
```

- [ ] **Step 4: Run test**

Run:

```bash
npm run test -- test/copilot-run-artifacts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/copilot/CopilotRunArtifacts.ts test/copilot-run-artifacts.test.ts
git commit -m "feat: add copilot run artifact model"
```

---

### Task 2: Add Action Result To Artifact Adapter

**Files:**
- Create: `src/service/copilot/CopilotArtifactAdapter.ts`
- Test: `test/copilot-artifact-adapter.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `test/copilot-artifact-adapter.test.ts`:

```ts
import assert from 'assert';
import { actionResultToArtifacts } from '../src/service/copilot/CopilotArtifactAdapter';
import type { ActionResult, CopilotAction } from '../src/service/copilot/CopilotActionRegistry';

function action(id: string, label = id): Pick<CopilotAction, 'id' | 'label'> {
	return { id, label };
}

const streamResult: ActionResult = { type: 'stream', text: 'Useful summary' };
const streamArtifacts = actionResultToArtifacts({ action: action('summarize', 'Summarize'), result: streamResult });
assert.equal(streamArtifacts[0].type, 'insight');
assert.equal(streamArtifacts[0].title, 'Summarize');

const structuredResult: ActionResult = {
	type: 'structured',
	data: {
		suggestions: [
			{ target: 'Product Positioning.md', reason: 'Related product strategy note', confidence: 0.82 },
		],
	},
};
const linkArtifacts = actionResultToArtifacts({ action: action('suggest-links', 'Connect links'), result: structuredResult });
assert.equal(linkArtifacts.some(item => item.type === 'change'), true);
assert.equal(linkArtifacts.some(item => item.type === 'source'), true);

const errorResult: ActionResult = { type: 'error', message: 'Provider failed' };
const errorArtifacts = actionResultToArtifacts({ action: action('review', 'Review article'), result: errorResult });
assert.equal(errorArtifacts[0].type, 'trace');
assert.equal(errorArtifacts[0].status, 'error');
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- test/copilot-artifact-adapter.test.ts
```

Expected: FAIL because `CopilotArtifactAdapter.ts` does not exist.

- [ ] **Step 3: Implement adapter**

Create `src/service/copilot/CopilotArtifactAdapter.ts`:

```ts
import type { ActionResult, CopilotAction } from './CopilotActionRegistry';
import type { CapabilityArtifact } from './CopilotRunArtifacts';

function provenance(action: Pick<CopilotAction, 'id' | 'label'>) {
	return [{ capabilityId: action.id, label: action.label }];
}

export function actionResultToArtifacts(params: {
	action: Pick<CopilotAction, 'id' | 'label'>;
	result: ActionResult;
}): CapabilityArtifact[] {
	const { action, result } = params;
	if (result.type === 'error') {
		return [{
			id: `${action.id}-error`,
			type: 'trace',
			label: action.label,
			status: 'error',
			summary: result.message,
		}];
	}

	if (result.type === 'stream') {
		return [{
			id: `${action.id}-insight`,
			type: 'insight',
			title: action.label,
			body: result.text,
			severity: 'info',
			provenance: provenance(action),
			actions: [{ id: 'create-proposal', label: 'Create proposal', kind: 'create-proposal' }],
		}];
	}

	const data = result.data ?? {};
	if (action.id.includes('link') || action.id.includes('connections')) {
		const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
		return [
			{
				id: `${action.id}-change`,
				type: 'change',
				title: action.label,
				provenance: provenance(action),
				blocks: suggestions.map((item: any, index: number) => ({
					id: `${action.id}-block-${index}`,
					heading: item.target ?? item.title ?? 'Related context',
					before: '',
					after: item.target ? `[[${item.target.replace(/\.md$/, '')}]]` : item.reason ?? '',
					provenance: provenance(action),
					selected: true,
				})),
			},
			...suggestions
				.filter((item: any) => item.target || item.path)
				.map((item: any, index: number) => ({
					id: `${action.id}-source-${index}`,
					type: 'source' as const,
					path: item.path ?? item.target,
					title: item.title ?? item.target ?? item.path,
					excerpt: item.reason,
					provenance: provenance(action),
				})),
		];
	}

	return [{
		id: `${action.id}-insight`,
		type: 'insight',
		title: action.label,
		body: typeof data.summary === 'string' ? data.summary : JSON.stringify(data, null, 2),
		severity: 'info',
		provenance: provenance(action),
		actions: [{ id: 'create-proposal', label: 'Create proposal', kind: 'create-proposal' }],
	}];
}
```

- [ ] **Step 4: Run adapter test**

Run:

```bash
npm run test -- test/copilot-artifact-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/copilot/CopilotArtifactAdapter.ts test/copilot-artifact-adapter.test.ts
git commit -m "feat: adapt copilot action results into review artifacts"
```

---

### Task 3: Add Review Shell View Model

**Files:**
- Create: `src/ui/view/copilot/review/CopilotReviewModel.ts`
- Test: `test/copilot-review-model.test.ts`

- [ ] **Step 1: Write failing view-model test**

Create `test/copilot-review-model.test.ts`:

```ts
import assert from 'assert';
import { buildCopilotReviewModel } from '../src/ui/view/copilot/review/CopilotReviewModel';
import type { CopilotRunArtifacts } from '../src/service/copilot/CopilotRunArtifacts';

const artifacts: CopilotRunArtifacts = {
	changes: [{ id: 'c1', type: 'change', title: 'Change', provenance: [], blocks: [] }],
	insights: [{ id: 'i1', type: 'insight', title: 'Insight', body: 'Body', provenance: [] }],
	sources: [{ id: 's1', type: 'source', path: 'A.md', title: 'A', provenance: [] }],
	trace: [{ id: 't1', type: 'trace', label: 'Run', status: 'done' }],
	allProvenance: [],
};

const model = buildCopilotReviewModel({ artifacts, requestedTab: undefined });
assert.equal(model.activeTab, 'changes');
assert.deepStrictEqual(model.tabs.map(tab => [tab.id, tab.count]), [
	['changes', 1],
	['insights', 1],
	['sources', 1],
	['chat', 0],
	['trace', 1],
]);

const insightOnly = buildCopilotReviewModel({
	artifacts: { ...artifacts, changes: [] },
	requestedTab: undefined,
});
assert.equal(insightOnly.activeTab, 'insights');
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- test/copilot-review-model.test.ts
```

Expected: FAIL because review model file does not exist.

- [ ] **Step 3: Implement review model**

Create `src/ui/view/copilot/review/CopilotReviewModel.ts`:

```ts
import { getDefaultReviewTab, type CopilotReviewTab, type CopilotRunArtifacts } from '@/service/copilot/CopilotRunArtifacts';

export interface CopilotReviewTabModel {
	id: CopilotReviewTab;
	label: string;
	count: number;
}

export interface CopilotReviewModel {
	activeTab: CopilotReviewTab;
	tabs: CopilotReviewTabModel[];
	canApply: boolean;
	hasInsights: boolean;
	hasSources: boolean;
}

export function buildCopilotReviewModel(params: {
	artifacts: CopilotRunArtifacts;
	requestedTab?: CopilotReviewTab;
}): CopilotReviewModel {
	const { artifacts } = params;
	const tabs: CopilotReviewTabModel[] = [
		{ id: 'changes', label: 'Changes', count: artifacts.changes.length },
		{ id: 'insights', label: 'Insights', count: artifacts.insights.length },
		{ id: 'sources', label: 'Sources', count: artifacts.sources.length },
		{ id: 'chat', label: 'Chat', count: 0 },
		{ id: 'trace', label: 'Trace', count: artifacts.trace.length },
	];

	return {
		activeTab: params.requestedTab ?? getDefaultReviewTab(artifacts),
		tabs,
		canApply: artifacts.changes.length > 0,
		hasInsights: artifacts.insights.length > 0,
		hasSources: artifacts.sources.length > 0,
	};
}
```

- [ ] **Step 4: Run model test**

Run:

```bash
npm run test -- test/copilot-review-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/copilot/review/CopilotReviewModel.ts test/copilot-review-model.test.ts
git commit -m "feat: add copilot review shell model"
```

---

### Task 4: Build Copilot Review Shell UI

**Files:**
- Create: `src/ui/view/copilot/review/CopilotReviewShell.tsx`
- Create: `src/ui/view/copilot/review/ChangesArtifactPanel.tsx`
- Create: `src/ui/view/copilot/review/InsightsArtifactPanel.tsx`
- Create: `src/ui/view/copilot/review/SourcesArtifactPanel.tsx`
- Create: `src/ui/view/copilot/review/TraceArtifactPanel.tsx`
- Modify: `src/ui/view/copilot/CopilotAutoRunModal.tsx`

- [ ] **Step 1: Add shell component**

Create `src/ui/view/copilot/review/CopilotReviewShell.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { FileText, Lightbulb, MessageSquare, ScrollText, ShieldCheck } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type { CopilotReviewTab, CopilotRunArtifacts } from '@/service/copilot/CopilotRunArtifacts';
import { buildCopilotReviewModel } from './CopilotReviewModel';
import { ChangesArtifactPanel } from './ChangesArtifactPanel';
import { InsightsArtifactPanel } from './InsightsArtifactPanel';
import { SourcesArtifactPanel } from './SourcesArtifactPanel';
import { TraceArtifactPanel } from './TraceArtifactPanel';

interface Props {
	title: string;
	subtitle: string;
	artifacts: CopilotRunArtifacts;
	onClose: () => void;
	onApplyReviewed?: () => void;
	onApplySelected?: () => void;
	onRejectAll?: () => void;
	onCreateProposal?: (insightId?: string) => void;
}

const ICONS = {
	changes: FileText,
	insights: Lightbulb,
	sources: ScrollText,
	chat: MessageSquare,
	trace: ShieldCheck,
} satisfies Record<CopilotReviewTab, React.ComponentType<{ className?: string }>>;

export function CopilotReviewShell(props: Props) {
	const model = useMemo(() => buildCopilotReviewModel({ artifacts: props.artifacts }), [props.artifacts]);
	const [activeTab, setActiveTab] = useState<CopilotReviewTab>(model.activeTab);

	return (
		<div className="pktw-flex pktw-h-full pktw-flex-col pktw-bg-background">
			<div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3 pktw-border-b pktw-border-border pktw-p-4">
				<div className="pktw-flex pktw-flex-col pktw-gap-1">
					<span className="pktw-text-base pktw-font-semibold">{props.title}</span>
					<span className="pktw-text-xs pktw-text-muted-foreground">{props.subtitle}</span>
				</div>
				<Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>
			</div>

			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-border-b pktw-border-border pktw-px-4 pktw-py-2">
				{model.tabs.map(tab => {
					const Icon = ICONS[tab.id];
					return (
						<Button
							key={tab.id}
							variant="ghost"
							size="sm"
							onClick={() => setActiveTab(tab.id)}
							className={cn(activeTab === tab.id && 'pktw-bg-pk-highlight pktw-text-pk-accent')}
						>
							<Icon className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
							{tab.label}
							<span className="pktw-ml-1 pktw-rounded-full pktw-bg-muted pktw-px-1.5 pktw-text-[10px]">{tab.count}</span>
						</Button>
					);
				})}
			</div>

			<div className="pktw-min-h-0 pktw-flex-1 pktw-overflow-y-auto pktw-p-4">
				{activeTab === 'changes' && <ChangesArtifactPanel artifacts={props.artifacts.changes} />}
				{activeTab === 'insights' && <InsightsArtifactPanel artifacts={props.artifacts.insights} onCreateProposal={props.onCreateProposal} />}
				{activeTab === 'sources' && <SourcesArtifactPanel artifacts={props.artifacts.sources} />}
				{activeTab === 'trace' && <TraceArtifactPanel artifacts={props.artifacts.trace} />}
				{activeTab === 'chat' && <span className="pktw-text-sm pktw-text-muted-foreground">Chat follow-up will continue this run context.</span>}
			</div>

			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-border-t pktw-border-border pktw-p-4">
				<span className="pktw-text-xs pktw-text-muted-foreground">No changes are applied automatically. Review carefully before applying.</span>
				<div className="pktw-flex pktw-gap-2">
					<Button variant="outline" onClick={props.onRejectAll}>Reject all</Button>
					<Button variant="outline" onClick={props.onApplySelected} disabled={!model.canApply}>Apply selected</Button>
					<Button onClick={props.onApplyReviewed} disabled={!model.canApply}>Apply reviewed changes</Button>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Add minimal artifact panels**

Create `src/ui/view/copilot/review/ChangesArtifactPanel.tsx`:

```tsx
import React from 'react';
import type { ChangeArtifact } from '@/service/copilot/CopilotRunArtifacts';

export function ChangesArtifactPanel({ artifacts }: { artifacts: ChangeArtifact[] }) {
	if (artifacts.length === 0) {
		return <span className="pktw-text-sm pktw-text-muted-foreground">No document changes proposed.</span>;
	}
	return (
		<div className="pktw-space-y-3">
			{artifacts.map(artifact => (
				<div key={artifact.id} className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card">
					<div className="pktw-border-b pktw-border-border pktw-p-3 pktw-text-sm pktw-font-semibold">{artifact.title}</div>
					<div className="pktw-space-y-2 pktw-p-3">
						{artifact.blocks.map(block => (
							<div key={block.id} className="pktw-grid pktw-grid-cols-2 pktw-gap-2 pktw-text-xs">
								<pre className="pktw-rounded-md pktw-border pktw-border-red-200 pktw-bg-red-50 pktw-p-2 pktw-whitespace-pre-wrap">{block.before || '(insert)'}</pre>
								<pre className="pktw-rounded-md pktw-border pktw-border-green-200 pktw-bg-green-50 pktw-p-2 pktw-whitespace-pre-wrap">{block.after || '(delete)'}</pre>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
```

Create `src/ui/view/copilot/review/InsightsArtifactPanel.tsx`:

```tsx
import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import type { InsightArtifact } from '@/service/copilot/CopilotRunArtifacts';

export function InsightsArtifactPanel({
	artifacts,
	onCreateProposal,
}: {
	artifacts: InsightArtifact[];
	onCreateProposal?: (insightId?: string) => void;
}) {
	if (artifacts.length === 0) return <span className="pktw-text-sm pktw-text-muted-foreground">No insights produced.</span>;
	return (
		<div className="pktw-space-y-3">
			{artifacts.map(artifact => (
				<div key={artifact.id} className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card pktw-p-3">
					<span className="pktw-text-sm pktw-font-semibold">{artifact.title}</span>
					<p className="pktw-mt-2 pktw-whitespace-pre-wrap pktw-text-sm pktw-leading-relaxed pktw-text-muted-foreground">{artifact.body}</p>
					<Button variant="outline" size="sm" className="pktw-mt-3" onClick={() => onCreateProposal?.(artifact.id)}>
						Create proposal
					</Button>
				</div>
			))}
		</div>
	);
}
```

Create `src/ui/view/copilot/review/SourcesArtifactPanel.tsx`:

```tsx
import React from 'react';
import type { SourceArtifact } from '@/service/copilot/CopilotRunArtifacts';

export function SourcesArtifactPanel({ artifacts }: { artifacts: SourceArtifact[] }) {
	if (artifacts.length === 0) return <span className="pktw-text-sm pktw-text-muted-foreground">No sources attached.</span>;
	return (
		<div className="pktw-space-y-2">
			{artifacts.map(source => (
				<div key={source.id} className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card pktw-p-3">
					<span className="pktw-text-sm pktw-font-semibold">{source.title}</span>
					<span className="pktw-block pktw-text-xs pktw-text-muted-foreground">{source.path}</span>
					{source.excerpt && <p className="pktw-mt-2 pktw-text-xs pktw-text-muted-foreground">{source.excerpt}</p>}
				</div>
			))}
		</div>
	);
}
```

Create `src/ui/view/copilot/review/TraceArtifactPanel.tsx`:

```tsx
import React from 'react';
import type { TraceArtifact } from '@/service/copilot/CopilotRunArtifacts';

export function TraceArtifactPanel({ artifacts }: { artifacts: TraceArtifact[] }) {
	if (artifacts.length === 0) return <span className="pktw-text-sm pktw-text-muted-foreground">No trace events.</span>;
	return (
		<div className="pktw-space-y-2">
			{artifacts.map(trace => (
				<div key={trace.id} className="pktw-rounded-md pktw-border pktw-border-border pktw-bg-card pktw-p-2 pktw-text-xs">
					<span className="pktw-font-semibold">{trace.label}</span>
					<span className="pktw-ml-2 pktw-text-muted-foreground">{trace.status}</span>
					{trace.summary && <span className="pktw-block pktw-text-muted-foreground">{trace.summary}</span>}
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 3: Wire shell into AutoRunModal review state**

In `src/ui/view/copilot/CopilotAutoRunModal.tsx`, after Task 2 exists, import:

```ts
import { actionResultToArtifacts } from '@/service/copilot/CopilotArtifactAdapter';
import { createEmptyCopilotRunArtifacts, mergeCapabilityArtifact } from '@/service/copilot/CopilotRunArtifacts';
import { CopilotReviewShell } from './review/CopilotReviewShell';
```

Then derive `artifacts` from completed runs before return:

```ts
const artifacts = state.runs.reduce((acc, run) => {
	if (!run.result) return acc;
	return actionResultToArtifacts({ action: run.capability.action, result: run.result })
		.reduce((next, artifact) => mergeCapabilityArtifact(next, artifact), acc);
}, createEmptyCopilotRunArtifacts());
```

When `state.status === 'review'`, render `CopilotReviewShell` instead of the card list:

```tsx
if (state.status === 'review') {
	return (
		<CopilotReviewShell
			title="Auto Review"
			subtitle="Agent called tools when useful and prepared review artifacts."
			artifacts={artifacts}
			onClose={onClose}
			onRejectAll={onClose}
		/>
	);
}
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/copilot/review src/ui/view/copilot/CopilotAutoRunModal.tsx
git commit -m "feat: add unified copilot review shell"
```

---

### Task 5: Route Manual Results Through Review Shell

**Files:**
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx`
- Test: `test/copilot-artifact-adapter.test.ts`

- [ ] **Step 1: Extend adapter tests for write and insight defaults**

Append to `test/copilot-artifact-adapter.test.ts`:

```ts
const polishArtifacts = actionResultToArtifacts({
	action: action('polish', 'Improve note'),
	result: { type: 'stream', text: 'Improved note proposal' },
});
assert.equal(polishArtifacts[0].type, 'insight');

const correctArtifacts = actionResultToArtifacts({
	action: action('correct-content', 'Correct content'),
	result: { type: 'structured', data: { summary: 'No critical issues.' } },
});
assert.equal(correctArtifacts[0].type, 'insight');
```

This test documents the initial conservative behavior: unknown outputs become Insights until a specific action has a change adapter.

- [ ] **Step 2: Run test**

Run:

```bash
npm run test -- test/copilot-artifact-adapter.test.ts
```

Expected: PASS after Task 2.

- [ ] **Step 3: Add optional unified review mode in ResultModal**

In `src/ui/view/copilot/CopilotResultModal.tsx`, import artifact helpers and shell:

```ts
import { actionResultToArtifacts } from '@/service/copilot/CopilotArtifactAdapter';
import { createEmptyCopilotRunArtifacts, mergeCapabilityArtifact } from '@/service/copilot/CopilotRunArtifacts';
import { CopilotReviewShell } from './review/CopilotReviewShell';
```

In the result branch, before rendering `Panel`, build artifacts:

```tsx
const resultForShell: ActionResult = phase.usage
	? { type: 'structured', data: phase.data, usage: phase.usage }
	: { type: 'structured', data: phase.data };
const shellArtifacts = actionResultToArtifacts({ action, result: resultForShell })
	.reduce((acc, artifact) => mergeCapabilityArtifact(acc, artifact), createEmptyCopilotRunArtifacts());
```

For actions that are ready to use unified review first, render:

```tsx
if (action.id === 'suggest-links' || action.id === 'suggest-semantic-links' || action.id === 'smart-connections') {
	return (
		<CopilotReviewShell
			title={action.label}
			subtitle="Manual intent result. Review artifacts before applying."
			artifacts={shellArtifacts}
			onClose={onClose}
			onRejectAll={onClose}
		/>
	);
}
```

Leave other actions on their existing `ResultPanel` until their adapter produces high-quality change blocks.

- [ ] **Step 4: Run targeted tests and build**

Run:

```bash
npm run test -- test/copilot-artifact-adapter.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/copilot/CopilotResultModal.tsx test/copilot-artifact-adapter.test.ts
git commit -m "feat: route link intents through copilot review shell"
```

---

### Task 6: Add Resizable Insights Layout Modes

**Files:**
- Modify: `src/ui/view/copilot/review/CopilotReviewShell.tsx`
- Test: `test/copilot-review-model.test.ts`

- [ ] **Step 1: Add layout mode model tests**

Append to `test/copilot-review-model.test.ts`:

```ts
import { nextInsightLayoutMode } from '../src/ui/view/copilot/review/CopilotReviewModel';

assert.equal(nextInsightLayoutMode('rail'), 'split');
assert.equal(nextInsightLayoutMode('split'), 'full');
assert.equal(nextInsightLayoutMode('full'), 'rail');
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- test/copilot-review-model.test.ts
```

Expected: FAIL because `nextInsightLayoutMode` does not exist.

- [ ] **Step 3: Implement layout mode helper**

In `src/ui/view/copilot/review/CopilotReviewModel.ts` add:

```ts
export type InsightLayoutMode = 'rail' | 'split' | 'full';

export function nextInsightLayoutMode(mode: InsightLayoutMode): InsightLayoutMode {
	if (mode === 'rail') return 'split';
	if (mode === 'split') return 'full';
	return 'rail';
}
```

- [ ] **Step 4: Add shell layout controls**

In `CopilotReviewShell.tsx`, add state:

```tsx
const [insightLayout, setInsightLayout] = useState<'rail' | 'split' | 'full'>('rail');
```

Show a small control when active tab is `insights` or when changes are active and insights exist:

```tsx
{model.hasInsights && (
	<Button variant="outline" size="sm" onClick={() => setInsightLayout(nextInsightLayoutMode(insightLayout))}>
		Insights: {insightLayout}
	</Button>
)}
```

For the first pass, this may only change class names:

```tsx
className={cn(
	'pktw-min-h-0 pktw-flex-1 pktw-overflow-y-auto pktw-p-4',
	insightLayout === 'full' && activeTab === 'insights' && 'pktw-px-8',
)}
```

- [ ] **Step 5: Run test and build**

Run:

```bash
npm run test -- test/copilot-review-model.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/copilot/review/CopilotReviewModel.ts src/ui/view/copilot/review/CopilotReviewShell.tsx test/copilot-review-model.test.ts
git commit -m "feat: add resizable insights modes to copilot review"
```

---

### Task 7: Complete Vault And Setting Review Semantics

**Files:**
- Modify: `src/service/copilot/CopilotAutoPlanner.ts`
- Modify: `src/service/copilot/CopilotArtifactAdapter.ts`
- Test: `test/copilot-auto-planner.test.ts`
- Test: `test/copilot-artifact-adapter.test.ts`

- [ ] **Step 1: Add planner tests for Vault and Setting minimum paths**

In `test/copilot-auto-planner.test.ts`, add assertions that:

```ts
assert.ok(vaultPlan.analysisSummary.includes('current note') || vaultPlan.analysisSummary.includes('vault'));
assert.ok(vaultPlan.selectedActions.every(item => item.risk === 'read-only' || item.risk === 'suggests-change'));
assert.ok(settingPlan.selectedActions.length >= 1);
```

- [ ] **Step 2: Add adapter tests for vault health and prompt audit**

In `test/copilot-artifact-adapter.test.ts`, add:

```ts
const vaultArtifacts = actionResultToArtifacts({
	action: action('vault-health', 'Vault health'),
	result: { type: 'structured', data: { summary: '2 orphan notes, 1 duplicate cluster.' } },
});
assert.equal(vaultArtifacts[0].type, 'insight');

const settingArtifacts = actionResultToArtifacts({
	action: action('prompt-audit', 'Prompt audit'),
	result: { type: 'structured', data: { summary: 'One model profile is missing API key.' } },
});
assert.equal(settingArtifacts[0].type, 'insight');
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm run test -- test/copilot-auto-planner.test.ts
npm run test -- test/copilot-artifact-adapter.test.ts
```

Expected: PASS or fail only on missing summary mapping.

- [ ] **Step 4: Improve adapter titles for Vault and Setting**

In `CopilotArtifactAdapter.ts`, before the generic structured fallback, add:

```ts
if (action.id === 'vault-health' || action.id === 'prompt-audit') {
	return [{
		id: `${action.id}-insight`,
		type: 'insight',
		title: action.label,
		body: typeof data.summary === 'string' ? data.summary : JSON.stringify(data, null, 2),
		severity: action.id === 'prompt-audit' ? 'medium' : 'info',
		provenance: provenance(action),
		actions: [{ id: 'ask-follow-up', label: 'Ask follow-up', kind: 'ask-follow-up' }],
	}];
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm run test -- test/copilot-auto-planner.test.ts
npm run test -- test/copilot-artifact-adapter.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/service/copilot/CopilotAutoPlanner.ts src/service/copilot/CopilotArtifactAdapter.ts test/copilot-auto-planner.test.ts test/copilot-artifact-adapter.test.ts
git commit -m "feat: complete vault and system artifact routing"
```

---

### Task 8: Visual QA And Documentation

**Files:**
- Modify: `docs/gstack/copilot-command-center-redesign-2026-05-14/final-ux-flow.html` only if implementation diverges from the selected flow
- Modify: `docs/manual-testing-checklist.md`
- Modify: `docs/progress.md`

- [ ] **Step 1: Run full relevant verification**

Run:

```bash
npm run test -- test/copilot-intent-hub.test.ts
npm run test -- test/copilot-auto-planner.test.ts
npm run test -- test/copilot-run-artifacts.test.ts
npm run test -- test/copilot-artifact-adapter.test.ts
npm run test -- test/copilot-review-model.test.ts
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Capture implementation screenshots**

If the plugin can be loaded in Obsidian, capture screenshots for:

- Entry panel: `Document / Vault / Setting`
- Auto Review with Changes active
- Auto Review with Insights full width
- Manual write diff
- Insight/no-change review

Save them under:

```text
docs/gstack/copilot-command-center-redesign-2026-05-14/implementation/
```

- [ ] **Step 3: Update manual testing checklist**

In `docs/manual-testing-checklist.md`, add a section:

```md
## Copilot / Command Center Final UX Flow

- [ ] Open Copilot from current note and confirm Document tab, Auto, search, and 3-4 recommended actions are visible.
- [ ] Run Document Auto and confirm trace appears while tools run.
- [ ] Confirm no changes are applied automatically.
- [ ] Confirm change artifacts open Changes by default.
- [ ] Confirm no-change runs open Insights by default.
- [ ] Confirm Insights can be rail/split/full width.
- [ ] Confirm Create proposal from Insights starts a change review.
- [ ] Confirm manual link/write action opens unified review shell.
- [ ] Confirm Vault Auto produces an insight/report path.
- [ ] Confirm Setting Auto produces diagnostics rather than content actions.
```

- [ ] **Step 4: Update progress**

In `docs/progress.md`, update the existing planned item:

```md
| `2026-05-14-copilot-command-center-user-centered-redesign` | Copilot / Command Center final UX flow: intent tabs, Auto ReAct run, artifact review shell, rendered diff, interactive Insights | 中 | IMPLEMENTED / NEEDS MANUAL QA |
```

Use `IMPLEMENTED / NEEDS MANUAL QA` only after code implementation and build pass.

- [ ] **Step 5: Commit**

```bash
git add docs/manual-testing-checklist.md docs/progress.md docs/gstack/copilot-command-center-redesign-2026-05-14/implementation
git commit -m "docs: add final copilot ux flow QA checklist"
```

---

## Verification Gates

Minimum automated verification:

```bash
npm run test -- test/copilot-intent-hub.test.ts
npm run test -- test/copilot-auto-planner.test.ts
npm run test -- test/copilot-run-artifacts.test.ts
npm run test -- test/copilot-artifact-adapter.test.ts
npm run test -- test/copilot-review-model.test.ts
npm run build
```

Manual verification:

- Document Auto starts one ReAct run and ends in a review shell.
- Manual write intent is not limited to a single tool.
- Changes default to rendered diff.
- Insights default to full width when no changes exist.
- Create proposal routes from Insights back to Changes.
- Vault and Setting tabs feel like distinct user workflows, not renamed action categories.

## Self-Review Notes

Spec coverage:

- Entry panel, tabs, Auto, manual intent, artifacts, Changes, Insights, Sources, Trace, Vault, Setting, safety, and visual QA are all covered.

Known implementation risk:

- Existing action results have heterogeneous shapes. The adapter should start conservative and expand action-by-action instead of pretending every result can become a high-quality diff immediately.

No-go:

- Do not rewrite every action panel in the first pass. The first shippable increment is the artifact model plus Auto Review shell, then migrate high-value actions.
