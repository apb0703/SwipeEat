import { useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { Channel, PlayerState } from '../../types'

interface Props {
  channel: Channel | null
  state: PlayerState
  onStatus: (status: PlayerState['status'], error?: string) => void
  onVolumeChange?: (v: number) => void
}

export default function VideoPlayer({ channel, state, onStatus, onVolumeChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !channel) {
      destroyHls()
      return
    }

    destroyHls()
    onStatus('loading')

    const url = channel.url

    // Native HLS (Safari) or direct stream
    if (video.canPlayType('application/vnd.apple.mpegurl') || !url.includes('.m3u')) {
      video.src = url
      video.play().catch(() => onStatus('error', 'Playback blocked or stream unavailable.'))
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      })
      hlsRef.current = hls

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => onStatus('error', 'Playback blocked.'))
      })

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          onStatus('error', `Stream error: ${data.details}`)
        }
      })

      hls.loadSource(url)
      hls.attachMedia(video)
    } else {
      video.src = url
      video.play().catch(() => onStatus('error', 'HLS not supported in this browser.'))
    }

    return () => destroyHls()
  }, [channel, destroyHls, onStatus])

  // Sync volume / mute
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = state.volume
    video.muted = state.muted
  }, [state.volume, state.muted])

  // Fullscreen
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (state.fullscreen && !document.fullscreenElement) {
      video.requestFullscreen().catch(() => {})
    } else if (!state.fullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [state.fullscreen])

  const handleVolumeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange?.(parseFloat(e.target.value))
  }

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center group">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onPlaying={() => onStatus('playing')}
        onWaiting={() => onStatus('loading')}
        onPause={() => onStatus('paused')}
        onError={() => onStatus('error', 'Media error')}
        onVolumeChange={() => {
          if (videoRef.current) onVolumeChange?.(videoRef.current.volume)
        }}
        playsInline
        controls={false}
      />

      {/* Overlay when idle */}
      {!channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500">
          <svg className="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <p className="text-sm">Select a channel to start watching</p>
        </div>
      )}

      {/* Loading spinner */}
      {state.status === 'loading' && channel && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {state.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
          <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-400 text-sm text-center px-4">{state.error ?? 'Stream unavailable'}</p>
        </div>
      )}

      {/* Bottom controls - shown on hover */}
      {channel && (
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3">
          <span className="text-xs font-medium text-white truncate flex-1">{channel.name}</span>

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.muted ? 0 : state.volume}
              onChange={handleVolumeInput}
              className="w-20 accent-accent"
            />
          </div>

          {/* Status badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${state.status === 'playing' ? 'bg-green-600' : 'bg-yellow-600'}`}>
            {state.status === 'playing' ? 'LIVE' : state.status.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  )
}
