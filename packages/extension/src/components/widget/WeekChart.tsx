import type { DailyStats } from '@yt-detox/shared'

interface WeekChartProps {
  days: DailyStats[]
}

export function WeekChart({ days }: WeekChartProps) {
  // Ensure we have 7 days, sorted oldest to newest
  const sortedDays = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)
  
  // Fill in missing days
  const today = new Date()
  const weekDays: (DailyStats | null)[] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    const found = sortedDays.find(d => d.date === dateStr)
    weekDays.push(found || null)
  }
  
  const maxMinutes = Math.max(
    ...weekDays.map(d => d ? Math.round((d.totalSeconds || 0) / 60) : 0),
    1
  )

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground text-center mb-2">
        Last 7 Days
      </div>
      <div className="flex items-end justify-between gap-1 h-16">
        {weekDays.map((day, i) => {
          const minutes = day ? Math.round((day.totalSeconds || 0) / 60) : 0
          const height = maxMinutes > 0 ? Math.max((minutes / maxMinutes) * 100, 4) : 4
          const date = new Date(today)
          date.setDate(date.getDate() - (6 - i))
          const dow = date.getDay()
          const isToday = i === 6
          
          return (
            <div key={i} className="flex flex-col items-center flex-1">
              <div 
                className={`w-full rounded-sm transition-all ${
                  isToday ? 'bg-primary' : 'bg-secondary'
                }`}
                style={{ height: `${height}%`, minHeight: '4px' }}
                title={`${day?.date || 'N/A'}: ${minutes} min`}
              />
              <div className={`text-[10px] mt-1 ${isToday ? 'font-bold' : 'text-muted-foreground'}`}>
                {dayLabels[dow]}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
