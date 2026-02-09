import { useState, useEffect, useCallback } from 'react'
import type { Settings } from '@yt-detox/shared'
import { getSettings, updateSettings as updateSettingsApi } from '@/lib/messaging'

const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  phase: 'observation',
  installDate: Date.now(),
  dailyGoalMinutes: 60,
  interventionsEnabled: {
    productivityPrompts: true,
    weeklyReports: true,
  },
  productivityPromptChance: 0.3,
  whitelistedChannels: [],
  blockedChannels: [],
  backend: {
    enabled: false,
    url: '',
    userId: null,
    lastSync: null,
  },
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getSettings()
      setSettings({ ...DEFAULT_SETTINGS, ...data })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch settings'))
    } finally {
      setLoading(false)
    }
  }, [])

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    try {
      await updateSettingsApi(updates)
      setSettings(prev => ({ ...prev, ...updates }))
      return true
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to update settings'))
      return false
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  return {
    settings,
    loading,
    error,
    updateSettings,
    refetch: fetchSettings,
  }
}
