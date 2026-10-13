"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AREAS, AREA_NOMBRE, AREAS_RECORRIDO, DIAS_ESTANCADA, NOMBRES, PRIORIDADES, RECURRENCIAS, USUARIOS,
  esAdmin, esMia, puedeTildar, quienPuede,
  type Area, type Pendiente, type Prioridad, type Recurrencia, type Usuario,
} from "@/lib/pendientes/permisos";
import { indiceBarrio, linksMaps, type Depto } from "@/lib/pendientes/deptos";
import s from "./pendientes.module.css";

type Filtro = "todas" | "mias" | "urgentes" | "estancadas" | "espera" | Area;
type Vista = "lista" | "recorrido";

const PRIO_PESO: Record<Prioridad, number> = { urgente: 0, alta: 1, normal: 2 };
const PRIO_TXT: Record<Prioridad, string> = { urgente: "Urgente", alta: "Importante", normal: "Normal" };
const REC_TXT: Record<Recurrencia, string> = { semanal: "Cada semana", mensual: "Cada mes" };

function hoyISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function fechaHecho(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}
function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function haceTxt(d: number): string {
  return d <= 0 ? "de hoy" : d === 1 ? "de ayer" : `hace ${d} días`;
}
function estancada(t: Pendiente): boolean {
  return !t.hecho && !t.esperando && diasDesde(t.creado_en) > DIAS_ESTANCADA;
}
function urgenteOVencida(t: Pendiente, hoy: string): boolean {
  return !t.hecho && !t.esperando && (t.prioridad === "urgente" || (!!t.fecha_tope && t.fecha_tope <= hoy));
}
function nombreDepto(d: Depto | undefined, codigo: string): string {
  if (!d) return codigo;
  if (d.tipo === "edificio") return d.alias[0] ?? codigo;
  return /^Z[A-Z]/.test(d.codigo) ? d.codigo.slice(1) : d.codigo;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" };
  const r = await fetch(url, { ...init, headers, cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error ?? "Algo falló."), { status: r.status });
  return body as T;
}

/** Achica la foto en el teléfono antes de subirla (lado mayor 1600 px, JPG). */
async function achicar(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
}

