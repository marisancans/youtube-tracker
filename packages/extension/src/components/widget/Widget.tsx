import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { SessionTimer } from './SessionTimer'
import { TodayStats } from './TodayStats'
import { WeekChart } from './WeekChart'
import { useStats } from '@/hooks/useStats'
import { formatMinutes } from '@/lib/utils'

export function Widget() {
  const [expanded, setExpanded] = useState(true)
  const { today, last7Days, currentSession, dailyGoalMinutes } = useStats(1000)

  const videoCount = today.videoCount || 0

  return (
    <Card className="w-80 bg-background/95 backdrop-blur-sm border shadow-lg">
      {/* Header - always visible */}
      <CardHeader 
        className="py-3 px-4 cursor-pointer flex flex-row items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🧘</span>
          <CardTitle className="text-base">YouTube Detox</CardTitle>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {formatMinutes(today.totalSeconds || 0)}
          </span>
          <span className="text-xs text-muted-foreground">
            {videoCount} vid
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {/* Expandable content */}
      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Current session */}
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Current Session
            </div>
            <SessionTimer session={currentSession} />
          </div>

          {/* Today's stats */}
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Today
            </div>
            <TodayStats today={today} dailyGoalMinutes={dailyGoalMinutes} />
          </div>

          {/* Week chart */}
          <div className="border-t pt-3">
            <WeekChart days={last7Days} />
          </div>
        </CardContent>
      )}
    </Card>
  )
}
