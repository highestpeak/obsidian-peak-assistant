# Settings General & Search Tab UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the General and Search & Indexing settings tabs to use a unified modern card style, remove dead Graph Viz settings, and replace the document type grid with pill chips.

**Architecture:** Extract a shared `SettingCard` component used by both tabs. General tab becomes a flat card list (no groups). Search tab keeps lightweight section headers (non-collapsible) with the same card style. `DocTypeGrid` replaced by `DocTypePills` with flex-wrap layout.

**Tech Stack:** React 18, Tailwind (pktw- prefix), Lucide React icons, existing shared-ui primitives (`Switch`, `Input`, `NumberInputWithConfirm`, `InputWithConfirm`, `Button`)

---

### Task 1: Create shared `SettingCard` component

Both tabs define local `SettingRow` helpers with slightly different APIs. Extract a shared component.

**Files:**
- Create: `src/ui/view/settings/components/SettingCard.tsx`

- [ ] **Step 1: Create the SettingCard component**

```tsx
// src/ui/view/settings/components/SettingCard.tsx
import React from 'react';
import { cn } from '@/ui/lib/utils';

interface SettingCardProps {
	label: string;
	description?: string;
	labelSuffix?: React.ReactNode;
	children: React.ReactNode;
	stacked?: boolean;
}

export function SettingCard({ label, description, labelSuffix, children, stacked }: SettingCardProps) {
	return (
		<div
			className={cn(
				'pktw-rounded-lg pktw-px-4 pktw-py-3.5 pktw-bg-pk-surface pktw-transition-colors hover:pktw-bg-pk-surface-hover',
				stacked ? 'pktw-flex pktw-flex-col pktw-gap-2' : 'pktw-flex pktw-items-center pktw-justify-between pktw-gap-4',
			)}
		>
			{stacked ? (
				<>
					<div>
						<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">
							{label}
							{labelSuffix}
						</span>
						{description && (
							<span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-mt-0.5">
								{description}
							</span>
						)}
					</div>
					{children}
				</>
			) : (
				<>
					<div className="pktw-flex-1 pktw-min-w-0">
						<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">
							{label}
							{labelSuffix}
						</span>
						{description && (
							<span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-mt-0.5">
								{description}
							</span>
						)}
					</div>
					<div className="pktw-flex-shrink-0">{children}</div>
				</>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Verify the CSS token `pktw-bg-pk-surface` exists**

Run: `grep -r 'pk-surface' src/ui/ --include='*.css' --include='*.tsx' -l`

Check if this token is defined in the Tailwind config or CSS. If not, check what existing background token the settings cards use (e.g. `pktw-bg-secondary`, `pktw-bg-card`) and use that instead. Also check `tailwind.config.js` for the theme tokens available under `pk-*`.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/components/SettingCard.tsx
git commit -m "feat(settings): add shared SettingCard component"
```

---

### Task 2: Create `SectionHeader` component

Extract the section header pattern from SearchTab into a shared component.

**Files:**
- Create: `src/ui/view/settings/components/SectionHeader.tsx`

- [ ] **Step 1: Create the SectionHeader component**

```tsx
// src/ui/view/settings/components/SectionHeader.tsx
import React from 'react';

interface SectionHeaderProps {
	icon: React.ElementType;
	title: string;
}

export function SectionHeader({ icon: Icon, title }: SectionHeaderProps) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-pt-4 pktw-pb-2 pktw-px-1 first:pktw-pt-0">
			<Icon className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
				{title}
			</span>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/settings/components/SectionHeader.tsx
git commit -m "feat(settings): add shared SectionHeader component"
```

---

### Task 3: Create `DocTypePills` component (replaces `DocTypeGrid`)

**Files:**
- Create: `src/ui/view/settings/components/DocTypePills.tsx`

- [ ] **Step 1: Create the pill chips component**

```tsx
// src/ui/view/settings/components/DocTypePills.tsx
import React from 'react';
import { cn } from '@/ui/lib/utils';

interface DocTypePillsProps {
	types: Record<string, boolean>;
	onToggle: (type: string, value: boolean) => void;
}

export function DocTypePills({ types, onToggle }: DocTypePillsProps) {
	return (
		<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
			{Object.entries(types).map(([type, enabled]) => (
				<span
					key={type}
					className={cn(
						'pktw-rounded-full pktw-px-3 pktw-py-1 pktw-text-xs pktw-cursor-pointer pktw-transition-colors pktw-select-none pktw-border',
						enabled
							? 'pktw-bg-pk-accent-muted pktw-text-pk-accent pktw-border-pk-accent'
							: 'pktw-bg-secondary pktw-text-muted-foreground pktw-border-pk-border hover:pktw-bg-secondary/80',
					)}
					onClick={() => onToggle(type, !enabled)}
				>
					{type.charAt(0).toUpperCase() + type.slice(1)}
				</span>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/settings/components/DocTypePills.tsx
git commit -m "feat(settings): add DocTypePills component with flex-wrap layout"
```