export default function PendientesPage() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [tareas, setTareas] = useState<Pendiente[]>([]);
  const [deptos, setDeptos] = useState<Depto[]>([]);
  const [vista, setVista] = useState<Vista>("lista");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [verHechas, setVerHechas] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ usuario: Usuario; tareas: Pendiente[]; deptos: Depto[] }>("/api/pendientes");
      setUsuario(r.usuario);
      setTareas(r.tareas);
      setDeptos(r.deptos);
    } catch (e) {
      if ((e as { status?: number }).status === 401) setUsuario(null);
      else setAviso((e as Error).message);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30_000);
    const onFocus = () => cargar();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [cargar]);

  const deptoPorCodigo = useMemo(() => new Map(deptos.map((d) => [d.codigo, d])), [deptos]);
  const hoy = hoyISO();

  const reemplazar = useCallback((t: Pendiente, nueva?: Pendiente | null) => {
    setTareas((ts) => {
      const out = ts.map((x) => (x.id === t.id ? t : x));
      return nueva ? [...out, nueva] : out;
    });
  }, []);

  const acciones: Acciones = {
    async tildar(t) {
      const nuevo = !t.hecho;
      reemplazar({ ...t, hecho: nuevo, hecho_por: nuevo ? usuario! : null, hecho_en: nuevo ? new Date().toISOString() : null });
      try {
        const r = await api<{ tarea: Pendiente; nueva: Pendiente | null }>(`/api/pendientes/${t.id}`, { method: "PATCH", body: JSON.stringify({ hecho: nuevo }) });
        reemplazar(r.tarea, r.nueva);
        if (r.nueva) setAviso(`Listo. Como se repite, ya quedó creada la próxima para el ${fechaCorta(r.nueva.fecha_tope!)}.`);
      } catch (e) { reemplazar(t); setAviso((e as Error).message); }
    },
    async cambiar(t, cambios) {
      try {
        const r = await api<{ tarea: Pendiente }>(`/api/pendientes/${t.id}`, { method: "PATCH", body: JSON.stringify(cambios) });
        reemplazar(r.tarea);
      } catch (e) { setAviso((e as Error).message); }
    },
    async borrar(t) {
      try {
        await api(`/api/pendientes/${t.id}`, { method: "DELETE" });
        setTareas((ts) => ts.filter((x) => x.id !== t.id));
      } catch (e) { setAviso((e as Error).message); }
    },
    async subirFoto(t, file) {
      try {
        const fd = new FormData();
        fd.append("foto", await achicar(file), "foto.jpg");
        const r = await api<{ tarea: Pendiente }>(`/api/pendientes/${t.id}/foto`, { method: "POST", body: fd });
        reemplazar(r.tarea);
      } catch (e) { setAviso((e as Error).message); }
    },
  };

  if (usuario === undefined) return <main className={s.page}><p className={s.vacio}>Cargando pendientes…</p></main>;
  if (usuario === null) return <Login onOk={(u) => { setUsuario(u); cargar(); }} />;

  const abiertas = tareas.filter((t) => !t.hecho);
  const ctx: Ctx = { usuario, hoy, deptoPorCodigo, acciones };

  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <h1 className={s.titulo}>Pendientes</h1>
          <p className={s.sub}>
            {abiertas.filter((t) => !t.esperando).length} activas · {abiertas.filter((t) => urgenteOVencida(t, hoy)).length} urgentes o vencidas · {abiertas.filter(estancada).length} estancadas
          </p>
        </div>
        <div className={s.yo}>
          <span>{NOMBRES[usuario]}</span>
          <button className={s.link} onClick={async () => { await api("/api/pendientes/sesion", { method: "DELETE" }); setUsuario(null); }}>
            Salir
          </button>
        </div>
      </header>

      <div className={s.tabs} role="tablist">
        <button role="tab" aria-selected={vista === "lista"} className={s.tab} onClick={() => setVista("lista")}>Lista</button>
        <button role="tab" aria-selected={vista === "recorrido"} className={s.tab} onClick={() => setVista("recorrido")}>Recorrido del día</button>
      </div>

      {aviso && (
        <div className={s.aviso} role="status">
          {aviso} <button className={s.link} onClick={() => setAviso(null)}>Cerrar</button>
        </div>
      )}

      {vista === "lista" ? (
        <Lista tareas={tareas} filtro={filtro} setFiltro={setFiltro} verHechas={verHechas} setVerHechas={setVerHechas}
          ctx={ctx} deptos={deptos} onCreada={(t) => setTareas((ts) => [...ts, t])} onError={setAviso} />
      ) : (
        <Recorrido tareas={tareas} ctx={ctx} />
      )}
    </main>
  );
}

type Acciones = {
  tildar: (t: Pendiente) => Promise<void>;
  cambiar: (t: Pendiente, c: Partial<Pendiente>) => Promise<void>;
  borrar: (t: Pendiente) => Promise<void>;
  subirFoto: (t: Pendiente, f: File) => Promise<void>;
};
type Ctx = { usuario: Usuario; hoy: string; deptoPorCodigo: Map<string, Depto>; acciones: Acciones };

function ordenar(a: Pendiente, b: Pendiente): number {
  return (
    Number(a.hecho) - Number(b.hecho) ||
    Number(!!a.esperando) - Number(!!b.esperando) ||
    PRIO_PESO[a.prioridad] - PRIO_PESO[b.prioridad] ||
    (a.fecha_tope ?? "9999").localeCompare(b.fecha_tope ?? "9999") ||
    (a.detalle ?? "").localeCompare(b.detalle ?? "") ||
    a.orden - b.orden
  );
}

