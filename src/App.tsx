import { useState, useCallback } from 'react'
import { Channel, SidebarTab } from './types'
import { useChannels } from './hooks/useChannels'
import { usePlayer } from './hooks/usePlayer'
import VideoPlayer from './components/Player/VideoPlayer'
import ChannelList from './components/Channels/ChannelList'
import AutoSearchPanel from './components/AutoSearch/AutoSearchPanel'
import Sidebar from './components/Layout/Sidebar'

export default function App() {
  const { channels, importChannels, deleteChannel, clear } = useChannels()
  const { state: playerState, play, setStatus, setVolume, toggleMute } = usePlayer()
  const [tab, setTab] = useState<SidebarTab>('channels')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleImport = useCallback((incoming: Channel[]) => {
    if (incoming.length === 0) {
      showToast('No channels found.')
      return
    }
    importChannels(incoming)
    showToast(`Added ${incoming.length} channel${incoming.length !== 1 ? 's' : ''}`)
    setTab('channels')
  }, [importChannels])

  const handlePlay = useCallback((channel: Channel) => {
    play(channel)
  }, [play])

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v)
  }, [setVolume])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">

      {/* Sidebar nav */}
      <Sidebar active={tab} channelCount={channels.length} onChange={setTab} />

      {/* Panel */}
      <div className="w-72 shrink-0 flex flex-col bg-surface-card border-r border-surface-elevated overflow-hidden">
        {tab === 'channels' ? (
          <ChannelList
            channels={channels}
            activeId={playerState.channel?.id ?? null}
            onPlay={handlePlay}
            onRemove={deleteChannel}
            onClear={clear}
          />
        ) : (
          <AutoSearchPanel onImport={handleImport} />
        )}
      </div>

      {/* Main: player area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-surface-elevated bg-surface-card shrink-0">
          <div className="flex-1 min-w-0">
            {playerState.channel ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <span className="text-sm font-semibold text-gray-100 truncate">{playerState.channel.name}</span>
                {playerState.channel.group && (
                  <span className="text-xs text-gray-500 truncate">{playerState.channel.group}</span>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-500">IPTV Player</span>
            )}
          </div>

          {/* Player controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-gray-400 hover:text-white transition-colors"
              title={playerState.muted ? 'Unmute' : 'Mute'}
            >
              {playerState.muted || playerState.volume === 0 ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={playerState.muted ? 0 : playerState.volume}
              onChange={e => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 accent-accent"
              title="Volume"
            />
          </div>
        </header>

        {/* Video player */}
        <div className="flex-1 overflow-hidden">
          <VideoPlayer
            channel={playerState.channel}
            state={playerState}
            onStatus={setStatus}
            onVolumeChange={handleVolumeChange}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-elevated border border-accent/30 text-sm text-gray-200 px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}
