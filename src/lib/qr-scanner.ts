export async function scanQRFromVideo(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement,
): Promise<string | null> {
  const context = canvasElement.getContext("2d");
  if (!context || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
    return null;
  }

  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  context.drawImage(
    videoElement,
    0,
    0,
    canvasElement.width,
    canvasElement.height,
  );

  const imageData = context.getImageData(
    0,
    0,
    canvasElement.width,
    canvasElement.height,
  );

  try {
    const jsQR = (await import("jsqr")).default;
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    return code ? code.data : null;
  } catch {
    return null;
  }
}