function Lista(p: {
  tareas: Pendiente[]; filtro: Filtro; setFiltro: (f: Filtro) => void; verHechas: boolean; setVerHechas: (v: boolean) => void;
  ctx: Ctx; deptos: Depto[]; onCreada: (t: Pendiente) => void; onError: (m: string) => void;
}) {
  const { tareas, filtro, ctx } = p;
  const { usuario, hoy } = ctx;

  const conteo = useMemo(() => {
    const c: Record<string, number> = { todas: 0, mias: 0, urgentes: 0, estancadas: 0, espera: 0 };
    for (const t of tareas) {
      if (t.hecho) continue;
      if (t.esperando) { c.espera++; continue; }
      c.todas++;
      c[t.area] = (c[t.area] ?? 0) + 1;
      if (esMia(usuario, t.area)) c.mias++;
      if (urgenteOVencida(t, hoy)) c.urgentes++;
      if (estancada(t)) c.estancadas++;
    }
    return c;
  }, [tareas, usuario, hoy]);

  const grupos = useMemo(() => {
    const visibles = tareas.filter((t) => {
      if (!p.verHechas && t.hecho) return false;
      switch (filtro) {
        case "todas": return true;
        case "mias": return esMia(usuario, t.area);
        case "urgentes": return urgenteOVencida(t, hoy);
        case "estancadas": return estancada(t);
        case "espera": return !t.hecho && !!t.esperando;
        default: return t.area === filtro;
      }
    });
    visibles.sort(ordenar);
    return AREAS.map((area) => ({ area, items: visibles.filter((t) => t.area === area) })).filter((g) => g.items.length);
  }, [tareas, filtro, p.verHechas, usuario, hoy]);

  const chips: { id: Filtro; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "mias", label: "Mis tareas" },
    { id: "urgentes", label: "Urgentes y vencidas" },
    { id: "estancadas", label: `Estancadas (+${DIAS_ESTANCADA} días)` },
    { id: "espera", label: "En espera" },
    ...AREAS.map((a) => ({ id: a as Filtro, label: AREA_NOMBRE[a] })),
  ];

  return (
    <>
      <nav className={s.barra} aria-label="Filtrar">
        {chips.map((c) => (
          <button key={c.id} className={s.chip} aria-pressed={filtro === c.id} onClick={() => p.setFiltro(c.id)}>
            {c.label}
            <span className={s.chipN}>{conteo[c.id] ?? 0}</span>
          </button>
        ))}
      </nav>

      <NuevaTarea filtro={filtro} deptos={p.deptos} onCreada={p.onCreada} onError={p.onError} />

      <label className={s.toggle}>
        <input type="checkbox" checked={p.verHechas} onChange={(e) => p.setVerHechas(e.target.checked)} />
        Mostrar lo hecho en los últimos 7 días
      </label>

      {!grupos.length && <p className={s.vacio}>No hay tareas en esta vista.</p>}

      {grupos.map(({ area, items }) => (
        <section key={area} className={s.area}>
          <div className={s.areaH}>
            <h2>{AREA_NOMBRE[area]}</h2>
            <span>{items.filter((t) => !t.hecho && !t.esperando).length} activas · tilda: {quienPuede(area)}</span>
          </div>
          <ul className={s.lista}>
            {items.map((t) => <Item key={t.id} t={t} ctx={ctx} deptos={p.deptos} />)}
          </ul>
        </section>
      ))}
    </>
  );
}

