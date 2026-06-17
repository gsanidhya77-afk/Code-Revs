/**
 * Non-blocking CLI update checker.
 *
 * Fetches the latest version from the npm registry, caches the result
 * for 4 hours, and prints a styled notification if an update is available.
 * Only runs on human-facing commands — AI-invoked commands are excluded
 * at the call site in index.ts.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import chalk from "chalk";

const PACKAGE_NAME = "@open-code-review/cli";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const CACHE_DIR = join(homedir(), ".ocr");
const CACHE_FILE = join(CACHE_DIR, "update-check.json");
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const FETCH_TIMEOUT_MS = 3000;

// ── Types ──

type UpdateCheckCache = {
  lastCheck: number;
  latestVersion: string | null;
};

export type UpdateResult = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  updateCommand: string;
};

// ── Cache ──

function readCache(cacheFile: string): UpdateCheckCache | null {
  try {
    return JSON.parse(readFileSync(cacheFile, "utf-8")) as UpdateCheckCache;
  } catch {
    return null;
  }
}

function writeCache(cacheFile: string, cache: UpdateCheckCache): void {
  try {
    mkdirSync(join(cacheFile, ".."), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(cache));
  } catch {
    // Non-critical — silently ignore
  }
}

// ── Version comparison ──

function isNewer(latest: string, current: string): boolean {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

// ── Update command ──

function detectUpdateCommand(): string {
  return `npm i -g ${PACKAGE_NAME}@latest && ocr update`;
}

// ── Public API ──

/**
 * Check if a newer version of the CLI is available on npm.
 *
 * Returns null when:
 * - Running in CI
 * - Suppressed via OCR_NO_UPDATE_CHECK
 * - Fetch fails or times out
 * - Already on the latest version
 */
export async function checkForUpdate(
  currentVersion: string,
  options?: { cacheDir?: string },
): Promise<UpdateResult | null> {
  if (process.env.CI || process.env.OCR_NO_UPDATE_CHECK) {
    return null;
  }

  const cacheFile = join(options?.cacheDir ?? CACHE_DIR, "update-check.json");

  try {
    // Check cache first
    const cache = readCache(cacheFile);
    if (cache && Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) {
      if (!cache.latestVersion) return null;
      if (!isNewer(cache.latestVersion, currentVersion)) return null;
      return {
        updateAvailable: true,
        currentVersion,
        latestVersion: cache.latestVersion,
        updateCommand: detectUpdateCommand(),
      };
    }

    // Fetch from registry
    const response = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version ?? null;

    writeCache(cacheFile, { lastCheck: Date.now(), latestVersion });

    if (!latestVersion || !isNewer(latestVersion, currentVersion)) {
      return null;
    }

    return {
      updateAvailable: true,
      currentVersion,
      latestVersion,
      updateCommand: detectUpdateCommand(),
    };
  } catch {
    // Network errors, timeouts — silently ignore
    writeCache(cacheFile, { lastCheck: Date.now(), latestVersion: null });
    return null;
  }
}

/**
 * Print a styled update notification to stderr.
 */
export function printUpdateNotification(result: UpdateResult): void {
  const line1 =
    chalk.yellow("  Update available: ") +
    chalk.dim(result.currentVersion) +
    chalk.yellow(" → ") +
    chalk.green(result.latestVersion);

  const line2 =
    chalk.dim("  Run: ") +
    chalk.bold(result.updateCommand);

  process.stderr.write(`\n${line1}\n${line2}\n\n`);
}
