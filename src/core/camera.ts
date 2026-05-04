export class Camera {
    #mediaRecorder: MediaRecorder | null = null;
    #recordedChunks: Blob[] = [];
    #isRecording: boolean = false;
    static currentMimeType: string | undefined = undefined;
    recordingResolve?: (blob: Blob) => void;
    recordingReject?: (reason?: any) => void;

    constructor() {
        // Pre-bind methods to avoid function recreation
        this.onDataAvailable = this.onDataAvailable.bind(this);
        this.onStop = this.onStop.bind(this);
        this.onError = this.onError.bind(this);
    }

    static supported(): boolean {
        return !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
    }

    checkSupport(): void {
        if (!Camera.supported()) {
            throw new NotSupportCamera('Not support navigator.mediaDevices.getUserMedia');
        }
    }

    static getOptimizedConstraints(deviceId: string | null = null, maxResolution: string = '1080p'): MediaStreamConstraints {
        const resolutionPresets: Record<string, { width: { max: number }; height: { max: number } }> = {
            '4K': { width: { max: 3840 }, height: { max: 2160 } },
            '1440p': { width: { max: 2560 }, height: { max: 1440 } },
            '1080p': { width: { max: 1920 }, height: { max: 1080 } },
            '720p': { width: { max: 1280 }, height: { max: 720 } },
            '480p': { width: { max: 854 }, height: { max: 480 } }
        };

        const resolution = resolutionPresets[maxResolution] || resolutionPresets['1080p'];

        return {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                ...resolution,
                frameRate: { ideal: 30, max: 60 },
                facingMode: deviceId ? undefined : { ideal: 'environment' }
            },
            audio: false
        };
    }

    async getMediaStream(constraints: MediaStreamConstraints | null = null): Promise<MediaStream> {
        this.checkSupport();

        if (!constraints) {
            constraints = Camera.getOptimizedConstraints();
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                await videoTrack.applyConstraints({
                    frameRate: { ideal: 30, max: 30 },
                    width: { max: 1920 },
                    height: { max: 1080 }
                });
            }

            return stream;
        } catch (error) {
            // Fallback to lower quality if high resolution fails
            const videoConstraints = (constraints as MediaStreamConstraints).video;
            if (videoConstraints && typeof videoConstraints === 'object' && 'width' in videoConstraints && (videoConstraints as any).width?.max > 1280) {
                console.warn('High resolution failed, trying 720p...');
                const fallbackConstraints = Camera.getOptimizedConstraints(null, '720p');
                return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            }
            throw error;
        }
    }

    async getListCamera(): Promise<MediaDeviceInfo[]> {
        this.checkSupport();
        const deviceInfo = await navigator.mediaDevices.enumerateDevices();
        const cameras = deviceInfo.filter((info) => info.kind === 'videoinput');
        return cameras;
    }

    async getPermissionState(): Promise<PermissionStatus['state']> {
        const name = 'camera' as PermissionName;
        if ('permissions' in navigator) {
            try {
                const permission = await navigator.permissions.query({ name });
                return permission.state;
            } catch (error) {
                throw new QueryCameraError(error instanceof Error ? error : String(error));
            }
        } else {
            throw new NotPermissionSupport('Not support navigator.permissions');
        }
    }

    capture(video: HTMLVideoElement): Promise<HTMLCanvasElement> {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d', {
                    alpha: false,
                    willReadFrequently: false
                });

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                if (context) {
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                }
                resolve(canvas);
            });
        });
    }

    async capture2(track: MediaStreamTrack): Promise<Blob> {
        const imageCapture = new ImageCapture(track);
        try {
            return await imageCapture.takePhoto({
                imageWidth: 1920,
                imageHeight: 1080
            });
        } catch (error) {
            // Fallback to basic photo capture
            return await imageCapture.takePhoto();
        }
    }

    static getExtension(mimeType: string): string {
        const mimeExtensions: Record<string, string> = {
            'video/webm;codecs=vp9,opus': 'webm',
            'video/webm;codecs=vp9': 'webm',
            'video/webm;codecs=vp8,opus': 'webm',
            'video/webm;codecs=vp8': 'webm',
            'video/webm': 'webm',
            'video/mp4;codecs=h264,aac': 'mp4',
            'video/mp4;codecs=h264': 'mp4',
            'video/mp4': 'mp4',
            'video/ogg': 'ogv',
            'video/x-matroska': 'mkv',
            'video/x-matroska;codecs=avc1': 'mkv'
        };

        return mimeExtensions[mimeType] || 'webm';
    }

    static getOptimizedRecordingSettings(videoTrack: MediaStreamTrack): { mimeType: string; bitsPerSecond: number } {
        const settings = videoTrack.getSettings();
        const width = settings.width || 1920;
        const height = settings.height || 1080;
        const pixels = width * height;

        let bitsPerSecond;
        if (pixels >= 3840 * 2160) {
            // 4K
            bitsPerSecond = 40_000_000;
        } else if (pixels >= 2560 * 1440) {
            // 1440p
            bitsPerSecond = 25_000_000;
        } else if (pixels >= 1920 * 1080) {
            // 1080p
            bitsPerSecond = 15_000_000;
        } else if (pixels >= 1280 * 720) {
            // 720p
            bitsPerSecond = 8_000_000;
        } else {
            // 480p and below
            bitsPerSecond = 4_000_000;
        }

        const preferredMimeTypes = [`video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm`, `video/mp4;codecs=h264,aac`, `video/mp4;codecs=h264`, `video/mp4`];

        for (const mimeType of preferredMimeTypes) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
                return { mimeType, bitsPerSecond };
            }
        }

        throw new Error('No supported mime type found for MediaRecorder');
    }

    // Event handlers as instance methods to avoid recreation
    onDataAvailable(event: BlobEvent): void {
        if (event.data.size > 0) {
            this.#recordedChunks.push(event.data);
        }
    }

    onStop(): void {
        const blob = new Blob(this.#recordedChunks, { type: Camera.currentMimeType });
        this.#recordedChunks = []; // Clear chunks for next recording
        this.#isRecording = false;
        this.recordingResolve?.(blob);
        this.#mediaRecorder = null;
    }

    onError(error: Event): void {
        this.#isRecording = false;
        this.recordingReject?.((error as any).reason || error);
    }

    async startRecord(stream: MediaStream, options: { bitsPerSecond?: number } = {}): Promise<Blob> {
        if (this.#isRecording) {
            throw new Error('Recording is already in progress');
        }

        const videoTrack = stream.getVideoTracks()[0];
        const recordingSettings = Camera.getOptimizedRecordingSettings(videoTrack);
        Camera.currentMimeType = recordingSettings.mimeType;

        // Reset chunks array
        this.#recordedChunks = [];
        this.#isRecording = true;

        return new Promise((resolve, reject) => {
            this.recordingResolve = resolve;
            this.recordingReject = reject;

            const mediaRecorderOptions = {
                mimeType: recordingSettings.mimeType,
                bitsPerSecond: options.bitsPerSecond || recordingSettings.bitsPerSecond,

                videoBitsPerSecond: Math.floor((options.bitsPerSecond || recordingSettings.bitsPerSecond) * 0.8),
                audioBitsPerSecond: Math.floor((options.bitsPerSecond || recordingSettings.bitsPerSecond) * 0.2)
            };

            try {
                this.#mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);

                this.#mediaRecorder.addEventListener('dataavailable', this.onDataAvailable);
                this.#mediaRecorder.addEventListener('stop', this.onStop);
                this.#mediaRecorder.addEventListener('error', this.onError);

                this.#mediaRecorder.start(500);
            } catch (error) {
                this.#isRecording = false;
                reject(new Error(`MediaRecorder initialization failed: ${(error instanceof Error ? error.message : String(error))}` ));
            }
        });
    }

    stopRecord(): void {
        if (this.#mediaRecorder && this.#mediaRecorder.state === 'recording') {
            this.#mediaRecorder.stop();
        }
    }

    pauseRecord(): void {
        if (this.#mediaRecorder && this.#mediaRecorder.state === 'recording') {
            this.#mediaRecorder.pause();
        }
    }

    resumeRecord(): void {
        if (this.#mediaRecorder && this.#mediaRecorder.state === 'paused') {
            this.#mediaRecorder.resume();
        }
    }

    getRecordingState(): string {
        return this.#mediaRecorder?.state || 'inactive';
    }

    getResolution(track: MediaStreamTrack): any {
        const capabilities = track.getCapabilities();
        const settings = track.getSettings();

        return {
            current: {
                width: settings.width,
                height: settings.height,
                frameRate: settings.frameRate
            },
            capabilities: {
                width: capabilities.width,
                height: capabilities.height,
                frameRate: capabilities.frameRate
            }
        };
    }

    getBlob(canvas: HTMLCanvasElement, quality: number = 0.8): Promise<Blob> {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob from canvas'));
                    }
                },
                'image/jpeg',
                quality
            );
        });
    }

    findTrackWithLabel(label: string, tracks: MediaStreamTrack[]): MediaStreamTrack | undefined {
        return tracks.find((track) => track.label === label);
    }

    findBackCamera(listCamera: MediaDeviceInfo[]): MediaDeviceInfo | undefined {
        const backCamera = listCamera.find((device) => /back|rear|environment/i.test(device.label));
        return backCamera || listCamera[0];
    }

    findFrontCamera(listCamera: MediaDeviceInfo[]): MediaDeviceInfo | undefined {
        const frontCamera = listCamera.find((device) => /front|user|facing/i.test(device.label));
        return frontCamera || listCamera[listCamera.length - 1];
    }

    findEnabledTrack(tracks: MediaStreamTrack[]): MediaStreamTrack | undefined {
        return tracks.find((track) => track.enabled);
    }

    cleanup(): void {
        if (this.#mediaRecorder) {
            this.#mediaRecorder.removeEventListener('dataavailable', this.onDataAvailable);
            this.#mediaRecorder.removeEventListener('stop', this.onStop);
            this.#mediaRecorder.removeEventListener('error', this.onError);

            if (this.#mediaRecorder.state === 'recording') {
                this.#mediaRecorder.stop();
            }
        }

        this.#recordedChunks = [];
        this.#isRecording = false;
        this.#mediaRecorder = null;
    }

    static async checkSystemPerformance(): Promise<{
        cores?: number;
        memory?: number;
        recommended: {
            maxResolution: string;
            maxBitrate: number;
        };
    }> {
        if ('hardwareConcurrency' in navigator) {
            const cores = navigator.hardwareConcurrency;
            const memory = (navigator as any).deviceMemory || 4; // GB, fallback to 4GB

            return {
                cores,
                memory,
                recommended: {
                    maxResolution: cores >= 4 && memory >= 8 ? '1080p' : '720p',
                    maxBitrate: cores >= 4 && memory >= 8 ? 15_000_000 : 8_000_000
                }
            };
        }

        return {
            recommended: {
                maxResolution: '720p',
                maxBitrate: 8_000_000
            }
        };
    }
}

export class NotPermissionSupport extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotPermissionSupport';
    }
}

export class QueryCameraError extends Error {
    constructor(message: string | Error) {
        super(message instanceof Error ? message.message : String(message));
        this.name = 'QueryCameraError';
    }
}

export class NotSupportCamera extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotSupportCamera';
    }
}
