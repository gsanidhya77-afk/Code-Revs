import { useCallback, useState } from 'react'
import { useSocket, useSocketEvent } from '../../../providers/socket-provider'

export type FixCommitStep = 'idle' | 'committing' | 'done' | 'error'
export type DiffStep = 'idle' | 'loading' | 'ready' | 'error'

export type FixCommitResult = {
  success: boolean
  commitHash?: string
  error?: string
  /** Set when the session is a remote PR and the agent already pushed */
  remote?: boolean
  prUrl?: string
  headRef?: string | null
}

export type DiffResult = {
  diff: string
  empty: boolean
  error?: string
  /** Set when the session is a remote PR — explains why there's no local diff */
  remoteNote?: string
}

export type SessionInfo = {
  isRemote: boolean
  isCollaborator?: boolean
  owner?: string
  repo?: string
  prNumber?: number
  headRef?: string | null
  prUrl?: string
}

export type UseFixFindingReturn = {
  commitStep: FixCommitStep
  commitResult: FixCommitResult | null
  commit: (message: string, sessionId?: string) => void
  reset: () => void
  diffStep: DiffStep
  diffResult: DiffResult | null
  requestDiff: (sessionId?: string) => void
  sessionInfo: SessionInfo | null
  requestSessionInfo: (sessionId: string) => void
}

export function useFixFinding(): UseFixFindingReturn {
  const { socket } = useSocket()
  const [commitStep, setCommitStep] = useState<FixCommitStep>('idle')
  const [commitResult, setCommitResult] = useState<FixCommitResult | null>(null)
  const [diffStep, setDiffStep] = useState<DiffStep>('idle')
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)

  useSocketEvent<FixCommitResult>(
    'fix:commit-result',
    useCallback((data) => {
      setCommitResult(data)
      setCommitStep(data.success ? 'done' : 'error')
    }, []),
  )

  useSocketEvent<DiffResult>(
    'fix:diff-result',
    useCallback((data) => {
      setDiffResult(data)
      setDiffStep(data.error ? 'error' : 'ready')
    }, []),
  )

  useSocketEvent<SessionInfo>(
    'fix:session-info-result',
    useCallback((data) => {
      setSessionInfo(data)
    }, []),
  )

  const commit = useCallback(
    (message: string, sessionId?: string) => {
      if (!socket) return
      setCommitStep('committing')
      setCommitResult(null)
      socket.emit('fix:commit', { message, sessionId })
    },
    [socket],
  )

  const requestDiff = useCallback(
    (sessionId?: string) => {
      if (!socket) return
      setDiffStep('loading')
      setDiffResult(null)
      socket.emit('fix:diff', sessionId ? { sessionId } : undefined)
    },
    [socket],
  )

  const requestSessionInfo = useCallback(
    (sessionId: string) => {
      if (!socket) return
      socket.emit('fix:session-info', { sessionId })
    },
    [socket],
  )

  const reset = useCallback(() => {
    setCommitStep('idle')
    setCommitResult(null)
    setDiffStep('idle')
    setDiffResult(null)
    setSessionInfo(null)
  }, [])

  return { commitStep, commitResult, commit, reset, diffStep, diffResult, requestDiff, sessionInfo, requestSessionInfo }
}
