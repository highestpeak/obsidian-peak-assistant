import {
	advanceComposerVirtualViewport,
	composerVirtualViewportIsCovered,
	initialComposerVirtualViewport,
} from '@/ui/view/composer/virtualization/ComposerVirtualScrollPolicy';
import { DEFAULT_COMPOSER_VIRTUALIZATION_CONFIG } from '@/ui/view/composer/config/composerConfig';

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean, detail = ''): void {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ` — ${detail}` : ''}`);
}

function main(): void {
	const config = DEFAULT_COMPOSER_VIRTUALIZATION_CONFIG;
	const initial = initialComposerVirtualViewport(config);
	const slowForward = advanceComposerVirtualViewport(initial, {
		start: 90,
		height: 900,
		sampledAtMs: 180,
	}, config);
	check('slow scroll keeps a bounded directional buffer', slowForward.overscanAfter === 990);
	check('forward scroll keeps only base overscan behind', slowForward.overscanBefore === config.overscanPx);

	const fastForward = advanceComposerVirtualViewport(slowForward, {
		start: 3_090,
		height: 900,
		sampledAtMs: 196,
	}, config);
	check('fast forward scroll reaches the configured cap', fastForward.overscanAfter === config.maxOverscanPx);
	check('fast forward scroll does not grow the trailing side', fastForward.overscanBefore === config.overscanPx);

	const fastReverse = advanceComposerVirtualViewport(fastForward, {
		start: 90,
		height: 900,
		sampledAtMs: 212,
	}, config);
	check('fast reverse scroll moves lookahead above', fastReverse.overscanBefore === config.maxOverscanPx);
	check('fast reverse scroll restores base overscan below', fastReverse.overscanAfter === config.overscanPx);

	check(
		'covered viewport may wait for the scheduled frame',
		composerVirtualViewportIsCovered(
			{ start: 1_000, height: 900 },
			{ start: 100, end: 2_000, documentEnd: 10_000 },
		),
	);
	check(
		'viewport beyond mounted coverage requires emergency projection',
		!composerVirtualViewportIsCovered(
			{ start: 2_001, height: 900 },
			{ start: 100, end: 2_000, documentEnd: 10_000 },
		),
	);
	check(
		'partial viewport coverage still requires emergency projection',
		!composerVirtualViewportIsCovered(
			{ start: 1_500, height: 900 },
			{ start: 100, end: 2_000, documentEnd: 10_000 },
		),
	);
	check(
		'tail coverage treats space below the last document row as covered',
		composerVirtualViewportIsCovered(
			{ start: 9_500, height: 900 },
			{ start: 8_000, end: 10_000, documentEnd: 10_000 },
		),
	);

	console.log(`composer-virtual-scroll-policy: ${checks - failures}/${checks} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
