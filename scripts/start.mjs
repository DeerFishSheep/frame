import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import nextEnv from "@next/env";

const project = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(project, false);
const server = resolve(project, ".next/standalone/server.js");
try { await access(server); }
catch { console.error("请先运行 npm run build，再启动 FRAME。"); process.exit(1); }
const child = spawn(process.execPath, [server], {
  cwd: project,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", HOSTNAME: process.env.FRAME_HOST || "0.0.0.0", PORT: process.env.PORT || "3000" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", error => { console.error(error.message); process.exit(1); });
child.on("exit", (code, signal) => { process.exit(signal ? 0 : code ?? 1); });
