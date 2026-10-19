import fs from 'node:fs'

export const SAMPLE_RATE = 16000
export const CHANNELS = 1
export const BITS_PER_SAMPLE = 16

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  dataOffset: number
  dataLength: number
  durationSec: number
}

export function wavHeader(
  dataLength: number,
  sampleRate = SAMPLE_RATE,
  channels = CHANNELS,
  bitsPerSample = BITS_PER_SAMPLE
): Buffer {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)
  return header
}

export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  return Buffer.concat([wavHeader(pcm.length, sampleRate), pcm])
}

export function writeWavFile(file: string, pcm: Buffer, sampleRate = SAMPLE_RATE): void {
  fs.writeFileSync(file, pcmToWav(pcm, sampleRate))
}

export function readWavInfo(file: string): WavInfo {
  const fd = fs.openSync(file, 'r')
  try {
    const header = Buffer.alloc(44)
    fs.readSync(fd, header, 0, 44, 0)
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Not a WAV file')
    }

    let offset = 12
    let sampleRate = SAMPLE_RATE
    let channels = CHANNELS
    let bitsPerSample = BITS_PER_SAMPLE
    let dataOffset = 44
    let dataLength = Math.max(0, header.readUInt32LE(40))

    while (offset + 8 <= header.length) {
      const id = header.toString('ascii', offset, offset + 4)
      const size = header.readUInt32LE(offset + 4)
      if (id === 'fmt ') {
        channels = header.readUInt16LE(offset + 10)
        sampleRate = header.readUInt32LE(offset + 12)
        bitsPerSample = header.readUInt16LE(offset + 22)
      }
      if (id === 'data') {
        dataOffset = offset + 8
        dataLength = size
        break
      }
      offset += 8 + size + (size % 2)
    }

    const bytesPerSample = channels * (bitsPerSample / 8)
    const durationSec = bytesPerSample > 0 ? dataLength / bytesPerSample / sampleRate : 0
    return {
      sampleRate,
      channels,
      bitsPerSample,
      dataOffset,
      dataLength,
      durationSec
    }
  } finally {
    fs.closeSync(fd)
  }
}

export function readPcmRange(
  file: string,
  info: WavInfo,
  startByte: number,
  length: number
): Buffer {
  const safeStart = Math.max(0, Math.min(startByte, info.dataLength))
  const safeLength = Math.max(0, Math.min(length, info.dataLength - safeStart))
  const buffer = Buffer.alloc(safeLength)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, buffer, 0, safeLength, info.dataOffset + safeStart)
  } finally {
    fs.closeSync(fd)
  }
  return buffer
}

export function readWavPcm(file: string): { pcm: Buffer; sampleRate: number } {
  const info = readWavInfo(file)
  return {
    pcm: readPcmRange(file, info, 0, info.dataLength),
    sampleRate: info.sampleRate
  }
}
