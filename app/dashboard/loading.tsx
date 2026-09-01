export default function DashboardLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Vazirmatn, sans-serif", direction: "rtl" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 12, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>در حال بارگذاری داشبورد...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}
