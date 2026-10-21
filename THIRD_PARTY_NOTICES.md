# Third-party notices

ezNotes itself is MIT licensed (see [LICENSE](LICENSE)). It bundles or downloads
the following third-party components.

## Bundled with the app

### Node.js

- Purpose: runtime for the offline speaker-diarization worker (Electron's own
  Node build cannot load the native addon because of the V8 memory cage).
- Version: recorded in `vendor/node/VERSION` and fetched by
  `npm run fetch:node`; packaged as `resources/node/node.exe`.
- License: MIT. The license text is packaged as `resources/node/LICENSE`.
- <https://nodejs.org>

### sherpa-onnx

- Purpose: offline speaker segmentation and embedding runtime.
- License: Apache-2.0. See [licenses/Apache-2.0.txt](licenses/Apache-2.0.txt).
- <https://github.com/k2-fsa/sherpa-onnx>

### webm-muxer

- Purpose: WebM container for retained Opus audio.
- License: MIT, Copyright © 2022 Vanilagy.
- <https://github.com/Vanilagy/webm-muxer>

### @anthropic-ai/sdk

- Purpose: official client for Anthropic's Messages API.
- License: MIT.
- <https://github.com/anthropics/anthropic-sdk-typescript>

### Inter

- Purpose: UI typeface.
- License: SIL Open Font License 1.1.
- <https://github.com/rsms/inter>

### Newsreader

- Purpose: note reading typeface.
- License: SIL Open Font License 1.1.
- <https://github.com/productiontype/Newsreader>

## Downloaded on first use

These models are downloaded by the app into
`%APPDATA%\ezNotes\models\sherpa\` and are not redistributed with ezNotes.

### pyannote segmentation 3.0

- Purpose: speech / speaker-change segmentation.
- License: MIT, Copyright © 2022 CNRS.
- <https://huggingface.co/pyannote/segmentation-3.0>

### NVIDIA TitaNet (small)

- Purpose: speaker embeddings for clustering.
- License: CC-BY-4.0.
- <https://huggingface.co/nvidia/speakerverification_en_titanet_large>
