/**
 * Shared environment utilities for spawning AI CLI processes.
 */

/** Environment variables allowed to pass through to spawned processes. */
const ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'TERM',
  'ANTHROPIC_API_KEY',
  // OpenCode may need provider API keys
  'OPENAI_API_KEY',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_DIR',
  // GitHub CLI auth — gh reads GH_TOKEN / GITHUB_TOKEN when not using
  // `gh auth login` (CI environments, act-runner, etc.)
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'NODE_ENV',
  'SHELL',
  'USER',
  'TMPDIR',
] as const

/**
 * Build a clean env for spawning an AI CLI as a child process.
 * Uses an allowlist so only known-safe variables are passed through.
 */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]
    }
  }
  return env
}
