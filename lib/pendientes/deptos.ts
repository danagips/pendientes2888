// Departamentos y edificios: detección en el texto de las tareas y orden del recorrido.
// Sin datos: las direcciones viven en la tabla `deptos` de Supabase, no en el repo.

export type Depto = {
  codigo: string;
  alias: string[];
  direccion: string; // calle y altura, ej. "Montañeses 2888"
  unidad: string | null; // ej. "1A", "Piso 3 Depto B"
  barrio: string | null;
  tipo: "depto" | "edificio";
};

/**
 * Orden aproximado de barrios para armar el recorrido: de norte a sur y de oeste
 * a centro, para que las paradas cercanas queden juntas. Los que no estén van al final.
 */
export const BARRIO_ORDEN = [
  "SAAVEDRA",
  "VILLA URQUIZA",
  "NUÑEZ",
  "BELGRANO",
  "PALERMO",
  "VILLA CRESPO",
  "PATERNAL",
  "CABALLITO",
  "ALMAGRO",
  "RECOLETA/ ALMAGRO",
  "RECOLETA",
  "BALVANERA",
  "CENTRO",
];

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Devuelve los códigos de deptos mencionados en el texto (sin repetir, en orden de aparición). */
export function detectarDeptos(texto: string, deptos: Pick<Depto, "codigo" | "alias">[]): string[] {
  const t = sinAcentos(texto).toLowerCase();
  const hallados: { codigo: string; pos: number }[] = [];
  for (const d of deptos) {
    let mejor = -1;
    for (const a of [d.codigo, ...d.alias]) {
      const re = new RegExp(`(^|[^a-z0-9])${escapar(sinAcentos(a).toLowerCase())}(?![a-z0-9])`);
      const m = re.exec(t);
      if (m) {
        const pos = m.index + m[1].length;
        if (mejor === -1 || pos < mejor) mejor = pos;
      }
    }
    if (mejor >= 0) hallados.push({ codigo: d.codigo, pos: mejor });
  }
  return hallados.sort((a, b) => a.pos - b.pos).map((h) => h.codigo);
}

export function indiceBarrio(barrio: string | null): number {
  const i = barrio ? BARRIO_ORDEN.indexOf(barrio.toUpperCase()) : -1;
  return i === -1 ? BARRIO_ORDEN.length : i;
}

/** Links de Google Maps con hasta 9 paradas cada uno, saliendo de donde esté el teléfono. */
export function linksMaps(direcciones: string[], porTramo = 9): string[] {
  const out: string[] = [];
  for (let i = 0; i < direcciones.length; i += porTramo) {
    const tramo = direcciones.slice(i, i + porTramo).map((d) => encodeURIComponent(`${d}, CABA, Argentina`));
    out.push(`https://www.google.com/maps/dir//${tramo.join("/")}`);
  }
  return out;
}
