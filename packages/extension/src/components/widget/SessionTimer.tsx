import { formatTime } from '@/lib/utils';
import type { CurrentSession } from '@yt-detox/shared';

interface SessionTimerProps {
  session: CurrentSession | null;
}

export function SessionTimer({ session }: SessionTimerProps) {
  if (!session) {
    return <div className="text-center py-2 text-muted-foreground text-sm">No active session</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <div className="text-center">
        <div className="text-2xl font-bold text-primary">{formatTime(session.activeSeconds)}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Active</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-muted-foreground">{formatTime(session.backgroundSeconds)}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Background</div>
      </div>
    </div>
  );
}
