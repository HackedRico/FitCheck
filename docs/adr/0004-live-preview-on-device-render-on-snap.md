# Live preview on the device, diffusion render on snap

Diffusion try-on takes seconds per image, so it cannot track a moving person. The live preview pins the garment cutout to body landmarks from MediaPipe Pose in the browser, which runs in real time on the phone for free; the diffusion render runs once when the owner taps to snap. The live preview is a 2D approximation and does not show drape or fit; the render does.
