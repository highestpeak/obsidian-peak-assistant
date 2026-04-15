# Heap snapshot Retainers → main.js locations

This file maps Chrome DevTools Heap Snapshot **Retainers** to the bundled `main.js` line numbers, for debugging memory retention.

## 1. Bluebird (OperationalError / RejectionError / __BluebirdErrorTypes__)

| Retainer | main.js | Description |
|----------|---------|--------------|
| `context in OperationalError()` | **32730-32743** | Bluebird's `OperationalError` constructor. |
| `__BluebirdErrorTypes__ in Error()` | **32744-32759** | `Error.__BluebirdErrorTypes__` is set with `configurable: false`, so **it cannot be deleted** from plugin unload. |
| `RejectionError` | 32750 | Part of `errorTypes` object attached to Error. |

**Source:** Bundled from Bluebird (used by officeparser/mammoth deps).  
**Implication:** Our onunload cleanup that tries to `delete Error.__BluebirdErrorTypes__` will no-op; the property stays.

---

## 2. Handlebars (Exception)

| Retainer | main.js | Description |
|----------|---------|--------------|
| `require_exception` / `Exception()` | **2989-3009** | Handlebars `exception.js`: `Exception(message, node)` constructor. Template compile/runtime errors create this; it holds `node` (AST) and `message`. |

**Source:** `node_modules/handlebars/dist/cjs/handlebars/exception.js`.  
**Mitigation:** We call `clearTemplateEngineForUnload()` (unregister helpers + partials) on unload.

---

## 3. p-queue / TimeoutError (PQueue)

| Retainer | main.js | Description |
|----------|---------|--------------|
| `TimeoutError` | **26364-26369** | `p-timeout` exports `TimeoutError` class. |
| `timeoutError` (module-level) | **26480** | `var timeoutError = new p_timeout_1.TimeoutError();` – created when p-queue module loads. |
| `context in PQueue()` | **26481-26507** | `p-queue` PQueue class. When a queued task times out, the TimeoutError can be retained in the queue context. |

**Source:** `node_modules/p-timeout`, `node_modules/p-queue` (pulled in by @langchain).  
**Implication:** LangChain uses PQueue internally; we clear `lc_block_translators_registry` but cannot clear LangChain’s internal queues from plugin code.

---

## 4. sax / ParseError (@xmldom/xmldom)

| Retainer | main.js | Description |
|----------|---------|--------------|
| `require_sax` | **50706-50707** | Module entry for `@xmldom/xmldom/lib/sax.js`. |
| `ParseError4` | **50721-50727** | `ParseError4(message, locator)` – used when XML parsing fails. |

**Source:** `node_modules/@xmldom/xmldom/lib/sax.js` (used by officeparser/mammoth for docx/pptx XML).  
**Implication:** We do not call sax directly; we cannot clear its internal state on unload.

---

## 5. Module bootstrap

| Retainer | main.js | Description |
|----------|---------|--------------|
| `__commonJS` | **19-21** | ESBuild commonJS wrapper; all above modules are loaded through it. |
| `context in e()` / `context in (Z)` | **15** | `__defNormalProp` / helpers used by the bundle. |

---

## Summary

- **Bluebird:** `__BluebirdErrorTypes__` is **configurable: false** in the bundle → cannot be removed at runtime.
- **Handlebars:** We unregister helpers and partials on unload.
- **p-queue / TimeoutError:** Owned by @langchain; no public API to clear queues.
- **sax / ParseError:** Owned by @xmldom (officeparser/mammoth); no cleanup API.

If Obsidian keeps a reference to the plugin script (e.g. for reload), the entire `main.js` bundle and these error/context chains will remain in memory until the app exits.