---

### Task 4: Rewrite `GeneralTab.tsx`

Remove collapsible sections, Graph Viz Tuning, and use `SettingCard`. Flat list of 4 settings.

**Files:**
- Modify: `src/ui/view/settings/GeneralTab.tsx` (full rewrite, lines 1–226)

- [ ] **Step 1: Rewrite GeneralTab**

Replace the entire file with:

```tsx
// src/ui/view/settings/GeneralTab.tsx
import React from 'react';
import type { MyPluginSettings } from '@/app/settings/types';
import { InputWithConfirm } from '@/ui/component/mine/input-with-confirm';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { Switch } from '@/ui/component/shared-ui/switch';
import { SettingCard } from './components/SettingCard';

interface GeneralTabProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

export function GeneralTab({ settings, settingsUpdates }: GeneralTabProps) {
	const { update, updateAI } = settingsUpdates;

	return (
		<div className="peak-settings-card pktw-flex pktw-flex-col pktw-gap-1.5">
			<SettingCard
				label="Data Storage Folder"
				description="Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory."
			>
				<div className="pktw-w-64">
					<InputWithConfirm
						type="text"
						placeholder="Leave empty for plugin directory"
						value={settings.dataStorageFolder || ''}
						onConfirm={(value) => update('dataStorageFolder', value.trim())}
					/>
				</div>
			</SettingCard>

			<SettingCard
				label="Chat Root Folder"
				description="Root folder for AI conversation data (Prompts, Attachments, Hub-Summaries, etc. are derived automatically)."
			>
				<div className="pktw-w-64">
					<InputWithConfirm
						type="text"
						placeholder="Enter chat root folder"
						value={settings.ai.rootFolder}
						onConfirm={(value) => updateAI('rootFolder', value)}
					/>
				</div>
			</SettingCard>

			<SettingCard
				label="Attachment Handling"
				description="How attachments are sent to the model. 'Direct' requires model vision support; 'Degrade to text' uses OCR/parsing for compatibility."
			>
				<select
					className="pktw-text-sm pktw-bg-background pktw-border pktw-border-input pktw-rounded-md pktw-px-2 pktw-py-1 pktw-cursor-pointer"
					value={settings.ai?.attachmentHandlingDefault ?? 'direct'}
					onChange={(e) =>
						updateAI(
							'attachmentHandlingDefault',
							e.target.value as 'direct' | 'degrade_to_text',
						)
					}
				>
					<option value="direct">Direct (send raw)</option>
					<option value="degrade_to_text">Degrade to text (OCR)</option>
				</select>
			</SettingCard>

			<SettingCard
				label="Enable DevTools Graph Inspector"
				description="Exposes window.testGraphTools in browser DevTools console with convenience methods for graph testing."
				labelSuffix={
					<span className="pktw-ml-2 pktw-text-[10px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-pk-accent-muted pktw-text-pk-accent">
						Developer
					</span>
				}
			>
				<Switch
					checked={settings.enableDevTools ?? false}
					onChange={(checked) => update('enableDevTools', checked)}
				/>
			</SettingCard>
		</div>
	);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors. The `ProgressBarSlider` and `CollapsibleSettingsSection` imports are gone.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/GeneralTab.tsx
git commit -m "refactor(settings): rewrite GeneralTab — flat cards, remove Graph Viz dead settings"
```

---

### Task 5: Rewrite `SearchTab.tsx`

Use `SettingCard` and `SectionHeader` for consistent style. Replace `DocTypeGrid` with `DocTypePills`.

**Files:**
- Modify: `src/ui/view/settings/SearchTab.tsx` (full rewrite, lines 1–162)

- [ ] **Step 1: Rewrite SearchTab**

Replace the entire file with:

```tsx
// src/ui/view/settings/SearchTab.tsx
import React, { useState, useEffect } from 'react';
import { Database, Scissors, Sparkles } from 'lucide-react';
import type { MyPluginSettings } from '@/app/settings/types';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';
import { NumberInputWithConfirm } from '@/ui/component/shared-ui/number-input';
import { SettingCard } from './components/SettingCard';
import { SectionHeader } from './components/SectionHeader';
import { DocTypePills } from './components/DocTypePills';

interface SearchTabProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

export function SearchTab({ settings, settingsUpdates }: SearchTabProps) {
	const { updateSearch, updateChunking, updateDocumentType } = settingsUpdates;

	const [editingPatterns, setEditingPatterns] = useState(false);
	const [patternsText, setPatternsText] = useState('');

	useEffect(() => {
		setPatternsText(settings.search.ignorePatterns?.join('\n') ?? '');
	}, [settings.search.ignorePatterns]);

	const saveIgnorePatterns = () => {
		const patterns = patternsText.split('\n').map((l) => l.trim()).filter(Boolean);
		updateSearch('ignorePatterns', patterns);
		setEditingPatterns(false);
	};

	return (
		<div className="peak-settings-card pktw-flex pktw-flex-col pktw-gap-1.5">
			{/* ── Indexing ── */}
			<SectionHeader icon={Database} title="Indexing" />

			<SettingCard label="Auto-index on startup" description="Run FTS index when Obsidian opens">
				<Switch
					checked={settings.search.autoIndex}
					onChange={(v) => updateSearch('autoIndex', v)}
				/>
			</SettingCard>

			<SettingCard
				label="Document types"
				description="File types included in the search index"
				stacked
			>
				<DocTypePills
					types={settings.search.includeDocumentTypes}
					onToggle={(type, val) => updateDocumentType(type, val)}
				/>
			</SettingCard>

			<SettingCard label="Ignore patterns" description="Glob patterns to exclude (one per line)">
				<Button variant="outline" size="sm" onClick={() => setEditingPatterns(!editingPatterns)}>
					{editingPatterns ? 'Close' : 'Edit'}
				</Button>
			</SettingCard>
			{editingPatterns && (
				<div className="pktw-px-4 pktw-pb-2 pktw-space-y-2">
					<textarea
						value={patternsText}
						onChange={(e) => setPatternsText(e.target.value)}
						placeholder={'.git/\nnode_modules/\n*.tmp'}
						className="pktw-w-full pktw-h-28 pktw-px-3 pktw-py-2 pktw-border pktw-border-border pktw-rounded-md pktw-text-xs pktw-font-mono pktw-resize-vertical focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring"
					/>
					<Button size="sm" onClick={saveIgnorePatterns}>Save</Button>
				</div>
			)}

			{/* ── Chunking ── */}
			<SectionHeader icon={Scissors} title="Chunking" />

			<SettingCard label="Max chunk size" description="Maximum characters per chunk (default 1000)">
				<div className="pktw-w-36">
					<NumberInputWithConfirm
						value={settings.search.chunking?.maxChunkSize ?? 1000}
						onConfirm={(v) => updateChunking('maxChunkSize', v)}
						min={1}
						placeholder="1000"
					/>
				</div>
			</SettingCard>

			<SettingCard label="Chunk overlap" description="Overlap characters between chunks (default 200)">
				<div className="pktw-w-36">
					<NumberInputWithConfirm
						value={settings.search.chunking?.chunkOverlap ?? 200}
						onConfirm={(v) => updateChunking('chunkOverlap', v)}
						min={0}
						placeholder="200"
					/>
				</div>
			</SettingCard>

			{/* ── AI Analysis ── */}
			<SectionHeader icon={Sparkles} title="AI Analysis" />

			<SettingCard label="Auto-save results" description="Save completed analysis to vault">
				<Switch
					checked={settings.search.aiAnalysisAutoSaveEnabled ?? true}
					onChange={(v) => updateSearch('aiAnalysisAutoSaveEnabled', v)}
				/>
			</SettingCard>

			<SettingCard label="Save folder" description="Vault-relative path for saved analyses">
				<div className="pktw-w-48">
					<Input
						value={settings.search.aiAnalysisAutoSaveFolder ?? 'Analysis/AI Searches'}
						onChange={(e) => updateSearch('aiAnalysisAutoSaveFolder', e.target.value)}
						placeholder="Analysis/AI Searches"
					/>
				</div>
			</SettingCard>

			<SettingCard label="Recent history limit" description="Items shown in Recent AI Analysis list">
				<div className="pktw-w-36">
					<NumberInputWithConfirm
						value={settings.search.aiAnalysisHistoryLimit ?? 5}
						onConfirm={(v) => updateSearch('aiAnalysisHistoryLimit', v)}
						min={1}
						max={50}
						placeholder="5"
					/>
				</div>
			</SettingCard>
		</div>
	);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors. The old `SectionHeading`, `SettingRow`, and `DocTypeGrid` imports are gone.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/settings/SearchTab.tsx
git commit -m "refactor(settings): rewrite SearchTab — card style, section headers, pill chips"
```

---

### Task 6: Remove dead GraphViz settings from types

