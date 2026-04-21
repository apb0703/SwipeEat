import { useState, useMemo } from 'react'
import { Channel } from '../../types'
import ChannelCard from './ChannelCard'

interface Props {
  channels: Channel[]
  activeId: string | null
  onPlay: (channel: Channel) => void
  onRemove: (id: string) => void
  onClear: () => void
}

export default function ChannelList({ channels, activeId, onPlay, onRemove, onClear }: Props) {
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const ch of channels) {
      const g = ch.group || 'Uncategorized'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(ch)
    }
    return map
  }, [channels])

  const groupNames = ['All', ...Array.from(groups.keys())]

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return channels.filter(ch => {
      const matchGroup = !activeGroup || activeGroup === 'All' || ch.group === activeGroup
      const matchQuery = !q || ch.name.toLowerCase().includes(q) || (ch.group ?? '').toLowerCase().includes(q)
      return matchGroup && matchQuery
    })
  }, [channels, query, activeGroup])

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-gray-500 p-6 text-center">
        <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
        </svg>
        <p className="text-sm">No channels yet.</p>
        <p className="text-xs text-gray-600">Use Auto Search to discover channels.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-surface-elevated">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="w-full bg-surface-elevated text-sm text-gray-100 pl-8 pr-3 py-2 rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Search channels…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Group tabs */}
      {groups.size > 1 && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide border-b border-surface-elevated">
          {groupNames.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g === 'All' ? null : g)}
              className={`shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
                (g === 'All' && !activeGroup) || g === activeGroup
                  ? 'bg-accent text-white'
                  : 'bg-surface-elevated text-gray-400 hover:text-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Count + Clear */}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-600">
        <span>{filtered.length} channel{filtered.length !== 1 ? 's' : ''}</span>
        <button onClick={onClear} className="hover:text-red-400 transition-colors">Clear all</button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {filtered.map(ch => (
          <ChannelCard
            key={ch.id}
            channel={ch}
            active={ch.id === activeId}
            onPlay={onPlay}
            onRemove={onRemove}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-600 text-sm py-8">No results for "{query}"</p>
        )}
      </div>
    </div>
  )
}
