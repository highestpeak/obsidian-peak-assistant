# Codex Imagegen Prompt — Command Center Prototype

Status: superseded. This prompt represents the first full workbench direction, which user feedback rejected as too complex and too page-like. Use `imagegen-panel-flow-prompt.md` for the corrected panel-first direction.

Use case: ui-mockup

Asset type: product-planning bitmap mockup for an Obsidian plugin redesign document.

Primary request:

Create a high-fidelity desktop UI mockup for "Peak Assistant Command Center", an Obsidian-native AI knowledge assistant. The design should show a calm, professional, dense workbench, not a marketing page.

Layout:

- Three-column desktop workbench.
- Left rail: intent areas and recent runs.
- Middle: global search, context strip, "Recommended now" actions, grouped tool catalog.
- Right: selected workflow result review panel.

Important UI content:

- Top title: "Command Center".
- Context strip labels: current note, selection, folder, model, index ready.
- Intent areas: Current Note, Connect Knowledge, Maintain Vault, Research & Synthesize, Manage System.
- Recommended actions: Connect Related Notes, Add Evidence, Improve Current Note.
- Show short recommendation reasons, such as "Recommended because 9 related notes exist".
- Result panel title: Connect Related Notes.
- Candidate cards should show anchor text, target note, confidence, provenance badges like semantic, graph, backlink, and a small diff preview.
- Include actions: Apply selected links, Open target notes, Save suggestions.
- Agent trace should be small and collapsed as "Inspect run details".

Visual style:

- Obsidian-native, quiet, utilitarian, professional.
- Dense but readable.
- Mostly white and neutral gray panels with restrained blue, green, amber, and purple accents.
- 8px or smaller card radius.
- No hero section, no gradient orbs, no decorative blobs, no oversized marketing visuals.
- The interface should feel like a real productivity tool for repeated use.

Composition constraints:

- Wide desktop screenshot, 16:10 or 16:9.
- Text should be mostly legible but do not over-focus on exact copy.
- Show hierarchy clearly: recommendations first, tools second, result artifacts on the right.
- Make the review/apply safety model visually obvious.
- Avoid raw markdown, raw JSON, and giant agent trace as primary content.

Negative prompt:

Do not make it look like a SaaS landing page. Do not show cartoon illustrations. Do not use a purple-blue gradient-dominated palette. Do not fill the screen with equal feature cards. Do not show auto-apply for risky changes.
