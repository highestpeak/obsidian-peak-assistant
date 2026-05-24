/**
 * Built-in skill definitions bundled as raw markdown strings.
 * These are always available regardless of the user's vault folder.
 */

export interface BuiltinSkillEntry {
	content: string;
}

export const BUILTIN_SKILLS: BuiltinSkillEntry[] = [
	{
		content: `---
id: weekly-report
name: Weekly Report Generator
version: 1.0.0
author: Peak Assistant
description: Compile recent vault activity into a structured weekly report
icon: calendar
tags: [productivity, writing]
license: free
type: simple
tools:
  builtin:
    - content_reader
    - local_search_whole_vault
    - recent_changes_whole_vault
model:
  recommended: gpt-4o
  minCapabilities:
    tools: true
  outputControl:
    temperature: 0.5
    reasoningEffort: medium
inputs:
  - name: period
    type: text
    description: Time period to cover (e.g. "last 7 days")
    required: true
    default: "last 7 days"
---

## System Prompt

You are a knowledge base assistant helping the user compile a weekly report. Your task is to analyze recent changes and activity in the vault for the period: {{period}}.

Steps:
1. Use recent_changes_whole_vault to find documents modified during the specified period
2. Use local_search_whole_vault to find related context if needed
3. Use content_reader to read key documents that were changed
4. Compile a structured report covering: key changes, themes, insights, and recommended follow-ups

Write the report in a clear, professional style. Focus on substance and actionable insights.

## Output Template

### Weekly Report: {{period}}

#### Key Changes
- List the most significant document changes and additions

#### Themes
- Identify recurring themes across the changes

#### Insights
- Note any patterns, gaps, or connections worth highlighting

#### Recommended Follow-ups
- Suggest next steps based on the activity
`,
	},
	{
		content: `---
id: literature-review
name: Literature Review
version: 1.0.0
author: Peak Assistant
description: Systematic literature review across vault documents on a specific topic
icon: book-open
tags: [academic, research]
license: free
type: pipeline
model:
  recommended: claude-sonnet-4-6
  minCapabilities:
    tools: true
inputs:
  - name: topic
    type: text
    description: Research topic to review
    required: true
  - name: scope
    type: text
    description: Folder or tag to scope the search (optional)
    required: false
phases:
  - name: discover
    tools:
      builtin: [local_search_whole_vault, search_by_dimensions]
    prompt: |
      Search the vault for all documents related to: {{topic}}
      Scope: {{scope}}
      Identify key papers, notes, and connections. List each discovered document with its path and a brief relevance note.

  - name: analyze
    tools:
      builtin: [content_reader, inspect_note_context]
    prompt: |
      For each document discovered in the previous phase, read it and extract:
      - Core thesis / findings
      - Methodology (if applicable)
      - Key citations and connections to other vault notes
      - Relevance to the topic: {{topic}}

  - name: synthesize
    tools:
      builtin: [content_reader]
    prompt: |
      Synthesize all findings into a structured literature review on: {{topic}}.
      Identify themes, gaps, contradictions, and connections across sources.
      Reference specific vault notes using [[wikilink]] format.
---

## System Prompt

You are an academic research assistant conducting a systematic literature review across the user's knowledge base.

## Output Template

### Literature Review: {{topic}}

#### Themes
- Major themes identified across sources

#### Source Analysis
- Per-source findings and contributions

#### Connections
- How sources relate to and build on each other

#### Gaps and Future Directions
- What is missing from the current knowledge base
`,
	},
	{
		content: `---
id: vault-health-check
name: Vault Health Check
version: 1.0.0
author: Peak Assistant
description: Analyze vault structure and identify health issues like orphan notes, weak connections, and stale content
icon: activity
tags: [productivity, organization]
license: free
type: simple
tools:
  builtin:
    - find_orphans
    - find_key_nodes
    - explore_folder
    - graph_traversal
    - local_search_whole_vault
model:
  recommended: gpt-4o
  minCapabilities:
    tools: true
  outputControl:
    temperature: 0.3
    reasoningEffort: high
inputs: []
---

## System Prompt

You are a knowledge base health analyst. Examine the vault structure and produce a comprehensive health report.

Steps:
1. Use find_orphans to identify disconnected notes
2. Use find_key_nodes to identify hub documents
3. Use explore_folder to understand the folder structure
4. Use graph_traversal to analyze connectivity patterns

Produce a structured health report with:
- Overall health score (1-10)
- Orphan notes that need linking or removal
- Hub documents that are most central
- Structural issues (folder organization, naming conventions)
- Actionable recommendations for improvement

Be specific and reference actual note paths using [[wikilink]] format.

## Output Template

### Vault Health Report

#### Health Score: /10

#### Orphan Notes
- Notes with no connections

#### Hub Documents
- Most connected and important notes

#### Structural Issues
- Organization problems found

#### Recommendations
- Specific actions to improve vault health
`,
	},
];
