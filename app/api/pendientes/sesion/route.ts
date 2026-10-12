import { esUsuario } from "@/lib/pendientes/permisos";
import { abrirSesion, cerrarSesion, json, usuarioActual, verificarPin } from "@/lib/pendientes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({ usuario: usuarioActual() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { usuario, pin } = body as { usuario?: unknown; pin?: unknown };
  // Pequeña demora fija para que adivinar PINs sea lento.
  await new Promise((r) => setTimeout(r, 600));
  if (!esUsuario(usuario) || typeof pin !== "string" || !verificarPin(usuario, pin.trim())) {
    return json({ error: "Nombre o PIN incorrecto." }, 401);
  }
  abrirSesion(usuario);
  return json({ usuario });
}

export async function DELETE() {
  cerrarSesion();
  return json({ ok: true });
}
