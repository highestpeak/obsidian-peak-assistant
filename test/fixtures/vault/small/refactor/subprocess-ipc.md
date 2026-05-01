---
tags: [refactor, provider, ipc]
---
# Subprocess IPC

The Agent SDK spawns a subprocess per plugin load and reuses it across calls.
JSON-RPC over stdio. Backlink: [[provider-v2-overview]].
