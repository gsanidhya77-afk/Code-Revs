import { useState, useCallback, useEffect, useRef } from 'react'
import { X, Wrench, GitCommit, RefreshCw, Check, ClipboardCopy, Play, ShieldAlert, AlertCircle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../../lib/utils'
import { useSocket } from '../../../providers/socket-provider'
import { useCommandState } from '../../../providers/command-state-provider'
import { useIdeConfig } from '../../../hooks/use-ide-config'
import { useFixFinding } from '../hooks/use-fix-finding'
import type { Finding } from '../../../lib/api-types'

type Tab = 'agent' | 'commit' | 'review'

type Props = {
  finding: Finding
  sessionId: string
  roundNumber: number
}

function buildPrompt(finding: Finding, roundNumber: number, notes: string): string {
  const location = finding.file_path
    ? `\nFile: ${finding.file_path}${finding.line_start != null ? `:${finding.line_start}` : ''}`
    : ''
  const notesSection = notes.trim() ? `\n\nAdditional context:\n${notes.trim()}` : ''
  return `You are an author fixing a specific code review finding.

FINDING (Round ${roundNumber}):
Title: ${finding.title}
Severity: ${finding.severity}${location}
${finding.summary ? `\nDescription:\n${finding.summary}` : ''}${notesSection}

INSTRUCTIONS:
1. Read the file at the location above and understand the concern
2. Apply the minimal correct fix — do not refactor surrounding code
3. Verify the fix resolves the concern without introducing new issues
4. Do NOT add comments explaining the change`.trim()
}

const SEVERITY_CLS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-700 dark:text-red-400',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  low: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  info: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
}

export function FixWithAiDialog({ finding, sessionId, roundNumber }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('agent')
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [commitMsg, setCommitMsg] = useState(`fix: address review finding — ${finding.title}`)

  const dialogRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { socket } = useSocket()
  const { isRunning } = useCommandState()
  const { data: config } = useIdeConfig()
  const hasAiCli = !!config?.aiCli?.active
  const { commitStep, commitResult, commit, reset: resetCommit } = useFixFinding()

  const close = useCallback(() => {
    setOpen(false)
    setTab('agent')
    setConfirming(false)
    resetCommit()
  }, [resetCommit])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  const prompt = buildPrompt(finding, roundNumber, notes)

  function handleRunAgent() {
    const roundDir = `.ocr/sessions/${sessionId}/rounds/round-${roundNumber}`
    const requirements = `Focus ONLY on this finding: "${finding.title}"${finding.file_path ? ` in ${finding.file_path}` : ''}. ${notes.trim() ? notes.trim() : 'Apply the minimal correct fix.'}`
    socket?.emit('command:run', {
      command: `ocr address ${roundDir}/final.md --requirements ${JSON.stringify(requirements)}`,
    })
    close()
    navigate('/commands')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCommit() {
    commit(commitMsg)
  }

  function handleQueueReview() {
    socket?.emit('command:run', { command: 'ocr review' })
    close()
    navigate('/commands')
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400 cursor-pointer"
      >
        <Wrench className="h-3 w-3" />
        Fix
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* backdrop */}
          <div className="fixed inset-0 bg-black/60" onClick={close} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="relative z-10 w-full max-w-lg glass-card rounded-xl shadow-2xl focus:outline-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/[0.06]">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Fix with Author Agent</h2>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400 max-w-[340px]">
                  {finding.title}
                </p>
              </div>
              <button
                onClick={close}
                className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-white/[0.06]">
              {(
                [
                  { id: 'agent' as Tab, label: '1. Run Agent', icon: Wrench },
                  { id: 'commit' as Tab, label: '2. Commit', icon: GitCommit },
                  { id: 'review' as Tab, label: '3. Re-review', icon: RefreshCw },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer',
                    tab === id
                      ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-5">
              {/* ── Tab 1: Run Agent ── */}
              {tab === 'agent' && (
                <div className="space-y-4">
                  {/* Finding summary card */}
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                          SEVERITY_CLS[finding.severity] ?? SEVERITY_CLS.info,
                        )}
                      >
                        {finding.severity}
                      </span>
                      {finding.file_path && (
                        <span className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {finding.file_path}
                          {finding.line_start != null ? `:${finding.line_start}` : ''}
                        </span>
                      )}
                    </div>
                    {finding.summary && (
                      <p className="line-clamp-3 text-xs text-zinc-600 dark:text-zinc-300">
                        {finding.summary}
                      </p>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Additional context{' '}
                      <span className="font-normal text-zinc-400">(optional)</span>
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Use the existing helper in utils.ts, don't change the API signature…"
                      rows={2}
                      className="mt-1 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm placeholder:text-zinc-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>

                  {hasAiCli ? (
                    <>
                      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          Runs an AI agent with read/write and shell access to your project. Review
                          the diff before committing.
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {!confirming ? (
                          <button
                            onClick={() => setConfirming(true)}
                            disabled={isRunning}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 cursor-pointer',
                              isRunning && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Run Author Agent
                          </button>
                        ) : (
                          <button
                            onClick={handleRunAgent}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 cursor-pointer"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Confirm — Run Agent
                          </button>
                        )}
                        <button
                          onClick={handleCopy}
                          title="Copy prompt to clipboard"
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.05] cursor-pointer"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                        Agent runs in the Commands view — return here to commit when done.
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Copy this prompt to your AI assistant to apply the fix:
                      </p>
                      <div className="max-h-36 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                          {prompt}
                        </pre>
                      </div>
                      <button
                        onClick={handleCopy}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <ClipboardCopy className="h-3.5 w-3.5" />
                            Copy Prompt
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 2: Commit ── */}
              {tab === 'commit' && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Once the Author Agent has applied the fix, commit and push the changes to the PR
                    branch.
                  </p>

                  <div>
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Commit message
                    </label>
                    <input
                      type="text"
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>

                  {commitStep === 'idle' && (
                    <button
                      onClick={handleCommit}
                      disabled={!commitMsg.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                      <GitCommit className="h-4 w-4" />
                      Commit &amp; Push
                    </button>
                  )}

                  {commitStep === 'committing' && (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 py-3 text-sm text-zinc-500 dark:border-white/[0.06] dark:text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Committing and pushing…
                    </div>
                  )}

                  {commitStep === 'done' && commitResult?.success && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                        <Check className="h-4 w-4 shrink-0" />
                        <span>
                          Committed{' '}
                          <code className="font-mono">{commitResult.commitHash}</code> and pushed
                          successfully.
                        </span>
                      </div>
                      <button
                        onClick={() => setTab('review')}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.05] cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Next: Queue Re-review →
                      </button>
                    </div>
                  )}

                  {commitStep === 'error' && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {commitResult?.error ??
                          'Commit failed. Check that the agent made changes first.'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 3: Re-review ── */}
              {tab === 'review' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      What happens next
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {[
                        'A new review round runs on the updated PR',
                        'AI reviewers check if the fix resolved their concerns',
                        'Findings are cross-referenced with Round ' + roundNumber,
                        'Resolved concerns are identified from unchanged / new findings',
                      ].map((line) => (
                        <li key={line} className="flex items-start gap-1.5">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={handleQueueReview}
                    disabled={isRunning}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 cursor-pointer',
                      isRunning && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Queue New Review Round
                  </button>
                  <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                    Runs <code className="font-mono">ocr review</code> for this session in the
                    Commands view.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
