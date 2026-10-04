import type { PoseLandmarker } from '@mediapipe/tasks-vision'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const IMAGE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
const IMAGE_MAX_POSES = 3

let imagePending: Promise<PoseLandmarker> | null = null

export async function visionFileset() {
  const { FilesetResolver } = await import('@mediapipe/tasks-vision')
  return FilesetResolver.forVisionTasks(WASM_URL)
}

export function loadImagePoseLandmarker(): Promise<PoseLandmarker> {
  imagePending ??= (async () => {
    const { PoseLandmarker } = await import('@mediapipe/tasks-vision')
    return PoseLandmarker.createFromOptions(await visionFileset(), {
      baseOptions: { modelAssetPath: IMAGE_MODEL_URL },
      runningMode: 'IMAGE',
      numPoses: IMAGE_MAX_POSES,
    })
  })().catch((error: unknown) => {
    imagePending = null
    throw error
  })
  return imagePending
}