function Item({ t, ctx, deptos, sinDeptos }: { t: Pendiente; ctx: Ctx; deptos?: Depto[]; sinDeptos?: boolean }) {
  const { usuario, hoy, deptoPorCodigo, acciones } = ctx;
  const [abierto, setAbierto] = useState(false);
  const [pausando, setPausando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const puede = puedeTildar(usuario, t.area);
  const admin = esAdmin(usuario);
  const vencida = !t.hecho && t.fecha_tope && t.fecha_tope < hoy;
  const esHoy = !t.hecho && t.fecha_tope === hoy;
  const dias = diasDesde(t.creado_en);
  const clase = [s.item, t.hecho ? s.hecho : "", t.esperando && !t.hecho ? s.espera : "",
    !t.hecho && !t.esperando && t.prioridad !== "normal" ? s[t.prioridad] : ""].join(" ");

  return (
    <li className={clase}>
      <input type="checkbox" id={`t-${t.id}`} className={s.check} checked={t.hecho} disabled={!puede}
        title={puede ? "Marcar como hecha" : `${quienPuede(t.area)} puede tildar esto`} onChange={() => acciones.tildar(t)} />
      <div className={s.cuerpo}>
        <label htmlFor={`t-${t.id}`} className={s.tags}>
          {t.prioridad !== "normal" && <span className={`${s.tag} ${s["tag_" + t.prioridad]}`}>{PRIO_TXT[t.prioridad]}</span>}
          {t.fecha_tope && (
            <span className={`${s.tag} ${vencida ? s.tag_vencida : esHoy ? s.tag_hoy : s.tag_fecha}`}>
              {vencida ? "Vencida " : esHoy ? "Hoy " : "Hasta "}{fechaCorta(t.fecha_tope)}
            </span>
          )}
          {estancada(t) && <span className={`${s.tag} ${s.tag_vieja}`}>Estancada</span>}
          {t.recurrencia && <span className={`${s.tag} ${s.tag_fecha}`}>{REC_TXT[t.recurrencia]}</span>}
          {t.detalle && <span className={`${s.tag} ${s.tag_det}`}>{t.detalle}</span>}
          {!sinDeptos && t.deptos.map((c) => (
            <span key={c} className={`${s.tag} ${s.tag_depto}`} title={deptoPorCodigo.get(c) ? `${deptoPorCodigo.get(c)!.direccion} ${deptoPorCodigo.get(c)!.unidad ?? ""}` : c}>
              {nombreDepto(deptoPorCodigo.get(c), c)}
            </span>
          ))}
        </label>
        <label htmlFor={`t-${t.id}`} className={s.texto}>{t.texto}</label>
        {t.esperando && !t.hecho && <span className={s.esperaTxt}>En espera: {t.esperando}</span>}
        <span className={s.meta}>
          {t.hecho && t.hecho_por && t.hecho_en
            ? `Hecho por ${NOMBRES[t.hecho_por as Usuario] ?? t.hecho_por} el ${fechaHecho(t.hecho_en)}`
            : `Cargada ${haceTxt(dias)}`}
        </span>
        {t.fotos.length > 0 && (
          <span className={s.fotos}>
            {t.fotos.map((f, i) => (
              <a key={f} href={`/api/pendientes/${t.id}/foto?ruta=${encodeURIComponent(f)}`} target="_blank" rel="noreferrer">Foto {i + 1}</a>
            ))}
          </span>
        )}
        {puede && !t.hecho && (
          <div className={s.acciones}>
            {t.esperando ? (
              <button className={s.mini} onClick={() => acciones.cambiar(t, { esperando: null })}>Reanudar</button>
            ) : pausando ? (
              <form className={s.fila} onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) { acciones.cambiar(t, { esperando: motivo }); setPausando(false); setMotivo(""); } }}>
                <input id={`esp-${t.id}`} className={s.input} placeholder="¿Esperando qué? Ej: que llegue el repuesto" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                <button className={s.mini}>Poner en espera</button>
                <button type="button" className={s.link} onClick={() => setPausando(false)}>Cancelar</button>
              </form>
            ) : (
              <button className={s.mini} onClick={() => setPausando(true)}>En espera</button>
            )}
            <button className={s.mini} disabled={subiendo} onClick={() => fileRef.current?.click()}>
              {subiendo ? "Subiendo…" : "Agregar foto"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setSubiendo(true); await acciones.subirFoto(t, f); setSubiendo(false); } }} />
          </div>
        )}
      </div>
      {admin && (
        <button className={s.mas} aria-label="Editar tarea" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>⋯</button>
      )}
      {admin && abierto && <Editor t={t} deptos={deptos ?? []} ctx={ctx} />}
    </li>
  );
}