Remove the 5 dead `graphViz` keys from the type definition and defaults. Keep the 4 remaining keys (`mstPruneDepth`, `skeletonBackboneOnly`, `mstLeafOpacity`, `mstLeafWidthScale`) which may be used by `peak-config.ts`.

**Files:**
- Modify: `src/app/settings/types.ts:406-409,412,466-469,472`

- [ ] **Step 1: Remove dead keys from the type**

In `src/app/settings/types.ts`, remove these lines from the `graphViz` type block (lines 406–409, 412):

```
clusterForceStrength?: number;
nodeBaseRadiusPhysical?: number;
nodeBaseRadiusSemantic?: number;
nodeDegreeBoost?: number;
skeletonMinBranchNodes?: number;
```

The remaining `graphViz` type should be:
```ts
graphViz?: {
    mstPruneDepth?: number;
    skeletonBackboneOnly?: boolean;
    mstLeafOpacity?: number;
    mstLeafWidthScale?: number;
};
```

- [ ] **Step 2: Remove dead keys from defaults**

In the same file, remove these lines from `DEFAULT_SETTINGS.graphViz` (lines 466–469, 472):

```
clusterForceStrength: 0.02,
nodeBaseRadiusPhysical: 6,
nodeBaseRadiusSemantic: 7,
nodeDegreeBoost: 16,
skeletonMinBranchNodes: 3,
```

The remaining defaults should be:
```ts
graphViz: {
    mstPruneDepth: 2,
    skeletonBackboneOnly: false,
    mstLeafOpacity: 0.25,
    mstLeafWidthScale: 0.6,
},
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors — these keys were only consumed by the now-removed GeneralTab UI.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/types.ts
git commit -m "refactor(settings): remove 5 dead graphViz setting keys"
```

---

### Task 7: Clean up dead files

Remove files that are no longer imported anywhere.

**Files:**
- Delete: `src/ui/view/settings/components/DocTypeGrid.tsx` (replaced by `DocTypePills`)
- Possibly delete: `src/ui/component/shared-ui/CollapsibleSettingsSection.tsx` (only used by old GeneralTab)
- Possibly delete: `src/ui/view/settings/component/setting-field.tsx` (unused)

- [ ] **Step 1: Verify no other imports of DocTypeGrid**

Run: `grep -r 'DocTypeGrid' src/ --include='*.tsx' --include='*.ts' -l`

Expected: No results (old import in SearchTab is already removed in Task 5).

- [ ] **Step 2: Verify no other imports of CollapsibleSettingsSection**

Run: `grep -r 'CollapsibleSettingsSection' src/ --include='*.tsx' --include='*.ts' -l`

Expected: Only `CollapsibleSettingsSection.tsx` itself (definition). If no other file imports it, delete it.

- [ ] **Step 3: Verify no imports of SettingField**

Run: `grep -r 'SettingField\|setting-field' src/ --include='*.tsx' --include='*.ts' -l`

Expected: Only `setting-field.tsx` itself. If so, delete it.

- [ ] **Step 4: Delete confirmed dead files**

```bash
rm src/ui/view/settings/components/DocTypeGrid.tsx
# Only if confirmed unused:
rm src/ui/component/shared-ui/CollapsibleSettingsSection.tsx
rm src/ui/view/settings/component/setting-field.tsx
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "refactor(settings): remove dead files — DocTypeGrid, CollapsibleSettingsSection, SettingField"
```

---

### Task 8: Visual verification

**Files:** None (manual testing)

- [ ] **Step 1: Build and reload**

Run: `npm run build`

Reload the plugin in Obsidian (Ctrl/Cmd+R or disable/enable plugin).

- [ ] **Step 2: Verify General tab**

Open Settings → General tab. Check:
- 4 setting cards displayed flat, no collapsible groups
- "Developer" badge appears on DevTools toggle
- No Graph Visualization Tuning section
- Text inputs, dropdown, toggle all functional
- Hover effect on cards works
- Light and dark theme both look correct

- [ ] **Step 3: Verify Search & Indexing tab**

Open Settings → Search & Indexing tab. Check:
- Three section headers visible: Indexing, Chunking, AI Analysis (with icons)
- All settings use the same card style as General tab
- Document types displayed as pill chips with flex-wrap
- Clicking pills toggles them (accent color for active, gray for inactive)
- Ignore patterns Edit/Save flow works
- Number inputs with confirm work
- Light and dark theme both look correct

- [ ] **Step 4: Commit any CSS tweaks**

If visual adjustments are needed (spacing, colors, etc.), make them and commit:

```bash
git add -u
git commit -m "fix(settings): visual polish for card layout"
```
