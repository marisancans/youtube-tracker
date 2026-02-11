import type { DailyStats } from '@yt-detox/shared';

interface TodayStatsProps {
  today: DailyStats;
  dailyGoalMinutes: number;
}

export function TodayStats({ today, dailyGoalMinutes }: TodayStatsProps) {
  const totalMinutes = Math.round((today.totalSeconds || 0) / 60);
  const goalProgress = Math.min((totalMinutes / dailyGoalMinutes) * 100, 100);

  return (
    <div className="space-y-3">
      {/* Main stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-secondary/50 rounded-md py-2 px-1">
          <div className="text-xl font-bold">{totalMinutes}</div>
          <div className="text-xs text-muted-foreground">minutes</div>
        </div>
        <div className="bg-secondary/50 rounded-md py-2 px-1">
          <div className="text-xl font-bold">{today.videoCount || 0}</div>
          <div className="text-xs text-muted-foreground">videos</div>
        </div>
        <div className="bg-secondary/50 rounded-md py-2 px-1">
          <div className="text-xl font-bold">{today.shortsCount || 0}</div>
          <div className="text-xs text-muted-foreground">shorts</div>
        </div>
      </div>

      {/* Goal progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Daily Goal</span>
          <span>
            {totalMinutes}/{dailyGoalMinutes}m
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${goalProgress >= 100 ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${goalProgress}%` }}
          />
        </div>
      </div>

      {/* Productivity */}
      <div className="flex items-center justify-center gap-4 text-sm">
        <span className="flex items-center gap-1">
          <span>👍</span>
          <span className="text-green-600 font-medium">{today.productiveVideos || 0}</span>
        </span>
        <span className="flex items-center gap-1">
          <span>👎</span>
          <span className="text-red-600 font-medium">{today.unproductiveVideos || 0}</span>
        </span>
      </div>
    </div>
  );
}
