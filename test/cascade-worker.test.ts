import { CascadeScheduler } from '../src/service/search/index/cascade/CascadeScheduler';
import assert from 'assert';

function test_does_not_fire_immediately() {
    let fired = false;
    const s = new CascadeScheduler({ idleDelayMs: 100, onIdle: () => { fired = true; } });
    s.notifyActivity();
    assert(!fired, 'Should not fire immediately');
    console.log('PASS: does not fire immediately');
    s.dispose();
}

function test_pause_prevents_fire() {
    let fired = false;
    const s = new CascadeScheduler({ idleDelayMs: 10, onIdle: () => { fired = true; } });
    s.pause();
    s.notifyActivity();
    assert(!fired, 'Should not fire while paused');
    console.log('PASS: pause prevents fire');
    s.dispose();
}

function test_dispose_cleans_up() {
    let fired = false;
    const s = new CascadeScheduler({ idleDelayMs: 10, onIdle: () => { fired = true; } });
    s.notifyActivity();
    s.dispose();
    assert(!fired, 'Should not fire after dispose');
    console.log('PASS: dispose cleans up');
}

test_does_not_fire_immediately();
test_pause_prevents_fire();
test_dispose_cleans_up();
console.log('\nAll cascade-worker tests passed!');
