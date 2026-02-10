import { useState, useEffect, useCallback } from 'react'
import type { Settings } from '@yt-detox/shared'
import { getSettings, updateSettings as updateSettingsApi } from '@/lib/messaging'

const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  privacyTier: 'standard',
  phase: 'observation',
  installDate: Date.now(),
  dailyGoalMinutes: 60,
  weekendGoalMinutes: 120,
  bedtime: '23:00',
  wakeTime: '07:00',
  interventionsEnabled: {
    productivityPrompts: true,
    timeWarnings: true,
    intentionPrompts: false,
    frictionDelay: false,
    weeklyReports: true,
    bedtimeWarning: false,
  },
  productivityPromptChance: 0.3,
  whitelistedChannels: [],
  blockedChannels: [],
  backend: {
    enabled: false,
    url: 'http://localhost:8000',
    userId: null,
    lastSync: null,
  },
  devFeatures: {
    driftEffects: false,
    frictionOverlay: false,
    musicDetection: false,
    nudges: false,
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
