export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(iso: string, lang: "en" | "hi" = "en"): string {
  try {
    return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function relativeUrgency(dateIso: string): "overdue" | "urgent" | "upcoming" | "info" {
  const d = new Date(dateIso).getTime();
  const now = Date.now();
  const diffDays = (d - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "urgent";
  if (diffDays <= 14) return "upcoming";
  return "info";
}
