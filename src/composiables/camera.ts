import {
  ref,
  readonly,
  toValue,
  onBeforeUnmount,
  nextTick,
  onMounted,
  Ref,
} from "vue";
import { Camera } from "../core/camera";
import { GlobalState } from "../store/state";
import mitt from "mitt";

interface SystemPerformance {
  cores?: number;
  memory?: number;
  recommended: {
    maxResolution: string;
    maxBitrate: number;
  };
}

export function useCamera() {
  let animationFrameId: number | null = null;
  let systemPerformance: SystemPerformance | null = null;
  const eventBus = mitt();
  const camera = new Camera();

  const tempraryImage: Ref<string | null> = ref(null);
  const tempraryVideo: Ref<string | null> = ref(null);
  const container: Ref<HTMLElement | null> = ref(null);
  const video: Ref<HTMLVideoElement | null> = ref(null);
  const canvas: Ref<HTMLCanvasElement | null> = ref(null);
  const torch = ref(false);
  const fallbackCamera = ref(false);
  const recording = ref(false);
  const isPause = ref(false);
  const constraints = ref({
    video: true,
    audio: false,
  });

  const initSystemPerformance = async () => {
    if (!systemPerformance) {
      systemPerformance = await Camera.checkSystemPerformance();
    }
    return systemPerformance;
  };

  const resetTempImage = () => {
    if (tempraryImage.value) {
      URL.revokeObjectURL(tempraryImage.value);
      tempraryImage.value = null;
    }
  };

  const useOldCapture = async (): Promise<boolean> => {
    try {
      if (!video.value) return false;
      const canvasEl = await camera.capture(video.value);
      const blob = await camera.getBlob(canvasEl, 0.85);
      if (tempraryImage.value) {
        URL.revokeObjectURL(tempraryImage.value);
      }
      tempraryImage.value = URL.createObjectURL(blob);
      return true;
    } catch (error) {
      console.error("Error in useOldCapture:", error);
      throw error;
    }
  };

  const capture = async () => {
    try {
      GlobalState.capturing = true;

      if (!window.ImageCapture) {
        console.log(
          "Browser not support ImageCapture, using optimized fallback",
        );
        await useOldCapture();
        return true;
      }

      const track = GlobalState.stream
        ? camera.findEnabledTrack(GlobalState.stream.getVideoTracks())
        : null;
      if (!track) {
        throw new Error("No enabled video track found");
      }

      const blob = await camera.capture2(track);
      if (tempraryImage.value) {
        URL.revokeObjectURL(tempraryImage.value);
      }
      tempraryImage.value = URL.createObjectURL(blob);
      return true;
    } catch (error) {
      console.error("Capture error:", error);
      // Fallback to canvas capture
      try {
        await useOldCapture();
        return true;
      } catch (fallbackError) {
        throw fallbackError;
      }
    } finally {
      GlobalState.capturing = false;
    }
  };

  const toObjectURL = (blob: Blob): string => {
    return URL.createObjectURL(blob);
  };

  const init = async () => {
    try {
      await initSystemPerformance();

      GlobalState.permissionState = await camera.getPermissionState();

      const optimizedConstraints = Camera.getOptimizedConstraints(
        null,
        systemPerformance?.recommended?.maxResolution || "1080p",
      );

      GlobalState.stream = await camera.getMediaStream(optimizedConstraints);
      GlobalState.permissionState = "granted";
      return true;
    } catch (error) {
      console.error("Camera init error:", error);
      if ((error as any).name === "NotAllowedError") {
        GlobalState.permissionState = "denied";
      } else if ((error as any).name === "OverconstrainedError") {
        // Fallback to basic constraints
        try {
          GlobalState.stream = await camera.getMediaStream({
            video: true,
            audio: false,
          });
          GlobalState.permissionState = "granted";
          console.warn(
            "Using fallback camera settings due to device limitations",
          );
          return true;
        } catch (fallbackError) {
          console.error("Fallback init failed:", fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    }
  };

  const calculateCanvasSize = () => {
    if (!canvas.value || !video.value) return;
    canvas.value.width = video.value.videoWidth;
    canvas.value.height = video.value.videoHeight;
  };

  const stopRendering = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  const canvasRender = () => {
    stopRendering();
    const drawFrame = () => {
      try {
        if (!video.value || !canvas.value) return;
        if (!video.value.paused && !video.value.ended) {
          calculateCanvasSize();
          const context = canvas.value?.getContext("2d", {
            alpha: false, // بهینه‌سازی performance
            willReadFrequently: false,
          });
          context?.drawImage(
            video.value,
            0,
            0,
            canvas.value.width,
            canvas.value.height,
          );
          animationFrameId = requestAnimationFrame(drawFrame);
        }
      } catch (error) {
        console.error("Error drawing video frame:", error);
        stopRendering();
      }
    };
    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(drawFrame);
    }
  };

  onMounted(() => {
    nextTick(() => {
      if (video.value) {
        // video.value.addEventListener('play', canvasRender);
        video.value.addEventListener("pause", stopRendering);
        video.value.addEventListener("ended", stopRendering);
      }
    });
  });

  onBeforeUnmount(() => {
    stopRendering();
    camera.cleanup();
    if (video.value) {
      video.value.removeEventListener("play", canvasRender);
      video.value.removeEventListener("pause", stopRendering);
      video.value.removeEventListener("ended", stopRendering);
    }

    resetTempImage();
    if (tempraryVideo.value) {
      URL.revokeObjectURL(tempraryVideo.value);
    }
  });

  const getTrack = () => {
    if (GlobalState.stream) {
      return GlobalState.stream.getVideoTracks()[0];
    }
  };

  const isSupportTorch = (): boolean => {
    const track = getTrack();
    if (!track) return false;
    const capabilities = (track.getCapabilities?.() ||
      {}) as MediaTrackCapabilities;
    return !!(capabilities as any).torch;
  };

  const torchToggle = async (): Promise<void> => {
    if (!isSupportTorch()) {
      throw new UnSupportTorchError("Torch not supported");
    }
    try {
      const torchState = !torch.value;
      const track = getTrack();
      if (track) {
        await track.applyConstraints?.({
          advanced: [{ torch: torchState } as any],
        });
        torch.value = torchState;
      }
    } catch (error) {
      console.error("Error setting torch:", error);
      throw error;
    }
  };

  const torchOn = async (): Promise<void> => {
    if (!isSupportTorch()) {
      return;
    }
    try {
      const track = getTrack();
      if (track) {
        await track.applyConstraints?.({
          advanced: [{ torch: true } as any],
        });
        torch.value = true;
      }
    } catch (error) {
      console.error("Error setting torch:", error);
    }
  };

  const torchOff = async (): Promise<void> => {
    if (!isSupportTorch()) {
      return;
    }
    try {
      const track = getTrack();
      if (track) {
        await track.applyConstraints?.({
          advanced: [{ torch: false } as any],
        });
        torch.value = false;
      }
    } catch (error) {
      console.error("Error setting torch:", error);
    }
  };

  const openCamera = async () => {
    try {
      await initSystemPerformance();

      const listCamera = await camera.getListCamera();
      const backCamera = camera.findBackCamera(listCamera);

      if (!GlobalState.stream) return;

      const track = getTrack();
      if (!track) {
        throw new Error("No video track available");
      }
      const resolution = camera.getResolution(track);

      const getOptimizedDimensions = (): Record<string, any> => {
        const maxRes = systemPerformance?.recommended?.maxResolution || "1080p";

        const resolutionLimits: Record<
          string,
          { width: { max: number }; height: { max: number } }
        > = {
          "4K": { width: { max: 3840 }, height: { max: 2160 } },
          "1440p": { width: { max: 2560 }, height: { max: 1440 } },
          "1080p": { width: { max: 1920 }, height: { max: 1080 } },
          "720p": { width: { max: 1280 }, height: { max: 720 } },
        };

        const limit = (resolutionLimits[maxRes] ||
          resolutionLimits["1080p"]) as {
          width: { max: number };
          height: { max: number };
        };

        return {
          facingMode: { exact: "environment" },
          width: { min: 1280, ideal: 1920, max: limit.width.max },
          height: { min: 720, ideal: 1080, max: limit.height.max },
          frameRate: { min: 15, ideal: 30, max: 30 },
        };
      };

      const dimension = getOptimizedDimensions();

      constraints.value.video = fallbackCamera.value
        ? true
        : (dimension as any);

      stop();
      GlobalState.stream = await camera.getMediaStream(toValue(constraints));

      if (video.value) {
        video.value.srcObject = GlobalState.stream;
        video.value.addEventListener("play", canvasRender);

        // Auto-play video
        try {
          await video.value.play();
        } catch (playError) {
          console.warn("Auto-play failed:", playError);
        }
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "OverconstrainedError" &&
        !fallbackCamera.value
      ) {
        fallbackCamera.value = true;
        console.warn(
          "Your device does not support the requested camera settings",
        );
        console.info("Trying with fallback settings...");
        return openCamera();
      } else {
        console.error("Error opening camera:", error);
        if (typeof error === "object" && error !== null && "message" in error) {
          console.error(`Failed to open camera: ${error.message}`);
        }
        throw error;
      }
    }

    return Promise.resolve();
  };

  function startMonitorLuminance() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });

    let running = true;

    function checkFrame() {
      if (!running || !video.value || !ctx) return;

      if (video.value.videoWidth === 0 || video.value.videoHeight === 0) {
        requestAnimationFrame(checkFrame);
        return;
      }

      canvas.width = video.value.videoWidth;
      canvas.height = video.value.videoHeight;
      ctx.drawImage(video.value, 0, 0, canvas.width, canvas.height);

      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;

      let total = 0;
      const step = 4 * 50;
      for (let i = 0; i < data.length; i += step) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        total += luminance;
      }

      const avg = total / (data.length / step);

      eventBus.emit("luminance", avg);

      requestAnimationFrame(checkFrame);
    }

    requestAnimationFrame(checkFrame);

    return () => {
      running = false;
    };
  }

  const stop = (full = false) => {
    try {
      if (!GlobalState.stream) {
        return;
      }

      const tracks = GlobalState.stream.getTracks();
      tracks.forEach((track) => {
        track.stop();
      });

      stopRendering();
    } catch (error) {
      console.error("Error stopping camera:", error);
    } finally {
      if (full) {
        if (video.value) {
          video.value.srcObject = null;
        }
        canvas.value = null;
        GlobalState.stream = null;
      }
    }
  };

  const pause = () => {
    if (!video.value) return;
    video.value.pause();
    stopRendering();
    isPause.value = true;
  };

  const resume = () => {
    if (!video.value) return;
    video.value.play();
    canvasRender();
    isPause.value = false;
  };

  const record = async (
    cb: ((error: Error | null, blob: Blob | null) => void) | null = null,
  ) => {
    try {
      if (recording.value) {
        camera.stopRecord();
        recording.value = false;
        return;
      }

      if (!GlobalState.stream) {
        throw new Error("No camera stream available");
      }

      recording.value = true;

      const recordingOptions = systemPerformance?.recommended
        ? {
            bitsPerSecond: systemPerformance.recommended.maxBitrate,
          }
        : {};

      const blob = await camera.startRecord(
        GlobalState.stream,
        recordingOptions,
      );

      if (tempraryVideo.value) {
        URL.revokeObjectURL(tempraryVideo.value);
      }
      tempraryVideo.value = URL.createObjectURL(blob);
      recording.value = false;

      if (typeof cb === "function") {
        cb(null, blob);
      }

      return blob;
    } catch (error) {
      recording.value = false;
      console.error("Recording error:", error);

      if (typeof cb === "function") {
        cb(error instanceof Error ? error : new Error(String(error)), null);
      }
      throw error;
    }
  };

  const pauseRecord = () => {
    camera.pauseRecord();
  };

  const resumeRecord = () => {
    camera.resumeRecord();
  };

  const getRecordingState = () => {
    return camera.getRecordingState();
  };

  const getSystemPerformance = () => {
    return systemPerformance;
  };

  return {
    Camera: camera,
    container,
    video,
    canvas,
    image: readonly(tempraryImage),
    videoBlob: readonly(tempraryVideo),
    torch: readonly(torch),
    recording: readonly(recording),
    isPause: readonly(isPause),
    eventBus,
    record,
    pauseRecord,
    resumeRecord,
    getRecordingState,
    capture,
    init,
    stop,
    start: openCamera,
    isSupportTorch,
    torchToggle,
    torchOn,
    torchOff,
    pause,
    resume,
    resetTempImage,
    toObjectURL,
    getSystemPerformance,
    getTrack,
    startMonitorLuminance,
  };
}

export class UnSupportTorchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnSupportTorchError";
  }
}
