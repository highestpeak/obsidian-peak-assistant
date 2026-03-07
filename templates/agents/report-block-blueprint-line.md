Block id: {{item.blockId}} (required; use this exact id in add_dashboard_blocks)
Title: {{#if item.spec.title}}{{item.spec.title}}{{else}}{{item.blockId}}{{/if}}
Role: {{item.spec.role}}
{{#if item.spec.paragraphSkeleton}}Paragraph skeleton: {{item.spec.paragraphSkeleton}}{{/if}}
{{#if item.spec.contentHint}}Content hint: {{item.spec.contentHint}}{{/if}}
Evidence: cite [[path]] or Fact #N where possible; if you cannot bind to evidence, mark that claim as (speculation).
{{#if item.spec.evidenceBinding}}Binding rules: {{item.spec.evidenceBinding}}{{/if}}
{{#if item.spec.chartOrTableShape}}Chart/table shape: {{item.spec.chartOrTableShape}}{{/if}}
{{#if item.spec.risksUncertaintyHint}}Risks/uncertainty: {{item.spec.risksUncertaintyHint}}{{/if}}
{{#if item.spec.wordTarget}}Word target: ~{{item.spec.wordTarget}}{{/if}}
{{#if item.visual}}
{{#if item.visual.needVisual}}
{{#if item.visual.primary.mermaidDirectiveCard}}
Mermaid directive: {{item.visual.primary.mermaidDirectiveCard}}
{{else}}
{{#if item.visual.secondary.mermaidDirectiveCard}}
Mermaid directive: {{item.visual.secondary.mermaidDirectiveCard}}
{{/if}}
{{/if}}
Chart choice: follow [[peakassistant-when-to-use-which-diagram]].
{{/if}}
{{/if}}

