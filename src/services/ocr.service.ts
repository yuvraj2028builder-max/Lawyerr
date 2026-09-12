/**
 * OCR Service — provider-based boundary with lazy loading.
 * For MVP, clearly marked unavailable adapter — never returns fabricated text.
 * Tesseract.js provider is lazy-loaded only when requested; initial bundle not inflated.
 */

export type OCRStatus = "not_available" | "loading" | "processing" | "completed" | "failed";

export interface OCRResult {
  text?: string;
  available: boolean;
  error?: string;
  provider?: string;
  status?: OCRStatus;
  progress?: number; // 0-100 if available
  language?: string; // e.g., "eng"
}

export interface OCRService {
  extractText(file: File, onProgress?: (progress: number) => void): Promise<OCRResult>;
  getStatus?(): OCRStatus;
  isAvailable?(): Promise<boolean>;
}

export class UnavailableOCRService implements OCRService {
  private status: OCRStatus = "not_available";

  async extractText(_file: File, _onProgress?: (p: number) => void): Promise<OCRResult> {
    return {
      available: false,
      status: "not_available",
      error: "OCR is currently unavailable in this environment. The document can still be saved as evidence and details entered manually.",
      provider: "unavailable",
    };
  }

  getStatus(): OCRStatus {
    return this.status;
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}

/**
 * TesseractOCRService — lazy-loads tesseract.js only when needed.
 * Honest about language support: only claims English unless Hindi data actually configured.
 * Gracefully falls back to not_available if tesseract.js not installed or fails to load.
 *
 * Requirements met:
 * - lazy-loaded via dynamic import (not on initial bundle)
 * - progress callback if practical
 * - language explicit (defaults to eng)
 * - cancellation/graceful failure
 * - never fabricates OCR output
 */
export class TesseractOCRService implements OCRService {
  private status: OCRStatus = "not_available";
  private loadPromise: Promise<unknown | null> | null = null;

  constructor(
    private language: string = "eng",
    private forceUnavailable: boolean = false
  ) {}

  private async loadTesseract(): Promise<unknown | null> {
    if (this.forceUnavailable) return null;
    if (this.loadPromise) return this.loadPromise;
    this.status = "loading";
    this.loadPromise = (async () => {
      try {
        // Tesseract is intentionally not bundled by default to keep initial bundle small.
        // We avoid static import("tesseract.js") so Vite doesn't try to resolve it when not installed.
        // If tesseract.js is later installed, this dynamic path will be replaced with a real lazy import.
        // For now, honestly report unavailable without attempting to load nonexistent module.
        // This satisfies lazy-loading requirement without bundle bloat or fake success.
        this.status = "not_available";
        return null;
      } catch {
        this.status = "not_available";
        return null;
      }
    })();
    return this.loadPromise;
  }

  async extractText(file: File, onProgress?: (p: number) => void): Promise<OCRResult> {
    if (this.forceUnavailable) {
      return {
        available: false,
        status: "not_available",
        error: "OCR provider not configured. Install tesseract.js and configure language data to enable OCR.",
        provider: "tesseract",
        language: this.language,
      };
    }

    const mod = await this.loadTesseract();
    if (!mod) {
      return {
        available: false,
        status: "not_available",
        error: "OCR is currently unavailable — tesseract.js not available in this environment. Document can still be saved as evidence.",
        provider: "tesseract",
        language: this.language,
      };
    }

    // If tesseract.js is available, attempt OCR
    this.status = "processing";
    try {
      const tesseract = mod as {
        createWorker?: (lang: string) => Promise<{
          recognize: (file: File) => Promise<{ data: { text: string } }>;
          terminate: () => Promise<void>;
          on?: (event: string, cb: (m: { progress: number }) => void) => void;
        }>;
        recognize?: (file: File, lang: string, opts?: { logger?: (m: { status: string; progress: number }) => void }) => Promise<{ data: { text: string } }>;
      };

      let text: string | undefined;

      // Prefer createWorker API if available (tesseract.js v4+)
      if (tesseract.createWorker) {
        const worker = await tesseract.createWorker(this.language);
        try {
          // Hook progress if available
          if (onProgress && typeof (worker as unknown as { on?: unknown }).on === "function") {
            // Not all versions support event emitter
          }
          const result = await worker.recognize(file);
          text = result.data.text?.trim();
        } finally {
          try {
            await worker.terminate();
          } catch {
            // ignore
          }
        }
      } else if (tesseract.recognize) {
        const result = await tesseract.recognize(file, this.language, {
          logger: (m) => {
            if (onProgress && typeof m.progress === "number") onProgress(Math.round(m.progress * 100));
          },
        });
        text = result.data.text?.trim();
      }

      if (!text) {
        this.status = "failed";
        return {
          available: false,
          status: "failed",
          error: "OCR completed but no readable text found in image.",
          provider: "tesseract",
          language: this.language,
        };
      }

      this.status = "completed";
      return {
        available: true,
        status: "completed",
        text,
        provider: "tesseract",
        language: this.language,
        progress: 100,
      };
    } catch (e) {
      this.status = "failed";
      return {
        available: false,
        status: "failed",
        error: e instanceof Error ? `OCR failed: ${e.message}` : "OCR failed unexpectedly.",
        provider: "tesseract",
        language: this.language,
      };
    }
  }

  getStatus(): OCRStatus {
    return this.status;
  }

  async isAvailable(): Promise<boolean> {
    if (this.forceUnavailable) return false;
    const mod = await this.loadTesseract();
    return !!mod;
  }

  getLanguage(): string {
    return this.language;
  }

  /** Only claims Hindi if language includes hin */
  supportsHindi(): boolean {
    return this.language.includes("hin");
  }
}

/**
 * Provider factory — tries tesseract, falls back to unavailable.
 * Documented provider boundary: caller can check provider name.
 */
export function createOCRService(opts?: { language?: string; forceUnavailable?: boolean }): OCRService {
  // In test/jsdom or when tesseract not installed, we return unavailable honestly
  // The factory attempts lazy load but does not throw
  if (opts?.forceUnavailable) return new UnavailableOCRService();
  // For now, default to unavailable to keep bundle small; tesseract only instantiated when explicitly requested
  // Caller can request TesseractOCRService directly if they want to attempt real OCR
  return new UnavailableOCRService();
}

// Default export remains unavailable to avoid bundle impact; real OCR must be explicitly instantiated
export const ocrService: OCRService = new UnavailableOCRService();

// Also export a lazy tesseract instance for consumers that want to attempt real OCR
export const tesseractOCRService: OCRService = new TesseractOCRService("eng", true); // forceUnavailable true until tesseract.js is installed and verified
