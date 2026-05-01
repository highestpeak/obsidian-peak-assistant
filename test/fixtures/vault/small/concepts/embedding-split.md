---
tags: [embeddings, refactor]
---
# Embedding Split

Anthropic has no embedding API, so embeddings use a ~50-line HTTP utility against
OpenAI-format endpoints. This is deliberately not a second runtime.
Backlink: [[provider-v2-overview]].
