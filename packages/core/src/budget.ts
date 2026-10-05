import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface UsageState {
  date: string;
  spentUsd: number;
}

const STATE_DIR = join(homedir(), ".mottainai");
const STATE_FILE = join(STATE_DIR, "usage.json");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadDailySpend(): number {
  if (!existsSync(STATE_FILE)) return 0;
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as UsageState;
    return state.date === today() ? state.spentUsd : 0;
  } catch {
    return 0;
  }
}

export function recordSpend(usd: number): number {
  if (usd <= 0) return loadDailySpend();
  const total = loadDailySpend() + usd;
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ date: today(), spentUsd: total } satisfies UsageState)
  );
  return total;
}
