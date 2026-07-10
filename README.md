# vue3cam-lib

A lightweight, type-safe Vue 3 library for accessing device cameras in web applications. Provides a `Camera` utility class and a `useCamera()` composable for streaming, photo capture, video recording, and torch control.

[![npm version](https://img.shields.io/npm/v/vue3cam-lib)](https://www.npmjs.com/package/vue3cam-lib)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

## Features

- **Camera access** — Request and manage `MediaStream` instances via the browser Camera API
- **Vue 3 composable** — Reactive refs and lifecycle-aware cleanup through `useCamera()`
- **Photo capture** — `ImageCapture` API with canvas-based fallback
- **Video recording** — `MediaRecorder` integration with resolution-aware bitrates
- **Torch control** — Toggle device flashlight when supported
- **Canvas mirroring** — Optional live video-to-canvas rendering loop
- **Luminance monitoring** — Frame brightness sampling via an event bus
- **TypeScript** — Full type definitions included in the published package
- **Performance hints** — System-aware resolution and bitrate recommendations

> **Planned, not yet implemented:** Barcode scanning is mentioned in package metadata but is not available in the current release.

## Requirements

- Vue `^3.5.32` (peer dependency)
- A modern browser with Camera API support (`navigator.mediaDevices.getUserMedia`)
- HTTPS (or `localhost`) for camera access

## Installation

### As a library consumer

```bash
npm install vue3cam-lib
```

```bash
yarn add vue3cam-lib
```

```bash
pnpm add vue3cam-lib
```

Ensure Vue 3 is installed in your project:

```bash
pnpm add vue@^3.5.32
```

### As a contributor (this repository)

This project uses [pnpm](https://pnpm.io/) as its package manager.

```bash
git clone https://github.com/farshidb2011/vue3cam-lib.git
cd vue3cam-lib
pnpm install
```

## Dependencies

| Kind | Package | Notes |
|------|---------|-------|
| **Peer dependency** | `vue@^3.5.32` | Must be installed by the consuming application |
| **Bundled runtime** | `mitt@^3.0.1` | Event bus used internally by `useCamera()`; shipped inside the built bundle |
| **Dev only** | `typescript`, `vite`, `vue-tsc`, `@vitejs/plugin-vue`, etc. | Used for building the library; not required by consumers |

Consumers only need to install `vue3cam-lib` and its Vue peer dependency.

## Build

Generate TypeScript declarations and bundled output (ES, UMD, IIFE):

```bash
pnpm run build
```

This runs:

1. `vue-tsc -p tsconfig.build.json --outDir dist/types` — emits `.d.ts` files to `dist/types/`
2. `vite build` — emits `dist/vue3cam-lib.es.js`, `dist/vue3cam-lib.umd.js`, and `dist/vue3cam-lib.iife.js`

## Publish

Publishing is configured in `package.json`:

```bash
pnpm run publish
```

The `prepublishOnly` script automatically runs `pnpm run build` before publish. The published package includes only `dist/`, `README.md`, and `LICENSE`.

## Quick Start

```vue
<template>
  <div>
    <video ref="video" autoplay playsinline muted />
    <canvas ref="canvas" />
    <button @click="handleCapture" :disabled="!image">Capture</button>
    <img v-if="previewUrl" :src="previewUrl" alt="Captured photo" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useCamera } from 'vue3cam-lib'

const previewUrl = ref<string | null>(null)

const {
  video,
  canvas,
  image,
  init,
  start,
  capture,
  stop,
  toObjectURL,
} = useCamera()

onMounted(async () => {
  await init()
  await start()
})

watch(image, (blob) => {
  if (blob) {
    previewUrl.value = toObjectURL(blob)
  }
})

async function handleCapture() {
  await capture()
}
</script>
```

**Typical flow:** call `init()` to acquire a stream, bind the returned `video` and `canvas` refs in your template, then call `start()` to attach the stream and begin playback.

## Public API

All symbols are exported from the package entry point (`src/index.ts`):

```typescript
import {
  // Core
  Camera,
  NotPermissionSupport,
  NotSupportCamera,
  QueryCameraError,

  // Composable
  useCamera,
  UnSupportTorchError,

  // State
  GlobalState,

  // Configuration types
  Resolution,
  type CustomResolution,
  type ResolutionLimit,
  type Config,
} from 'vue3cam-lib'
```

---

## `useCamera()`

```typescript
function useCamera(): UseCameraReturn
```

Creates a self-contained camera session with reactive state, lifecycle cleanup, and a shared `Camera` instance.

### Returned refs

| Property | Type | Description |
|----------|------|-------------|
| `video` | `Ref<HTMLVideoElement \| null>` | Bind to a `<video>` element |
| `canvas` | `Ref<HTMLCanvasElement \| null>` | Bind to a `<canvas>` element for mirrored rendering |
| `container` | `Ref<HTMLElement \| null>` | Optional container ref (not used internally) |
| `image` | `Readonly<Ref<Blob \| null>>` | Last captured photo |
| `videoBlob` | `Readonly<Ref<Blob \| null>>` | Last recorded video |
| `torch` | `Readonly<Ref<boolean>>` | Current torch state |
| `recording` | `Readonly<Ref<boolean>>` | Whether a recording is in progress |
| `isPause` | `Readonly<Ref<boolean>>` | Whether the video element is paused |

### Returned methods

#### `init(config?)`

```typescript
init(config?: MaybeRef<Config | null>): Promise<true>
```

Acquires camera permission and creates a `MediaStream`. Stores the stream in `GlobalState.stream`.

- **`config`** — Optional `Config` object (or ref). When provided, merges into the internal configuration before opening the stream.
- **Returns** `true` on success.
- On `NotAllowedError`, sets `GlobalState.permissionState` to `"denied"`.
- On `OverconstrainedError`, retries with `{ video: true, audio: false }`.

Must be called before `start()`.

#### `start()`

```typescript
start(): Promise<void>
```

Opens the camera for display: re-acquires the stream using configured constraints, attaches it to the `video` ref, starts playback, and begins the canvas render loop.

- Requires an existing stream from `init()`; returns early if `GlobalState.stream` is `null`.
- Automatically retries with relaxed constraints on `OverconstrainedError`.
- Prefers the rear/environment camera via `facingMode: { exact: "environment" }`.

#### `stop(full?)`

```typescript
stop(full?: boolean): void
```

Stops all tracks on the current stream and cancels canvas rendering.

- **`full`** — When `true`, also clears `video.srcObject`, resets the canvas ref, and sets `GlobalState.stream` to `null`. Default: `false`.

#### `capture()`

```typescript
capture(): Promise<true>
```

Captures a still image from the active stream.

- Uses `ImageCapture.takePhoto()` when available; falls back to canvas-based capture.
- Sets `GlobalState.capturing` during the operation.
- Stores the result in the `image` ref.

#### `record(cb?)`

```typescript
record(
  cb?: ((error: Error | null, blob: Blob | null) => void) | null
): Promise<Blob | undefined>
```

Records video from the active stream.

- When not recording: starts recording and **awaits until recording is stopped**, then stores the blob in `videoBlob`.
- When already recording: calls `stopRecord()` and returns `undefined`.
- **`cb`** — Optional callback invoked with `(error, blob)` when recording completes.

Call `record()` again while recording to stop and finalize.

#### `pauseRecord()` / `resumeRecord()`

```typescript
pauseRecord(): void
resumeRecord(): void
```

Pause or resume an in-progress `MediaRecorder` session.

#### `getRecordingState()`

```typescript
getRecordingState(): string
```

Returns the current `MediaRecorder` state (`"inactive"`, `"recording"`, `"paused"`) or `"inactive"` if no recorder exists.

#### `pause()` / `resume()`

```typescript
pause(): void
resume(): void
```

Pause or resume the `<video>` element playback and canvas rendering.

#### Torch control

```typescript
isSupportTorch(): boolean
torchToggle(): Promise<void>
torchOn(): Promise<void>
torchOff(): Promise<void>
```

- `isSupportTorch()` — Returns whether the active video track supports torch.
- `torchToggle()` — Toggles torch; throws `UnSupportTorchError` if unsupported.
- `torchOn()` / `torchOff()` — Enable or disable torch silently when unsupported.

#### `startMonitorLuminance()`

```typescript
startMonitorLuminance(): () => void
```

Samples video frame brightness and emits `"luminance"` events on `eventBus` with the average luminance value (`number`).

Returns a cleanup function that stops monitoring.

```typescript
const stopMonitoring = startMonitorLuminance()
eventBus.on('luminance', (avg) => console.log('Luminance:', avg))
// later:
stopMonitoring()
```

#### Utilities

```typescript
resetTempImage(): void
toObjectURL(blob: Blob): string
getSystemPerformance(): SystemPerformance | null
getTrack(): MediaStreamTrack | undefined
```

| Method | Description |
|--------|-------------|
| `resetTempImage()` | Clears the `image` ref |
| `toObjectURL(blob)` | Creates an object URL for a blob |
| `getSystemPerformance()` | Returns cached system performance recommendations |
| `getTrack()` | Returns the first video track from `GlobalState.stream` |

### Other returned properties

| Property | Type | Description |
|----------|------|-------------|
| `Camera` | `Camera` | The underlying `Camera` instance for advanced use |
| `eventBus` | `Emitter` | `mitt` event bus (currently emits `"luminance"`) |

### Lifecycle

`useCamera()` automatically:

- Stops canvas rendering on component unmount
- Calls `camera.cleanup()` to release recorder resources
- Removes video event listeners
- Clears temporary image and video blob refs

---

## `Camera` class

Framework-agnostic utility for browser media APIs.

```typescript
const camera = new Camera()
```

### Static members

| Member | Signature | Description |
|--------|-----------|-------------|
| `currentMimeType` | `string \| undefined` | MIME type of the last recording |
| `supported()` | `(): boolean` | Whether `getUserMedia` is available |
| `getOptimizedConstraints(deviceId?, maxResolution?)` | `(deviceId?: string \| null, maxResolution?: string): MediaStreamConstraints` | Builds constraints for a given device and resolution preset (`'4K'`, `'1440p'`, `'1080p'`, `'720p'`, `'480p'`) |
| `getExtension(mimeType)` | `(mimeType: string): string` | Maps a MIME type to a file extension |
| `getOptimizedRecordingSettings(videoTrack)` | `(videoTrack: MediaStreamTrack): { mimeType: string; bitsPerSecond: number }` | Picks a supported recorder MIME type and bitrate |
| `checkSystemPerformance()` | `(): Promise<{ cores?: number; memory?: number; recommended: { maxResolution: string; maxBitrate: number } }>` | Recommends resolution and bitrate from hardware info |

### Instance methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `checkSupport()` | `(): void` | Throws `NotSupportCamera` if camera API is unavailable |
| `getMediaStream(constraints?)` | `(constraints?: MediaStreamConstraints \| null): Promise<MediaStream>` | Requests a media stream; falls back to 720p on high-resolution failure |
| `getListCamera()` | `(): Promise<MediaDeviceInfo[]>` | Lists video input devices |
| `getPermissionState()` | `(): Promise<PermissionStatus['state']>` | Queries camera permission; throws `NotPermissionSupport` or `QueryCameraError` |
| `capture(video)` | `(video: HTMLVideoElement): Promise<HTMLCanvasElement>` | Draws the current video frame to a canvas |
| `capture2(track)` | `(track: MediaStreamTrack): Promise<Blob>` | Captures a photo via `ImageCapture` |
| `getBlob(canvas, quality?)` | `(canvas: HTMLCanvasElement, quality?: number): Promise<Blob>` | Converts a canvas to a JPEG blob (default quality `0.8`) |
| `startRecord(stream, options?)` | `(stream: MediaStream, options?: { bitsPerSecond?: number }): Promise<Blob>` | Starts recording; resolves when `stopRecord()` is called |
| `stopRecord()` | `(): void` | Stops an active recording |
| `pauseRecord()` | `(): void` | Pauses recording |
| `resumeRecord()` | `(): void` | Resumes a paused recording |
| `getRecordingState()` | `(): string` | Returns recorder state |
| `getResolution(track)` | `(track: MediaStreamTrack): object` | Returns current settings and capabilities for a track |
| `findTrackWithLabel(label, tracks)` | `(label: string, tracks: MediaStreamTrack[]): MediaStreamTrack \| undefined` | Finds a track by label |
| `findBackCamera(listCamera)` | `(listCamera: MediaDeviceInfo[]): MediaDeviceInfo \| undefined` | Finds a rear/environment camera by label |
| `findFrontCamera(listCamera)` | `(listCamera: MediaDeviceInfo[]): MediaDeviceInfo \| undefined` | Finds a front/user camera by label |
| `findEnabledTrack(tracks)` | `(tracks: MediaStreamTrack[]): MediaStreamTrack \| undefined` | Returns the first enabled track |
| `cleanup()` | `(): void` | Stops recording and releases recorder resources |

### Instance event handlers

These are bound in the constructor and used internally by `MediaRecorder`:

- `onDataAvailable(event: BlobEvent): void`
- `onStop(): void`
- `onError(error: Event): void`

---

## Configuration

### `Config` interface

```typescript
interface Config {
  canvasWidth: 'auto' | number
  canvasHeight: 'auto' | number
  constraints: MediaStreamConstraints | null
}
```

Pass a `Config` object to `init()`:

```typescript
await init({
  canvasWidth: 'auto',
  canvasHeight: 'auto',
  constraints: {
    audio: false,
    video: {
      facingMode: { exact: 'environment' },
      width: { min: 1280, ideal: 1920 },
      height: { min: 720, ideal: 1080 },
      frameRate: { min: 15, ideal: 30, max: 30 },
    },
  },
})
```

### Default configuration

When no config is passed, `useCamera()` uses:

```typescript
{
  canvasWidth: 'auto',
  canvasHeight: 'auto',
  constraints: {
    audio: false,
    video: {
      facingMode: { exact: 'environment' },
      width: { min: 1280, ideal: 1920 },
      height: { min: 720, ideal: 1080 },
      frameRate: { min: 15, ideal: 30, max: 30 },
    },
  },
}
```

### `Resolution` enum

Exported resolution preset identifiers:

```typescript
enum Resolution {
  '4K',
  '1440P',
  '1080P',
  '720P',
  '480P',
  'custom',
}
```

### `CustomResolution` and `ResolutionLimit`

```typescript
interface CustomResolution {
  width: { max: number }
  height: { max: number }
}

type ResolutionLimit = {
  [x in Resolution]: CustomResolution
}
```

These types are exported for custom constraint building. The `Camera.getOptimizedConstraints()` method uses string presets (`'4K'`, `'1440p'`, `'1080p'`, `'720p'`, `'480p'`) internally.

---

## `GlobalState`

Shared reactive state used by `useCamera()`:

```typescript
const GlobalState = reactive({
  permissionState: 'prompt' as PermissionStatus['state'] | 'prompt',
  stream: null as MediaStream | null,
  capturing: false,
})
```

| Property | Type | Description |
|----------|------|-------------|
| `permissionState` | `string` | Camera permission state (`"prompt"`, `"granted"`, `"denied"`) |
| `stream` | `MediaStream \| null` | Active camera stream |
| `capturing` | `boolean` | Whether a photo capture is in progress |

---

## Error classes

| Class | Extends | Thrown when |
|-------|---------|-------------|
| `NotSupportCamera` | `Error` | `navigator.mediaDevices.getUserMedia` is unavailable |
| `NotPermissionSupport` | `Error` | `navigator.permissions` is unavailable |
| `QueryCameraError` | `Error` | Permission query fails |
| `UnSupportTorchError` | `Error` | Torch is requested on an unsupported device (`torchToggle()` only) |

`getMediaStream()` may also throw native DOM errors such as `NotAllowedError` and `OverconstrainedError`. `init()` and `start()` handle some of these internally.

```typescript
import {
  useCamera,
  UnSupportTorchError,
  NotPermissionSupport,
  NotSupportCamera,
  QueryCameraError,
} from 'vue3cam-lib'

try {
  await init()
} catch (error) {
  if (error instanceof NotSupportCamera) {
    console.error('Camera API not supported')
  } else if (error instanceof NotPermissionSupport) {
    console.error('Permissions API not supported')
  } else if (error instanceof QueryCameraError) {
    console.error('Failed to query camera permission')
  }
}
```

---

## Usage examples

### Initializing the camera

```typescript
import { useCamera } from 'vue3cam-lib'

const { init, start, video, canvas } = useCamera()

// Step 1: acquire stream
await init()

// Optional: pass custom config
await init({
  canvasWidth: 'auto',
  canvasHeight: 'auto',
  constraints: { video: true, audio: false },
})

// Step 2: attach to video element and start playback
await start()
```

### Displaying the video stream

```vue
<template>
  <video ref="video" autoplay playsinline muted />
  <canvas ref="canvas" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useCamera } from 'vue3cam-lib'

const { video, canvas, init, start } = useCamera()

onMounted(async () => {
  await init()
  await start()
})
</script>
```

Use `autoplay`, `playsinline`, and `muted` on the `<video>` element for reliable mobile playback.

The canvas ref receives a mirrored copy of the video feed when playback starts. Canvas dimensions follow `Config.canvasWidth` and `Config.canvasHeight` (`'auto'` uses the video's native dimensions).

### Capturing photos

```typescript
const { capture, image, toObjectURL, resetTempImage } = useCamera()

await init()
await start()

await capture()

if (image.value) {
  const url = toObjectURL(image.value)
  // use url in <img :src="url" />
}

resetTempImage() // clear when done
```

### Recording video

```typescript
const { record, videoBlob, recording } = useCamera()

await init()
await start()

// Start recording (blocks until stopped)
const recordPromise = record((error, blob) => {
  if (error) console.error(error)
  else console.log('Recording saved:', blob)
})

// Stop recording by calling record() again
await record()

const blob = await recordPromise
// or read from videoBlob.value
```

You can also pause and resume during recording:

```typescript
pauseRecord()
resumeRecord()
```

### Torch control

```vue
<script setup lang="ts">
import { useCamera, UnSupportTorchError } from 'vue3cam-lib'

const { init, start, isSupportTorch, torchToggle, torch, torchOn, torchOff } = useCamera()

await init()
await start()

if (isSupportTorch()) {
  try {
    await torchToggle()
    // or: await torchOn() / await torchOff()
  } catch (error) {
    if (error instanceof UnSupportTorchError) {
      console.log('Torch not supported')
    }
  }
}
</script>
```

### Camera switching

There is no dedicated `switchCamera()` composable method. Camera selection is available through the `Camera` instance returned by `useCamera()`:

```typescript
import { useCamera, Camera, GlobalState } from 'vue3cam-lib'

const { Camera: camera, init, start, stop, video } = useCamera()

await init()
await start()

// List available cameras
const devices = await camera.getListCamera()
const frontCamera = camera.findFrontCamera(devices)
const backCamera = camera.findBackCamera(devices)

// Switch to a specific device
if (frontCamera) {
  stop()
  const constraints = Camera.getOptimizedConstraints(frontCamera.deviceId)
  const stream = await camera.getMediaStream(constraints)

  GlobalState.stream = stream
  if (video.value) {
    video.value.srcObject = stream
    await video.value.play()
  }
}
```

By default, `start()` prefers the rear camera via `facingMode: { exact: "environment" }`.

### Cleanup

`useCamera()` cleans up automatically on component unmount. You can also stop manually:

```typescript
const { stop } = useCamera()

stop()       // stop tracks, keep stream reference
stop(true)   // stop tracks and fully release stream + video element
```

When using the `Camera` class directly:

```typescript
const camera = new Camera()
camera.cleanup() // release MediaRecorder resources
```

---

## Browser support

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 47+ | Full |
| Firefox | 55+ | Full |
| Safari | 11+ | Full |
| Edge | 79+ | Full |
| iOS Safari | 14+ | Full |

Some features depend on optional APIs:

| Feature | API | Fallback |
|---------|-----|----------|
| Photo capture | `ImageCapture` | Canvas `drawImage` |
| Torch | `MediaTrackCapabilities.torch` | Not available |
| Permission state | `navigator.permissions` | Throws `NotPermissionSupport` |
| Recording | `MediaRecorder` | Throws if no MIME type is supported |

## Performance tips

1. Call `init()` once, then `start()` after template refs are bound.
2. Use `stop(true)` when fully releasing the camera to free hardware resources.
3. Prefer `'auto'` canvas dimensions unless you need a fixed size.
4. Let the library's system performance detection choose resolution when possible.
5. Always set `playsinline` and `muted` on `<video>` for mobile browsers.

## Project structure

```
src/
├── index.ts              # Public exports
├── core/camera.ts        # Camera class and core errors
├── composiables/camera.ts # useCamera() composable
├── store/state.ts        # GlobalState
└── config/cfg.ts         # Config and resolution types
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Install dependencies with `pnpm install`
4. Make your changes and run `pnpm run build`
5. Commit and push
6. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE).

## Support

For issues and feature requests, open an issue on [GitHub](https://github.com/farshidb2011/vue3cam-lib/issues).

---

**Made with care by the vue3cam team**
