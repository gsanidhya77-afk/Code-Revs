import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../../lib/utils'
import { useSocketEvent } from '../../../providers/socket-provider'
import type { ReviewerMeta, ReviewerTier } from '../../../../shared/types.js'

export type { ReviewerMeta, ReviewerTier }

type ReviewersResponse = {
  reviewers: ReviewerMeta[]
  defaults: string[]
}

export function useReviewers() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<ReviewersResponse>({
    queryKey: ['reviewers'],
    queryFn: () => fetchApi<ReviewersResponse>('/api/reviewers'),
  })

  // Live refresh when reviewers-meta.json changes
  useSocketEvent<ReviewersResponse>('reviewers:updated', (updated) => {
    queryClient.setQueryData(['reviewers'], updated)
  })

  return {
    reviewers: data?.reviewers ?? [],
    defaults: data?.defaults ?? [],
    isLoaded: !isLoading,
  }
}
