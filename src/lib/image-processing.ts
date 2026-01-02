import sharp from "sharp"

interface ProcessedImage {
  data: string // base64 encoded
  mimeType: string
}

/**
 * Process an uploaded image:
 * - Resize to max dimensions (800x600)
 * - Convert to WebP format for better compression
 * - Return as base64 string
 */
export async function processImage(
  base64Input: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {}
): Promise<ProcessedImage> {
  const { maxWidth = 800, maxHeight = 600, quality = 80 } = options

  // Remove data URL prefix if present
  const base64Data = base64Input.replace(/^data:image\/\w+;base64,/, ``)

  // Convert base64 to buffer
  const inputBuffer = Buffer.from(base64Data, `base64`)

  // Process with Sharp
  const outputBuffer = await sharp(inputBuffer)
    .resize(maxWidth, maxHeight, {
      fit: `inside`,
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer()

  // Convert back to base64
  const outputBase64 = outputBuffer.toString(`base64`)

  return {
    data: outputBase64,
    mimeType: `image/webp`,
  }
}

/**
 * Get image dimensions from base64 data
 */
export async function getImageDimensions(
  base64Input: string
): Promise<{ width: number; height: number }> {
  const base64Data = base64Input.replace(/^data:image\/\w+;base64,/, ``)
  const inputBuffer = Buffer.from(base64Data, `base64`)

  const metadata = await sharp(inputBuffer).metadata()

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
  }
}

/**
 * Create a thumbnail from an image
 */
export async function createThumbnail(
  base64Input: string,
  size: number = 200
): Promise<ProcessedImage> {
  const base64Data = base64Input.replace(/^data:image\/\w+;base64,/, ``)
  const inputBuffer = Buffer.from(base64Data, `base64`)

  const outputBuffer = await sharp(inputBuffer)
    .resize(size, size, {
      fit: `cover`,
      position: `center`,
    })
    .webp({ quality: 70 })
    .toBuffer()

  return {
    data: outputBuffer.toString(`base64`),
    mimeType: `image/webp`,
  }
}
