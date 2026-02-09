import { useState, useCallback } from 'react'
import { Widget } from '@/components/widget/Widget'
import { ProductivityPrompt } from '@/components/widget/ProductivityPrompt'

interface AppProps {
  onPromptRequest?: (callback: (video: { videoId: string; title: string }) => void) => void
}

export function App({ onPromptRequest }: AppProps) {
  const [prompt, setPrompt] = useState<{ videoId: string; title: string } | null>(null)

  // Register callback for showing productivity prompt
  useCallback(() => {
    onPromptRequest?.((video) => {
      setPrompt(video)
    })
  }, [onPromptRequest])

  return (
    <div className="yt-detox-root space-y-2">
      {prompt && (
        <ProductivityPrompt
          videoId={prompt.videoId}
          title={prompt.title}
          onClose={() => setPrompt(null)}
        />
      )}
      <Widget />
    </div>
  )
}
