import { useEffect, useRef, useState, type RefObject } from "react";

import { encodeCanvas, makeCanvas } from "./canvas";

// =============================================================================
// Module Overview
// =============================================================================
// Camera access for every screen. `useCamera` opens the front or rear camera
// into a `<video>` and closes it when the screen goes away; `captureFrame` and
// `pickedPhoto` turn a frame or a picked file into a JPEG small enough to upload fast.

export type Facing = "user" | "environment";
export type CameraStatus = "off" | "starting" | "live" | "denied" | "unavailable";

export interface CameraHandle {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
}

// Tagging and try-on models work at about 1024 px; larger frames only slow the upload
const UPLOAD_MAX_SIDE = 1280;
const JPEG_QUALITY = 0.9;

/** Open the `facing` camera into `videoRef` while `enabled`, and stop it afterwards. */
export function useCamera(facing: Facing, enabled: boolean): CameraHandle {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("off");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      return undefined;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setError(
        window.isSecureContext
          ? "This browser cannot open a camera. Use a photo instead."
          : "The camera needs the https address. Use a photo instead.",
      );
      return undefined;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;
    setStatus("starting");
    setError(null);

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then(async (opened) => {
        if (cancelled) {
          stopStream(opened);
          return;
        }
        stream = opened;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = opened;
        await video.play();
        // A camera switch during `play` must not mark the next stream live before it opens
        if (!cancelled) setStatus("live");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
        setStatus(denied ? "denied" : "unavailable");
        setError(
          denied
            ? "Camera access is blocked. Allow it in the browser, or use a photo instead."
            : "No camera could be opened. Use a photo instead.",
        );
      });

    return () => {
      cancelled = true;
      if (stream) stopStream(stream);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [facing, enabled]);

  return { videoRef, status, error };
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** Grab the current video frame as a JPEG, unmirrored, at most `UPLOAD_MAX_SIDE` px. */
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  if (video.videoWidth === 0) return Promise.reject(new Error("The camera has no frame yet."));
  return drawToJpeg(video, video.videoWidth, video.videoHeight);
}

/** The photo just chosen in a file `input`, upload-sized, or `null` when none was chosen. */
export async function pickedPhoto(input: HTMLInputElement): Promise<Blob | null> {
  const file = input.files?.[0];
  // Cleared, so choosing the same file again still fires a change
  input.value = "";
  return file ? shrinkImage(file) : null;
}

/** Downscale a picked photo to an upload-sized JPEG; returns it unchanged if it cannot be decoded. */
async function shrinkImage(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return await drawToJpeg(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch (error) {
    console.warn("[camera] Could not decode the photo in the browser; uploading it as is.", error);
    return file;
  }
}

async function drawToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(width, height));
  const canvas = makeCanvas(Math.round(width * scale), Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw images.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await encodeCanvas(canvas, "image/jpeg", JPEG_QUALITY);
  if (!blob) throw new Error("Could not encode the photo.");
  return blob;
}
