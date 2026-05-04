# vue3cam

A lightweight, type-safe Vue 3 camera library for web applications. Provides simple composables and utilities for accessing device cameras and real-time camera streams.

[![npm version](https://img.shields.io/npm/v/vue3cam-lib)](https://www.npmjs.com/package/vue3cam-lib)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

## Features

- 📷 **Easy Camera Access** - Simple API to access device cameras with minimal setup
- 🎯 **Type-Safe** - Full TypeScript support with comprehensive type definitions
- 🪨 **Lightweight** - Minimal bundle size (~16 KB gzipped)
- 🎨 **Vue 3 Composables** - Reactive composables for easy integration
- ⚡ **Performance Optimized** - Efficient resource management and cleanup
- 🔦 **Torch Control** - Control device flashlight when available
- 🌐 **Browser Compatible** - Works with modern browsers supporting Camera API
- 🎬 **Real-time Streaming** - Stream camera feed directly to video elements

## Installation

```bash
npm install vue3cam-lib
```

or with yarn:

```bash
yarn add vue3cam-lib
```

or with pnpm:

```bash
pnpm add vue3cam-lib
```

## Quick Start

### Using the Camera Composable

```vue
<template>
  <div>
    <video ref="videoElement" autoplay playsinline />
    <button @click="toggleCamera">
      {{ isActive ? 'Stop Camera' : 'Start Camera' }}
    </button>
    <button v-if="supportsTorch" @click="toggleTorch">
      {{ torchActive ? 'Torch Off' : 'Torch On' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCamera } from 'vue3cam-lib'

const videoElement = ref<HTMLVideoElement>()
const { 
  isActive, 
  start, 
  stop, 
  toggleTorch,
  supportsTorch,
  torchActive 
} = useCamera(videoElement)

onMounted(async () => {
  try {
    await start()
  } catch (error) {
    console.error('Camera access denied:', error)
  }
})
</script>
```

### Using the Camera Class

```typescript
import { Camera } from 'vue3cam-lib'

const camera = new Camera(videoElement)
await camera.start()

// Toggle torch
if (camera.supportsTorch) {
  await camera.toggleTorch()
}

// Stop camera
await camera.stop()
```

## API Reference

### `useCamera(videoElement)`

Main composable for camera control.

#### Parameters

- `videoElement` (Ref<HTMLVideoElement>) - Reference to video element to stream camera feed

#### Returns

```typescript
{
  isActive: Ref<boolean>           // Whether camera is active
  start: () => Promise<void>       // Start camera stream
  stop: () => Promise<void>        // Stop camera stream
  toggleCamera: () => Promise<void> // Toggle camera on/off
  toggleTorch: () => Promise<void>  // Toggle torch/flashlight
  supportsTorch: Ref<boolean>      // Whether device supports torch
  torchActive: Ref<boolean>        // Whether torch is currently on
}
```

#### Error Handling

```typescript
import { useCamera, UnSupportTorchError } from 'vue3cam-lib'

try {
  await toggleTorch()
} catch (error) {
  if (error instanceof UnSupportTorchError) {
    console.log('Torch not supported on this device')
  }
}
```

### `Camera` Class

Direct class for camera management.

#### Constructor

```typescript
const camera = new Camera(videoElement: HTMLVideoElement)
```

#### Methods

- `start(): Promise<void>` - Start camera stream
- `stop(): Promise<void>` - Stop camera stream
- `toggleTorch(): Promise<void>` - Toggle torch (throws `UnSupportTorchError` if not available)
- `changeConstraints(constraints: MediaStreamConstraints): Promise<void>` - Update camera constraints

#### Properties

- `isActive: boolean` - Camera stream status
- `supportsTorch: boolean` - Torch availability
- `torchActive: boolean` - Torch status

### Error Types

```typescript
import {
  Camera,
  NotPermissionSupport,
  NotSupportCamera,
  QueryCameraError
} from 'vue3cam-lib'

// Handle specific errors
try {
  await camera.start()
} catch (error) {
  if (error instanceof NotPermissionSupport) {
    console.log('Camera permission denied')
  } else if (error instanceof NotSupportCamera) {
    console.log('Device does not support camera')
  } else if (error instanceof QueryCameraError) {
    console.log('Error querying camera devices')
  }
}
```

## Browser Support

| Browser | Version | Support |
|---------|---------|---------|
| Chrome  | 47+     | ✅ Full |
| Firefox | 55+     | ✅ Full |
| Safari  | 11+     | ✅ Full |
| Edge    | 79+     | ✅ Full |
| iOS Safari | 14+ | ✅ Full |

## Requirements

- Vue 3.5.32 or higher
- Modern browser with Camera API support
- HTTPS context (except localhost)

## Examples

### Full Camera App with Constraints

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useCamera } from 'vue3cam-lib'

const videoElement = ref<HTMLVideoElement>()
const { start, stop, isActive } = useCamera(videoElement)

const startWithConstraints = async () => {
  // Use rear camera with HD video
  await start({
    facingMode: 'environment',
    width: { min: 1280, ideal: 1920 },
    height: { min: 720, ideal: 1080 }
  })
}
</script>
```

### Permission Request Handling

```typescript
import { useCamera, NotPermissionSupport } from 'vue3cam-lib'

try {
  await start()
} catch (error) {
  if (error instanceof NotPermissionSupport) {
    // Show permission request UI
    alert('Please grant camera permission to use this feature')
  }
}
```

## Performance Tips

1. **Use React Refs Properly** - Keep video element stable to avoid remounting
2. **Cleanup on Unmount** - Always call `stop()` in cleanup
3. **Minimal Constraints** - Only specify necessary constraints for better compatibility
4. **Video Element Settings** - Use `playsinline` on mobile for better UX

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or suggestions, please open an [issue](../../issues) on GitHub.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

**Made with ❤️ by the vue3cam team**
