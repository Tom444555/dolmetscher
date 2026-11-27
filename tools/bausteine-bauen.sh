#!/usr/bin/env bash
# Holt die Rechen-Bausteine neu (nur nötig bei einem Update der Bibliotheken).
# Danach: Dateinamen der Piper-Teile in app/js/main.js (LIB_FILES) und app/sw.js prüfen!
set -e
cd "$(dirname "$0")/.."
npm i --ignore-scripts pdfjs-dist@4 @huggingface/transformers@3 tesseract.js@5 tesseract.js-core@5 @mintplex-labs/piper-tts-web @diffusionstudio/piper-wasm@1.0.0 esbuild
npm rebuild esbuild
rm -rf app/lib && mkdir -p app/lib/{transformers,tesseract/core,piper/ort}
T=node_modules/@huggingface/transformers/dist
cp $T/transformers.min.js $T/ort-wasm-simd-threaded.jsep.{mjs,wasm} app/lib/transformers/
cp node_modules/tesseract.js/dist/{tesseract.min.js,worker.min.js} app/lib/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-{simd-lstm,lstm}.wasm.js app/lib/tesseract/core/
npx esbuild tools/piper-entry.js --bundle --format=esm --minify --outdir=app/lib/piper --splitting \
  --external:path --external:fs --external:url --external:module --external:worker_threads --platform=browser
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{wasm,mjs} app/lib/piper/ort/
cp node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.{wasm,data} app/lib/piper/
mkdir -p app/lib/pdf && cp node_modules/pdfjs-dist/legacy/build/pdf{,.worker}.min.mjs app/lib/pdf/
ls app/lib/piper
