# Unified Context Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented ContextBuilder with a unified ContextPipeline that provides cross-feature awareness, token budget governance, and dynamic context discovery across Chat, AI Analysis, Copilot, and Ambient Push.

**Architecture:** Event-sourced activity tracking (SessionContextService) feeds a priority-based slot pipeline (ContextPipeline + BudgetGovernor) inspired by Cursor's Priompt and Claude Code's multi-layer compression. Each scenario (chat, analysis, copilot) gets a ContextProfile that defines which slots participate and at what priority. Large context is accessible on-demand via tools rather than stuffed into the window.

**Tech Stack:** TypeScript, Zod, Kysely (SQLite), Obsidian API, EventBus, Handlebars templates

**Spec:** `docs/superpowers/specs/2026-05-02-unified-context-pipeline-design.md`

---

## Phase 1: Foundation

### Task 1: Add MobiusOperationRepo Reader Methods

**Files:**
- Modify: `src/core/storage/sqlite/repositories/MobiusOperationRepo.ts:15-48`
- Create: `test/mobius-operation-repo.test.ts`

- [ ] **Step 1: Implement reader methods**

Add to `src/core/storage/sqlite/repositories/MobiusOperationRepo.ts` after line 48 (`insertRow` method):

```typescript
async getRecent(params: {
  limit: number;
  sinceTs?: number;
  types?: string[];
}): Promise<MobiusOperationRow[]> {
  let query = this.db
    .selectFrom('mobius_operation')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(params.limit);

  if (params.sinceTs != null) {
    query = query.where('created_at', '>=', params.sinceTs);
  }
  if (params.types && params.types.length > 0) {
    query = query.where('operation_type', 'in', params.types);
  }

  return await query.execute();
}

async countByTypeSince(sinceTs: number): Promise<Record<string, number>> {
  const rows = await this.db
    .selectFrom('mobius_operation')
    .select(['operation_type'])
    .select(this.db.fn.count<number>('id').as('cnt'))
    .where('created_at', '>=', sinceTs)
    .groupBy('operation_type')
    .execute();

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.operation_type] = Number(row.cnt);
  }
  return result;
}
```

Also add the row type at the top of the file (after imports):

```typescript
export interface MobiusOperationRow {
  id: string;
  operation_type: string;
  operation_desc: string | null;
  created_at: number;
  related_kind: string | null;
  related_id: string | null;
  important_level: number | null;
  continuous_group_id: string | null;
  meta_json: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/storage/sqlite/repositories/MobiusOperationRepo.ts
git commit -m "feat(context): add reader methods to MobiusOperationRepo"
```

---

### Task 2: Add New EventBus Event Types

**Files:**
- Modify: `src/core/eventBus.ts:7-18`

- [ ] **Step 1: Add new event types to ViewEventType enum**

In `src/core/eventBus.ts`, add new values to the `ViewEventType` enum (after line 17, before the closing brace):

```typescript
// Existing values remain...
// Add these new ones:
COPILOT_ACTION = 'copilot-action',
SEARCH_QUERY = 'search-query',
RESOURCE_ATTACHED = 'resource-attached',
AI_ANALYSIS_COMPLETE = 'ai-analysis-complete',
```

- [ ] **Step 2: Commit**

```bash
git add src/core/eventBus.ts
git commit -m "feat(context): add new EventBus event types for unified context tracking"
```

---

### Task 3: Implement SessionContextService Core

**Files:**
- Create: `src/service/context/types.ts`
- Create: `src/service/context/SessionContextService.ts`
- Create: `test/session-context-service.test.ts`

- [ ] **Step 1: Create types**

```typescript
// src/service/context/types.ts

export type OperationType =
  | 'chat_message'
  | 'ai_analysis_complete'
  | 'copilot_action'
  | 'file_open'
  | 'resource_attach'
  | 'search_query';

export interface ActivityEntry {
  id: string;
  type: OperationType;
  timestamp: number;
  summary: string;
  relatedPaths: string[];
  importanceLevel: 0 | 1 | 2;
  metadata?: Record<string, unknown>;
}

export interface WorkingTheme {
  ruleBased: {
    topTags: string[];
    topFolders: string[];
    topKeywords: string[];
    summary: string;
  };
  llmInferred: {
    summary: string;
    relatedFiles: string[];
    updatedAt: number;
  } | null;
}

export interface WorkingContext {
  activeFile: { path: string; title: string; openedAt: number } | null;
  recentActivities: ActivityEntry[];
  workingTheme: WorkingTheme;
  updatedAt: number;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// test/session-context-service.test.ts
import { describe, it, expect } from 'vitest';
import { SessionContextService } from '../src/service/context/SessionContextService';
import type { WorkingContext, ActivityEntry } from '../src/service/context/types';

describe('SessionContextService', () => {
  it('buildWorkingContextFromRows converts operation rows to WorkingContext', () => {
    const rows = [
      {
        id: '1', operation_type: 'file_open', operation_desc: 'Opened research/graph.md',
        created_at: Date.now(), related_kind: 'file', related_id: 'research/graph.md',
        important_level: 0, continuous_group_id: null, meta_json: null,
      },
      {
        id: '2', operation_type: 'search_query', operation_desc: 'Searched: semantic zoom',
        created_at: Date.now() - 60000, related_kind: null, related_id: null,
        important_level: 1, continuous_group_id: null, meta_json: JSON.stringify({ query: 'semantic zoom' }),
      },
    ];

    const ctx = SessionContextService.buildWorkingContextFromRows(rows);

    expect(ctx.recentActivities).toHaveLength(2);
    expect(ctx.recentActivities[0].type).toBe('file_open');
    expect(ctx.recentActivities[0].relatedPaths).toContain('research/graph.md');
    expect(ctx.workingTheme.ruleBased.topKeywords).toContain('semantic zoom');
  });

  it('buildWorkingContextFromRows deduplicates continuous groups', () => {
    const now = Date.now();
    const rows = [
      {
        id: '1', operation_type: 'file_open', operation_desc: 'Opened a.md',
        created_at: now, related_kind: 'file', related_id: 'a.md',
        important_level: 0, continuous_group_id: 'g1', meta_json: null,
      },
      {
        id: '2', operation_type: 'file_open', operation_desc: 'Opened b.md',
        created_at: now - 1000, related_kind: 'file', related_id: 'b.md',
        important_level: 0, continuous_group_id: 'g1', meta_json: null,
      },
      {
        id: '3', operation_type: 'file_open', operation_desc: 'Opened c.md',
        created_at: now - 2000, related_kind: 'file', related_id: 'c.md',
        important_level: 0, continuous_group_id: 'g1', meta_json: null,
      },
    ];

    const ctx = SessionContextService.buildWorkingContextFromRows(rows);

    // Group should be collapsed into one activity
    expect(ctx.recentActivities).toHaveLength(1);
    expect(ctx.recentActivities[0].relatedPaths).toEqual(['a.md', 'b.md', 'c.md']);
    expect(ctx.recentActivities[0].summary).toContain('3');
  });

  it('computeRuleBasedTheme extracts tags, folders, keywords', () => {
    const activities: ActivityEntry[] = [
      { id: '1', type: 'file_open', timestamp: Date.now(), summary: 'Opened research/graph.md',
        relatedPaths: ['research/graph.md'], importanceLevel: 0 },
      { id: '2', type: 'file_open', timestamp: Date.now(), summary: 'Opened research/viz.md',
        relatedPaths: ['research/viz.md'], importanceLevel: 0 },
      { id: '3', type: 'search_query', timestamp: Date.now(), summary: 'Searched: semantic zoom',
        relatedPaths: [], importanceLevel: 1, metadata: { query: 'semantic zoom' } },
    ];

    const theme = SessionContextService.computeRuleBasedTheme(activities);

    expect(theme.topFolders).toContain('research');
    expect(theme.topKeywords).toContain('semantic zoom');
    expect(theme.summary).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- test/session-context-service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement SessionContextService**

```typescript
// src/service/context/SessionContextService.ts
import type { App } from 'obsidian';
import type { MobiusOperationRow } from '@/core/storage/sqlite/repositories/MobiusOperationRepo';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { ViewEventType } from '@/core/eventBus';
import type { EventBus } from '@/core/eventBus';
import type {
  ActivityEntry,
  OperationType,
  WorkingContext,
  WorkingTheme,
} from './types';

const DECAY_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const CONTINUOUS_GROUP_THRESHOLD_MS = 3000; // 3 seconds

export class SessionContextService {
  private static instance: SessionContextService | null = null;
  private workingContext: WorkingContext;
  private unsubscribers: Array<() => void> = [];
  private lastGroupId: string | null = null;
  private lastOperationType: string | null = null;
  private lastOperationTs = 0;

  private constructor(
    private readonly app: App,
    private readonly eventBus: EventBus,
  ) {
    this.workingContext = this.emptyWorkingContext();
  }

  static getInstance(app?: App, eventBus?: EventBus): SessionContextService {
    if (!SessionContextService.instance) {
      if (!app || !eventBus) throw new Error('SessionContextService not initialized');
      SessionContextService.instance = new SessionContextService(app, eventBus);
    }
    return SessionContextService.instance;
  }

  static destroyInstance(): void {
    SessionContextService.instance?.destroy();
    SessionContextService.instance = null;
  }

  /** Initialize: rebuild from SQLite + subscribe to events */
  async init(): Promise<void> {
    await this.rebuildFromSqlite();
    this.subscribeToEvents();
  }

  /** Get current working context snapshot */
  getWorkingContext(): WorkingContext {
    return this.workingContext;
  }

