import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, chmodSync } from "node:fs";
import { createDevNetworkWatch, getPrivateIpv4Addresses } from "../lib/dev-network-watch.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const pidFile = resolve(project, ".tmp/dev-wrapper.pid");
mkdirSync(resolve(project, ".tmp"), { recursive: true });
writeFileSync(pidFile, `${process.pid}\n`, { mode: 0o600 });
chmodSync(pidFile, 0o600);
process.once("exit", () => {
  try { if (readFileSync(pidFile, "utf8").trim() === String(process.pid)) unlinkSync(pidFile); }
  catch { /* Missing or replaced PID hints must not interrupt shutdown. */ }
});
const next = resolve(project, "node_modules/next/dist/bin/next");
const args = [next, "dev", "--hostname", "0.0.0.0", ...process.argv.slice(2)];
const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
let watcher;
const stop = () => watcher?.stop("SIGTERM");
for (const signal of signals) process.on(signal, stop);
watcher = createDevNetworkWatch({
  readAddresses: () => getPrivateIpv4Addresses(networkInterfaces()),
  // Keep Next CLI directly above next-server, so dev-control can validate both processes.
  spawnChild: () => spawn(process.execPath, args, { cwd: project, stdio: "inherit", env: process.env }),
  onRestart: addresses => console.log(`[FRAME] 本机局域网地址已变更，正在重启开发服务：${addresses.join("、") || "暂无局域网地址"}`),
  onError: error => console.error(`[FRAME] 开发服务监视器错误：${error.message}`),
  onExit: (code, signal) => {
    for (const event of signals) process.removeListener(event, stop);
    process.exitCode = typeof code === "number" ? code : signal === "SIGTERM" || signal === "SIGINT" || signal === "SIGHUP" ? 0 : 1;
  },
});
