import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderGit2, Plus, Trash2, CheckCircle2, AlertCircle,
  Copy, Check, Terminal, GitPullRequest, Loader2,
  ExternalLink, ChevronDown, ChevronUp, XCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  useRepos, useAddRepo, useRemoveRepo,
  useAddRemotePr, useRemoveRemotePr, useRemoteReview,
} from './hooks/use-repos'
import type { ConnectedRepo, RemotePr } from './hooks/use-repos'

// ── Shared helpers ──

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="ml-1 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// ── Local repo card ──

function LocalRepoCard({ repo, onRemove }: { repo: ConnectedRepo; onRemove: (p: string) => void }) {
  const [showSwitch, setShowSwitch] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const cmd = `cd ${repo.path}\nocr dashboard`

  return (
    <div className={cn('rounded-lg border p-4', repo.isActive
      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
      : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <FolderGit2 className={cn('mt-0.5 h-5 w-5 shrink-0', repo.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400')} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{repo.name}</span>
              {repo.isActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Active
                </span>
              )}
              {!repo.hasOcr && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" /> No .ocr
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">{repo.path}</p>
            <p className="mt-0.5 text-xs text-zinc-400">Added {new Date(repo.addedAt).toLocaleDateString()}</p>
          </div>
        </div>
        {!repo.isActive && (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => { setShowSwitch(v => !v); setConfirmRemove(false) }}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
              Switch
            </button>
            {confirmRemove ? (
              <>
                <button onClick={() => onRemove(repo.path)} className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600">Confirm</button>
                <button onClick={() => setConfirmRemove(false)} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">Cancel</button>
              </>
            ) : (
              <button onClick={() => { setConfirmRemove(true); setShowSwitch(false) }}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {showSwitch && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <Terminal className="h-3.5 w-3.5" /> Run in terminal to switch
          </div>
          <div className="flex items-start justify-between gap-2">
            <pre className="flex-1 font-mono text-xs text-zinc-800 dark:text-zinc-200">{cmd}</pre>
            <CopyButton text={cmd} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Remote PR card ──

function RemotePrCard({ pr, onRemove }: { pr: RemotePr; onRemove: (url: string) => void }) {
  const { state, start, cancel } = useRemoteReview(pr.prUrl)
  const [showStream, setShowStream] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const streamRef = useRef<HTMLPreElement>(null)

  const isRunning = state.status === 'running'
  const isDone = state.status === 'done' || pr.hasReview
  const sessionId = state.status === 'done' ? state.sessionId : (pr.hasReview ? pr.sessionId : null)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <GitPullRequest className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{pr.title}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {pr.owner}/{pr.repo}#{pr.prNumber}
              </span>
              {isDone && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Reviewed
                </span>
              )}
              {state.status === 'error' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400">
                  <XCircle className="h-3 w-3" /> Error
                </span>
              )}
            </div>
            <a href={pr.prUrl} target="_blank" rel="noreferrer"
              className="mt-0.5 flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-indigo-500">
              {pr.prUrl} <ExternalLink className="h-3 w-3" />
            </a>
            <p className="mt-0.5 text-xs text-zinc-400">Added {new Date(pr.addedAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {sessionId && (
            <Link to={`/sessions/${sessionId}`}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
              View Review
            </Link>
          )}
          {isRunning ? (
            <button onClick={cancel}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancel
            </button>
          ) : (
            <button onClick={start}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
              {isDone ? 'Re-review' : 'Run Review'}
            </button>
          )}
          {confirmRemove ? (
            <>
              <button onClick={() => onRemove(pr.prUrl)} className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600">Confirm</button>
              <button onClick={() => setConfirmRemove(false)} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmRemove(true)}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Running phase label */}
      {isRunning && state.status === 'running' && state.phase && (
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
          <span>{state.phase}</span>
        </div>
      )}

      {/* Stream toggle */}
      {(isRunning || state.status === 'error') && (
        <button onClick={() => setShowStream(v => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          {showStream ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showStream ? 'Hide' : 'Show'} output
        </button>
      )}

      {showStream && state.status === 'running' && state.tokens && (
        <pre ref={streamRef}
          className="mt-2 max-h-48 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 dark:bg-zinc-950">
          {state.tokens}
        </pre>
      )}

      {state.status === 'error' && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
        </div>
      )}
    </div>
  )
}

// ── Add forms ──

function AddLocalRepoForm({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('')
  const addRepo = useAddRepo()
  const submit = async () => {
    if (!value.trim()) return
    try { await addRepo.mutateAsync(value.trim()); onClose() } catch { /* shown below */ }
  }
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Repository path</label>
      <div className="flex gap-2">
        <input autoFocus type="text" value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onClose() }}
          placeholder="/Users/you/projects/my-repo"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
        <button onClick={() => void submit()} disabled={!value.trim() || addRepo.isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {addRepo.isPending ? 'Adding…' : 'Add'}
        </button>
        <button onClick={onClose} className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">Cancel</button>
      </div>
      {addRepo.error && <p className="mt-2 text-xs text-red-500">{(addRepo.error as Error).message}</p>}
      <p className="mt-2 text-xs text-zinc-400">Run <code className="font-mono">ocr init</code> inside the path first to enable reviews.</p>
    </div>
  )
}

function AddRemotePrForm({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const addPr = useAddRemotePr()
  const submit = async () => {
    if (!url.trim()) return
    try { await addPr.mutateAsync({ prUrl: url.trim(), title: title.trim() || undefined }); onClose() } catch { /* shown below */ }
  }
  return (
    <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-950/20">
      <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">GitHub PR URL</label>
      <div className="flex gap-2">
        <input autoFocus type="text" value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onClose() }}
          placeholder="https://github.com/owner/repo/pull/42"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
        <button onClick={() => void submit()} disabled={!url.trim() || addPr.isPending}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {addPr.isPending ? 'Adding…' : 'Add'}
        </button>
        <button onClick={onClose} className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400">Cancel</button>
      </div>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Optional title override"
        className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
      {addPr.error && <p className="mt-2 text-xs text-red-500">{(addPr.error as Error).message}</p>}
      <p className="mt-2 text-xs text-zinc-400">Works for any public PR. Private repos require <code className="font-mono">gh auth</code> with repo scope.</p>
    </div>
  )
}

// ── Main page ──

type Tab = 'local' | 'remote'

export function ReposPage() {
  const { data, isLoading } = useRepos()
  const removeRepo = useRemoveRepo()
  const removeRemotePr = useRemoveRemotePr()
  const [tab, setTab] = useState<Tab>('local')
  const [showAddLocal, setShowAddLocal] = useState(false)
  const [showAddRemote, setShowAddRemote] = useState(false)

  const localRepos = data?.local ?? []
  const remotePrs = data?.remote ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Repositories</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Local repos and remote GitHub PRs you want to review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'local' && !showAddLocal && (
            <button onClick={() => setShowAddLocal(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
              <Plus className="h-4 w-4" /> Add Local Repo
            </button>
          )}
          {tab === 'remote' && !showAddRemote && (
            <button onClick={() => setShowAddRemote(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus className="h-4 w-4" /> Add PR URL
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/50" style={{ width: 'fit-content' }}>
        {(['local', 'remote'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300')}>
            {t === 'local' ? (
              <span className="flex items-center gap-1.5"><FolderGit2 className="h-3.5 w-3.5" /> Local ({localRepos.length})</span>
            ) : (
              <span className="flex items-center gap-1.5"><GitPullRequest className="h-3.5 w-3.5" /> Remote PRs ({remotePrs.length})</span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}

      {/* Local tab */}
      {tab === 'local' && (
        <div className="space-y-3">
          {showAddLocal && <AddLocalRepoForm onClose={() => setShowAddLocal(false)} />}
          {localRepos.length === 0 && !showAddLocal && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <FolderGit2 className="mx-auto mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500">No local repos connected yet.</p>
            </div>
          )}
          {localRepos.map(r => (
            <LocalRepoCard key={r.path} repo={r} onRemove={p => removeRepo.mutate(p)} />
          ))}
        </div>
      )}

      {/* Remote tab */}
      {tab === 'remote' && (
        <div className="space-y-3">
          {showAddRemote && <AddRemotePrForm onClose={() => setShowAddRemote(false)} />}
          {remotePrs.length === 0 && !showAddRemote && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <GitPullRequest className="mx-auto mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No remote PRs added yet.</p>
              <p className="mt-1 text-xs text-zinc-400">Add any public GitHub PR URL to review it without cloning.</p>
            </div>
          )}
          {remotePrs.map(pr => (
            <RemotePrCard key={pr.prUrl} pr={pr} onRemove={u => removeRemotePr.mutate(u)} />
          ))}
          {remotePrs.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                <strong className="text-zinc-700 dark:text-zinc-300">How it works —</strong>{' '}
                Clicking <strong>Run Review</strong> fetches the PR diff via <code className="font-mono">gh</code>, creates a local session, and runs the full OCR multi-agent pipeline on it. Results appear in Sessions once complete.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
