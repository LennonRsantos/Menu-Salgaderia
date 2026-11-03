"use client";

// Replaces the root layout when it fails, so it brings its own document and
// plain inline styles (global CSS and the theme are not loaded here).
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#ece6d6", color: "#141210" }}>
        <title>Algo deu errado · Menu</title>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Algo deu errado</h1>
          <p style={{ margin: "0 0 20px", color: "#625a4c" }}>Não conseguimos abrir o site agora. Tente de novo em instantes.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ border: 0, borderRadius: 8, padding: "12px 20px", background: "#6b2c7a", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