function Recorrido({ tareas, ctx }: { tareas: Pendiente[]; ctx: Ctx }) {
  const [area, setArea] = useState<Area | "ambas">("cadeteria");
  const [soloPrioridad, setSoloPrioridad] = useState(false);
  const { deptoPorCodigo, hoy } = ctx;

  const { paradas, sinDir } = useMemo(() => {
    const abiertas = tareas
      .filter((t) => !t.hecho && !t.esperando)
      .filter((t) => (area === "ambas" ? AREAS_RECORRIDO.includes(t.area) : t.area === area))
      .filter((t) => !soloPrioridad || t.prioridad !== "normal" || (t.fecha_tope && t.fecha_tope <= hoy))
      .sort(ordenar);
    const porDir = new Map<string, { direccion: string; barrio: string | null; unidades: Set<string>; tareas: Pendiente[] }>();
    const sinDir: Pendiente[] = [];
    for (const t of abiertas) {
      const ds = t.deptos.map((c) => deptoPorCodigo.get(c)).filter((d): d is Depto => !!d);
      if (!ds.length) { sinDir.push(t); continue; }
      for (const d of ds) {
        const p = porDir.get(d.direccion) ?? { direccion: d.direccion, barrio: d.barrio, unidades: new Set<string>(), tareas: [] };
        if (d.tipo === "depto") p.unidades.add(`${nombreDepto(d, d.codigo)}${d.unidad ? ` (${d.unidad})` : ""}`);
        if (!p.tareas.includes(t)) p.tareas.push(t);
        porDir.set(d.direccion, p);
      }
    }
    const paradas = [...porDir.values()].sort(
      (a, b) => indiceBarrio(a.barrio) - indiceBarrio(b.barrio) || a.direccion.localeCompare(b.direccion),
    );
    return { paradas, sinDir };
  }, [tareas, area, soloPrioridad, deptoPorCodigo, hoy]);

  const links = linksMaps(paradas.map((p) => p.direccion));

  return (
    <>
      <div className={s.recCtrl}>
        <div className={s.fila}>
          {(["cadeteria", "mantenimiento", "ambas"] as const).map((a) => (
            <button key={a} className={s.chip} aria-pressed={area === a} onClick={() => setArea(a)}>
              {a === "ambas" ? "Las dos" : AREA_NOMBRE[a]}
            </button>
          ))}
        </div>
        <label className={s.toggle}>
          <input type="checkbox" checked={soloPrioridad} onChange={(e) => setSoloPrioridad(e.target.checked)} />
          Solo urgentes, importantes y con fecha cumplida
        </label>
      </div>

      {paradas.length > 0 ? (
        <div className={s.mapas}>
          <p style={{ margin: 0 }}><strong>{paradas.length} paradas</strong>, ordenadas por zona de norte a sur.</p>
          <div className={s.fila}>
            {links.map((l, i) => (
              <a key={l} className={s.primario} href={l} target="_blank" rel="noreferrer">
                Abrir en Google Maps{links.length > 1 ? ` · tramo ${i + 1} de ${links.length}` : ""}
              </a>
            ))}
          </div>
          <span className={s.meta}>Sale desde donde esté tu teléfono. Google Maps puede reordenar las paradas si le pedís la ruta más corta.</span>
        </div>
      ) : (
        <p className={s.vacio}>No hay paradas para este recorrido.</p>
      )}

      <ol className={s.paradas}>
        {paradas.map((p, i) => (
          <li key={p.direccion} className={s.parada}>
            <div className={s.paradaH}>
              <span className={s.num}>{i + 1}</span>
              <div>
                <strong>{p.direccion}</strong>
                <span className={s.meta}>{p.barrio ? `${p.barrio.toLowerCase()} · ` : ""}{[...p.unidades].join(", ") || "Edificio"}</span>
              </div>
            </div>
            <ul className={s.lista}>
              {p.tareas.map((t) => <Item key={t.id} t={t} ctx={ctx} sinDeptos />)}
            </ul>
          </li>
        ))}
      </ol>

      {sinDir.length > 0 && (
        <section className={s.area}>
          <div className={s.areaH}><h2>Sin dirección</h2><span>{sinDir.length} tareas sin depto vinculado</span></div>
          <ul className={s.lista}>{sinDir.map((t) => <Item key={t.id} t={t} ctx={ctx} />)}</ul>
        </section>
      )}
    </>
  );
}

function Login({ onOk }: { onOk: (u: Usuario) => void }) {
  const [quien, setQuien] = useState<Usuario | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!quien || !pin) return;
    setEnviando(true); setError(null);
    try {
      await api("/api/pendientes/sesion", { method: "POST", body: JSON.stringify({ usuario: quien, pin }) });
      onOk(quien);
    } catch (err) { setError((err as Error).message); setPin(""); }
    finally { setEnviando(false); }
  }

  return (
    <main className={s.page}>
      <form className={s.login} onSubmit={entrar}>
        <h1 className={s.titulo}>Pendientes <span className={s.marca}>Rent2888</span></h1>
        <p className={s.sub}>¿Quién sos?</p>
        <div className={s.quien}>
          {USUARIOS.map((u) => (
            <button type="button" key={u} className={s.chip} aria-pressed={quien === u} onClick={() => setQuien(u)}>{NOMBRES[u]}</button>
          ))}
        </div>
        <label className={s.campo}>
          Tu PIN
          <input id="pin" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} disabled={!quien} />
        </label>
        {error && <p className={s.error}>{error}</p>}
        <button className={s.primario} disabled={!quien || !pin || enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}

