export interface Channel {
  id: string
  name: string
  url: string
  logo?: string
  group?: string
  tvgId?: string
  tvgName?: string
  language?: string
  country?: string
  isCustom?: boolean
  addedAt: number
}

export interface ChannelGroup {
  name: string
  channels: Channel[]
}

export interface ScanResult {
  url: string
  channelCount: number
  channels: Channel[]
  source: string
}

export interface ScanProgress {
  phase: 'idle' | 'scanning' | 'parsing' | 'done' | 'error'
  current: number
  total: number
  message: string
  found: number
}

export interface M3UEntry {
  url: string
  name: string
  logo?: string
  group?: string
  tvgId?: string
  tvgName?: string
  language?: string
  country?: string
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PlayerState {
  channel: Channel | null
  status: PlayerStatus
  volume: number
  muted: boolean
  fullscreen: boolean
  error: string | null
}

export type SidebarTab = 'channels' | 'search' | 'settings'
