import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { EventEmitter } from "node:events";
import { createDevNetworkWatch, getPrivateIpv4Addresses } from "../lib/dev-network-watch.mjs";
import { getLocalDevOrigins } from "../lib/dev-origins";

const original = "192.168.0.101", changed = "192.168.8.59", another = "10.2.3.4";

class Child extends EventEmitter {
  signals: string[] = [];
  constructor(readonly id: number, readonly events: string[]) { super(); }
  kill(signal = "SIGTERM") { this.signals.push(signal); this.events.push(`kill:${this.id}:${signal}`); return true; }
  close(code: number | null = null, signal: string | null = "SIGTERM") { this.events.push(`close:${this.id}`); this.emit("close", code, signal); }
}

function setup(context: TestContext, initialAddresses = [original]) {
  context.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let addresses = [...initialAddresses], reads = 0, readError: Error | null = null;
  const events: string[] = [], children: Child[] = [], restarts: string[][] = [];
  const exits: Array<[number | null, string | null]> = [], errors: Error[] = [];
  const watcher = createDevNetworkWatch({
    readAddresses: () => { reads++; if (readError) throw readError; return addresses; },
    spawnChild: () => { const child = new Child(children.length, events); children.push(child); events.push(`spawn:${child.id}`); return child; },
    onExit: (code: number | null, signal: string | null) => exits.push([code, signal]),
    onRestart: (next: string[]) => restarts.push(next),
    onError: (error: Error) => errors.push(error),
  });
  context.after(() => watcher.stop());
  return {
    watcher, events, children, restarts, exits, errors,
    tick: (ms: number) => context.mock.timers.tick(ms),
    setAddresses: (next: string[]) => { addresses = next; },
    setReadError: (error: Error | null) => { readError = error; },
    getReads: () => reads,
  };
}

test("the watcher uses the same exact private IPv4 boundary as the development origin allowlist", () => {
  const ipv4 = (address: string, internal = false) => ({ address, family: "IPv4" as const, internal });
  const interfaces = {
    wifi: [ipv4(original), ipv4(changed), ipv4(original)],
    ethernet: [ipv4(another), ipv4("172.16.0.2"), ipv4("172.31.255.254")],
    invalid: [ipv4("192.168.*.*"), ipv4("192.168.0.999"), ipv4("https://192.168.8.59"), ipv4("localhost")],
    excluded: [ipv4("127.0.0.1", true), ipv4("10.0.0.1", true), ipv4("8.8.8.8"), ipv4("172.15.0.1"), ipv4("172.32.0.1"), ipv4("192.169.0.1"), ipv4("0.0.0.0"), { address: "fe80::1", family: "IPv6" as const, internal: false }],
    inactive: undefined,
  };
  assert.deepEqual(getPrivateIpv4Addresses(interfaces), getLocalDevOrigins(interfaces));
  assert.deepEqual(getPrivateIpv4Addresses(interfaces), [another, "172.16.0.2", "172.31.255.254", original, changed]);
  assert.deepEqual(getPrivateIpv4Addresses({}), []);
});

test("the initial child starts once and reordered or duplicate address snapshots do not restart it", context => {
  const state = setup(context, [original, another]);
  assert.equal(state.children.length, 1);
  state.setAddresses([another, original, another]); state.watcher.sample(); state.tick(10_000);
  assert.deepEqual(state.children[0].signals, []);
  assert.deepEqual(state.restarts, []);
  assert.equal(state.children.length, 1);
});

test("a settled change terminates first and waits for close before spawning its replacement", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(1499);
  assert.deepEqual(state.children[0].signals, []);
  state.tick(1);
  assert.deepEqual(state.children[0].signals, ["SIGTERM"]);
  assert.deepEqual(state.restarts, [[changed]]);
  assert.equal(state.children.length, 1);
  state.children[0].emit("exit", null, "SIGTERM"); state.tick(10_000);
  assert.equal(state.children.length, 1, "Next must release its process and stdio before replacement");
  state.children[0].close();
  assert.deepEqual(state.events.slice(0, 4), ["spawn:0", "kill:0:SIGTERM", "close:0", "spawn:1"]);
  state.tick(10_000);
  assert.equal(state.children.length, 2);
  assert.deepEqual(state.children[1].signals, []);
  assert.deepEqual(state.exits, []);
});

test("polling detects new addresses after two seconds and then applies the stability delay", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.tick(1999);
  assert.deepEqual(state.children[0].signals, []);
  state.tick(1); state.tick(1499);
  assert.deepEqual(state.children[0].signals, []);
  state.tick(1);
  assert.deepEqual(state.children[0].signals, ["SIGTERM"]);
});

test("multiple rapid address changes are coalesced into one restart for the latest stable address", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(500);
  state.setAddresses([another]); state.watcher.sample(); state.tick(1499);
  assert.deepEqual(state.children[0].signals, []);
  state.tick(1);
  assert.deepEqual(state.restarts, [[another]]);
  assert.deepEqual(state.children[0].signals, ["SIGTERM"]);
  state.children[0].close(); state.tick(5000);
  assert.equal(state.children.length, 2);
});

