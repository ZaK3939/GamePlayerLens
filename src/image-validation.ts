import sharp from "sharp";

export type SupportedImageMimeType = "image/png" | "image/jpeg";

const MAX_CAPTURE_PIXELS = 40_000_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

function expectedImage(mimeType: SupportedImageMimeType) {
  return mimeType === "image/png"
    ? {format: "png" as const, name: "PNG", signature: PNG_SIGNATURE}
    : {format: "jpeg" as const, name: "JPEG", signature: JPEG_SIGNATURE};
}

export async function validateRasterImage(
  bytes: Buffer,
  mimeType: SupportedImageMimeType,
): Promise<{width: number; height: number}> {
  const expected = expectedImage(mimeType);
  if (!bytes.subarray(0, expected.signature.length).equals(expected.signature)) {
    throw new Error(`invalid ${expected.name} signature`);
  }

  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: MAX_CAPTURE_PIXELS,
      limitInputChannels: 4,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== expected.format
      || !metadata.width
      || !metadata.height
    ) {
      throw new Error("decoded image metadata does not match the declared format");
    }
    await image.stats();
    return {width: metadata.width, height: metadata.height};
  } catch {
    throw new Error(
      `invalid ${expected.name} image: compressed pixels could not be decoded`,
    );
  }
}
