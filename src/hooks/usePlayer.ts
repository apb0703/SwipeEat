import { useState, useCallback } from 'react'
import { Channel, PlayerState } from '../types'

const INITIAL: PlayerState = {
  channel: null,
  status: 'idle',
  volume: 1,
  muted: false,
  fullscreen: false,
  error: null,
}

export function usePlayer() {
  const [state, setState] = useState<PlayerState>(INITIAL)

  const play = useCallback((channel: Channel) => {
    setState(s => ({ ...s, channel, status: 'loading', error: null }))
  }, [])

  const setStatus = useCallback((status: PlayerState['status'], error?: string) => {
    setState(s => ({ ...s, status, error: error ?? s.error }))
  }, [])

  const setVolume = useCallback((volume: number) => {
    setState(s => ({ ...s, volume: Math.max(0, Math.min(1, volume)), muted: false }))
  }, [])

  const toggleMute = useCallback(() => {
    setState(s => ({ ...s, muted: !s.muted }))
  }, [])

  const toggleFullscreen = useCallback(() => {
    setState(s => ({ ...s, fullscreen: !s.fullscreen }))
  }, [])

  const stop = useCallback(() => {
    setState(s => ({ ...s, status: 'idle', channel: null, error: null }))
  }, [])

  return { state, play, setStatus, setVolume, toggleMute, toggleFullscreen, stop }
}