test("a temporary address change that returns to the running network cancels the restart", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(500);
  state.setAddresses([original]); state.watcher.sample(); state.tick(5000);
  assert.equal(state.children.length, 1);
  assert.deepEqual(state.children[0].signals, []);
  assert.deepEqual(state.restarts, []);
});

test("the stability deadline rechecks actual addresses instead of restarting from an outdated poll", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(500);
  state.setAddresses([original]);
  // No new poll occurs before the 1.5-second timer; this tests its final snapshot check.
  state.tick(1000);
  assert.deepEqual(state.children[0].signals, []);
  assert.deepEqual(state.restarts, []);
  state.tick(5000);
  assert.equal(state.children.length, 1);
});

test("an unobserved third address at the stability deadline receives its own settling window", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(500);
  state.setAddresses([another]); state.tick(1000);
  assert.deepEqual(state.children[0].signals, []);
  state.tick(1499);
  assert.deepEqual(state.children[0].signals, []);
  state.tick(1);
  assert.deepEqual(state.restarts, [[another]]);
  assert.deepEqual(state.children[0].signals, ["SIGTERM"]);
});

test("user stop cancels a pending restart, terminates once, and wins over future network changes", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(500);
  state.watcher.stop(); state.watcher.stop(); state.tick(5000);
  assert.deepEqual(state.children[0].signals, ["SIGTERM"]);
  state.children[0].close();
  state.setAddresses([another]); state.watcher.sample(); state.tick(5000);
  assert.equal(state.children.length, 1);
  assert.deepEqual(state.restarts, []);
  assert.deepEqual(state.exits, [[null, "SIGTERM"]]);
});

test("user stop while awaiting a network restart prevents resurrection after the old child closes", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(1500);
  assert.equal(state.restarts.length, 1);
  state.watcher.stop(); state.children[0].close(); state.tick(5000);
  assert.equal(state.children.length, 1);
  assert.equal(state.exits.length, 1);
});

test("a replacement reads the latest snapshot even if another network change happens while waiting for close", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(1500);
  state.setAddresses([another]); state.watcher.sample();
  state.children[0].close(); state.tick(5000);
  assert.equal(state.children.length, 2);
  assert.deepEqual(state.children[1].signals, []);
  assert.equal(state.restarts.length, 1);
});

test("a child crash ends supervision instead of creating an automatic restart loop", context => {
  const state = setup(context);
  state.children[0].close(1, null);
  const readsAtExit = state.getReads();
  state.setAddresses([changed]); state.watcher.sample(); state.tick(10_000);
  assert.equal(state.children.length, 1);
  assert.equal(state.getReads(), readsAtExit);
  assert.deepEqual(state.exits, [[1, null]]);
  assert.deepEqual(state.restarts, []);
});

test("a normal child exit cancels pending network changes and is never treated as a restart request", context => {
  const state = setup(context);
  state.setAddresses([changed]); state.watcher.sample();
  state.children[0].close(0, null); state.tick(10_000);
  assert.equal(state.children.length, 1);
  assert.deepEqual(state.children[0].signals, []);
  assert.deepEqual(state.exits, [[0, null]]);
  assert.deepEqual(state.restarts, []);
});

test("child errors report failure once, cancel all timers, and cannot subsequently restart on close", context => {
  const state = setup(context), failure = new Error("synthetic spawn failure");
  state.children[0].emit("error", failure);
  state.children[0].close(1, null);
  state.setAddresses([changed]); state.watcher.sample(); state.tick(10_000);
  assert.deepEqual(state.errors, [failure]);
  assert.deepEqual(state.exits, [[1, null]]);
  assert.equal(state.children.length, 1);
});

test("temporary interface read failures leave the active child running and later samples can recover", context => {
  const state = setup(context), failure = new Error("synthetic interface read failure");
  state.setReadError(failure); state.watcher.sample();
  assert.deepEqual(state.errors, [failure]);
  assert.deepEqual(state.children[0].signals, []);
  assert.deepEqual(state.exits, []);
  state.setReadError(null); state.setAddresses([changed]); state.watcher.sample(); state.tick(1500);
  assert.deepEqual(state.children[0].signals, ["SIGTERM"]);
});

test("a failed final interface check postpones termination until a later successful stable sample", context => {
  const state = setup(context), failure = new Error("synthetic interface read failure");
  state.setAddresses([changed]); state.watcher.sample(); state.tick(500);
  state.setReadError(failure); state.tick(1000);
  assert.deepEqual(state.errors, [failure]);
  assert.deepEqual(state.children[0].signals, []);
  state.setReadError(null); state.watcher.sample(); state.tick(1500);
  assert.deepEqual(state.children[0].signals, ["SIGTERM"]);
});
