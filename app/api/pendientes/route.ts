import { esArea, esPrioridad, esRecurrencia } from "@/lib/pendientes/permisos";
import { detectarDeptos, type Depto } from "@/lib/pendientes/deptos";
import { db, json, usuarioActual } from "@/lib/pendientes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista: todo lo pendiente + lo hecho en los últimos 7 días, más la tabla de deptos.
export async function GET() {
  const usuario = usuarioActual();
  if (!usuario) return json({ error: "Entrá con tu PIN." }, 401);
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const base = db();
  const [t, d] = await Promise.all([
    base.from("pendientes").select("*").or(`hecho.eq.false,hecho_en.gte.${desde}`).order("orden").limit(1000),
    base.from("deptos").select("codigo, alias, direccion, unidad, barrio, tipo").eq("activo", true).order("codigo"),
  ]);
  if (t.error) return json({ error: "No se pudo leer la lista." }, 500);
  return json({ usuario, tareas: t.data, deptos: d.data ?? [] });
}

// Alta: cualquiera del equipo puede agregar una tarea en cualquier área.
// Si no se eligen deptos, se detectan solos en el texto.
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
  const recurrencia = esRecurrencia(b.recurrencia) ? b.recurrencia : null;

  const base = db();
  let deptos: string[] = Array.isArray(b.deptos) ? b.deptos.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  if (!deptos.length) {
    const { data } = await base.from("deptos").select("codigo, alias").eq("activo", true);
    deptos = detectarDeptos(`${texto} ${detalle ?? ""}`, (data ?? []) as Pick<Depto, "codigo" | "alias">[]);
  }

  const { data, error } = await base
    .from("pendientes")
    .insert({
      area: b.area, texto, detalle, prioridad, fecha_tope, recurrencia, deptos,
      creado_por: usuario, origen: "manual", orden: Date.now() % 2_000_000_000,
    })
    .select()
    .single();
  if (error) return json({ error: "No se pudo guardar la tarea." }, 500);
  return json({ tarea: data }, 201);
}
