import { useEffect, useRef } from 'react'
import { useApp } from '../state/AppContext'

const WORKLET_SOURCE = `
class AulaCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(2048)
    this.offset = 0
  }

  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]
    if (!channel) return true
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i]
      if (this.offset === this.buffer.length) {
        const out = this.buffer
        this.port.postMessage(out.buffer, [out.buffer])
        this.buffer = new Float32Array(2048)
        this.offset = 0
      }
    }
    return true
  }
}
registerProcessor('aula-capture', AulaCaptureProcessor)
`

export function useAudioCapture(): void {
  const { recording, settings, toast } = useApp()
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const startingRef = useRef(false)
  const generationRef = useRef(0)
  const shouldCapture =
    Boolean(recording) &&
    (recording?.status === 'recording' || recording?.status === 'paused')
  const micId = settings?.settings.microphoneId ?? null
  const recordingId = recording?.id ?? null

  useEffect(() => {
    if (!shouldCapture || !recordingId) {
      cleanup()
      return
    }
    if (activeIdRef.current === recordingId || startingRef.current) return

    startingRef.current = true
    void start(recordingId, micId)
      .catch((error) => {
        toast(
          `Microphone unavailable: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
      })
      .finally(() => {
        startingRef.current = false
      })
  }, [shouldCapture, recordingId, micId, toast])

  useEffect(() => {
    return () => cleanup()
  }, [])

  async function start(id: string, deviceId: string | null): Promise<void> {
    cleanup()
    const generation = generationRef.current
    const baseConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { ...baseConstraints, deviceId: { exact: deviceId } }
          : baseConstraints
      })
    } catch (error) {
      if (!deviceId) throw error
      stream = await navigator.mediaDevices.getUserMedia({ audio: baseConstraints })
      toast('Saved microphone was unavailable. Using the default device.', 'warn')
    }

    if (activeIdRef.current !== null) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    if (generation !== generationRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    const context = new AudioContext({ sampleRate: 16000 })
    try {
      await context.resume()
    } catch {
      // The context will resume on the next user gesture.
    }

    const url = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
    )
    try {
      await context.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }

    if (generation !== generationRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      void context.close().catch(() => undefined)
      return
    }

    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, 'aula-capture')
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(node)
    node.connect(gain)
    gain.connect(context.destination)

    const outputRate = context.sampleRate
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (activeIdRef.current !== id) return
      const samples = new Float32Array(event.data)
      const buffer =
        outputRate === 16000
          ? new Uint8Array(event.data).buffer
          : new Uint8Array(resample(samples, outputRate, 16000)).buffer
      window.aula.recording.sendAudio(buffer)
    }

    streamRef.current = stream
    contextRef.current = context
    nodeRef.current = node
    activeIdRef.current = id
  }

  function cleanup(): void {
    generationRef.current += 1
    activeIdRef.current = null
    if (nodeRef.current) {
      nodeRef.current.port.onmessage = null
      try {
        nodeRef.current.disconnect()
      } catch {
        // Already disconnected.
      }
    }
    nodeRef.current = null

    if (contextRef.current) {
      void contextRef.current.close().catch(() => undefined)
    }
    contextRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    streamRef.current = null
  }
}

function resample(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const a = input[index] ?? 0
    const b = input[index + 1] ?? a
    output[i] = a * (1 - fraction) + b * fraction
  }
  return output
}

export function AudioCapture(): null {
  useAudioCapture()
  return null
}
