"use client";

export default function LPError({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      textAlign: "center",
      backgroundColor: "#f9fafb",
      fontFamily: "'Cairo', sans-serif",
    }}>
      <div style={{ fontSize: "64px", marginBottom: "16px" }}>😕</div>
      <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#111827", margin: "0 0 8px" }}>
        حدث خطأ
      </h1>
      <p style={{ color: "#6b7280", fontSize: "15px", margin: "0 0 24px" }}>
        لم نتمكن من تحميل الصفحة. يرجى المحاولة مجدداً.
      </p>
      <button
        onClick={reset}
        style={{
          backgroundColor: "#16a34a",
          color: "white",
          border: "none",
          borderRadius: "12px",
          padding: "14px 28px",
          fontSize: "16px",
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "'Cairo', sans-serif",
        }}
      >
        حاول مجدداً
      </button>
    </div>
  );
}
