/**
 * ImagePreprocessingService — lightweight, browser-safe.
 * - Validates dimensions, size limits, orientation-safe handling
 * - Does NOT silently modify original file
 * - Keeps original metadata
 * - Returns honest unavailable when not possible (e.g., jsdom lacks Image)
 */

export interface ImageInfo {
  width?: number;
  height?: number;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
  orientationSafe?: boolean;
}

export interface PreprocessResult {
  available: boolean;
  file: File; // original file (never silently replaced unless explicitly requested)
  info?: ImageInfo;
  error?: string;
  warnings?: string[];
}

export const MAX_IMAGE_DIMENSION = 8000; // pixels
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, aligns with upload limit
export const MIN_IMAGE_DIMENSION = 10; // too small to be useful

export class ImagePreprocessingService {
  /**
   * Validate image without modifying it.
   * Returns info and warnings; does not block upload but informs UI.
   */
  async validateImage(file: File): Promise<{ ok: boolean; error?: string; warnings?: string[]; info?: ImageInfo }> {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Not an image file" };
    }
    if (file.size === 0) return { ok: false, error: "File is empty" };
    if (file.size > MAX_IMAGE_FILE_SIZE) {
      return { ok: false, error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_IMAGE_FILE_SIZE / 1024 / 1024} MB.` };
    }

    const info: ImageInfo = {
      sizeBytes: file.size,
      mimeType: file.type,
      fileName: file.name,
    };

    // Try to get dimensions if browser supports createImageBitmap or Image
    try {
      const dims = await this.getDimensions(file);
      if (dims) {
        info.width = dims.width;
        info.height = dims.height;
        info.orientationSafe = true;

        const warnings: string[] = [];
        if (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION) {
          return {
            ok: false,
            error: `Image dimensions too large (${dims.width}×${dims.height}). Max ${MAX_IMAGE_DIMENSION}px.`,
            info,
          };
        }
        if (dims.width < MIN_IMAGE_DIMENSION || dims.height < MIN_IMAGE_DIMENSION) {
          warnings.push(`Image very small (${dims.width}×${dims.height}) — may be unreadable.`);
        }
        // Orientation: we treat as safe — browser handles EXIF orientation for display
        return { ok: true, warnings: warnings.length ? warnings : undefined, info };
      }
    } catch (e) {
      // Dimension check unavailable — still allow upload but warn
      return {
        ok: true,
        warnings: [`Image dimension check not available in this environment: ${e instanceof Error ? e.message : "unknown"}`],
        info,
      };
    }

    // If we couldn't determine dimensions (e.g., jsdom), allow but note
    return {
      ok: true,
      warnings: ["Image preprocessing is not currently available in this environment — dimension check skipped."],
      info,
    };
  }

  async getDimensions(file: File): Promise<{ width: number; height: number } | null> {
    // Try createImageBitmap (modern, efficient)
    if (typeof createImageBitmap !== "undefined") {
      try {
        const bitmap = await createImageBitmap(file);
        const dims = { width: bitmap.width, height: bitmap.height };
        bitmap.close?.();
        return dims;
      } catch {
        // fall through to Image fallback
      }
    }

    // Fallback to Image element (requires DOM)
    if (typeof Image !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const dims = { width: img.width, height: img.height };
          URL.revokeObjectURL(url);
          resolve(dims);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to load image for dimension check"));
        };
        img.src = url;
        // Timeout after 2s
        setTimeout(() => {
          URL.revokeObjectURL(url);
          reject(new Error("Image dimension check timed out"));
        }, 2000);
      });
    }

    return null; // not available in this env (e.g., jsdom without canvas)
  }

  /**
   * Preprocess is currently a no-op that preserves original.
   * Future: optional grayscale/contrast could be added behind flag, but never auto-applied.
   */
  async preprocess(file: File): Promise<PreprocessResult> {
    const validation = await this.validateImage(file);
    if (!validation.ok) {
      return { available: false, file, error: validation.error, info: validation.info };
    }
    // No actual modification — return original file
    // If warnings exist, include them but still available
    if (validation.warnings) {
      return { available: true, file, info: validation.info, warnings: validation.warnings };
    }
    return { available: true, file, info: validation.info };
  }

  /**
   * Check if preprocessing is available in this environment.
   */
  isAvailable(): boolean {
    // We consider it available if we can at least validate size; dimension check is optional
    return true;
  }

  getUnavailableMessage(): string {
    return "Image preprocessing is not currently available in this environment. Original file will be kept unchanged.";
  }
}

export const imagePreprocessingService = new ImagePreprocessingService();
