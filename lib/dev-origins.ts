import { isIPv4 } from "node:net";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

type Interfaces = Record<string, readonly Pick<NetworkInterfaceInfo, "address" | "family" | "internal">[] | undefined>;

/** Allow only this machine's concrete private IPv4 hosts for local development. */
export function getLocalDevOrigins(interfaces: Interfaces = networkInterfaces()): string[] {
  const addresses = Object.values(interfaces).flatMap(entries => (entries || []).flatMap(entry => {
    if (entry.internal || entry.family !== "IPv4" || !isIPv4(entry.address)) return [];
    const [first, second] = entry.address.split(".").map(Number);
    const privateAddress = first === 10 || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
    return privateAddress ? [entry.address] : [];
  }));
  return [...new Set(addresses)].sort();
}
