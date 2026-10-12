import { esArea, esPrioridad } from "@/lib/pendientes/permisos";
import { db, json, usuarioActual } from "@/lib/pendientes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista: todo lo pendiente + lo hecho en los últimos 7 días (para ver qué se resolvió).
export async function GET() {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("pendientes")
    .select("*")
    .or(`hecho.eq.false,hecho_en.gte.${desde}`)
    .order("orden", { ascending: true })
    .limit(1000);
  if (error) return json({ error: "No se pudo leer la lista." }, 500);
  return json({ usuario, tareas: data });
}

// Alta: cualquiera del equipo puede agregar una tarea en cualquier área.
export async function POST(req: Request) {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const texto = typeof b.texto === "string" ? b.texto.trim() : "";
  if (!texto || texto.length > 500) return json({ error: "Escribí la tarea (hasta 500 caracteres)." }, 400);
  if (!esArea(b.area)) return json({ error: "Elegí un área." }, 400);
  const prioridad = esPrioridad(b.prioridad) ? b.prioridad : "normal";
  const fecha_tope = typeof b.fecha_tope === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha_tope) ? b.fecha_tope : null;
  const detalle = typeof b.detalle === "string" && b.detalle.trim() ? b.detalle.trim().slice(0, 80) : null;

  const { data, error } = await db()
    .from("pendientes")
    .insert({ area: b.area, texto, detalle, prioridad, fecha_tope, creado_por: usuario, origen: "manual", orden: Date.now() % 2_000_000_000 })
    .select()
    .single();
  if (error) return json({ error: "No se pudo guardar la tarea." }, 500);
  return json({ tarea: data }, 201);
}
