/**
 * Peak Composer — Brief producer refresh + sensing policy.
 *
 * These are runtime contracts rather than UI snapshots:
 * - “本轮忽略” is local to one producer refresh and must be restored when the
 *   source-backed producer observes the same finding again;
 * - manual sensing has no hidden background refresh, idle is debounced, and
 *   continuous is throttle-bounded.
 */

import {
	IntelligenceRuntime,
	parseComposerDocument,
	type BriefSensingPolicy,
	type ComposerDocumentSnapshot,
	type FindingIngestInput,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const testSensingPolicy: BriefSensingPolicy = {
	idleRefreshDelayMs: 70,
	continuousRefreshMinIntervalMs: 80,
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceSnapshot(revision: string): ComposerDocumentSnapshot {
	return parseComposerDocument('- [ ] Source-backed task\n', {
		filePath: 'brief-runtime.md',
		revision,
	});
}

function sourceFinding(snapshot: ComposerDocumentSnapshot): FindingIngestInput {
	return {
		fingerprint: 'brief-runtime-open-task',
		evidenceRevision: snapshot.revision,
		target: { kind: 'document', documentId: snapshot.documentId },
		reason: 'Open task: Source-backed task',
		producerId: 'brief-runtime-test-producer',
	};
}

interface RuntimeFixture {
	runtime: IntelligenceRuntime;
	setCurrent: (snapshot: ComposerDocumentSnapshot) => void;
	producerRevisions: string[];
}

function makeRuntime(initial: ComposerDocumentSnapshot): RuntimeFixture {
	let current = initial;
	const producerRevisions: string[] = [];
	const runtime = new IntelligenceRuntime({
		hub: { on: () => () => undefined } as never,
		getSnapshot: () => current,
		produceFindings: (snapshot) => {
			producerRevisions.push(snapshot.revision);
			return [sourceFinding(snapshot)];
		},
		briefSensing: testSensingPolicy,
	});
	return {
		runtime,
		setCurrent: (snapshot) => {
			current = snapshot;
		},
		producerRevisions,
	};
}

async function run(): Promise<void> {
	// A local ignore does not turn into a permanent dismissal. The next real
	// producer refresh owns the decision to show it again.
	{
		const first = sourceSnapshot('r1');
		const fixture = makeRuntime(first);
		check('explicit Brief refresh succeeds with an injected producer', fixture.runtime.refreshBrief());
		const finding = fixture.runtime.findings.list()[0];
		fixture.runtime.ignoreFindingForCurrentRefresh(finding.findingId);
		check('ignore hides the finding for the current refresh', fixture.runtime.findings.get(finding.findingId)?.state === 'ignored');
		check('ignored finding leaves the Brief projection', fixture.runtime.findings.briefItems().length === 0);

		fixture.runtime.refreshBrief();
		const restored = fixture.runtime.findings.get(finding.findingId);
		check('same source finding is restored on the next refresh', restored?.state === 'active');
		check('restored finding returns to the Brief projection', fixture.runtime.findings.briefItems().length === 1);
		check('refresh restores the existing source finding rather than creating a duplicate', fixture.runtime.findings.list().length === 1);
		fixture.runtime.dispose();
	}

	// Manual is deliberately opt-in: document reparses do not schedule any work.
	{
		const previous = sourceSnapshot('manual-r1');
		const next = sourceSnapshot('manual-r2');
		const fixture = makeRuntime(previous);
		fixture.runtime.setSensingMode('manual');
		fixture.setCurrent(next);
		fixture.runtime.onReparse(previous, next);
		await sleep(testSensingPolicy.idleRefreshDelayMs + 35);
		check('manual sensing does not schedule a background producer pass', fixture.producerRevisions.length === 0);
		check('manual sensing still allows an explicit refresh', fixture.runtime.refreshBrief());
		check('explicit manual refresh invokes the producer once', fixture.producerRevisions.length === 1);
		fixture.runtime.dispose();
	}

	// Idle sensing must restart its quiet-period timer after a newer reparse.
	{
		const first = sourceSnapshot('idle-r1');
		const second = sourceSnapshot('idle-r2');
		const third = sourceSnapshot('idle-r3');
		const fixture = makeRuntime(first);
		fixture.setCurrent(second);
		fixture.runtime.onReparse(first, second);
		await sleep(20);
		fixture.setCurrent(third);
		fixture.runtime.onReparse(second, third);
		await sleep(60);
		check('idle sensing restarts the debounce after a newer reparse', fixture.producerRevisions.length === 0);
		await sleep(45);
		check('idle sensing refreshes once after the quiet period', fixture.producerRevisions.length === 1);
		check('idle sensing reads the latest source snapshot', fixture.producerRevisions[0] === 'idle-r3');
		fixture.runtime.dispose();
	}

	// Continuous sensing should update promptly, then coalesce rereads until its
	// configured minimum interval has elapsed.
	{
		const first = sourceSnapshot('continuous-r1');
		const second = sourceSnapshot('continuous-r2');
		const third = sourceSnapshot('continuous-r3');
		const fixture = makeRuntime(first);
		fixture.runtime.setSensingMode('continuous');
		await sleep(25);
		check('continuous sensing schedules its first producer pass', fixture.producerRevisions.length === 1);
		fixture.setCurrent(second);
		fixture.runtime.onReparse(first, second);
		fixture.setCurrent(third);
		fixture.runtime.onReparse(second, third);
		await sleep(35);
		check('continuous sensing coalesces rapid reparses inside the throttle window', fixture.producerRevisions.length === 1);
		await sleep(70);
		check('continuous sensing emits one follow-up refresh after the throttle window', fixture.producerRevisions.length === 2);
		check('continuous sensing reads the latest source snapshot', fixture.producerRevisions[1] === 'continuous-r3');
		fixture.runtime.dispose();
	}

	done('composer-brief-runtime');
}

void run();