  /** Record an activity (write to SQLite + update in-memory) */
  async recordActivity(params: {
    type: OperationType;
    summary: string;
    relatedPaths?: string[];
    importanceLevel?: 0 | 1 | 2;
    relatedKind?: string;
    relatedId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const now = Date.now();

    // Continuous group detection
    let groupId: string | null = null;
    if (
      params.type === this.lastOperationType &&
      now - this.lastOperationTs < CONTINUOUS_GROUP_THRESHOLD_MS
    ) {
      groupId = this.lastGroupId ?? `grp_${now}`;
    }
    this.lastOperationType = params.type;
    this.lastOperationTs = now;
    this.lastGroupId = groupId;

    const id = `op_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Write to SQLite immediately
    const repo = sqliteStoreManager.getMobiusOperationRepo();
    await repo.insertRow({
      id,
      operation_type: params.type,
      operation_desc: params.summary,
      created_at: now,
      related_kind: params.relatedKind ?? null,
      related_id: params.relatedId ?? null,
      important_level: params.importanceLevel ?? 0,
      continuous_group_id: groupId,
      meta_json: params.metadata ? JSON.stringify(params.metadata) : null,
    });

    // Update in-memory
    const entry: ActivityEntry = {
      id,
      type: params.type,
      timestamp: now,
      summary: params.summary,
      relatedPaths: params.relatedPaths ?? [],
      importanceLevel: params.importanceLevel ?? 0,
      metadata: params.metadata,
    };

    this.addActivityToContext(entry, groupId);
  }

  /** Rebuild WorkingContext from SQLite rows (used on init and crash recovery) */
  private async rebuildFromSqlite(): Promise<void> {
    const repo = sqliteStoreManager.getMobiusOperationRepo();
    const sinceTs = Date.now() - DECAY_WINDOW_MS;
    const rows = await repo.getRecent({ limit: 100, sinceTs });
    this.workingContext = SessionContextService.buildWorkingContextFromRows(rows);
  }

  /** Pure function: convert DB rows → WorkingContext (testable) */
  static buildWorkingContextFromRows(rows: MobiusOperationRow[]): WorkingContext {
    // Group by continuous_group_id
    const groupMap = new Map<string, MobiusOperationRow[]>();
    const ungrouped: MobiusOperationRow[] = [];

    for (const row of rows) {
      if (row.continuous_group_id) {
        const group = groupMap.get(row.continuous_group_id) ?? [];
        group.push(row);
        groupMap.set(row.continuous_group_id, group);
      } else {
        ungrouped.push(row);
      }
    }

    const activities: ActivityEntry[] = [];

    // Process ungrouped rows
    for (const row of ungrouped) {
      activities.push(SessionContextService.rowToActivity(row));
    }

    // Process groups — collapse into single activity
    for (const [, groupRows] of groupMap) {
      const sorted = groupRows.sort((a, b) => b.created_at - a.created_at);
      const newest = sorted[0];
      const allPaths = sorted
        .map(r => r.related_id)
        .filter((p): p is string => p != null);
      const folder = SessionContextService.commonFolder(allPaths);

      activities.push({
        id: newest.id,
        type: newest.operation_type as OperationType,
        timestamp: newest.created_at,
        summary: `Browsed ${sorted.length} files${folder ? ` in ${folder}` : ''} (most recent: ${SessionContextService.fileName(allPaths[0])})`,
        relatedPaths: allPaths,
        importanceLevel: 0,
      });
    }

    // Sort by timestamp desc
    activities.sort((a, b) => b.timestamp - a.timestamp);

    const theme = SessionContextService.computeRuleBasedTheme(activities);

    return {
      activeFile: null, // Set by file-open handler
      recentActivities: activities,
      workingTheme: { ruleBased: theme, llmInferred: null },
      updatedAt: Date.now(),
    };
  }

  /** Pure function: compute rule-based theme from activities (testable) */
  static computeRuleBasedTheme(activities: ActivityEntry[]): WorkingTheme['ruleBased'] {
    const folderCounts = new Map<string, number>();
    const keywordList: string[] = [];
    const tagSet = new Set<string>();

    for (const a of activities) {
      // Extract folders
      for (const p of a.relatedPaths) {
        const folder = p.split('/').slice(0, -1).join('/');
        if (folder) folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
      }

      // Extract keywords from search queries
      if (a.type === 'search_query' && a.metadata?.query) {
        keywordList.push(a.metadata.query as string);
      }

      // Extract tags from metadata
      if (a.metadata?.tags && Array.isArray(a.metadata.tags)) {
        for (const tag of a.metadata.tags) tagSet.add(tag as string);
      }
    }

    const topFolders = [...folderCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f]) => f);

    const topKeywords = keywordList.slice(0, 5);
    const topTags = [...tagSet].slice(0, 5);

    const parts: string[] = [];
    if (topFolders.length > 0) parts.push(`Active in ${topFolders.join(', ')}`);
    if (topTags.length > 0) parts.push(`topics: ${topTags.join(', ')}`);
    if (topKeywords.length > 0) parts.push(`recent searches: '${topKeywords.join("', '")}'`);

    return {
      topFolders,
      topKeywords,
      topTags,
      summary: parts.join('; ') || 'No recent activity',
    };
  }

  // --- Private helpers ---

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.eventBus.on(ViewEventType.MESSAGE_SENT, (data: any) => {
        this.recordActivity({
          type: 'chat_message',
          summary: `Chat: ${(data.content ?? '').slice(0, 80)}`,
          relatedPaths: [],
          importanceLevel: 0,
          relatedKind: 'conversation',
          relatedId: data.conversationId,
          metadata: { role: data.role, contentPreview: (data.content ?? '').slice(0, 200) },
        });
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on(ViewEventType.COPILOT_ACTION, (data: any) => {
        this.recordActivity({
          type: 'copilot_action',
          summary: `Copilot ${data.action}: ${SessionContextService.fileName(data.targetFile)}${data.resultSummary ? ' — ' + data.resultSummary : ''}`,
          relatedPaths: data.targetFile ? [data.targetFile] : [],
          importanceLevel: 1,
          relatedKind: 'file',
          relatedId: data.targetFile,
          metadata: { action: data.action, resultSummary: data.resultSummary },
        });
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on(ViewEventType.SEARCH_QUERY, (data: any) => {
        this.recordActivity({
          type: 'search_query',
          summary: `Search: '${(data.query ?? '').slice(0, 80)}'`,
          relatedPaths: [],
          importanceLevel: 1,
          metadata: { query: data.query, mode: data.mode },
        });
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on(ViewEventType.AI_ANALYSIS_COMPLETE, (data: any) => {
        this.recordActivity({
          type: 'ai_analysis_complete',
          summary: `AI Analysis: '${(data.query ?? '').slice(0, 60)}' → ${data.sourcesCount ?? 0} sources`,
          relatedPaths: data.sources ?? [],
          importanceLevel: 2,
          relatedKind: 'ai_analysis_record',
          relatedId: data.recordId,
          metadata: { query: data.query, title: data.title, sourcesCount: data.sourcesCount },
        });
      }),
    );

    this.unsubscribers.push(
      this.eventBus.on(ViewEventType.RESOURCE_ATTACHED, (data: any) => {
        this.recordActivity({
          type: 'resource_attach',
          summary: `Attached: ${SessionContextService.fileName(data.path)}`,
          relatedPaths: data.path ? [data.path] : [],
          importanceLevel: 0,
          relatedKind: 'resource',
          relatedId: data.path,
        });
      }),
    );

    // File open — via Obsidian workspace event
    const fileOpenRef = this.app.workspace.on('file-open', (file) => {
      if (!file) return;
      this.workingContext.activeFile = {
        path: file.path,
        title: file.basename,
        openedAt: Date.now(),
      };
      this.recordActivity({
        type: 'file_open',
        summary: `Opened ${file.path}`,
        relatedPaths: [file.path],
        importanceLevel: 0,
        relatedKind: 'file',
        relatedId: file.path,
      });
    });
    this.unsubscribers.push(() => this.app.workspace.offref(fileOpenRef));
  }

  private addActivityToContext(entry: ActivityEntry, groupId: string | null): void {
    if (groupId) {
      // Try to merge into existing group
      const existingIdx = this.workingContext.recentActivities.findIndex(
        a => a.id === groupId || a.metadata?.groupId === groupId
      );
      if (existingIdx >= 0) {
        const existing = this.workingContext.recentActivities[existingIdx];
        existing.relatedPaths = [...new Set([...existing.relatedPaths, ...entry.relatedPaths])];
        existing.timestamp = Math.max(existing.timestamp, entry.timestamp);
        existing.summary = `Browsed ${existing.relatedPaths.length} files (most recent: ${SessionContextService.fileName(entry.relatedPaths[0])})`;
        existing.metadata = { ...existing.metadata, groupId };
        return;
      }
      entry.metadata = { ...entry.metadata, groupId };
    }

    this.workingContext.recentActivities.unshift(entry);

    // Trim to decay window
    const cutoff = Date.now() - DECAY_WINDOW_MS;
    this.workingContext.recentActivities = this.workingContext.recentActivities.filter(
      a => a.timestamp >= cutoff
    );

    // Recompute rule-based theme
    this.workingContext.workingTheme.ruleBased =
      SessionContextService.computeRuleBasedTheme(this.workingContext.recentActivities);
    this.workingContext.updatedAt = Date.now();
  }

  private destroy(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  private emptyWorkingContext(): WorkingContext {
    return {
      activeFile: null,
      recentActivities: [],
      workingTheme: {
        ruleBased: { topTags: [], topFolders: [], topKeywords: [], summary: 'No recent activity' },
        llmInferred: null,
      },
      updatedAt: Date.now(),
    };
  }

  static fileName(path: string | undefined): string {
    if (!path) return '(unknown)';
    return path.split('/').pop() ?? path;
  }

  static commonFolder(paths: string[]): string | null {
    if (paths.length === 0) return null;
    const folders = paths.map(p => p.split('/').slice(0, -1).join('/'));
    const first = folders[0];
    if (folders.every(f => f === first)) return first || null;
    // Find common prefix
    const parts = first.split('/');
    for (let i = parts.length; i > 0; i--) {
      const prefix = parts.slice(0, i).join('/');
      if (folders.every(f => f.startsWith(prefix))) return prefix;
    }
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- test/session-context-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/service/context/types.ts src/service/context/SessionContextService.ts test/session-context-service.test.ts
git commit -m "feat(context): implement SessionContextService with activity tracking and working theme"
```

---

### Task 4: Add New PromptIds and Templates

**Files:**
- Modify: `src/service/prompt/PromptId.ts:265-266` (enum) and `src/service/prompt/PromptId.ts:780-782` (PromptVariables)
- Create: `templates/prompt/working-theme-inference.prompt.md`
- Create: `templates/prompt/working-context-render.prompt.md`
- Create: `templates/prompt/activity-index-render.prompt.md`
- Create: `templates/prompt/message-chunk-summarize.prompt.md`

- [ ] **Step 1: Add PromptId entries**

In `src/service/prompt/PromptId.ts`, add before the closing brace of the enum (line 266):

```typescript
// Unified Context Pipeline
WorkingThemeInference = 'working-theme-inference',
WorkingContextRender = 'working-context-render',
ActivityIndexRender = 'activity-index-render',
MessageChunkSummarize = 'message-chunk-summarize',
```

In `PromptVariables` interface, add before the closing brace (line 782):

```typescript
[PromptId.WorkingThemeInference]: {
  activities: Array<{ type: string; summary: string; timestamp: number }>;
};
[PromptId.WorkingContextRender]: {
  theme: string;
  recentActivities: Array<{ summary: string; timeAgo: string }>;
  activeFile: { path: string; title: string } | null;
};
[PromptId.ActivityIndexRender]: {
  activities: Array<{ id: string; timeAgo: string; summary: string }>;
  counts: Record<string, number>;
};
[PromptId.MessageChunkSummarize]: {
  messages: Array<{ role: string; content: string }>;
};
```

- [ ] **Step 2: Create prompt templates**

```markdown
<!-- templates/prompt/working-theme-inference.prompt.md -->
Based on the user's recent activities in their knowledge base, infer what they are currently working on. Be specific and concise (1-2 sentences).

## Recent Activities
{{#each activities}}
- [{{type}}] {{summary}} ({{timestamp}})
{{/each}}

Respond with JSON:
{"summary": "...", "relatedFiles": ["path1", "path2"]}
```

```markdown
<!-- templates/prompt/working-context-render.prompt.md -->
## Current Working Context
{{#if activeFile}}
Currently editing: {{activeFile.title}} ({{activeFile.path}})
{{/if}}

**Working on:** {{theme}}

{{#if recentActivities.length}}
### Recent Activity
{{#each recentActivities}}
- {{timeAgo}}: {{summary}}
{{/each}}
{{/if}}
```

```markdown
<!-- templates/prompt/activity-index-render.prompt.md -->
## Recent User Activity
{{#each activities}}
- [{{id}}] {{timeAgo}}: {{summary}}
{{/each}}

{{#if (gt (lookup counts 'total') 0)}}
Summary: {{lookup counts 'file_open'}} file opens, {{lookup counts 'search_query'}} searches, {{lookup counts 'copilot_action'}} copilot actions, {{lookup counts 'ai_analysis_complete'}} analyses
{{/if}}

Use get_activity_detail(id) for full context of any activity.
```

```markdown
<!-- templates/prompt/message-chunk-summarize.prompt.md -->
Summarize the following conversation excerpt concisely. Preserve key decisions, questions asked, and conclusions reached. Omit greetings and filler.

{{#each messages}}
**{{role}}**: {{content}}

{{/each}}

Provide a concise summary (2-4 sentences):
```

- [ ] **Step 3: Register templates in TemplateRegistry**

Find the template registration file (likely `src/core/template/TemplateRegistry.ts` or equivalent) and register the new templates following the existing pattern. The exact registration depends on how templates are currently loaded — check how existing `PromptId` entries are registered.

- [ ] **Step 4: Commit**

```bash
git add src/service/prompt/PromptId.ts templates/prompt/working-theme-inference.prompt.md templates/prompt/working-context-render.prompt.md templates/prompt/activity-index-render.prompt.md templates/prompt/message-chunk-summarize.prompt.md
git commit -m "feat(context): add PromptIds and templates for unified context pipeline"
```

---

### Task 5: Wire SessionContextService into Plugin Lifecycle

**Files:**
- Modify: `src/app/context/AppContext.ts:102-137` (add SessionContextService to constructor)
- Modify: `src/main.ts` (init SessionContextService after EventBus)

- [ ] **Step 1: Add SessionContextService to AppContext**

In `src/app/context/AppContext.ts`, add a private field and accessor:

```typescript
// Add import at top
import { SessionContextService } from '@/service/context/SessionContextService';

// Add field in the class (near other private fields)
private sessionContextService: SessionContextService | null = null;

// Add static accessor (near other static getters, after line 87)
static getSessionContext(): SessionContextService {
  return SessionContextService.getInstance();
}
```

- [ ] **Step 2: Initialize in main.ts**

In `main.ts`, after `EventBus.getInstance(app)` is called (around line 122) and after `AppContext` constructor, add:

```typescript
// Initialize SessionContextService (after EventBus is ready)
const sessionContext = SessionContextService.getInstance(this.app, EventBus.getInstance(this.app));
await sessionContext.init();
```

In the plugin's `onunload()` method, add cleanup:

```typescript
SessionContextService.destroyInstance();
```

- [ ] **Step 3: Commit**

```bash
git add src/app/context/AppContext.ts src/main.ts
git commit -m "feat(context): wire SessionContextService into plugin lifecycle"
```

---

## Phase 2: Slot System

### Task 6: Implement ContextSlot Interface and Core Types

**Files:**
- Create: `src/service/chat/context/slots/types.ts`

- [ ] **Step 1: Create slot types**

```typescript
// src/service/chat/context/slots/types.ts
import type { LLMRequestMessage, LLMStreamEvent, ModelCapabilities } from '@/core/providers/types';
import type { ChatConversation, ChatProject, ChatMessage } from '../../types';
import type { SessionContextService } from '@/service/context/SessionContextService';
import type { App } from 'obsidian';

export interface SlotBuildContext {
  sessionContext: SessionContextService;
  conversation?: ChatConversation;
  project?: ChatProject;
  messages?: ChatMessage[];
  activeFilePath?: string;
  modelCapabilities?: ModelCapabilities;
  app: App;
  [key: string]: unknown; // buildParams from profile
}

export interface SlotContent {
  data: unknown;
  tokens: number;
  compressionLevel: 0 | 1 | 2 | 3;
}

export interface ContextSlot {
  id: string;
  build(ctx: SlotBuildContext): Promise<SlotContent>;
  compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent>;
  estimateTokens(content: SlotContent): number;
  render(content: SlotContent): LLMRequestMessage[];
}

export interface SlotConfig {
  slotId: string;
  priority: number;
  maxTokens: number | 'rest';
  required: boolean;
  maxCompressionLevel: 0 | 1 | 2 | 3;
  buildParams?: Record<string, unknown>;
}

export interface ContextProfile {
  id: string;
  totalBudget: number | 'auto';
  slots: SlotConfig[];
}

/** Helper: estimate tokens from text (fast heuristic) */
export function estimateTokensFromText(text: string): number {
  // CJK characters are ~1 token each, Latin ~0.25 tokens per char
  let cjkChars = 0;
  let otherChars = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) cjkChars++;
    else otherChars++;
  }
  return Math.ceil(cjkChars + otherChars / 3.5);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/service/chat/context/slots/types.ts
git commit -m "feat(context): define ContextSlot, SlotConfig, ContextProfile interfaces"
```

---

### Task 7: Implement Core Slots (SystemPrompt, UserProfile, ConvSummary, RecentMessages)

These four slots directly replace the existing ContextBuilder's 4 steps.

**Files:**
- Create: `src/service/chat/context/slots/SystemPromptSlot.ts`
- Create: `src/service/chat/context/slots/UserProfileSlot.ts`
- Create: `src/service/chat/context/slots/ConvSummarySlot.ts`
- Create: `src/service/chat/context/slots/RecentMessagesSlot.ts`
- Create: `test/context-slots.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/context-slots.test.ts
import { describe, it, expect } from 'vitest';
import { estimateTokensFromText } from '../src/service/chat/context/slots/types';

describe('estimateTokensFromText', () => {
  it('estimates English text', () => {
    const text = 'Hello world, this is a test sentence.';
    const tokens = estimateTokensFromText(text);
    // ~36 chars / 3.5 ≈ 10 tokens
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(20);
  });

  it('estimates CJK text higher', () => {
    const text = '这是一个测试句子';
    const tokens = estimateTokensFromText(text);
    // 8 CJK chars ≈ 8 tokens
    expect(tokens).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/context-slots.test.ts`
Expected: FAIL — module not found (until Task 6 is committed)

- [ ] **Step 3: Implement SystemPromptSlot**

```typescript
// src/service/chat/context/slots/SystemPromptSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class SystemPromptSlot implements ContextSlot {
  id = 'system-prompt';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const promptId = (ctx.systemPromptId as PromptId) ?? PromptId.ConversationSystem;
    const text = await this.promptService.render(promptId, ctx.systemPromptVars ?? {});
    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent): Promise<SlotContent> {
    return content; // System prompt is not compressible
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    const text = content.data as string;
    if (!text) return [];
    return [{ role: 'system', content: [{ type: 'text', text }] }];
  }
}
```

- [ ] **Step 4: Implement UserProfileSlot**

```typescript
// src/service/chat/context/slots/UserProfileSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import type { UserProfileService } from '@/service/chat/context/UserProfileService';
import { PromptId } from '@/service/prompt/PromptId';

export class UserProfileSlot implements ContextSlot {
  id = 'user-profile';

  constructor(
    private readonly promptService: PromptService,
    private readonly userProfileService: UserProfileService | undefined,
  ) {}

  async build(): Promise<SlotContent> {
    if (!this.userProfileService) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }
    const contextMap = await this.userProfileService.loadContext();
    if (contextMap.size === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const entries = Array.from(contextMap.entries()).map(([category, texts]) => ({
      category,
      texts: texts.join(', '),
    }));

    const text = (await this.promptService.render(PromptId.UserProfileContext, {
      contextEntries: entries,
    })).trim();

    return { data: { text, entries }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (level >= 1 && content.data) {
      // L1: keep only top N categories
      const { entries } = content.data as { text: string; entries: Array<{ category: string; texts: string }> };
      const truncated = entries.slice(0, 3);
      const text = truncated.map(e => `${e.category}: ${e.texts}`).join('\n');
      return { data: { text, entries: truncated }, tokens: estimateTokensFromText(text), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    const { text } = content.data as { text: string };
    if (!text) return [];
    return [{ role: 'user', content: [{ type: 'text', text }] }];
  }
}
```

- [ ] **Step 5: Implement ConvSummarySlot**

```typescript
// src/service/chat/context/slots/ConvSummarySlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class ConvSummarySlot implements ContextSlot {
  id = 'conv-summary';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const conv = ctx.conversation;
    const project = ctx.project;
    if (!conv) return { data: null, tokens: 0, compressionLevel: 0 };

    const projectSummary = project?.context?.fullSummary || project?.context?.shortSummary;
    const convSummary = conv.context?.fullSummary || conv.context?.shortSummary;

    const templateVars = {
      hasProject: !!project && !!projectSummary,
      projectName: project?.meta.name || '',
      projectSummary: projectSummary || '',
      projectResources: (project?.context?.resourceIndex || []).map(r => ({
        displayName: r.title || r.id,
        displaySummary: r.shortSummary || r.source,
      })),
      hasConversation: !!convSummary,
      conversationSummary: convSummary || '',
      conversationTopics: conv.context?.topics || [],
      conversationResources: (conv.context?.resourceIndex || []).map(r => ({
        displayName: r.title || r.id,
        displaySummary: r.shortSummary || r.source,
      })),
    };

    const text = (await this.promptService.render(PromptId.ContextMemory, templateVars)).trim();
    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };

    return { data: { text, templateVars }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { templateVars } = content.data as { text: string; templateVars: any };

    if (level >= 1) {
      // L1: use shortSummary, drop resource details
      const conv = templateVars;
      const shortText = [
        conv.hasProject ? `Project: ${conv.projectName}` : '',
        conv.hasConversation ? `Summary: ${conv.conversationSummary.slice(0, 200)}` : '',
      ].filter(Boolean).join('\n');
      return { data: { text: shortText, templateVars }, tokens: estimateTokensFromText(shortText), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    const { text } = content.data as { text: string };
    if (!text) return [];
    return [{ role: 'system', content: [{ type: 'text', text }] }];
  }
}
```

- [ ] **Step 6: Implement RecentMessagesSlot**

```typescript
// src/service/chat/context/slots/RecentMessagesSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage, MessagePart } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import type { ResourceSummaryService } from '../ResourceSummaryService';
import { PromptId } from '@/service/prompt/PromptId';
import { getImageMimeType, getFileMimeType } from '@/core/document/helper/FileTypeUtils';
import { readFileAsBase64 } from '@/core/utils/obsidian-utils';

const DEFAULT_MAX_RECENT = 10;

export class RecentMessagesSlot implements ContextSlot {
  id = 'recent-messages';

  constructor(
    private readonly promptService: PromptService,
    private readonly resourceSummaryService: ResourceSummaryService,
  ) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const messages = ctx.messages ?? [];
    const maxRecent = (ctx.maxRecentMessages as number) ?? DEFAULT_MAX_RECENT;
    const recent = messages.slice(-maxRecent);

    // Estimate tokens from message content
    let totalTokens = 0;
    for (const msg of recent) {
      if (msg.content) totalTokens += estimateTokensFromText(msg.content);
    }

    return {
      data: { messages: recent, ctx },
      tokens: totalTokens,
      compressionLevel: 0,
    };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    const { messages, ctx } = content.data as { messages: any[]; ctx: SlotBuildContext };

    if (level === 1) {
      // L1: reduce to fewer messages
      const reduced = messages.slice(-Math.ceil(messages.length / 2));
      let tokens = 0;
      for (const msg of reduced) {
        if (msg.content) tokens += estimateTokensFromText(msg.content);
      }
      return { data: { messages: reduced, ctx }, tokens, compressionLevel: 1 };
    }

    if (level === 2) {
      // L2: keep last 3 verbatim, replace older with one-line summaries
      const verbatim = messages.slice(-3);
      const older = messages.slice(0, -3);
      const olderSummaries = older.map((m: any) => ({
        ...m,
        content: `[${m.role}]: ${(m.content ?? '').slice(0, 100)}...`,
        _compressed: true,
      }));
      const all = [...olderSummaries, ...verbatim];
      let tokens = 0;
      for (const msg of all) {
        if (msg.content) tokens += estimateTokensFromText(msg.content);
      }
      return { data: { messages: all, ctx }, tokens, compressionLevel: 2 };
    }

    // L3: LLM summarize would be handled by BudgetGovernor externally
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    const { messages, ctx } = content.data as { messages: any[]; ctx: SlotBuildContext };
    const result: LLMRequestMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const parts: MessagePart[] = [];

      if (msg.content) {
        parts.push({ type: 'text', text: msg.content });
      }

      // Resource handling for latest message (direct mode) vs older (summary)
      if (msg.resources && msg.resources.length > 0) {
        const isLatest = i === messages.length - 1;
        if (isLatest && ctx.attachmentHandlingMode === 'direct') {
          // Direct resource content would be built here
          // (delegated to the existing buildDirectResourceContent logic)
        } else {
          // Just note the resources exist
          parts.push({
            type: 'text',
            text: `[Attached: ${msg.resources.map((r: any) => r.id ?? r.source).join(', ')}]`,
          });
        }
      }

      if (parts.length > 0) {
        result.push({ role: msg.role, content: parts });
      }
    }

    return result;
  }
}
```

- [ ] **Step 7: Run tests**

Run: `npm run test -- test/context-slots.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/service/chat/context/slots/SystemPromptSlot.ts src/service/chat/context/slots/UserProfileSlot.ts src/service/chat/context/slots/ConvSummarySlot.ts src/service/chat/context/slots/RecentMessagesSlot.ts test/context-slots.test.ts
git commit -m "feat(context): implement core slots — SystemPrompt, UserProfile, ConvSummary, RecentMessages"
```

---

### Task 8: Implement New Context Slots (WorkingContext, ActivityIndex, VaultIntuition, PrevAnalysis, CurrentFile, ResourceIndex)

**Files:**
- Create: `src/service/chat/context/slots/WorkingContextSlot.ts`
- Create: `src/service/chat/context/slots/ActivityIndexSlot.ts`
- Create: `src/service/chat/context/slots/VaultIntuitionSlot.ts`
- Create: `src/service/chat/context/slots/PrevAnalysisSlot.ts`
- Create: `src/service/chat/context/slots/CurrentFileSlot.ts`
- Create: `src/service/chat/context/slots/ResourceIndexSlot.ts`

- [ ] **Step 1: Implement WorkingContextSlot**

```typescript
// src/service/chat/context/slots/WorkingContextSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class WorkingContextSlot implements ContextSlot {
  id = 'working-context';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const wc = ctx.sessionContext.getWorkingContext();
    const theme = wc.workingTheme.llmInferred?.summary ?? wc.workingTheme.ruleBased.summary;

    const now = Date.now();
    const recentActivities = wc.recentActivities.slice(0, 8).map(a => ({
      summary: a.summary,
      timeAgo: formatTimeAgo(now - a.timestamp),
    }));

    const text = (await this.promptService.render(PromptId.WorkingContextRender, {
      theme,
      recentActivities,
      activeFile: wc.activeFile ? { path: wc.activeFile.path, title: wc.activeFile.title } : null,
    })).trim();

    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };
    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const text = content.data as string;

    if (level >= 1) {
      // L1: keep only theme line + active file
      const lines = text.split('\n').filter(l => l.trim());
      const reduced = lines.slice(0, 3).join('\n');
      return { data: reduced, tokens: estimateTokensFromText(reduced), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    return [{ role: 'system', content: [{ type: 'text', text: content.data as string }] }];
  }
}

function formatTimeAgo(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}
```

- [ ] **Step 2: Implement ActivityIndexSlot**

```typescript
// src/service/chat/context/slots/ActivityIndexSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import type { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/service/prompt/PromptId';

export class ActivityIndexSlot implements ContextSlot {
  id = 'activity-index';

  constructor(private readonly promptService: PromptService) {}

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const wc = ctx.sessionContext.getWorkingContext();
    if (wc.recentActivities.length === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const now = Date.now();
    const activities = wc.recentActivities.slice(0, 10).map((a, i) => ({
      id: `A${i + 1}`,
      timeAgo: formatTimeAgo(now - a.timestamp),
      summary: a.summary,
    }));

    const counts: Record<string, number> = { total: wc.recentActivities.length };
    for (const a of wc.recentActivities) {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    }

    const text = (await this.promptService.render(PromptId.ActivityIndexRender, {
      activities,
      counts,
    })).trim();

    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };
    return { data: { text, activities }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { activities } = content.data as { text: string; activities: any[] };

    if (level >= 1) {
      // L1: aggregate counts only, drop individual items
      const countText = `Recent activity: ${activities.length} actions`;
      return { data: { text: countText, activities: [] }, tokens: estimateTokensFromText(countText), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    const { text } = content.data as { text: string };
    if (!text) return [];
    return [{ role: 'system', content: [{ type: 'text', text }] }];
  }
}

function formatTimeAgo(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}
```

- [ ] **Step 3: Implement VaultIntuitionSlot**

```typescript
// src/service/chat/context/slots/VaultIntuitionSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export class VaultIntuitionSlot implements ContextSlot {
  id = 'vault-intuition';

  async build(): Promise<SlotContent> {
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo('vault');
    const intuitionJson = await indexStateRepo.get('knowledge_intuition_json');

    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
    const folders = await nodeRepo.getTopFolders?.(30) ?? [];

    const parts: string[] = [];
    if (intuitionJson) parts.push(`## Vault Knowledge Map\n${intuitionJson}`);
    if (folders.length > 0) {
      parts.push('## Top Folders\n' + folders.map((f: any) =>
        `- ${f.path} (${f.docCount} docs)`
      ).join('\n'));
    }

    const text = parts.join('\n\n');
    if (!text) return { data: null, tokens: 0, compressionLevel: 0 };
    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const text = content.data as string;

    if (level >= 1) {
      // L1: truncate to first 1000 chars
      const truncated = text.slice(0, 1000);
      return { data: truncated, tokens: estimateTokensFromText(truncated), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    return [{ role: 'system', content: [{ type: 'text', text: content.data as string }] }];
  }
}
```

- [ ] **Step 4: Implement PrevAnalysisSlot**

```typescript
// src/service/chat/context/slots/PrevAnalysisSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';
import { AppContext } from '@/app/context/AppContext';

export class PrevAnalysisSlot implements ContextSlot {
  id = 'prev-analysis';

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const historyService = AppContext.getAIAnalysisHistoryService();
    const records = await historyService.list({ limit: 3, offset: 0 });

    if (records.length === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const lines = records.map(r =>
      `- "${r.query}" → ${r.title} (${r.sources_count} sources, ${new Date(r.created_at_ts).toLocaleString()})`
    );

    const text = `## Recent AI Analyses\n${lines.join('\n')}\n\nUse get_recent_analysis_result(query) for full details.`;
    return { data: { text, records }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { records } = content.data as { text: string; records: any[] };

    if (level >= 1) {
      // L1: only most recent, title only
      const r = records[0];
      const short = `Recent analysis: "${r.query}" → ${r.title}`;
      return { data: { text: short, records: [r] }, tokens: estimateTokensFromText(short), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    const { text } = content.data as { text: string };
    if (!text) return [];
    return [{ role: 'system', content: [{ type: 'text', text }] }];
  }
}
```

- [ ] **Step 5: Implement CurrentFileSlot**

```typescript
// src/service/chat/context/slots/CurrentFileSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';

export class CurrentFileSlot implements ContextSlot {
  id = 'current-file';

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const app = ctx.app;
    const filePath = ctx.activeFilePath ?? app.workspace.getActiveFile()?.path;
    if (!filePath) return { data: null, tokens: 0, compressionLevel: 0 };

    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) return { data: null, tokens: 0, compressionLevel: 0 };

    const metadataOnly = ctx.metadataOnly as boolean | undefined;
    const cache = app.metadataCache.getFileCache(file as any);

    if (metadataOnly) {
      const meta = [
        `File: ${filePath}`,
        cache?.frontmatter?.tags ? `Tags: ${cache.frontmatter.tags}` : '',
        cache?.headings ? `Headings: ${cache.headings.map(h => h.heading).join(', ')}` : '',
      ].filter(Boolean).join('\n');
      return { data: meta, tokens: estimateTokensFromText(meta), compressionLevel: 0 };
    }

    const content = await app.vault.cachedRead(file as any);
    const maxChars = 40000;
    const truncated = content.length > maxChars ? content.slice(0, maxChars) + '\n...[truncated]' : content;
    const text = `## Current File: ${filePath}\n\n${truncated}`;

    return { data: text, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const text = content.data as string;

    if (level >= 1) {
      // L1: first 2000 chars
      const truncated = text.slice(0, 2000) + '\n...[truncated]';
      return { data: truncated, tokens: estimateTokensFromText(truncated), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    return [{ role: 'system', content: [{ type: 'text', text: content.data as string }] }];
  }
}
```

- [ ] **Step 6: Implement ResourceIndexSlot**

```typescript
// src/service/chat/context/slots/ResourceIndexSlot.ts
import type { ContextSlot, SlotBuildContext, SlotContent } from './types';
import { estimateTokensFromText } from './types';
import type { LLMRequestMessage } from '@/core/providers/types';

export class ResourceIndexSlot implements ContextSlot {
  id = 'resource-index';

  async build(ctx: SlotBuildContext): Promise<SlotContent> {
    const resources = [
      ...(ctx.project?.context?.resourceIndex ?? []),
      ...(ctx.conversation?.context?.resourceIndex ?? []),
    ];

    if (resources.length === 0) {
      return { data: null, tokens: 0, compressionLevel: 0 };
    }

    const lines = resources.map((r: any) =>
      `- ${r.title || r.id}: ${r.shortSummary || r.source}`
    );
    const text = `## Referenced Resources\n${lines.join('\n')}`;
    return { data: { text, resources }, tokens: estimateTokensFromText(text), compressionLevel: 0 };
  }

  async compress(content: SlotContent, level: 1 | 2 | 3): Promise<SlotContent> {
    if (!content.data) return content;
    const { resources } = content.data as { text: string; resources: any[] };

    if (level >= 1) {
      // L1: titles only
      const titles = resources.map((r: any) => r.title || r.id).join(', ');
      const short = `Resources: ${titles}`;
      return { data: { text: short, resources }, tokens: estimateTokensFromText(short), compressionLevel: 1 };
    }
    return content;
  }

  estimateTokens(content: SlotContent): number {
    return content.tokens;
  }

  render(content: SlotContent): LLMRequestMessage[] {
    if (!content.data) return [];
    const { text } = content.data as { text: string };
    if (!text) return [];
    return [{ role: 'system', content: [{ type: 'text', text }] }];
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/service/chat/context/slots/WorkingContextSlot.ts src/service/chat/context/slots/ActivityIndexSlot.ts src/service/chat/context/slots/VaultIntuitionSlot.ts src/service/chat/context/slots/PrevAnalysisSlot.ts src/service/chat/context/slots/CurrentFileSlot.ts src/service/chat/context/slots/ResourceIndexSlot.ts
git commit -m "feat(context): implement WorkingContext, ActivityIndex, VaultIntuition, PrevAnalysis, CurrentFile, ResourceIndex slots"
```

---

### Task 9: Implement BudgetGovernor

**Files:**
- Create: `src/service/chat/context/BudgetGovernor.ts`
- Create: `test/budget-governor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/budget-governor.test.ts
import { describe, it, expect } from 'vitest';
import { BudgetGovernor } from '../src/service/chat/context/BudgetGovernor';
import type { SlotConfig, SlotContent, ContextSlot } from '../src/service/chat/context/slots/types';

function mockSlot(id: string, tokens: number, compressible = true): { slot: ContextSlot; content: SlotContent; config: SlotConfig } {
  return {
    slot: {
      id,
      async build() { return { data: 'x'.repeat(tokens * 4), tokens, compressionLevel: 0 as const }; },
      async compress(content: SlotContent, level: 1 | 2 | 3) {
        if (!compressible) return content;
        const factor = level === 1 ? 0.7 : level === 2 ? 0.4 : 0.2;
        const newTokens = Math.floor(content.tokens * factor);
        return { data: content.data, tokens: newTokens, compressionLevel: level };
      },
      estimateTokens(content: SlotContent) { return content.tokens; },
      render(content: SlotContent) { return [{ role: 'system' as const, content: [{ type: 'text' as const, text: String(content.data) }] }]; },
    },
    content: { data: 'x'.repeat(tokens * 4), tokens, compressionLevel: 0 as const },
    config: { slotId: id, priority: 500, maxTokens: tokens * 2, required: false, maxCompressionLevel: 3 },
  };
}

describe('BudgetGovernor', () => {
  it('returns all slots when within budget', () => {
    const governor = new BudgetGovernor();
    const items = [
      mockSlot('a', 100),
      mockSlot('b', 200),
    ];
    // Give each a different priority
    items[0].config.priority = 900;
    items[1].config.priority = 500;

    const result = await governor.fit(items, 500);
    expect(result).toHaveLength(2);
    expect(result.reduce((s, r) => s + r.content.tokens, 0)).toBeLessThanOrEqual(500);
  });

  it('compresses lowest-priority slot first when over budget', () => {
    const governor = new BudgetGovernor();
    const items = [
      mockSlot('high', 200),
      mockSlot('low', 400),
    ];
    items[0].config.priority = 900;
    items[1].config.priority = 100;

    const result = await governor.fit(items, 450);
    // 'low' should be compressed (400 → 280 at L1), total = 200 + 280 = 480 still over
    // Then L2: 400 → 160, total = 200 + 160 = 360, fits
    expect(result).toHaveLength(2);
    const lowResult = result.find(r => r.slot.id === 'low');
    expect(lowResult!.content.compressionLevel).toBeGreaterThan(0);
  });

  it('drops non-required slot when compression is insufficient', () => {
    const governor = new BudgetGovernor();
    const items = [
      mockSlot('required', 300, false),
      mockSlot('optional', 300, false),
    ];
    items[0].config.priority = 1000;
    items[0].config.required = true;
    items[0].config.maxCompressionLevel = 0;
    items[1].config.priority = 100;
    items[1].config.maxCompressionLevel = 0;

    const result = await governor.fit(items, 400);
    expect(result).toHaveLength(1);
    expect(result[0].slot.id).toBe('required');
  });

  it('never drops required slots', () => {
    const governor = new BudgetGovernor();
    const items = [
      mockSlot('r1', 300, false),
      mockSlot('r2', 300, false),
    ];
    items[0].config.required = true;
    items[0].config.priority = 1000;
    items[0].config.maxCompressionLevel = 0;
    items[1].config.required = true;
    items[1].config.priority = 900;
    items[1].config.maxCompressionLevel = 0;

    // Both required, budget too small — keep both anyway
    const result = await governor.fit(items, 400);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/budget-governor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BudgetGovernor**

```typescript
// src/service/chat/context/BudgetGovernor.ts
import type { ContextSlot, SlotConfig, SlotContent } from './slots/types';

export interface GovernedSlot {
  slot: ContextSlot;
  content: SlotContent;
  config: SlotConfig;
}

export class BudgetGovernor {
  /**
   * Fit slot contents within a token budget.
   * Strategy: compress lowest-priority non-required slots first (L1 → L2 → L3),
   * then drop if still over budget. Required slots are never dropped.
   */
  async fit(items: GovernedSlot[], totalBudget: number): Promise<GovernedSlot[]> {
    let totalTokens = items.reduce((s, item) => s + item.content.tokens, 0);

    if (totalTokens <= totalBudget) return items;

    const compressible = items
      .filter(item => !item.config.required)
      .sort((a, b) => a.config.priority - b.config.priority);

    // Phase 1: Try compression levels L1 → L2 → L3
    for (const level of [1, 2, 3] as const) {
      if (totalTokens <= totalBudget) break;

      for (const item of compressible) {
        if (totalTokens <= totalBudget) break;
        if (level > item.config.maxCompressionLevel) continue;
        if (item.content.compressionLevel >= level) continue;

        const before = item.content.tokens;
        const compressed = await item.slot.compress(item.content, level);
        const saved = before - compressed.tokens;
        if (saved > 0) {
          totalTokens -= saved;
          item.content = compressed;
        }
      }
    }

    // Phase 2: Drop
    if (totalTokens > totalBudget) {
      for (const item of compressible) {
        if (totalTokens <= totalBudget) break;
        totalTokens -= item.content.tokens;
        item.content = { data: null, tokens: 0, compressionLevel: 0 };
      }
    }

    return items.filter(item => item.content.tokens > 0 || item.config.required);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/budget-governor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/chat/context/BudgetGovernor.ts test/budget-governor.test.ts
git commit -m "feat(context): implement BudgetGovernor with multi-layer compression and priority-based dropping"
```

---

### Task 10: Implement ContextPipeline and Profiles

**Files:**
- Create: `src/service/chat/context/ContextPipeline.ts`
- Create: `src/service/chat/context/profiles/ChatProfile.ts`
- Create: `src/service/chat/context/profiles/AiAnalysisProfile.ts`
- Create: `src/service/chat/context/profiles/CopilotProfile.ts`
- Create: `src/service/chat/context/profiles/FollowupProfile.ts`
- Create: `src/service/chat/context/profiles/AmbientProfile.ts`
- Create: `src/service/chat/context/profiles/index.ts`

- [ ] **Step 1: Implement ContextPipeline**

```typescript
// src/service/chat/context/ContextPipeline.ts
import type { LLMRequestMessage, LLMStreamEvent, ModelCapabilities } from '@/core/providers/types';
import type { ContextSlot, ContextProfile, SlotBuildContext } from './slots/types';
import { BudgetGovernor, type GovernedSlot } from './BudgetGovernor';

export class ContextPipeline {
  private readonly slotRegistry: Map<string, ContextSlot>;
  private readonly budgetGovernor = new BudgetGovernor();

  constructor(slots: ContextSlot[]) {
    this.slotRegistry = new Map(slots.map(s => [s.id, s]));
  }

  /**
   * Assemble context for a given profile.
   * Drop-in replacement for ContextBuilder.buildContextMessages().
   */
  async *assemble(
    profile: ContextProfile,
    buildCtx: SlotBuildContext,
    modelCapabilities?: ModelCapabilities,
  ): AsyncGenerator<LLMStreamEvent, LLMRequestMessage[], void> {
    const startTime = Date.now();
    yield { type: 'tool-call', toolName: 'context-pipeline:assemble', input: { profileId: profile.id } };

    // 1. Resolve budget
    const totalBudget = this.resolveBudget(profile, modelCapabilities);

    // 2. Build all slots in parallel
    yield { type: 'tool-call', toolName: 'context-pipeline:build-slots', input: { slotCount: profile.slots.length } };
    const items: GovernedSlot[] = [];
    const buildResults = await Promise.allSettled(
      profile.slots.map(async config => {
        const slot = this.slotRegistry.get(config.slotId);
        if (!slot) return null;
        const mergedCtx: SlotBuildContext = { ...buildCtx, ...(config.buildParams ?? {}) };
        const content = await slot.build(mergedCtx);
        return { slot, content, config } as GovernedSlot;
      })
    );
    for (const result of buildResults) {
      if (result.status === 'fulfilled' && result.value) {
        items.push(result.value);
      }
    }
    yield { type: 'tool-result', toolName: 'context-pipeline:build-slots',
      output: { builtCount: items.length, totalTokens: items.reduce((s, i) => s + i.content.tokens, 0) }
    };

    // 3. Budget governance
    yield { type: 'tool-call', toolName: 'context-pipeline:budget-govern', input: { totalBudget } };
    const governed = await this.budgetGovernor.fit(items, totalBudget);
    yield { type: 'tool-result', toolName: 'context-pipeline:budget-govern',
      output: { survivingSlots: governed.length, totalTokens: governed.reduce((s, g) => s + g.content.tokens, 0) }
    };

    // 4. Render in profile order (profile.slots defines order)
    const slotOrder = profile.slots.map(s => s.slotId);
    const ordered = governed.sort((a, b) =>
      slotOrder.indexOf(a.config.slotId) - slotOrder.indexOf(b.config.slotId)
    );

    const messages: LLMRequestMessage[] = [];
    for (const item of ordered) {
      messages.push(...item.slot.render(item.content));
    }

    yield { type: 'tool-result', toolName: 'context-pipeline:assemble',
      input: { profileId: profile.id },
      output: { messageCount: messages.length, durationMs: Date.now() - startTime }
    };

    return messages;
  }

  private resolveBudget(profile: ContextProfile, modelCapabilities?: ModelCapabilities): number {
    if (typeof profile.totalBudget === 'number') return profile.totalBudget;

    const contextWindow = modelCapabilities?.contextWindow ?? 200000;
    const outputReserve = Math.min(modelCapabilities?.maxOutputTokens ?? 8192, 16384);
    const safetyMargin = 0.05 * contextWindow;

    return contextWindow - outputReserve - safetyMargin;
  }
}
```

- [ ] **Step 2: Implement profiles**

```typescript
// src/service/chat/context/profiles/ChatProfile.ts
import type { ContextProfile } from '../slots/types';

export const ChatProfile: ContextProfile = {
  id: 'chat',
  totalBudget: 'auto',
  slots: [
    { slotId: 'system-prompt',    priority: 1000, maxTokens: 1500,   required: true,  maxCompressionLevel: 0 },
    { slotId: 'recent-messages',  priority: 950,  maxTokens: 100000, required: true,  maxCompressionLevel: 3, buildParams: { maxRecentMessages: 20 } },
    { slotId: 'working-context',  priority: 750,  maxTokens: 500,    required: false, maxCompressionLevel: 2 },
    { slotId: 'conv-summary',     priority: 700,  maxTokens: 800,    required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',   priority: 650,  maxTokens: 200,    required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',     priority: 600,  maxTokens: 400,    required: false, maxCompressionLevel: 1 },
    { slotId: 'prev-analysis',    priority: 500,  maxTokens: 600,    required: false, maxCompressionLevel: 2 },
    { slotId: 'resource-index',   priority: 400,  maxTokens: 300,    required: false, maxCompressionLevel: 1 },
  ],
};
```

```typescript
// src/service/chat/context/profiles/AiAnalysisProfile.ts
import type { ContextProfile } from '../slots/types';

export const AiAnalysisProfile: ContextProfile = {
  id: 'ai-analysis',
  totalBudget: 'auto',
  slots: [
    { slotId: 'system-prompt',    priority: 1000, maxTokens: 3000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'vault-intuition',  priority: 900,  maxTokens: 2000,  required: false, maxCompressionLevel: 1 },
    { slotId: 'working-context',  priority: 850,  maxTokens: 600,   required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',   priority: 700,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',     priority: 400,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
  ],
};
```

```typescript
// src/service/chat/context/profiles/CopilotProfile.ts
import type { ContextProfile } from '../slots/types';

export const CopilotProfile: ContextProfile = {
  id: 'copilot',
  totalBudget: 'auto',
  slots: [
    { slotId: 'current-file',    priority: 1000, maxTokens: 8000,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'system-prompt',   priority: 950,  maxTokens: 1000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'working-context', priority: 800,  maxTokens: 400,   required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',  priority: 600,  maxTokens: 200,   required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',    priority: 400,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
  ],
};
```

```typescript
// src/service/chat/context/profiles/FollowupProfile.ts
import type { ContextProfile } from '../slots/types';

export const FollowupProfile: ContextProfile = {
  id: 'followup',
  totalBudget: 'auto',
  slots: [
    { slotId: 'prev-analysis',    priority: 1000, maxTokens: 3000,  required: true,  maxCompressionLevel: 2 },
    { slotId: 'system-prompt',    priority: 950,  maxTokens: 1000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'recent-messages',  priority: 850,  maxTokens: 2000,  required: false, maxCompressionLevel: 3, buildParams: { maxRecentMessages: 10 } },
    { slotId: 'working-context',  priority: 750,  maxTokens: 500,   required: false, maxCompressionLevel: 2 },
    { slotId: 'vault-intuition',  priority: 500,  maxTokens: 800,   required: false, maxCompressionLevel: 1 },
  ],
};
```

```typescript
// src/service/chat/context/profiles/AmbientProfile.ts
import type { ContextProfile } from '../slots/types';

export const AmbientProfile: ContextProfile = {
  id: 'ambient',
  totalBudget: 2000,
  slots: [
    { slotId: 'working-context', priority: 1000, maxTokens: 800,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'activity-index',  priority: 900,  maxTokens: 500,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'current-file',   priority: 700,  maxTokens: 500,  required: false, maxCompressionLevel: 1, buildParams: { metadataOnly: true } },
  ],
};
```

```typescript
// src/service/chat/context/profiles/index.ts
export { ChatProfile } from './ChatProfile';
export { AiAnalysisProfile } from './AiAnalysisProfile';
export { CopilotProfile } from './CopilotProfile';
export { FollowupProfile } from './FollowupProfile';
export { AmbientProfile } from './AmbientProfile';
```

- [ ] **Step 3: Commit**

```bash
git add src/service/chat/context/ContextPipeline.ts src/service/chat/context/profiles/
git commit -m "feat(context): implement ContextPipeline with 5 scenario profiles"
```

---

## Phase 3: Chat Integration

### Task 11: Wire ContextPipeline into ConversationService

**Files:**
- Modify: `src/service/chat/service-conversation.ts:55-72` (constructor) and `src/service/chat/service-conversation.ts:223-297` (prepareChatRequest)
- Modify: `src/service/chat/service-manager.ts:110-119` (ConversationService creation)

- [ ] **Step 1: Update ConversationService to accept ContextPipeline**

In `src/service/chat/service-conversation.ts`, modify the constructor (line 55-72) to accept `ContextPipeline` alongside the existing `ContextBuilder` for migration:

```typescript
// Add import at top
import { ContextPipeline } from './context/ContextPipeline';
import { ChatProfile } from './context/profiles/ChatProfile';
import { SessionContextService } from '@/service/context/SessionContextService';

// In constructor, after contextBuilder creation (line 71), add:
// this.contextPipeline will be set via setter after construction
private contextPipeline: ContextPipeline | null = null;

setContextPipeline(pipeline: ContextPipeline): void {
  this.contextPipeline = pipeline;
}
```

- [ ] **Step 2: Update prepareChatRequest to use ContextPipeline when available**

In `src/service/chat/service-conversation.ts`, modify `prepareChatRequest` (around line 265 where `buildContextMessages` is called):

```typescript
// Replace the existing contextBuilder call with:
let contextMessages: LLMRequestMessage[];
if (this.contextPipeline) {
  const buildCtx = {
    sessionContext: SessionContextService.getInstance(),
    conversation,
    project: project ?? undefined,
    messages: historyMessages,
    app: this.app,
    modelCapabilities: params.modelCapabilities,
    attachmentHandlingMode: params.attachmentHandlingMode,
  };
  contextMessages = yield* this.contextPipeline.assemble(
    ChatProfile,
    buildCtx,
    params.modelCapabilities,
  );
} else {
  // Fallback to old ContextBuilder during migration
  contextMessages = yield* this.contextBuilder.buildContextMessages({
    conversation,
    project,
    messages: historyMessages,
    options: params.options,
    modelCapabilities: params.modelCapabilities,
    attachmentHandlingMode: params.attachmentHandlingMode,
    app: this.app,
  });
}
```

- [ ] **Step 3: Create and inject ContextPipeline in AIServiceManager**

In `src/service/chat/service-manager.ts`, after `ConversationService` creation (around line 119), add pipeline construction:

```typescript
// Add imports at top
import { ContextPipeline } from './context/ContextPipeline';
import { SystemPromptSlot } from './context/slots/SystemPromptSlot';
import { UserProfileSlot } from './context/slots/UserProfileSlot';
import { ConvSummarySlot } from './context/slots/ConvSummarySlot';
import { RecentMessagesSlot } from './context/slots/RecentMessagesSlot';
import { WorkingContextSlot } from './context/slots/WorkingContextSlot';
import { ActivityIndexSlot } from './context/slots/ActivityIndexSlot';
import { PrevAnalysisSlot } from './context/slots/PrevAnalysisSlot';
import { ResourceIndexSlot } from './context/slots/ResourceIndexSlot';
import { VaultIntuitionSlot } from './context/slots/VaultIntuitionSlot';
import { CurrentFileSlot } from './context/slots/CurrentFileSlot';

// After ConversationService creation (line ~119):
const contextPipeline = new ContextPipeline([
  new SystemPromptSlot(this.promptService),
  new UserProfileSlot(this.promptService, this.profileService),
  new ConvSummarySlot(this.promptService),
  new RecentMessagesSlot(this.promptService, this.resourceSummaryService),
  new WorkingContextSlot(this.promptService),
  new ActivityIndexSlot(this.promptService),
  new PrevAnalysisSlot(),
  new ResourceIndexSlot(),
  new VaultIntuitionSlot(),
  new CurrentFileSlot(),
]);
this.conversationService.setContextPipeline(contextPipeline);
```

- [ ] **Step 4: Test end-to-end**

Manual test: Open Obsidian, start a chat conversation. Verify:
- Chat still works (messages sent and received)
- Check DevTools console for `context-pipeline:assemble` events
- Verify working context appears if there have been recent file opens

- [ ] **Step 5: Commit**

```bash
git add src/service/chat/service-conversation.ts src/service/chat/service-manager.ts
git commit -m "feat(context): wire ContextPipeline into chat ConversationService"
```

---

## Phase 4: Cross-Feature Integration

### Task 12: Emit Events from Copilot, AI Analysis, and Search

**Files:**
- Modify: `src/app/commands/copilot-commands.ts:48,71,97,126` (after each AI call, emit COPILOT_ACTION)
- Modify: `src/service/search/analysisDocPersistence.ts:128-147` (emit AI_ANALYSIS_COMPLETE after persist)
- Modify: `src/ui/view/quick-search/` (emit SEARCH_QUERY when user submits search)

- [ ] **Step 1: Emit COPILOT_ACTION events from copilot-commands.ts**

In `src/app/commands/copilot-commands.ts`, after each successful AI call + modal open, add event dispatch. For example, after the polish command's `CopilotResultModal` open (line 52):

```typescript
// Add import at top
import { AppContext } from '@/app/context/AppContext';
import { ViewEventType } from '@/core/eventBus';

// After CopilotResultModal open for polish (line 52):
AppContext.getEventBus().dispatch({
  type: ViewEventType.COPILOT_ACTION,
  data: { action: 'polish', targetFile: file.path, resultSummary: `Polished ${scope === 'selection' ? 'selection' : 'full document'}` },
});
```

Apply the same pattern after review (line 75), suggest-links (line 102), split (line 131). Each with appropriate `action` and `resultSummary`.

- [ ] **Step 2: Emit AI_ANALYSIS_COMPLETE from analysisDocPersistence.ts**

In `src/service/search/analysisDocPersistence.ts`, after `AIAnalysisHistoryService.insertOrIgnore(record)` (around line 144):

```typescript
// Add import
import { EventBus, ViewEventType } from '@/core/eventBus';

// After insertOrIgnore:
try {
  EventBus.getInstance().dispatch({
    type: ViewEventType.AI_ANALYSIS_COMPLETE,
    data: {
      query: record.query,
      title: record.title,
      sourcesCount: record.sources_count,
      recordId: record.id,
      sources: snapshot.sources?.map(s => s.path) ?? [],
    },
  });
} catch { /* EventBus may not be initialized in tests */ }
```

- [ ] **Step 3: Emit SEARCH_QUERY from search UI**

Find the search submission point in the Quick Search UI (likely in `SearchModal.tsx` or the store) and emit:

```typescript
AppContext.getEventBus().dispatch({
  type: ViewEventType.SEARCH_QUERY,
  data: { query: searchQuery, mode: activeTab },
});
```

- [ ] **Step 4: Commit**

```bash
git add src/app/commands/copilot-commands.ts src/service/search/analysisDocPersistence.ts
git commit -m "feat(context): emit events from Copilot, AI Analysis, and Search for unified tracking"
```

---

### Task 13: Implement Dynamic Discovery Tools

**Files:**
- Create: `src/service/context/context-tools/getActivityDetailTool.ts`
- Create: `src/service/context/context-tools/getRecentAnalysisResultTool.ts`
- Create: `src/service/context/context-tools/getWorkingThemeTool.ts`
- Create: `src/core/schemas/tools/contextDiscovery.ts`

- [ ] **Step 1: Create Zod schemas**

```typescript
// src/core/schemas/tools/contextDiscovery.ts
import { z } from 'zod';

export const getActivityDetailInputSchema = z.object({
  activityId: z.string().describe('Activity ID from the recent activity index, e.g. "A1"'),
});

export const getRecentAnalysisResultInputSchema = z.object({
  query: z.string().optional().describe('Search query to match against recent analyses'),
  limit: z.number().default(1).describe('Number of results to return'),
});

export const getWorkingThemeInputSchema = z.object({});
```

- [ ] **Step 2: Implement getActivityDetailTool**

```typescript
// src/service/context/context-tools/getActivityDetailTool.ts
import { safeAgentTool } from '@/service/tools/types';
import { getActivityDetailInputSchema } from '@/core/schemas/tools/contextDiscovery';
import { SessionContextService } from '../SessionContextService';
import type { AgentTool } from '@/service/tools/types';

export function getActivityDetailTool(): AgentTool {
  return safeAgentTool({
    description: 'Get full context of a recent user activity by its ID from the activity index (e.g. "A1", "A2")',
    inputSchema: getActivityDetailInputSchema,
    async execute(input) {
      const ctx = SessionContextService.getInstance().getWorkingContext();
      const index = parseInt(input.activityId.replace(/^A/i, ''), 10) - 1;
      const activity = ctx.recentActivities[index];

      if (!activity) {
        return { error: `Activity ${input.activityId} not found. Available: A1-A${ctx.recentActivities.length}` };
      }

      return {
        id: activity.id,
        type: activity.type,
        timestamp: new Date(activity.timestamp).toISOString(),
        summary: activity.summary,
        relatedPaths: activity.relatedPaths,
        importanceLevel: activity.importanceLevel,
        metadata: activity.metadata ?? {},
      };
    },
  });
}
```

- [ ] **Step 3: Implement getRecentAnalysisResultTool**

```typescript
// src/service/context/context-tools/getRecentAnalysisResultTool.ts
import { safeAgentTool } from '@/service/tools/types';
import { getRecentAnalysisResultInputSchema } from '@/core/schemas/tools/contextDiscovery';
import { AppContext } from '@/app/context/AppContext';
import type { AgentTool } from '@/service/tools/types';

export function getRecentAnalysisResultTool(): AgentTool {
  return safeAgentTool({
    description: 'Get the summary and sources of recent AI analysis sessions. Optionally filter by query keyword.',
    inputSchema: getRecentAnalysisResultInputSchema,
    async execute(input) {
      const service = AppContext.getAIAnalysisHistoryService();
      const records = await service.list({ limit: input.limit ?? 3, offset: 0 });

      if (records.length === 0) {
        return { message: 'No recent AI analyses found.' };
      }

      let filtered = records;
      if (input.query) {
        const q = input.query.toLowerCase();
        filtered = records.filter(r =>
          r.query.toLowerCase().includes(q) || (r.title ?? '').toLowerCase().includes(q)
        );
      }

      return {
        analyses: filtered.map(r => ({
          query: r.query,
          title: r.title,
          sourcesCount: r.sources_count,
          topicsCount: r.topics_count,
          timestamp: new Date(r.created_at_ts).toISOString(),
          vaultPath: r.vault_rel_path,
        })),
      };
    },
  });
}
```

- [ ] **Step 4: Implement getWorkingThemeTool**

```typescript
// src/service/context/context-tools/getWorkingThemeTool.ts
import { safeAgentTool } from '@/service/tools/types';
import { getWorkingThemeInputSchema } from '@/core/schemas/tools/contextDiscovery';
import { SessionContextService } from '../SessionContextService';
import type { AgentTool } from '@/service/tools/types';

export function getWorkingThemeTool(): AgentTool {
  return safeAgentTool({
    description: 'Get the inferred current working theme with related files and recent activity summary',
    inputSchema: getWorkingThemeInputSchema,
    async execute() {
      const wc = SessionContextService.getInstance().getWorkingContext();
      return {
        activeFile: wc.activeFile,
        theme: wc.workingTheme.llmInferred?.summary ?? wc.workingTheme.ruleBased.summary,
        ruleBasedTheme: wc.workingTheme.ruleBased,
        llmTheme: wc.workingTheme.llmInferred,
        recentActivityCount: wc.recentActivities.length,
        topActivities: wc.recentActivities.slice(0, 5).map(a => ({
          type: a.type,
          summary: a.summary,
          timestamp: new Date(a.timestamp).toISOString(),
        })),
      };
    },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/core/schemas/tools/contextDiscovery.ts src/service/context/context-tools/
git commit -m "feat(context): implement dynamic discovery tools — getActivityDetail, getRecentAnalysis, getWorkingTheme"
```

---

### Task 14: Add Discovery Tools to Vault MCP Server

**Files:**
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts:328` (buildVaultMcpServer function)
- Modify: `src/service/agents/DocSimpleAgent.ts:53-67` (tool list)

- [ ] **Step 1: Add tools to buildVaultMcpServer**

In `src/service/agents/vault-sdk/vaultMcpServer.ts`, in the `buildVaultMcpServer` function (line 328), after existing tool registrations, add the three new tools:

```typescript
// Add imports at top
import { getActivityDetailTool } from '@/service/context/context-tools/getActivityDetailTool';
import { getRecentAnalysisResultTool } from '@/service/context/context-tools/getRecentAnalysisResultTool';
import { getWorkingThemeTool } from '@/service/context/context-tools/getWorkingThemeTool';

// In buildVaultMcpServer, add to the tools object:
const contextTools = {
  get_activity_detail: getActivityDetailTool(),
  get_recent_analysis: getRecentAnalysisResultTool(),
  get_working_theme: getWorkingThemeTool(),
};
// Merge with existing tools
```

Also update the `allowedTools` list in `VaultSearchAgentSDK.ts:245-257` to include the new tool names.

- [ ] **Step 2: Add tools to DocSimpleAgent**

In `src/service/agents/DocSimpleAgent.ts:53-67`, add the three tools to the tool set:

```typescript
// Add imports
import { getActivityDetailTool } from '@/service/context/context-tools/getActivityDetailTool';
import { getRecentAnalysisResultTool } from '@/service/context/context-tools/getRecentAnalysisResultTool';
import { getWorkingThemeTool } from '@/service/context/context-tools/getWorkingThemeTool';

// In the tools object construction, add:
get_activity_detail: getActivityDetailTool(),
get_recent_analysis: getRecentAnalysisResultTool(),
get_working_theme: getWorkingThemeTool(),
```

- [ ] **Step 3: Commit**

```bash
git add src/service/agents/vault-sdk/vaultMcpServer.ts src/service/agents/VaultSearchAgentSDK.ts src/service/agents/DocSimpleAgent.ts
git commit -m "feat(context): add dynamic discovery tools to vault MCP server and DocSimpleAgent"
```

---

## Phase 5: LLM Working Theme Inference + Polish

### Task 15: Implement LLM Working Theme Inference

**Files:**
- Create: `src/service/context/WorkingThemeInferrer.ts`
- Modify: `src/service/context/SessionContextService.ts` (add LLM inference trigger)

- [ ] **Step 1: Implement WorkingThemeInferrer**

```typescript
// src/service/context/WorkingThemeInferrer.ts
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { ActivityEntry, WorkingTheme } from './types';

const INFERENCE_THRESHOLD = 10; // activities since last inference
const INFERENCE_DEBOUNCE_MS = 30000; // 30 seconds

export class WorkingThemeInferrer {
  private activitiesSinceLastInference = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  /** Called on every new activity */
  onActivity(): void {
    this.activitiesSinceLastInference++;
    if (this.activitiesSinceLastInference >= INFERENCE_THRESHOLD && !this.isRunning) {
      this.scheduleInference();
    }
  }

  /** Force inference (e.g., when chat session starts) */
  forceInference(activities: ActivityEntry[]): void {
    if (this.isRunning) return;
    this.runInference(activities);
  }

  private scheduleInference(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const ctx = AppContext.getSessionContext().getWorkingContext();
      await this.runInference(ctx.recentActivities);
    }, INFERENCE_DEBOUNCE_MS);
  }

  private async runInference(activities: ActivityEntry[]): Promise<void> {
    if (this.isRunning || activities.length === 0) return;
    this.isRunning = true;

    try {
      const manager = AppContext.getManager();
      const activitiesInput = activities.slice(0, 20).map(a => ({
        type: a.type,
        summary: a.summary,
        timestamp: a.timestamp,
      }));

      const response = await manager.queryText(PromptId.WorkingThemeInference, {
        activities: activitiesInput,
      });

      // Parse JSON response
      const parsed = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

      const sessionCtx = AppContext.getSessionContext();
      const wc = sessionCtx.getWorkingContext();
      wc.workingTheme.llmInferred = {
        summary: parsed.summary ?? '',
        relatedFiles: parsed.relatedFiles ?? [],
        updatedAt: Date.now(),
      };

      this.activitiesSinceLastInference = 0;
    } catch (err) {
      console.warn('[WorkingThemeInferrer] Failed:', err);
    } finally {
      this.isRunning = false;
    }
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
```

- [ ] **Step 2: Wire into SessionContextService**

In `src/service/context/SessionContextService.ts`, add the inferrer:

```typescript
// Add import
import { WorkingThemeInferrer } from './WorkingThemeInferrer';

// Add field in constructor:
private readonly themeInferrer = new WorkingThemeInferrer();

// In addActivityToContext, after theme recalculation:
this.themeInferrer.onActivity();

// In destroy:
this.themeInferrer.destroy();
```

- [ ] **Step 3: Commit**

```bash
git add src/service/context/WorkingThemeInferrer.ts src/service/context/SessionContextService.ts
git commit -m "feat(context): implement LLM working theme inference with activity threshold trigger"
```

---

### Task 16: Deprecate ContextBuilder + Final Cleanup

**Files:**
- Modify: `src/service/chat/context/ContextBuilder.ts` (add deprecation notice)
- Modify: `src/service/chat/service-conversation.ts` (remove fallback branch)

- [ ] **Step 1: Add deprecation notice to ContextBuilder**

At the top of `src/service/chat/context/ContextBuilder.ts`, add:

```typescript
/**
 * @deprecated Use ContextPipeline instead. This class is kept for migration compatibility.
 * Will be removed after all call sites are migrated to ContextPipeline.
 */
```

- [ ] **Step 2: Remove fallback branch in ConversationService**

In `src/service/chat/service-conversation.ts`, remove the `else` branch from `prepareChatRequest` that falls back to `ContextBuilder`:

```typescript
// Remove the old ContextBuilder fallback — ContextPipeline is now the only path
const buildCtx = {
  sessionContext: SessionContextService.getInstance(),
  conversation,
  project: project ?? undefined,
  messages: historyMessages,
  app: this.app,
  modelCapabilities: params.modelCapabilities,
  attachmentHandlingMode: params.attachmentHandlingMode,
};
const contextMessages = yield* this.contextPipeline!.assemble(
  ChatProfile,
  buildCtx,
  params.modelCapabilities,
);
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Clean build with no errors

- [ ] **Step 5: Commit**

```bash
git add src/service/chat/context/ContextBuilder.ts src/service/chat/service-conversation.ts
git commit -m "refactor(context): deprecate ContextBuilder, make ContextPipeline the sole context assembly path"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **Phase 1** | Tasks 1-5 | Foundation: SessionContextService, EventBus events, MobiusOperation readers, prompt templates, lifecycle wiring |
| **Phase 2** | Tasks 6-10 | Slot system: all 10 slots, BudgetGovernor, ContextPipeline, 5 profiles |
| **Phase 3** | Task 11 | Chat integration: ContextPipeline wired into ConversationService |
| **Phase 4** | Tasks 12-14 | Cross-feature: event emission from Copilot/Analysis/Search, discovery tools in MCP |
| **Phase 5** | Tasks 15-16 | Polish: LLM theme inference, ContextBuilder deprecation |
