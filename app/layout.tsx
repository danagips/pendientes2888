import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Pendientes Rent2888",
  description: "Lista de pendientes del equipo de Rent2888",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Pendientes", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#161212" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <style>{`
          html, body { background: #f7f5f4; }
          @media (prefers-color-scheme: dark) { html, body { background: #161212; } }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
