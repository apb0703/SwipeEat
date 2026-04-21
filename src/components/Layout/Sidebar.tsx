import { SidebarTab } from '../../types'

interface Props {
  active: SidebarTab
  channelCount: number
  onChange: (tab: SidebarTab) => void
}

const TABS: { id: SidebarTab; label: string; icon: JSX.Element }[] = [
  {
    id: 'channels',
    label: 'Channels',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'search',
    label: 'Search',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
]

export default function Sidebar({ active, channelCount, onChange }: Props) {
  return (
    <nav className="w-14 flex flex-col items-center py-4 gap-2 bg-surface border-r border-surface-elevated shrink-0">
      {/* Logo */}
      <div className="mb-2 w-9 h-9 rounded-xl bg-accent/20 flex items-center justify-center">
        <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
        </svg>
      </div>

      {TABS.map(tab => (
        <button
          key={tab.id}
          title={tab.label}
          onClick={() => onChange(tab.id)}
          className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
            active === tab.id
              ? 'bg-accent/20 text-accent'
              : 'text-gray-500 hover:bg-surface-elevated hover:text-gray-300'
          }`}
        >
          {tab.icon}
          {tab.id === 'channels' && channelCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-accent text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {channelCount > 99 ? '99+' : channelCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
