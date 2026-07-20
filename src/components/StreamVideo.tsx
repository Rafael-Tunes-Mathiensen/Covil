import { useEffect, useRef } from 'react'

interface StreamVideoProps {
  stream: MediaStream
  muted?: boolean
  label: string
}

export function StreamVideo({ stream, muted = false, label }: StreamVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.srcObject = stream
    const playback = video.play()
    if (playback) void playback.catch(() => undefined)
    return () => {
      video.srcObject = null
    }
  }, [stream])

  return <video aria-label={label} autoPlay muted={muted} playsInline ref={ref} />
}
