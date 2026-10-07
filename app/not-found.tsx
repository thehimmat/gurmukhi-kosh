// Site-wide not-found page (#126), in the site's own layout instead of
// Next's default black-on-white 404.
export default function NotFound() {
  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>Page not found</h1>
      <p style={{ marginBottom: "1.5rem" }}>Nothing lives at this address.</p>
      <ul style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.95rem", lineHeight: 2, paddingLeft: "1.2rem", margin: 0, listStyle: "disc" }}>
        <li><a href="/">Search Gurbani or the dictionary</a></li>
        <li><a href="/browse">Browse every word by frequency</a></li>
      </ul>
    </div>
  );
}
