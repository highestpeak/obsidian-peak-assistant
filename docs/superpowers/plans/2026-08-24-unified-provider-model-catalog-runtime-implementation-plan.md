# Unified Provider Model Catalog Runtime Implementation Plan

1. Add a narrow core `ModelCatalogPort` and profile-qualified dynamic catalog ids.
2. Add an authenticated OpenRouter `/models/user` parser/fetcher with metadata-preserving tests.
3. Add exact snapshot replacement and revision semantics to the registry-backed catalog store.
4. Compose one `ModelCatalogRuntime` in `AppContext`, bind it in `AppRuntimeRegistry`, hydrate last-known data, and refresh enabled profiles at boot.
5. Publish the narrow port through `ServiceContext` and a `useModelCatalog` subscription hook.
6. Migrate Settings, Onboarding, Chat Studio, Composer, Harness, and Vault Intelligence to the port; remove screen-local discovery and onboarding evidence writes.
7. Retire the external OpenRouter JSON availability control from Settings while preserving legacy settings data for migration compatibility.
8. Add source-boundary tests that prevent new model-list producers and direct UI registry reads.
9. Run focused tests, full tests, production build, plugin-only reload, and real picker assertions where CDP is available.
10. Review the owned diff, exclude unrelated existing edits, and commit with an English message.
