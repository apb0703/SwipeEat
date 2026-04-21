import { Channel } from '../../types'

interface Props {
  channel: Channel
  active: boolean
  onPlay: (channel: Channel) => void
  onRemove: (id: string) => void
}

export default function ChannelCard({ channel, active, onPlay, onRemove }: Props) {
  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        active
          ? 'bg-accent/20 border border-accent/40'
          : 'hover:bg-surface-elevated border border-transparent'
      }`}
      onClick={() => onPlay(channel)}
    >
      {/* Logo / Fallback */}
      <div className="w-9 h-9 rounded-md bg-surface-elevated flex items-center justify-center overflow-hidden shrink-0">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="w-full h-full object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${active ? 'text-accent' : 'text-gray-100'}`}>
          {channel.name}
        </p>
        {channel.group && (
          <p className="text-xs text-gray-500 truncate">{channel.group}</p>
        )}
      </div>

      {/* Live badge + remove */}
      <div className="flex items-center gap-1.5 shrink-0">
        {active && (
          <span className="text-[10px] font-bold tracking-wide text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
            LIVE
          </span>
        )}
        <button
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
          onClick={(e) => { e.stopPropagation(); onRemove(channel.id) }}
          title="Remove channel"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
