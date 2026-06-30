# Model Registry Templates

`model-catalog.json` is the bundled fallback catalog loaded by `ModelRegistry` before runtime templates are available. It contains provider metadata plus the zero-config model list.

Provider-specific JSON files such as `openai.json`, `claude.json`, and `ollama-families.json` are runtime-loaded overrides. When they load successfully, they replace the matching provider's bundled model list while preserving provider metadata from the fallback catalog.

Keep built-in model defaults in this directory so template-backed configuration has one maintenance home.
