---
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
