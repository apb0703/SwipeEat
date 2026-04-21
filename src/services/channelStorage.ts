import { Channel } from '../types'

const STORAGE_KEY = 'iptv_channels'

export function loadChannels(): Channel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Channel[]) : []
  } catch {
    return []
  }
}

export function saveChannels(channels: Channel[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(channels))
}

export function addChannels(incoming: Channel[]): Channel[] {
  const existing = loadChannels()
  const urlSet = new Set(existing.map(c => c.url))
  const deduped = incoming.filter(c => !urlSet.has(c.url))
  const merged = [...existing, ...deduped]
  saveChannels(merged)
  return merged
}

export function removeChannel(id: string): Channel[] {
  const updated = loadChannels().filter(c => c.id !== id)
  saveChannels(updated)
  return updated
}

export function clearChannels(): void {
  localStorage.removeItem(STORAGE_KEY)
}
