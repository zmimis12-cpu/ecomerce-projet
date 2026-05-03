export default function LPLoading() {
  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f9fafb",
      fontFamily: "'Cairo', sans-serif",
    }}>
      {/* Urgency bar skeleton */}
      <div style={{ backgroundColor: "#dc2626", height: "40px" }} />

      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "24px 16px" }}>
        {/* Image skeleton */}
        <div style={{
          width: "100%", aspectRatio: "1/1",
          borderRadius: "16px",
          backgroundColor: "#e5e7eb",
          marginBottom: "20px",
          animation: "pulse 1.5s ease-in-out infinite",
        }} />

        {/* Text skeletons */}
        {[80, 60, 40].map((w, i) => (
          <div key={i} style={{
            height: "18px",
            width: `${w}%`,
            backgroundColor: "#e5e7eb",
            borderRadius: "8px",
            margin: "0 auto 12px",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        ))}

        {/* Button skeleton */}
        <div style={{
          height: "56px",
          borderRadius: "16px",
          backgroundColor: "#dcfce7",
          animation: "pulse 1.5s ease-in-out infinite",
        }} />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
