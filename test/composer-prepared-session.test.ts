import { ComposerPreparedSessionStore } from '@/app/composer/ComposerPreparedSessionStore';
import { DocumentComposerController } from '@/app/composer/DocumentComposerController';
import {
	ComposerSourceRevisionService,
	type ComposerFileEvent,
	type ComposerFileEventsPort,
	type ComposerSourcePort,
} from '@/service/composer';

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean): void {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}`);
}

class Source implements ComposerSourcePort {
	reads = 0;
	async readSource(filePath: string): Promise<string> {
		this.reads += 1;
		return `# ${filePath}\n\nPrepared body.\n`;
	}
}

class Events implements ComposerFileEventsPort {
	onFileEvent(_cb: (event: ComposerFileEvent) => void): () => void {
		return () => undefined;
	}
}

async function main(): Promise<void> {
	const source = new Source();
	let now = 100;
	const revisions = new ComposerSourceRevisionService();
	const store = new ComposerPreparedSessionStore(source, revisions, 50, () => now);
	const firstId = await store.prepare('A.md');
	check('prepare performs one read', source.reads === 1);
	check('wrong path cannot consume prepared source', store.consume(firstId, 'B.md') === null);
	check('wrong-path attempt consumes token fail-closed', store.consume(firstId, 'A.md') === null);

	const secondId = await store.prepare('A.md');
	const controller = new DocumentComposerController({
		source,
		events: new Events(),
		revisionService: revisions,
		consumePreparedSession: (id, path) => store.consume(id, path),
	});
	controller.start('A.md', secondId);
	check('prepared controller is loaded synchronously', controller.getState().status === 'loaded');
	check('prepared controller does not read source twice', source.reads === 2);
	check('prepared snapshot belongs to requested file', controller.getState().snapshot?.filePath === 'A.md');
	check('prepared token is one-shot', store.consume(secondId, 'A.md') === null);

	const supersedingId = await store.prepare('D.md');
	const supersedingController = new DocumentComposerController({
		source,
		events: new Events(),
		revisionService: revisions,
		consumePreparedSession: (id, path) => store.consume(id, path),
	});
	supersedingController.start('D.md');
	check('ordinary same-file start enters loading', supersedingController.getState().status === 'loading');
	supersedingController.bindFile('D.md', supersedingId);
	check(
		'prepared same-file handoff supersedes an in-flight restore read synchronously',
		supersedingController.getState().status === 'loaded',
	);
	await supersedingController.settled();
	check('obsolete restore read cannot overwrite prepared state', supersedingController.getState().status === 'loaded');
	supersedingController.stop();

	const expiredId = await store.prepare('C.md');
	now += 51;
	check('expired preparation is refused', store.consume(expiredId, 'C.md') === null);
	store.dispose();
	controller.stop();

	console.log(`composer-prepared-session: ${checks - failures}/${checks} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

void main().catch((error) => {
	console.error(error);
	process.exit(1);
});
