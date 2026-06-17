import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../../lib/utils'
import { useSocket } from '../../../providers/socket-provider'

// ── Types ──

export type ConnectedRepo = {
  type: 'local'
  path: string
  name: string
  addedAt: string
  hasOcr: boolean
  isActive: boolean
}

export type RemotePr = {
  type: 'remote'
  prUrl: string
  owner: string
  repo: string
  prNumber: number
  title: string
  addedAt: string
  sessionId: string
  hasReview: boolean
}

type ReposResponse = {
  local: ConnectedRepo[]
  remote: RemotePr[]
}

export type ReviewPhase =
  | { status: 'idle' }
  | { status: 'running'; phase: string; tokens: string }
  | { status: 'done'; sessionId: string }
  | { status: 'error'; error: string }

// ── Local repo hooks ──

export function useRepos() {
  return useQuery<ReposResponse>({
    queryKey: ['repos'],
    queryFn: () => fetchApi<ReposResponse>('/api/repos'),
  })
}

export function useAddRepo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path: string) =>
      fetchApi<ConnectedRepo>('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  })
}

export function useRemoveRepo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path: string) =>
      fetchApi<{ removed: string }>('/api/repos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  })
}

// ── Remote PR hooks ──

export function useAddRemotePr() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ prUrl, title }: { prUrl: string; title?: string }) =>
      fetchApi<RemotePr>('/api/repos/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl, title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  })
}

export function useRemoveRemotePr() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prUrl: string) =>
      fetchApi<{ removed: string }>('/api/repos/remote', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  })
}

// ── Remote review hook (socket-based streaming) ──

export function useRemoteReview(prUrl: string) {
  const { socket } = useSocket()
  const qc = useQueryClient()
  const [state, setState] = useState<ReviewPhase>({ status: 'idle' })
  const tokensRef = useRef('')

  useEffect(() => {
    if (!socket) return

    const onPhase = (data: { prUrl: string; phase: string }) => {
      if (data.prUrl !== prUrl) return
      setState({ status: 'running', phase: data.phase, tokens: tokensRef.current })
    }

    const onToken = (data: { prUrl: string; token: string }) => {
      if (data.prUrl !== prUrl) return
      tokensRef.current += data.token
      setState((prev) =>
        prev.status === 'running'
          ? { ...prev, tokens: tokensRef.current }
          : { status: 'running', phase: '', tokens: tokensRef.current }
      )
    }

    const onDone = (data: { prUrl: string; sessionId: string }) => {
      if (data.prUrl !== prUrl) return
      tokensRef.current = ''
      setState({ status: 'done', sessionId: data.sessionId })
      void qc.invalidateQueries({ queryKey: ['repos'] })
    }

    const onError = (data: { prUrl: string; error: string }) => {
      if (data.prUrl !== prUrl) return
      tokensRef.current = ''
      setState({ status: 'error', error: data.error })
    }

    socket.on('remote-review:phase', onPhase)
    socket.on('remote-review:token', onToken)
    socket.on('remote-review:done', onDone)
    socket.on('remote-review:error', onError)

    return () => {
      socket.off('remote-review:phase', onPhase)
      socket.off('remote-review:token', onToken)
      socket.off('remote-review:done', onDone)
      socket.off('remote-review:error', onError)
    }
  }, [socket, prUrl, qc])

  const start = useCallback(() => {
    if (!socket) return
    tokensRef.current = ''
    setState({ status: 'running', phase: 'Starting…', tokens: '' })
    socket.emit('remote-review:start', { prUrl })
  }, [socket, prUrl])

  const cancel = useCallback(() => {
    if (!socket) return
    socket.emit('remote-review:cancel', { prUrl })
    setState({ status: 'idle' })
  }, [socket, prUrl])

  return { state, start, cancel }
}
