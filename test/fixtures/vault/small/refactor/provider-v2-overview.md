---
tags: [refactor, provider, overview, hub]
---
# Provider V2 Refactor — Overview

The core motivation for provider v2 is to **reduce cognitive burden** by collapsing
all LLM calls onto a single runtime. See the spokes for details:

- [[profile-registry]] — unified configuration surface
- [[subprocess-ipc]] — how queries talk to the model
- [[mcp-unification]] — tool plumbing
- [[embedding-split]] — why embeddings are the one exception
- [[skill-rewrite]] — skills on the new runtime

This refactor explicitly accepts desktop-only as a tradeoff.
