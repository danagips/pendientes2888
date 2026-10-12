import {
  esAdmin, esArea, esPrioridad, esRecurrencia, puedeTildar, quienPuede,
  type Area, type Recurrencia,
} from "@/lib/pendientes/permisos";
import { db, json, usuarioActual } from "@/lib/pendientes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function hoyBA(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Próxima fecha tope de una tarea recurrente. */
function proximaFecha(rec: Recurrencia, desde: string | null): string {
  const base = new Date(`${desde && desde > hoyBA() ? desde : hoyBA()}T12:00:00Z`);
  if (rec === "semanal") base.setUTCDate(base.getUTCDate() + 7);
  else base.setUTCMonth(base.getUTCMonth() + 1);
  return base.toISOString().slice(0, 10);
}

// Tildar / poner en espera (según área) y, para admins, editar texto, prioridad, fecha, área, deptos y recurrencia.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  if (!UUID.test(params.id)) return json({ error: "Tarea inválida." }, 400);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const base = db();
  const { data: actual, error: e1 } = await base.from("pendientes").select("*").eq("id", params.id).single();
  if (e1 || !actual) return json({ error: "La tarea ya no existe." }, 404);
  const area = actual.area as Area;

  const cambios: Record<string, unknown> = {};
  const tilda = "hecho" in b || "esperando" in b;
  if (tilda && !puedeTildar(usuario, area)) {
    return json({ error: `${quienPuede(area)} puede tildar o pausar las tareas de esta área.` }, 403);
  }
  if ("hecho" in b) {
    if (typeof b.hecho !== "boolean") return json({ error: "Valor inválido." }, 400);
    cambios.hecho = b.hecho;
    cambios.hecho_por = b.hecho ? usuario : null;
    cambios.hecho_en = b.hecho ? new Date().toISOString() : null;
    if (b.hecho) cambios.esperando = null;
  }
  if ("esperando" in b) {
    const e = typeof b.esperando === "string" ? b.esperando.trim().slice(0, 120) : "";
    cambios.esperando = e || null;
  }

  const edita = ["texto", "prioridad", "fecha_tope", "area", "detalle", "deptos", "recurrencia"].some((k) => k in b);
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
      if (b.fecha_tope !== null && !(typeof b.fecha_tope === "string" && FECHA.test(b.fecha_tope))) {
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
    if ("deptos" in b) {
      if (!Array.isArray(b.deptos)) return json({ error: "Deptos inválidos." }, 400);
      cambios.deptos = b.deptos.filter((x): x is string => typeof x === "string" && x.length <= 40).slice(0, 20);
    }
    if ("recurrencia" in b) {
      if (b.recurrencia !== null && !esRecurrencia(b.recurrencia)) return json({ error: "Repetición inválida." }, 400);
      cambios.recurrencia = b.recurrencia;
    }
  }

  if (!Object.keys(cambios).length) return json({ error: "No hay cambios." }, 400);
  const { data, error } = await base.from("pendientes").update(cambios).eq("id", params.id).select().single();
  if (error) return json({ error: "No se pudo guardar el cambio." }, 500);

  // Tarea recurrente completada: se crea la próxima.
  let nueva = null;
  if (b.hecho === true && !actual.hecho && actual.recurrencia) {
    const { data: n } = await base
      .from("pendientes")
      .insert({
        area: actual.area, texto: actual.texto, detalle: actual.detalle, prioridad: actual.prioridad,
        deptos: actual.deptos, recurrencia: actual.recurrencia, orden: actual.orden,
        fecha_tope: proximaFecha(actual.recurrencia, actual.fecha_tope),
        creado_por: usuario, origen: "recurrente",
      })
      .select()
      .single();
    nueva = n;
  }
  return json({ tarea: data, nueva });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  if (!esAdmin(usuario)) return json({ error: "Solo Dana, Nico y Brico pueden borrar tareas." }, 403);
  if (!UUID.test(params.id)) return json({ error: "Tarea inválida." }, 400);
  const base = db();
  const { data } = await base.from("pendientes").select("fotos").eq("id", params.id).single();
  const { error } = await base.from("pendientes").delete().eq("id", params.id);
  if (error) return json({ error: "No se pudo borrar." }, 500);
  if (data?.fotos?.length) await base.storage.from("pendientes").remove(data.fotos);
  return json({ ok: true });
}
