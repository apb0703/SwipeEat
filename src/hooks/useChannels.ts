import { useState, useCallback } from 'react'
import { Channel } from '../types'
import { loadChannels, saveChannels, addChannels, removeChannel, clearChannels } from '../services/channelStorage'

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>(() => loadChannels())

  const importChannels = useCallback((incoming: Channel[]) => {
    const merged = addChannels(incoming)
    setChannels(merged)
    return merged.length - (loadChannels().length - incoming.length)
  }, [])

  const deleteChannel = useCallback((id: string) => {
    const updated = removeChannel(id)
    setChannels(updated)
  }, [])

  const reorderChannels = useCallback((updated: Channel[]) => {
    saveChannels(updated)
    setChannels(updated)
  }, [])

  const clear = useCallback(() => {
    clearChannels()
    setChannels([])
  }, [])

  const addSingle = useCallback((channel: Channel) => {
    setChannels(prev => {
      if (prev.find(c => c.url === channel.url)) return prev
      const updated = [...prev, channel]
      saveChannels(updated)
      return updated
    })
  }, [])

  return { channels, importChannels, deleteChannel, reorderChannels, clear, addSingle }
}
