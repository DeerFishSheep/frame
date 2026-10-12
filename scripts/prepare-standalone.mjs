import { cp, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const project = fileURLToPath(new URL("../", import.meta.url));
const standalone = resolve(project, ".next/standalone");
await access(resolve(standalone, "server.js"));
await mkdir(resolve(standalone, ".next"), { recursive: true });
await cp(resolve(project, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
await cp(resolve(project, "public"), resolve(standalone, "public"), { recursive: true });
console.log("FRAME standalone assets prepared.");
