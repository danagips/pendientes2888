import crypto from "node:crypto";
import { puedeTildar, quienPuede, type Area } from "@/lib/pendientes/permisos";
import { db, json, usuarioActual } from "@/lib/pendientes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 5 * 1024 * 1024;
const MAX_FOTOS = 6;

// Subir una foto a la tarea (quien puede tildarla). Body: multipart con campo "foto".
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  if (!UUID.test(params.id)) return json({ error: "Tarea inválida." }, 400);

  const base = db();
  const { data: t } = await base.from("pendientes").select("area, fotos").eq("id", params.id).single();
  if (!t) return json({ error: "La tarea ya no existe." }, 404);
  if (!puedeTildar(usuario, t.area as Area)) {
    return json({ error: `${quienPuede(t.area as Area)} puede subir fotos a esta área.` }, 403);
  }
  if ((t.fotos ?? []).length >= MAX_FOTOS) return json({ error: `Máximo ${MAX_FOTOS} fotos por tarea.` }, 400);

  const form = await req.formData().catch(() => null);
  const file = form?.get("foto");
  if (!(file instanceof File)) return json({ error: "Elegí una foto." }, 400);
  const ext = TIPOS[file.type];
  if (!ext) return json({ error: "La foto tiene que ser JPG, PNG o WEBP." }, 400);
  if (file.size > MAX) return json({ error: "La foto pesa más de 5 MB." }, 400);

  const ruta = `${params.id}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const up = await base.storage.from("pendientes").upload(ruta, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
  });
  if (up.error) return json({ error: "No se pudo subir la foto." }, 500);

  const fotos = [...(t.fotos ?? []), ruta];
  const { data, error } = await base.from("pendientes").update({ fotos }).eq("id", params.id).select().single();
  if (error) return json({ error: "No se pudo guardar la foto." }, 500);
  return json({ tarea: data }, 201);
}

// Ver una foto: redirige a un link firmado de 10 minutos.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  const ruta = new URL(req.url).searchParams.get("ruta") ?? "";
  if (!UUID.test(params.id) || !ruta.startsWith(`${params.id}/`) || ruta.includes("..")) {
    return json({ error: "Foto inválida." }, 400);
  }
  const { data, error } = await db().storage.from("pendientes").createSignedUrl(ruta, 600);
  if (error || !data) return json({ error: "No se encontró la foto." }, 404);
  return Response.redirect(data.signedUrl, 302);
}
