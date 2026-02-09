import { useState, useEffect, useCallback } from 'react'
import type { StatsResponse, DailyStats } from '@yt-detox/shared'
import { getStats } from '@/lib/messaging'

const EMPTY_DAILY: DailyStats = {
  date: new Date().toISOString().split('T')[0],
  totalSeconds: 0,
  activeSeconds: 0,
  backgroundSeconds: 0,
  sessionCount: 0,
  avgSessionDurationSeconds: 0,
  firstCheckTime: undefined,
  videoCount: 0,
  videosCompleted: 0,
  videosAbandoned: 0,
  shortsCount: 0,
  uniqueChannels: 0,
  searchCount: 0,
  recommendationClicks: 0,
  autoplayCount: 0,
  autoplayCancelled: 0,
  totalScrollPixels: 0,
  avgScrollVelocity: 0,
  thumbnailsHovered: 0,
  thumbnailsClicked: 0,
  pageReloads: 0,
  backButtonPresses: 0,
  tabSwitches: 0,
  productiveVideos: 0,
  unproductiveVideos: 0,
  neutralVideos: 0,
  promptsShown: 0,
  promptsAnswered: 0,
  interventionsShown: 0,
  interventionsEffective: 0,
  hourlySeconds: {},
  topChannels: [],
  preSleepMinutes: 0,
  bingeSessions: 0,
}

export function useStats(pollInterval = 1000) {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const data = await getStats()
      setStats(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch stats'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, pollInterval)
    return () => clearInterval(interval)
  }, [fetchStats, pollInterval])

  return {
    today: (stats?.today as DailyStats) || EMPTY_DAILY,
    last7Days: stats?.last7Days || [],
    currentSession: stats?.currentSession || null,
    dailyGoalMinutes: stats?.dailyGoalMinutes || 60,
    loading,
    error,
    refetch: fetchStats,
  }
}
