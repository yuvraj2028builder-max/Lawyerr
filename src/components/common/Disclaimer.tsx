import { useLanguage } from "@/context/LanguageContext";

export function Disclaimer({ variant = "default" }: { variant?: "default" | "compact" }) {
  const { t } = useLanguage();
  if (variant === "compact") {
    return (
      <p className="tiny muted" style={{ lineHeight: 1.5, maxWidth: 640 }}>
        {t("disclaimer")}
      </p>
    );
  }
  return (
    <div
      role="note"
      style={{
        background: "#fffbeb",
        border: "1px solid #fcd34d",
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
      <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
        {t("disclaimer")}
      </p>
    </div>
  );
}
