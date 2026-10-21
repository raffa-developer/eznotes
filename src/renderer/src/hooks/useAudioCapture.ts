import { useEffect, useRef } from 'react'
import { ArrayBufferTarget, Muxer } from 'webm-muxer'
import type { RecordingStatus } from '../../../shared/types'
import { useApp } from '../state/AppContext'

const WORKLET_SOURCE = `
class EzNotesCaptureProcessor extends AudioWorkletProcessor {
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
registerProcessor('eznotes-capture', EzNotesCaptureProcessor)
`

interface AudioMuxer {
  id: string
  muxer: Muxer<ArrayBufferTarget>
  encoder: AudioEncoder
  samples: number
}

export function useAudioCapture(): void {
  const { recording, settings, toast } = useApp()
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const startingRef = useRef(false)
  const generationRef = useRef(0)
  const muxerRef = useRef<AudioMuxer | null>(null)
  const statusRef = useRef<RecordingStatus | null>(null)
  const shouldCapture =
    Boolean(recording) &&
    (recording?.status === 'recording' || recording?.status === 'paused')
  const micId = settings?.settings.microphoneId ?? null
  const recordingId = recording?.id ?? null
  const printMode = new URLSearchParams(window.location.search).get('print') === '1'

  useEffect(() => {
    if (printMode) return
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
  }, [shouldCapture, recordingId, micId, printMode, toast])

  useEffect(() => {
    return () => {
      abortMuxer()
      cleanup()
    }
  }, [])

  useEffect(() => {
    statusRef.current = recording?.status ?? null
  }, [recording?.status])

  useEffect(() => {
    if (!recording) {
      abortMuxer()
      return
    }
    if (recording.status === 'stopped' || recording.status === 'error') {
      void finishMuxer()
    }
  }, [recording?.id, recording?.status])

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
    const node = new AudioWorkletNode(context, 'eznotes-capture')
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(node)
    node.connect(gain)
    gain.connect(context.destination)

    const outputRate = context.sampleRate
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (activeIdRef.current !== id) return
      const samples = new Float32Array(event.data)
      const pcm =
        outputRate === 16000 ? samples : resample(samples, outputRate, 16000)
      window.ezNotes.recording.sendAudio(pcm.buffer as ArrayBuffer)
      encodePcm(pcm)
    }

    streamRef.current = stream
    contextRef.current = context
    nodeRef.current = node
    activeIdRef.current = id
    startMuxer(id)
  }

  function startMuxer(id: string): void {
    abortMuxer()
    if (typeof AudioEncoder === 'undefined') return

    try {
      const target = new ArrayBufferTarget()
      const muxer = new Muxer({
        target,
        audio: {
          codec: 'A_OPUS',
          sampleRate: 16000,
          numberOfChannels: 1
        }
      })
      const encoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (error) => {
          toast(`Audio compression stopped: ${error.message}`, 'warn')
        }
      })
      encoder.configure({
        codec: 'opus',
        sampleRate: 16000,
        numberOfChannels: 1,
        bitrate: 24000
      })
      muxerRef.current = { id, muxer, encoder, samples: 0 }
    } catch (error) {
      toast(
        `Audio compression is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'warn'
      )
    }
  }

  function encodePcm(pcm: Float32Array): void {
    const current = muxerRef.current
    if (!current || statusRef.current !== 'recording') return

    try {
      const audioData = new AudioData({
        format: 'f32',
        sampleRate: 16000,
        numberOfFrames: pcm.length,
        numberOfChannels: 1,
        timestamp: Math.round((current.samples / 16000) * 1_000_000),
        data: new Float32Array(pcm)
      })
      current.samples += pcm.length
      current.encoder.encode(audioData)
      audioData.close()
    } catch (error) {
      toast(
        `Audio compression stopped: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'warn'
      )
      abortMuxer()
    }
  }

  async function finishMuxer(): Promise<void> {
    const current = muxerRef.current
    if (!current) return
    muxerRef.current = null

    try {
      await current.encoder.flush()
      current.muxer.finalize()
      const buffer = current.muxer.target.buffer
      if (buffer && buffer.byteLength > 1024) {
        window.ezNotes.recording.saveWebm(current.id, buffer)
      }
    } catch (error) {
      toast(
        `Could not finish the compressed audio: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'warn'
      )
    } finally {
      try {
        current.encoder.close()
      } catch {
        // Already closed.
      }
    }
  }

  function abortMuxer(): void {
    const current = muxerRef.current
    if (!current) return
    muxerRef.current = null
    try {
      current.encoder.close()
    } catch {
      // Already closed.
    }
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
