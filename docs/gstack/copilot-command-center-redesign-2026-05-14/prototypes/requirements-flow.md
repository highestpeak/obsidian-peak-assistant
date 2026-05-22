# Requirements Prototype Flow

These diagrams capture the intended product behavior for the Copilot / Command Center redesign.

## Panel-First Information Architecture

```mermaid
flowchart LR
  Note["Active Obsidian note"] --> Invoke["Quick invoke: palette, selection, context menu, panel shortcut"]
  Note --> Dock["Docked assistant panel"]
  Invoke --> Dock
  Invoke --> Hub["Intent hub: Copilot / Vault Intelligence"]
  Hub --> Scan["Context or vault scan"]
  Scan --> Plan["Auto action plan"]
  Plan --> Popout["Pop-out command panel\nDocument / Vault / Setting tabs"]

  Dock --> Context["Current context: note, selection, folder, index health"]
  Dock --> Search["Compact action search"]
  Dock --> Recommended["2-3 recommendations with reasons"]
  Dock --> Pending["Pending review / recent runs"]
  Dock --> Hub

  Recommended --> Improve["Improve selected text / current note"]
  Recommended --> Connect["Connect related notes"]
  Recommended --> Evidence["Add evidence"]

  Popout --> CommandSearch["Command search input"]
  Popout --> Tabs["Top tabs: Document / Vault / Setting"]
  CommandSearch --> Browse["Scoped manual capability results"]
  Tabs --> Browse
  Popout --> Configure["Configure selected plan/capability"]
  Plan --> Connect["Connect related notes"]
  Plan --> Evidence["Add evidence"]
  Plan --> Improve["Improve selected text / current note"]
  Plan --> Visual["Suggest diagram / image / example"]
  Browse --> Maintain["Vault Intelligence / Maintain queue"]
  Browse --> Tasks["Task review"]
  Browse --> Research["Vault Intelligence / Synthesize"]
  Browse --> Manage["Manage system / advanced"]

  Connect --> Review["Focused review drilldown"]
  Evidence --> Review
  Improve --> Review
  Visual --> Review
  Maintain --> Review
  Review --> Apply["Preview, apply, save, ignore, undo"]
```

## Surface Model

```mermaid
flowchart TB
  Quick["Quick Invoke"] --> Intent["Intent Hub"]
  Panel["Docked Panel"] --> Intent
  Intent --> Scan["Context/Vault Scan"]
  Scan --> Plan["Auto Action Plan"]
  Plan --> Command["Pop-out Command Panel"]
  Command --> Drilldown["Review / Apply Panel"]
  Drilldown --> Panel
  Drilldown --> Command
  Panel --> Note["Active Note"]
  Intent --> Note
  Plan --> Note
  Command --> Note
  Drilldown --> Note

  Quick -. "fast entry" .-> Note
  Panel -. "compact context" .-> Note
  Intent -. "click Copilot or Vault Intelligence" .-> Note
  Plan -. "system chooses relevant capabilities" .-> Note
  Command -. "more room for plan/config/manual catalog" .-> Note
  Drilldown -. "only when needed" .-> Note
```

## Vault Intelligence Mode Split

```mermaid
flowchart LR
  Entry["Click Vault Intelligence"] --> Scope["Resolve scope: neighborhood / folder / topic / vault"]
  Scope --> Mode["Choose mode"]
  Mode --> Analyze["Analyze: related notes / gaps / graph / summary"]
  Mode --> Synthesize["Synthesize: cited draft / topic report / save as note"]
  Mode --> Maintain["Maintain: health / duplicates / filing / tags / tasks"]
  Analyze --> Artifact["Digest + source drilldown"]
  Synthesize --> Artifact
  Maintain --> Queue["Review queue + safe apply"]
```

## Shared Action Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Configuring
  Configuring --> Running: Run
  Running --> ResultReady: Completed
  Running --> Failed: Error
  Running --> Skipped: Cancel
  ResultReady --> PreviewingChange: Review mutation
  ResultReady --> Applied: Save/copy non-mutating artifact
  ResultReady --> Skipped: Dismiss/ignore
  PreviewingChange --> Applied: Accept/apply selected
  PreviewingChange --> ResultReady: Back to results
  PreviewingChange --> Skipped: Reject
  Applied --> ResultReady: View applied diff
  Applied --> ResultReady: Undo when available
  Failed --> Configuring: Retry with changes
  Skipped --> [*]
```

## Result Artifact Model

```mermaid
flowchart TB
  Run["AI/search/graph run"] --> Artifact["Reviewable artifact"]

  Artifact --> LinkCards["Link proposals"]
  Artifact --> EvidenceCards["Evidence candidates"]
  Artifact --> IssueCards["Document issue cards"]
  Artifact --> HealthCards["Vault issue cards"]
  Artifact --> TaskCards["Task review cards"]
  Artifact --> MarkdownPreview["Cited Markdown preview"]

  LinkCards --> Preview["Preview / diff"]
  EvidenceCards --> Preview
  IssueCards --> Preview
  HealthCards --> Preview
  TaskCards --> Preview
  IssueCards --> FullDoc["Full rendered document diff"]
  MarkdownPreview --> Save["Save / copy / insert"]

  Preview --> UserDecision["Accept, reject, edit, ignore"]
  FullDoc --> UserDecision
  UserDecision --> Provenance["Provenance remains visible"]
  Provenance --> Apply["Safe apply or save"]
```
