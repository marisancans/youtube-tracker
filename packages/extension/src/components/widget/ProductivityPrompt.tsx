import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { rateVideo } from '@/lib/messaging';

interface ProductivityPromptProps {
  videoId: string;
  title: string;
  onClose: () => void;
}

export function ProductivityPrompt({ videoId, title, onClose }: ProductivityPromptProps) {
  const [remaining, setRemaining] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  const handleRate = async (rating: number) => {
    await rateVideo(videoId, rating);
    onClose();
  };

  const truncatedTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;

  return (
    <Card className="w-80 bg-background/95 backdrop-blur-sm border shadow-lg">
      <CardContent className="p-4 space-y-3">
        <div className="text-center">
          <div className="text-lg font-medium mb-1">Was this productive?</div>
          <div className="text-sm text-muted-foreground">{truncatedTitle}</div>
        </div>

        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={() => handleRate(1)}
            className="flex-1 hover:bg-green-100 hover:border-green-400"
          >
            <span className="text-xl">👍</span>
          </Button>
          <Button variant="outline" size="lg" onClick={() => handleRate(0)} className="flex-1 hover:bg-gray-100">
            <span className="text-xl">—</span>
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => handleRate(-1)}
            className="flex-1 hover:bg-red-100 hover:border-red-400"
          >
            <span className="text-xl">👎</span>
          </Button>
        </div>

        {/* Timer bar */}
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-1000"
            style={{ width: `${(remaining / 8) * 100}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