function NuevaTarea({ filtro, deptos, onCreada, onError }: { filtro: Filtro; deptos: Depto[]; onCreada: (t: Pendiente) => void; onError: (m: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [area, setArea] = useState<Area>("general");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [fecha, setFecha] = useState("");
  const [rec, setRec] = useState<Recurrencia | "">("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if ((AREAS as readonly string[]).includes(filtro)) setArea(filtro as Area); }, [filtro]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await api<{ tarea: Pendiente }>("/api/pendientes", {
        method: "POST",
        body: JSON.stringify({ texto, area, prioridad, fecha_tope: fecha || null, recurrencia: rec || null }),
      });
      onCreada(r.tarea);
      setTexto(""); setFecha(""); setPrioridad("normal"); setRec("");
    } catch (err) { onError((err as Error).message); }
    finally { setEnviando(false); }
  }

  if (!abierto) return <button className={s.agregar} onClick={() => setAbierto(true)}>+ Agregar tarea</button>;

  return (
    <form className={s.nueva} onSubmit={crear}>
      <textarea id="nueva-texto" className={s.input} rows={2} placeholder="¿Qué hay que hacer? Nombrá el depto (ej: Plamo, IT326, P3B) y se vincula solo." value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
      <div className={s.fila}>
        <select id="nueva-area" className={s.input} value={area} onChange={(e) => setArea(e.target.value as Area)} aria-label="Área">
          {AREAS.map((a) => <option key={a} value={a}>{AREA_NOMBRE[a]}</option>)}
        </select>
        <select id="nueva-prio" className={s.input} value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)} aria-label="Prioridad">
          {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIO_TXT[p]}</option>)}
        </select>
        <input id="nueva-fecha" className={s.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha tope" />
        <select id="nueva-rec" className={s.input} value={rec} onChange={(e) => setRec(e.target.value as Recurrencia | "")} aria-label="Se repite">
          <option value="">No se repite</option>
          {RECURRENCIAS.map((r) => <option key={r} value={r}>{REC_TXT[r]}</option>)}
        </select>
      </div>
      <div className={s.fila}>
        <button className={s.primario} disabled={!texto.trim() || enviando}>{enviando ? "Guardando…" : "Agregar"}</button>
        <button type="button" className={s.link} onClick={() => setAbierto(false)}>Cancelar</button>
        <span className={s.meta}>{deptos.length} deptos cargados para vincular</span>
      </div>
    </form>
  );
}

function Editor({ t, deptos, ctx }: { t: Pendiente; deptos: Depto[]; ctx: Ctx }) {
  const { acciones } = ctx;
  const [texto, setTexto] = useState(t.texto);
  const [codigos, setCodigos] = useState(t.deptos.join(", "));
  const [confirmar, setConfirmar] = useState(false);
  const [errDeptos, setErrDeptos] = useState("");
  const validos = new Set(deptos.map((d) => d.codigo));

  function guardarDeptos() {
    const lista = codigos.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    const malos = lista.filter((c) => validos.size && !validos.has(c));
    if (malos.length) { setErrDeptos(`No existe: ${malos.join(", ")}. Usá los códigos de la lista.`); return; }
    if (lista.join(",") !== t.deptos.join(",")) acciones.cambiar(t, { deptos: lista });
  }

  return (
    <div className={s.editor}>
      <textarea id={`ed-${t.id}`} className={s.input} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
        onBlur={() => texto.trim() && texto !== t.texto && acciones.cambiar(t, { texto })} />
      <label className={s.campoMini}>
        Deptos (códigos separados por coma)
        <input id={`ed-dep-${t.id}`} className={s.input} list="lista-deptos" value={codigos} aria-invalid={!!errDeptos}
          onChange={(e) => { setCodigos(e.target.value); setErrDeptos(""); }}
          onBlur={guardarDeptos} />
        {errDeptos && <span className={s.error}>{errDeptos}</span>}
      </label>
      <datalist id="lista-deptos">{deptos.map((d) => <option key={d.codigo} value={d.codigo}>{d.direccion} {d.unidad ?? ""}</option>)}</datalist>
      <div className={s.fila}>
        <select className={s.input} value={t.prioridad} onChange={(e) => acciones.cambiar(t, { prioridad: e.target.value as Prioridad })} aria-label="Prioridad">
          {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIO_TXT[p]}</option>)}
        </select>
        <input className={s.input} type="date" value={t.fecha_tope ?? ""} onChange={(e) => acciones.cambiar(t, { fecha_tope: e.target.value || null })} aria-label="Fecha tope" />
        <select className={s.input} value={t.area} onChange={(e) => acciones.cambiar(t, { area: e.target.value as Area })} aria-label="Mover a área">
          {AREAS.map((a) => <option key={a} value={a}>{AREA_NOMBRE[a]}</option>)}
        </select>
        <select className={s.input} value={t.recurrencia ?? ""} onChange={(e) => acciones.cambiar(t, { recurrencia: (e.target.value || null) as Recurrencia | null })} aria-label="Se repite">
          <option value="">No se repite</option>
          {RECURRENCIAS.map((r) => <option key={r} value={r}>{REC_TXT[r]}</option>)}
        </select>
        <button type="button" className={s.borrar} onClick={() => (confirmar ? acciones.borrar(t) : setConfirmar(true))}>
          {confirmar ? "¿Seguro? Borrar" : "Borrar"}
        </button>
      </div>
    </div>
  );
}
