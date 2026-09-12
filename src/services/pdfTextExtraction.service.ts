/**
 * PdfTextExtractionService — reliable PDF text extraction behind adapter.
 * Preferred: pdfjs-dist lazy-loaded, worker configured, no fake text.
 * If pdfjs-dist unavailable or fails → honest not_available.
 */

export interface PdfExtractionResult {
  available: boolean;
  text?: string;
  pageCount?: number;
  error?: string;
  source: "pdf_text" | "none";
  workerConfigured?: boolean;
}

export interface PdfTextExtractionService {
  extractText(file: File): Promise<PdfExtractionResult>;
}

/**
 * PdfJsTextExtractionService — uses pdfjs-dist via dynamic import.
 * Lazy-loaded: pdfjs code not in initial bundle.
 * Worker: attempts to configure via ?url import; falls back to disableWorker:true
 * so extraction works even without worker thread.
 * Never fabricates text — empty scanned PDF returns source:none.
 */
export class PdfJsTextExtractionService implements PdfTextExtractionService {
  private workerConfigured = false;
  private triedWorkerConfig = false;

  async extractText(file: File): Promise<PdfExtractionResult> {
    if (file.type !== "application/pdf") {
      return { available: false, source: "none", error: "Not a PDF file" };
    }

    let pdfjs: unknown;
    try {
      // Lazy-load pdfjs-dist — not in initial bundle
      const mod = await import("pdfjs-dist");
      pdfjs = mod;
    } catch (e) {
      return {
        available: false,
        source: "none",
        error: e instanceof Error ? e.message : "PDF.js not available in this environment. PDF text extraction not available in this environment. You can still add it as evidence and enter details manually.",
      };
    }

    // Try to configure worker once (browser only)
    if (!this.triedWorkerConfig && typeof window !== "undefined") {
      this.triedWorkerConfig = true;
      try {
        // Try Vite ?url import for worker — may fail in some envs, that's ok we fallback to disableWorker
        // We use dynamic import with error capture; if fails we just disable worker
        const workerMod: unknown = await import("pdfjs-dist/build/pdf.worker.min.mjs?url").catch(() => null);
        const workerUrl = workerMod && typeof workerMod === "object" && "default" in (workerMod as Record<string, unknown>) ? (workerMod as { default: string }).default : null;
        const pdfjsAny = pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } };
        if (workerUrl && pdfjsAny.GlobalWorkerOptions) {
          pdfjsAny.GlobalWorkerOptions.workerSrc = workerUrl;
          this.workerConfigured = true;
        }
      } catch {
        // Worker config failed — will use disableWorker fallback
        this.workerConfigured = false;
      }
    }

    try {
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength === 0) {
        return { available: false, source: "none", error: "PDF is empty (0 bytes)", workerConfigured: this.workerConfigured };
      }

      const pdfjsAny = pdfjs as {
        getDocument: (opts: unknown) => { promise: Promise<PdfDocument> };
        GlobalWorkerOptions?: unknown;
        version?: string;
      };

      // Always use disableWorker when worker not configured to avoid missing worker errors
      const isWorkerAvailable = this.workerConfigured;
      const loadingTask = pdfjsAny.getDocument({
        data: new Uint8Array(buffer),
        // Disable worker if not configured — still extracts text, just on main thread
        disableWorker: !isWorkerAvailable,
        verbosity: 0,
        // Security: disable eval for safety
        isEvalSupported: false,
      } as unknown);

      const pdf: PdfDocument = await loadingTask.promise;
      const pageCount = pdf.numPages;
      if (pageCount === 0) {
        return { available: false, source: "none", pageCount: 0, error: "PDF has no pages", workerConfigured: this.workerConfigured };
      }

      // Extract text from all pages, but limit to reasonable size (e.g., 50 pages, 200k chars)
      const maxPages = Math.min(pageCount, 50);
      let fullText = "";
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // content.items may be TextItem or TextMarkedContent
        const strings = (content.items as Array<{ str?: string } | unknown>)
          .map((item) => (item && typeof item === "object" && "str" in item ? (item as { str: string }).str : ""))
          .join(" ");
        fullText += strings + "\n";
        // Early break if text too long
        if (fullText.length > 200_000) break;
      }

      const trimmed = fullText.trim();
      // Scanned/image-only PDF: no text extracted → honest empty, trigger OCR path
      if (!trimmed || trimmed.length < 10) {
        return {
          available: false,
          source: "none",
          pageCount,
          error: "No readable text found in PDF (may be scanned/image-only). OCR path will be attempted if available.",
          workerConfigured: this.workerConfigured,
        };
      }

      return {
        available: true,
        text: trimmed,
        pageCount,
        source: "pdf_text",
        workerConfigured: this.workerConfigured,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to read PDF";
      // Honest failure — never fabricate
      // Common errors: password protected, corrupted, etc.
      const isPassword = msg.toLowerCase().includes("password");
      const friendly = isPassword
        ? "PDF is password-protected and cannot be read automatically. You can still add it as evidence and enter details manually."
        : `PDF text extraction failed: ${msg}. You can still add it as evidence and enter details manually.`;
      return {
        available: false,
        source: "none",
        error: friendly,
        workerConfigured: this.workerConfigured,
      };
    }
  }

  isWorkerConfigured(): boolean {
    return this.workerConfigured;
  }
}

// Minimal pdf.js types for internal use
interface PdfDocument {
  numPages: number;
  getPage(num: number): Promise<PdfPage>;
  destroy(): void;
}
interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
}

/**
 * Fallback service when pdfjs-dist cannot be loaded — always returns not_available
 * with honest explanation.
 */
export class UnavailablePdfExtractionService implements PdfTextExtractionService {
  async extractText(_file: File): Promise<PdfExtractionResult> {
    return {
      available: false,
      source: "none",
      error: "PDF text extraction not available in this environment. You can still add the document as evidence and enter details manually.",
    };
  }
}

// Default singleton — tries pdfjs, falls back honestly if not available
export const pdfTextExtractionService: PdfTextExtractionService = new PdfJsTextExtractionService();

export function createPdfTextExtractionService(forceUnavailable = false): PdfTextExtractionService {
  if (forceUnavailable) return new UnavailablePdfExtractionService();
  return new PdfJsTextExtractionService();
}
