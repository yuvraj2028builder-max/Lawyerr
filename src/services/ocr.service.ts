/**
 * OCR Service — provider-based boundary with lazy loading.
 * Option A (implemented): real Tesseract.js OCR, lazy-loaded, English only.
 * Hindi is explicitly NOT claimed: language data quality was not verified.
 * Never returns fabricated text; every failure is explicit.
 */

export type OCRStatus = "not_available" | "loading" | "processing" | "completed" | "failed";

/** The only OCR language this MVP claims. Anything else is honestly refused. */
export const SUPPORTED_OCR_LANGUAGE = "eng";

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
 * English only: Hindi/autodetect requests are refused honestly because
 * Hindi language-data quality was not verified for this MVP.
 * Gracefully falls back to not_available/failed if the SDK cannot load.
 *
 * Requirements met:
 * - lazy-loaded via dynamic import (not on initial bundle)
 * - progress callback
 * - language explicit (eng only)
 * - worker always terminated, failures never fabricate text
 */
export class TesseractOCRService implements OCRService {
  private status: OCRStatus = "not_available";
  private loadPromise: Promise<unknown | null> | null = null;

  constructor(
    private language: string = SUPPORTED_OCR_LANGUAGE,
    private forceUnavailable: boolean = false
  ) {}

  private async loadTesseract(): Promise<unknown | null> {
    if (this.forceUnavailable) return null;
    if (this.loadPromise) return this.loadPromise;
    this.status = "loading";
    this.loadPromise = (async () => {
      try {
        // Lazy chunk: tesseract.js (~200KB+) loads only on first OCR attempt.
        const mod = await import("tesseract.js");
        this.status = "not_available";
        return mod;
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

    if (this.language !== SUPPORTED_OCR_LANGUAGE) {
      return {
        available: false,
        status: "not_available",
        error: `OCR language "${this.language}" is not supported in this MVP — English only. Hindi reading quality was not verified, so it stays off rather than guessing.`,
        provider: "tesseract",
        language: this.language,
      };
    }

    if (!file.type.startsWith("image/")) {
      return {
        available: false,
        status: "not_available",
        error: "Automatic reading handles photos and screenshots. Scanned PDFs cannot be read automatically yet — please type the details manually.",
        provider: "tesseract",
        language: this.language,
      };
    }

    const mod = await this.loadTesseract();
    if (!mod) {
      return {
        available: false,
        status: "not_available",
        error: "Automatic reading could not start (OCR engine failed to load). The document is still saved as evidence — please type the details manually.",
        provider: "tesseract",
        language: this.language,
      };
    }

    // If tesseract.js is available, attempt OCR
    this.status = "processing";
    try {
      const tesseract = mod as {
        createWorker?: (
          lang: string,
          oem?: number,
          options?: { logger?: (m: { status: string; progress: number }) => void }
        ) => Promise<{
          recognize: (file: File) => Promise<{ data: { text: string; confidence?: number } }>;
          terminate: () => Promise<void>;
        }>;
        recognize?: (file: File, lang: string, opts?: { logger?: (m: { status: string; progress: number }) => void }) => Promise<{ data: { text: string } }>;
      };

      let text: string | undefined;

      // Prefer createWorker API (tesseract.js v4+)
      if (tesseract.createWorker) {
        const worker = await tesseract.createWorker(this.language, undefined, {
          logger: (m) => {
            if (onProgress && typeof m.progress === "number" && m.status === "recognizing text") {
              onProgress(Math.round(m.progress * 100));
            }
          },
        });
        try {
          const result = await worker.recognize(file);
          text = result.data.text?.trim();
          if (onProgress) onProgress(100);
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
 * Provider factory — explicit opt-in to real OCR, honest fallback otherwise.
 */
export function createOCRService(opts?: { language?: string; forceUnavailable?: boolean }): OCRService {
  if (opts?.forceUnavailable) return new UnavailableOCRService();
  if (opts?.language && opts.language !== SUPPORTED_OCR_LANGUAGE) {
    return new TesseractOCRService(opts.language); // will honestly refuse non-English
  }
  return new UnavailableOCRService();
}

// Default export stays unavailable: default document flows must explicitly
// opt into OCR so nothing changes unless the user asks. Real OCR must be
// explicitly instantiated.
export const ocrService: OCRService = new UnavailableOCRService();

// Explicit opt-in English OCR (lazy-loaded tesseract.js on first use).
// Hindi stays off: language-data quality was not verified for this MVP.
export const englishTesseractService: OCRService = new TesseractOCRService(SUPPORTED_OCR_LANGUAGE, false);

// Also export a lazy tesseract instance for consumers that want to attempt real OCR
export const tesseractOCRService: OCRService = new TesseractOCRService("eng", false);
