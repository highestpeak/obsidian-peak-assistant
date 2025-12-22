/**
 * @deprecated This file is deprecated and will be removed in a future commit.
 * Worker-based search has been replaced by main-thread SQLite search (USKE architecture).
 * See: src/core/storage/README.md
 */

/// <reference lib="webworker" />

import { installWorkerRouter } from './router';

/**
 * Worker entry point. used by esbuild.config.mjs to build the worker.
 *
 * This file should stay small: it only wires router + context.
 */
installWorkerRouter();
