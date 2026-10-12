// Quién puede tildar qué. Esta es la única fuente de verdad: la API la aplica
// en el servidor y la página la usa solo para deshabilitar casillas.

export const USUARIOS = ["dana", "brico", "nico", "tami", "vero"] as const;
export type Usuario = (typeof USUARIOS)[number];

export const NOMBRES: Record<Usuario, string> = {
  dana: "Dana",
  brico: "Brico",
  nico: "Nico",
  tami: "Tami",
  vero: "Vero",
};

/** Pueden tildar todo, editar y borrar. */
export const ADMINS: readonly Usuario[] = ["dana", "nico", "brico"];

export const AREAS = [
  "general",
  "nico",
  "tami",
  "vero",
  "cadeteria",
  "mantenimiento",
  "compras",
  "dptos_nuevos",
  "costa_rica",
  "liquidaciones",
] as const;
export type Area = (typeof AREAS)[number];

export const AREA_NOMBRE: Record<Area, string> = {
  general: "General",
  nico: "Nico",
  tami: "Tami",
  vero: "Vero",
  cadeteria: "Cadetería",
  mantenimiento: "Mantenimiento",
  compras: "Compras",
  dptos_nuevos: "Dptos nuevos",
  costa_rica: "Costa Rica",
  liquidaciones: "Liquidaciones",
};

/** "todos" = cualquier persona del equipo. Los admins pueden siempre. */
export const QUIEN_TILDA: Record<Area, "todos" | readonly Usuario[]> = {
  general: "todos",
  nico: ["nico"],
  tami: ["tami"],
  vero: ["vero"],
  cadeteria: ["vero", "tami", "nico"],
  mantenimiento: ["vero", "tami", "nico"],
  compras: "todos",
  dptos_nuevos: "todos",
  costa_rica: "todos",
  liquidaciones: "todos",
};

export const PRIORIDADES = ["urgente", "alta", "normal"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export function esUsuario(v: unknown): v is Usuario {
  return typeof v === "string" && (USUARIOS as readonly string[]).includes(v);
}
export function esArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}
export function esPrioridad(v: unknown): v is Prioridad {
  return typeof v === "string" && (PRIORIDADES as readonly string[]).includes(v);
}

export function esAdmin(u: Usuario): boolean {
  return ADMINS.includes(u);
}

export function puedeTildar(u: Usuario, area: Area): boolean {
  if (esAdmin(u)) return true;
  const q = QUIEN_TILDA[area];
  return q === "todos" || q.includes(u);
}

/** Texto para mostrar cuando alguien no puede tildar. */
export function quienPuede(area: Area): string {
  const q = QUIEN_TILDA[area];
  if (q === "todos") return "Todo el equipo";
  const nombres = q.map((u) => NOMBRES[u]);
  return nombres.length === 1
    ? `Solo ${nombres[0]}`
    : nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
}

/** Las tareas que "son de" alguien, para el filtro Mis tareas. */
export function esMia(u: Usuario, area: Area): boolean {
  const q = QUIEN_TILDA[area];
  return q !== "todos" && q.includes(u);
}

export type Pendiente = {
  id: string;
  area: Area;
  texto: string;
  detalle: string | null;
  prioridad: Prioridad;
  fecha_tope: string | null;
  hecho: boolean;
  hecho_por: string | null;
  hecho_en: string | null;
  creado_por: string | null;
  creado_en: string;
  orden: number;
};
