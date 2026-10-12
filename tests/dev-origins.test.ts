import assert from "node:assert/strict";
import test from "node:test";
import { getLocalDevOrigins } from "../lib/dev-origins";

const ipv4 = (address: string, internal = false) => ({ address, family: "IPv4" as const, internal });

test("LAN origins use only the host's private interface addresses, without wildcard expansion", () => {
  assert.deepEqual(getLocalDevOrigins({
    en0: [ipv4("192.168.0.101")],
    ethernet: [ipv4("10.2.3.4"), ipv4("172.16.0.2"), ipv4("172.31.255.254")],
    duplicate: [ipv4("192.168.0.101")],
    inactive: undefined,
  }), ["10.2.3.4", "172.16.0.2", "172.31.255.254", "192.168.0.101"]);
});

test("loopback, public addresses, invalid hosts and IPv6 never widen the development allowlist", () => {
  assert.deepEqual(getLocalDevOrigins({
    lo0: [ipv4("127.0.0.1", true), ipv4("10.0.0.1", true)],
    other: [ipv4("8.8.8.8"), ipv4("172.15.1.1"), ipv4("172.32.1.1"), ipv4("192.169.0.1"),
      ipv4("0.0.0.0"), ipv4("192.168.*.*"), ipv4("192.168.0.999"), ipv4("attacker.invalid"),
      { address: "fe80::1", family: "IPv6", internal: false }],
  }), []);
  assert.deepEqual(getLocalDevOrigins({}), []);
});

test("a new interface snapshot replaces a previous DHCP address", () => {
  assert.deepEqual(getLocalDevOrigins({ en0: [ipv4("192.168.0.101")] }), ["192.168.0.101"]);
  assert.deepEqual(getLocalDevOrigins({ en0: [ipv4("192.168.0.102")] }), ["192.168.0.102"]);
});
