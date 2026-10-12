import {
  esAdmin, esArea, esPrioridad, puedeTildar, quienPuede, type Area,
} from "@/lib/pendientes/permisos";
import { db, json, usuarioActual } from "@/lib/pendientes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// Tildar/destildar (según área) y, para admins, editar texto, prioridad, fecha y área.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  if (!UUID.test(params.id)) return json({ error: "Tarea inválida." }, 400);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const base = db();
  const { data: actual, error: e1 } = await base.from("pendientes").select("area").eq("id", params.id).single();
  if (e1 || !actual) return json({ error: "La tarea ya no existe." }, 404);
  const area = actual.area as Area;

  const cambios: Record<string, unknown> = {};

  if ("hecho" in b) {
    if (typeof b.hecho !== "boolean") return json({ error: "Valor inválido." }, 400);
    if (!puedeTildar(usuario, area)) {
      return json({ error: `${quienPuede(area)} puede tildar las tareas de esta área.` }, 403);
    }
    cambios.hecho = b.hecho;
    cambios.hecho_por = b.hecho ? usuario : null;
    cambios.hecho_en = b.hecho ? new Date().toISOString() : null;
  }

  const edita = ["texto", "prioridad", "fecha_tope", "area", "detalle"].some((k) => k in b);
  if (edita) {
    if (!esAdmin(usuario)) return json({ error: "Solo Dana, Nico y Brico pueden editar tareas." }, 403);
    if ("texto" in b) {
      const t = typeof b.texto === "string" ? b.texto.trim() : "";
      if (!t || t.length > 500) return json({ error: "El texto no puede quedar vacío." }, 400);
      cambios.texto = t;
    }
    if ("prioridad" in b) {
      if (!esPrioridad(b.prioridad)) return json({ error: "Prioridad inválida." }, 400);
      cambios.prioridad = b.prioridad;
    }
    if ("fecha_tope" in b) {
      if (b.fecha_tope !== null && !(typeof b.fecha_tope === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha_tope))) {
        return json({ error: "Fecha inválida." }, 400);
      }
      cambios.fecha_tope = b.fecha_tope;
    }
    if ("area" in b) {
      if (!esArea(b.area)) return json({ error: "Área inválida." }, 400);
      cambios.area = b.area;
    }
    if ("detalle" in b) {
      cambios.detalle = typeof b.detalle === "string" && b.detalle.trim() ? b.detalle.trim().slice(0, 80) : null;
    }
  }

  if (!Object.keys(cambios).length) return json({ error: "No hay cambios." }, 400);
  const { data, error } = await base.from("pendientes").update(cambios).eq("id", params.id).select().single();
  if (error) return json({ error: "No se pudo guardar el cambio." }, 500);
  return json({ tarea: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  if (!esAdmin(usuario)) return json({ error: "Solo Dana, Nico y Brico pueden borrar tareas." }, 403);
  if (!UUID.test(params.id)) return json({ error: "Tarea inválida." }, 400);
  const { error } = await db().from("pendientes").delete().eq("id", params.id);
  if (error) return json({ error: "No se pudo borrar." }, 500);
  return json({ ok: true });
}
