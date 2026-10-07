// Skeleton for a word entry while its data loads (#126). Streams first on a
// full page load, so a slow query shows the page's shape instead of a blank
// screen. Sized like the real header and tab bar so nothing jumps.

const BAR: React.CSSProperties = { background: "var(--bg-alt)", borderRadius: "4px" };

export default function WordLoading() {
  return (
    <div
      style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}
      aria-busy="true"
      aria-label="Loading entry"
    >
      <div className="animate-pulse">
        <div style={{ ...BAR, width: "7rem", height: "0.9rem", marginBottom: "2rem" }} />
        <div style={{ ...BAR, width: "11rem", height: "3.2rem", marginBottom: "0.75rem" }} />
        <div style={{ ...BAR, width: "6rem", height: "1rem", marginBottom: "0.75rem" }} />
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "2.5rem" }}>
          <div style={{ ...BAR, width: "13rem", height: "1.3rem" }} />
          <div style={{ ...BAR, width: "11rem", height: "1.3rem" }} />
        </div>
        <div style={{ borderBottom: "1px solid var(--border)", height: "2.9rem", marginBottom: "1.5rem" }} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "0.75rem", background: "white" }}
          >
            <div style={{ ...BAR, width: "40%", height: "0.85rem", marginBottom: "0.6rem" }} />
            <div style={{ ...BAR, width: "90%", height: "1.1rem", marginBottom: "0.4rem" }} />
            <div style={{ ...BAR, width: "70%", height: "1.1rem" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
