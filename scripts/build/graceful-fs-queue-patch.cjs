const fs = require('node:fs/promises');

const GRACEFUL_FS_ENTRY = /node_modules[\\/]graceful-fs[\\/]graceful-fs\.js$/;
const QUEUE_PUBLISHER = /function publishQueue\(context, queue\) \{\s*Object\.defineProperty\(context, gracefulQueue, \{\s*get: function\(\) \{\s*return queue\s*\}\s*\}\)\s*\}/g;

/**
 * graceful-fs normally publishes its shared queue through a non-configurable
 * getter. When the package is bundled, that getter closes over the bundle's
 * module context and permanently pins the first evaluated plugin generation.
 *
 * A read-only data property preserves the public contract: callers receive
 * the same mutable queue Array, while the global object no longer owns a
 * closure from the plugin bundle.
 */
function patchGracefulFsQueuePublisher(source) {
	const matches = source.match(QUEUE_PUBLISHER) ?? [];
	if (matches.length !== 1) {
		throw new Error(`graceful-fs queue publisher pattern not found exactly once (found ${matches.length})`);
	}
	return source.replace(
		QUEUE_PUBLISHER,
		[
			'function publishQueue(context, queue) {',
			'  Object.defineProperty(context, gracefulQueue, {',
			'    value: queue',
			'  })',
			'}',
		].join('\n'),
	);
}

const gracefulFsQueueDataPropertyPlugin = {
	name: 'graceful-fs-queue-data-property',
	setup(build) {
		build.onLoad({ filter: GRACEFUL_FS_ENTRY }, async (args) => ({
			contents: patchGracefulFsQueuePublisher(await fs.readFile(args.path, 'utf8')),
			loader: 'js',
		}));
	},
};

module.exports = {
	gracefulFsQueueDataPropertyPlugin,
	patchGracefulFsQueuePublisher,
};
