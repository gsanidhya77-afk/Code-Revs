import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkForUpdate,
  printUpdateNotification,
  type UpdateResult,
} from "../update-check.js";

// ── Helpers ──

function writeCacheFile(
  cacheDir: string,
  data: { lastCheck: number; latestVersion: string | null },
): void {
  writeFileSync(join(cacheDir, "update-check.json"), JSON.stringify(data));
}

function readCacheFile(
  cacheDir: string,
): { lastCheck: number; latestVersion: string | null } {
  return JSON.parse(
    readFileSync(join(cacheDir, "update-check.json"), "utf-8"),
  );
}

function mockFetch(version: string) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ version }),
  });
}

function mockFetchError() {
  return vi.fn().mockRejectedValue(new Error("network error"));
}

// ── Tests ──

describe("checkForUpdate", () => {
  let cacheDir: string;
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "ocr-update-check-test-"));
    delete process.env.CI;
    delete process.env.OCR_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("returns update result when registry has a newer version", async () => {
    globalThis.fetch = mockFetch("2.0.0");

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(true);
    expect(result!.currentVersion).toBe("1.5.1");
    expect(result!.latestVersion).toBe("2.0.0");
    expect(result!.updateCommand).toContain("npm i -g");
    expect(result!.updateCommand).toContain("&& ocr update");
  });

  it("returns null when current version is already latest", async () => {
    globalThis.fetch = mockFetch("1.5.1");

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).toBeNull();
  });

  it("returns null when current version is ahead of registry", async () => {
    globalThis.fetch = mockFetch("1.4.0");

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).toBeNull();
  });

  it("returns null when CI env var is set", async () => {
    process.env.CI = "true";
    globalThis.fetch = mockFetch("9.9.9");

    const result = await checkForUpdate("1.0.0", { cacheDir });

    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns null when OCR_NO_UPDATE_CHECK is set", async () => {
    process.env.OCR_NO_UPDATE_CHECK = "1";
    globalThis.fetch = mockFetch("9.9.9");

    const result = await checkForUpdate("1.0.0", { cacheDir });

    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("uses cached version within TTL instead of fetching", async () => {
    writeCacheFile(cacheDir, {
      lastCheck: Date.now(),
      latestVersion: "2.0.0",
    });
    globalThis.fetch = mockFetch("3.0.0");

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).not.toBeNull();
    expect(result!.latestVersion).toBe("2.0.0"); // cached, not 3.0.0
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns null from cache when cached version is not newer", async () => {
    writeCacheFile(cacheDir, {
      lastCheck: Date.now(),
      latestVersion: "1.5.1",
    });
    globalThis.fetch = mockFetch("9.9.9");

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns null from cache when cached latestVersion is null", async () => {
    writeCacheFile(cacheDir, {
      lastCheck: Date.now(),
      latestVersion: null,
    });
    globalThis.fetch = mockFetch("9.9.9");

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches from registry when cache is expired", async () => {
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
    writeCacheFile(cacheDir, {
      lastCheck: fiveHoursAgo,
      latestVersion: "1.5.0",
    });
    globalThis.fetch = mockFetch("2.0.0");

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).not.toBeNull();
    expect(result!.latestVersion).toBe("2.0.0"); // from fetch, not cache
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("writes cache after successful fetch", async () => {
    globalThis.fetch = mockFetch("2.0.0");

    await checkForUpdate("1.5.1", { cacheDir });

    const cache = readCacheFile(cacheDir);
    expect(cache.latestVersion).toBe("2.0.0");
    expect(cache.lastCheck).toBeGreaterThan(0);
  });

  it("returns null and caches on network error", async () => {
    globalThis.fetch = mockFetchError();

    const result = await checkForUpdate("1.5.1", { cacheDir });

    expect(result).toBeNull();
    const cache = readCacheFile(cacheDir);
    expect(cache.latestVersion).toBeNull();
  });

  it("compares major versions correctly", async () => {
    globalThis.fetch = mockFetch("2.0.0");
    expect(await checkForUpdate("1.9.9", { cacheDir })).not.toBeNull();
  });

  it("compares minor versions correctly", async () => {
    globalThis.fetch = mockFetch("1.6.0");

    // Clear cache from previous test
    rmSync(join(cacheDir, "update-check.json"), { force: true });

    expect(await checkForUpdate("1.5.9", { cacheDir })).not.toBeNull();
  });

  it("compares patch versions correctly", async () => {
    globalThis.fetch = mockFetch("1.5.2");

    rmSync(join(cacheDir, "update-check.json"), { force: true });

    expect(await checkForUpdate("1.5.1", { cacheDir })).not.toBeNull();
  });

  it("creates cache directory if it does not exist", async () => {
    const nestedCacheDir = join(cacheDir, "nested", "deep");
    globalThis.fetch = mockFetch("2.0.0");

    await checkForUpdate("1.5.1", { cacheDir: nestedCacheDir });

    const cache = readCacheFile(nestedCacheDir);
    expect(cache.latestVersion).toBe("2.0.0");
  });
});

describe("printUpdateNotification", () => {
  it("writes notification to stderr", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const result: UpdateResult = {
      updateAvailable: true,
      currentVersion: "1.5.1",
      latestVersion: "2.0.0",
      updateCommand: "npm i -g @open-code-review/cli@latest && ocr update",
    };

    printUpdateNotification(result);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain("1.5.1");
    expect(output).toContain("2.0.0");
    expect(output).toContain("npm i -g");
    expect(output).toContain("ocr update");

    writeSpy.mockRestore();
  });
});
