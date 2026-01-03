interface ProcessedImage {
  data: string // base64 encoded
  mimeType: string
}

// Dynamic import of Sharp - may not be available on all platforms (e.g., Cloudflare Workers)
// eslint-disable-next-line quotes
let sharp: typeof import("sharp") | null = null

async function getSharp() {
  if (sharp === null) {
    try {
      // eslint-disable-next-line quotes
      sharp = await import("sharp")
    } catch {
      // Sharp not available on this platform
      // eslint-disable-next-line quotes
      sharp = undefined as unknown as typeof import("sharp")
    }
  }
  return sharp
}

/**
 * Process an uploaded image:
 * - Resize to max dimensions (800x600)
 * - Convert to WebP format for better compression
 * - Return as base64 string
 *
 * Falls back to returning the original image if Sharp is not available.
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

  const sharpModule = await getSharp()
  if (!sharpModule) {
    // Sharp not available - return original image
    return {
      data: base64Data,
      mimeType: `image/jpeg`, // Assume JPEG if we can't detect
    }
  }

  // Convert base64 to buffer
  const inputBuffer = Buffer.from(base64Data, `base64`)

  // Process with Sharp
  const outputBuffer = await sharpModule.default(inputBuffer)
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
  const sharpModule = await getSharp()
  if (!sharpModule) {
    return { width: 0, height: 0 }
  }

  const base64Data = base64Input.replace(/^data:image\/\w+;base64,/, ``)
  const inputBuffer = Buffer.from(base64Data, `base64`)

  const metadata = await sharpModule.default(inputBuffer).metadata()

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
  const sharpModule = await getSharp()
  if (!sharpModule) {
    const base64Data = base64Input.replace(/^data:image\/\w+;base64,/, ``)
    return {
      data: base64Data,
      mimeType: `image/jpeg`,
    }
  }

  const base64Data = base64Input.replace(/^data:image\/\w+;base64,/, ``)
  const inputBuffer = Buffer.from(base64Data, `base64`)

  const outputBuffer = await sharpModule.default(inputBuffer)
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
