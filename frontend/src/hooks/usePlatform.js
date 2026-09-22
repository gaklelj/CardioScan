import { useMemo } from 'react'

export function usePlatform() {
  return useMemo(() => {
    const ua = navigator.userAgent || navigator.platform || ''
    const isIOSDevice = /iPhone|iPad|iPod/i.test(ua)
    const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__)
    // iOS if: Tauri mobile on iOS device, or iPhone/iPad in browser
    const isIOS = isIOSDevice
    const isMobile = isIOS || (window.innerWidth <= 500 && 'ontouchstart' in window)
    return { isIOS, isMobile, isTauri }
  }, [])
}
