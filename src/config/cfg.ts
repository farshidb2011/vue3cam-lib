type CanvasDrawDim = "auto" | number;

export enum Resolution {
    "4K",
    "1440P",
    "1080P",
    "720P",
    "480P",
    "custom"
}

export interface CustomResolution {
        width: {
            max: number
        }
        height: {
            max: number
        }
    }

export type ResolutionLimit = {
    [x in Resolution]: CustomResolution
}

export interface Config {
  canvasWidth: CanvasDrawDim;
  canvasHeight: CanvasDrawDim;
  constraints: MediaStreamConstraints | null;
}