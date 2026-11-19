# Third-party notices

ezNotes itself is MIT licensed (see [LICENSE](LICENSE)). It bundles or downloads
the following third-party components.

## Bundled with the app

### sherpa-onnx

- Purpose: offline speaker segmentation and embedding runtime.
- Version: fetched by `npm run fetch:sherpa` and packaged under
  `resources/diarizer/node_modules/` for the target platform.
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

These models are downloaded by the app into the app data folder under
`models/sherpa/` and are not redistributed with ezNotes.

### pyannote segmentation 3.0

- Purpose: speech / speaker-change segmentation.
- License: MIT, Copyright © 2022 CNRS.
- <https://huggingface.co/pyannote/segmentation-3.0>

### NVIDIA TitaNet (small)

- Purpose: speaker embeddings for clustering.
- License: CC-BY-4.0.
- <https://huggingface.co/nvidia/speakerverification_en_titanet_large>
