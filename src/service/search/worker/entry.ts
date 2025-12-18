/// <reference lib="webworker" />

import { installWorkerRouter } from '@/service/search/worker/router';

/**
 * Worker entry point. used by esbuild.config.mjs to build the worker.
 *
 * This file should stay small: it only wires router + context.
 */
installWorkerRouter();
