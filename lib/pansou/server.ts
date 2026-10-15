import "server-only";
import { createPansouClient } from "./client";
export const pansou = createPansouClient({ baseUrl: process.env.PANSOU_BASE_URL ?? "" });
