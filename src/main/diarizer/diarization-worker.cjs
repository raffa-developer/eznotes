const fs = require('node:fs')
const os = require('node:os')
const sherpa = require('sherpa-onnx-node')

// Usage:
//   node diarization-worker.cjs <wav> <segmentation.onnx> <embedding.onnx> <output.json> [threshold]
const [wavPath, segmentationModel, embeddingModel, outputPath, thresholdArg] =
  process.argv.slice(2)

function writeResult(value) {
  if (!outputPath) return
  try {
    fs.writeFileSync(outputPath, JSON.stringify(value))
  } catch {
    // Nothing else we can do without a writable output path.
  }
}

if (!wavPath || !segmentationModel || !embeddingModel || !outputPath) {
  writeResult({ ok: false, error: 'Missing diarization arguments.' })
  process.exit(1)
}

try {
  const cpuCount = os.availableParallelism
    ? os.availableParallelism()
    : os.cpus().length
  const numThreads = Math.max(1, Math.min(4, cpuCount - 1))
  const threshold = Number(thresholdArg)

  const wave = sherpa.readWave(wavPath, false)
  const diarizer = new sherpa.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: segmentationModel },
      numThreads
    },
    embedding: { model: embeddingModel, numThreads },
    clustering: {
      numClusters: -1,
      threshold: Number.isFinite(threshold) ? threshold : 0.8
    },
    minDurationOn: 0.3,
    minDurationOff: 0.5
  })

  const segments = diarizer.process(wave.samples)
  writeResult({ ok: true, segments })
} catch (error) {
  writeResult({
    ok: false,
    error: error && error.stack ? error.stack : String(error)
  })
  process.exitCode = 1
}
