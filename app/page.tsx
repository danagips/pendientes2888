"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AREAS, AREA_NOMBRE, NOMBRES, PRIORIDADES, USUARIOS,
  esAdmin, esMia, puedeTildar, quienPuede,
  type Area, type Pendiente, type Prioridad, type Usuario,
} from "@/lib/pendientes/permisos";
import s from "./pendientes.module.css";

type Filtro = "todas" | "mias" | "urgentes" | Area;

const PRIO_PESO: Record<Prioridad, number> = { urgente: 0, alta: 1, normal: 2 };
const PRIO_TXT: Record<Prioridad, string> = { urgente: "Urgente", alta: "Importante", normal: "Normal" };

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

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error ?? "Algo falló."), { status: r.status });
  return body as T;
}

export default function PendientesPage() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [tareas, setTareas] = useState<Pendiente[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [verHechas, setVerHechas] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ usuario: Usuario; tareas: Pendiente[] }>("/api/pendientes");
      setUsuario(r.usuario);
      setTareas(r.tareas);
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

  const hoy = hoyISO();

  const conteo = useMemo(() => {
    const c: Record<string, number> = { todas: 0, mias: 0, urgentes: 0 };
    for (const t of tareas) {
      if (t.hecho) continue;
      c.todas++;
      c[t.area] = (c[t.area] ?? 0) + 1;
      if (usuario && esMia(usuario, t.area)) c.mias++;
      if (t.prioridad === "urgente" || (t.fecha_tope && t.fecha_tope <= hoy)) c.urgentes++;
    }
    return c;
  }, [tareas, usuario, hoy]);

  const grupos = useMemo(() => {
    const visibles = tareas.filter((t) => {
      if (!verHechas && t.hecho) return false;
      if (filtro === "todas") return true;
      if (filtro === "mias") return !!usuario && esMia(usuario, t.area);
      if (filtro === "urgentes") return !t.hecho && (t.prioridad === "urgente" || (!!t.fecha_tope && t.fecha_tope <= hoy));
      return t.area === filtro;
    });
    visibles.sort((a, b) =>
      Number(a.hecho) - Number(b.hecho) ||
      PRIO_PESO[a.prioridad] - PRIO_PESO[b.prioridad] ||
      (a.fecha_tope ?? "9999").localeCompare(b.fecha_tope ?? "9999") ||
      (a.detalle ?? "").localeCompare(b.detalle ?? "") ||
      a.orden - b.orden,
    );
    return AREAS.map((area) => ({ area, items: visibles.filter((t) => t.area === area) })).filter((g) => g.items.length);
  }, [tareas, filtro, verHechas, usuario, hoy]);

  async function tildar(t: Pendiente) {
    const nuevo = !t.hecho;
    setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, hecho: nuevo, hecho_por: nuevo ? usuario! : null, hecho_en: nuevo ? new Date().toISOString() : null } : x)));
    try {
      const r = await api<{ tarea: Pendiente }>(`/api/pendientes/${t.id}`, { method: "PATCH", body: JSON.stringify({ hecho: nuevo }) });
      setTareas((ts) => ts.map((x) => (x.id === t.id ? r.tarea : x)));
    } catch (e) {
      setTareas((ts) => ts.map((x) => (x.id === t.id ? t : x)));
      setAviso((e as Error).message);
    }
  }

  async function editar(t: Pendiente, cambios: Partial<Pendiente>) {
    try {
      const r = await api<{ tarea: Pendiente }>(`/api/pendientes/${t.id}`, { method: "PATCH", body: JSON.stringify(cambios) });
      setTareas((ts) => ts.map((x) => (x.id === t.id ? r.tarea : x)));
    } catch (e) { setAviso((e as Error).message); }
  }

  async function borrar(t: Pendiente) {
    try {
      await api(`/api/pendientes/${t.id}`, { method: "DELETE" });
      setTareas((ts) => ts.filter((x) => x.id !== t.id));
      setAbierta(null);
    } catch (e) { setAviso((e as Error).message); }
  }

  if (usuario === undefined) return <main className={s.page}><p className={s.vacio}>Cargando pendientes…</p></main>;
  if (usuario === null) return <Login onOk={(u) => { setUsuario(u); cargar(); }} />;

  const admin = esAdmin(usuario);
  const chips: { id: Filtro; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "mias", label: "Mis tareas" },
    { id: "urgentes", label: "Urgentes y vencidas" },
    ...AREAS.map((a) => ({ id: a as Filtro, label: AREA_NOMBRE[a] })),
  ];

  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <h1 className={s.titulo}>Pendientes</h1>
          <p className={s.sub}>
            {conteo.todas} abiertas · {conteo.urgentes} urgentes o vencidas
          </p>
        </div>
        <div className={s.yo}>
          <span>{NOMBRES[usuario]}</span>
          <button className={s.link} onClick={async () => { await api("/api/pendientes/sesion", { method: "DELETE" }); setUsuario(null); }}>
            Salir
          </button>
        </div>
      </header>

      <nav className={s.barra} aria-label="Filtrar por área">
        {chips.map((c) => (
          <button key={c.id} className={s.chip} aria-pressed={filtro === c.id} onClick={() => setFiltro(c.id)}>
            {c.label}
            <span className={s.chipN}>{conteo[c.id] ?? 0}</span>
          </button>
        ))}
      </nav>

      <NuevaTarea filtro={filtro} onCreada={(t) => setTareas((ts) => [...ts, t])} onError={setAviso} />

      <label className={s.toggle}>
        <input type="checkbox" checked={verHechas} onChange={(e) => setVerHechas(e.target.checked)} />
        Mostrar lo hecho en los últimos 7 días
      </label>

      {aviso && (
        <div className={s.aviso} role="alert">
          {aviso} <button className={s.link} onClick={() => setAviso(null)}>Cerrar</button>
        </div>
      )}

      {!grupos.length && <p className={s.vacio}>No hay tareas en esta vista.</p>}

      {grupos.map(({ area, items }) => {
        const pend = items.filter((t) => !t.hecho).length;
        const puede = puedeTildar(usuario, area);
        return (
          <section key={area} className={s.area}>
            <div className={s.areaH}>
              <h2>{AREA_NOMBRE[area]}</h2>
              <span>{pend} pendientes · tilda: {quienPuede(area)}</span>
            </div>
            <ul className={s.lista}>
              {items.map((t) => {
                const vencida = !t.hecho && t.fecha_tope && t.fecha_tope < hoy;
                const esHoy = !t.hecho && t.fecha_tope === hoy;
                return (
                  <li key={t.id} className={`${s.item} ${t.hecho ? s.hecho : ""} ${!t.hecho && t.prioridad !== "normal" ? s[t.prioridad] : ""}`}>
                    <input
                      type="checkbox"
                      id={`t-${t.id}`}
                      className={s.check}
                      checked={t.hecho}
                      disabled={!puede}
                      title={puede ? "Marcar como hecha" : `${quienPuede(area)} puede tildar esto`}
                      onChange={() => tildar(t)}
                    />
                    <label htmlFor={`t-${t.id}`} className={s.cuerpo}>
                      <span className={s.tags}>
                        {t.prioridad !== "normal" && <span className={`${s.tag} ${s["tag_" + t.prioridad]}`}>{PRIO_TXT[t.prioridad]}</span>}
                        {t.fecha_tope && (
                          <span className={`${s.tag} ${vencida ? s.tag_vencida : esHoy ? s.tag_hoy : s.tag_fecha}`}>
                            {vencida ? "Vencida " : esHoy ? "Hoy " : "Hasta "}{fechaCorta(t.fecha_tope)}
                          </span>
                        )}
                        {t.detalle && <span className={`${s.tag} ${s.tag_det}`}>{t.detalle}</span>}
                      </span>
                      <span className={s.texto}>{t.texto}</span>
                      {t.hecho && t.hecho_por && t.hecho_en && (
                        <span className={s.meta}>Hecho por {NOMBRES[t.hecho_por as Usuario] ?? t.hecho_por} el {fechaHecho(t.hecho_en)}</span>
                      )}
                    </label>
                    {admin && (
                      <button className={s.mas} aria-label="Editar tarea" aria-expanded={abierta === t.id} onClick={() => setAbierta(abierta === t.id ? null : t.id)}>⋯</button>
                    )}
                    {admin && abierta === t.id && <Editor t={t} onGuardar={(c) => editar(t, c)} onBorrar={() => borrar(t)} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
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

function NuevaTarea({ filtro, onCreada, onError }: { filtro: Filtro; onCreada: (t: Pendiente) => void; onError: (m: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [area, setArea] = useState<Area>("general");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [fecha, setFecha] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if ((AREAS as readonly string[]).includes(filtro)) setArea(filtro as Area); }, [filtro]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await api<{ tarea: Pendiente }>("/api/pendientes", {
        method: "POST",
        body: JSON.stringify({ texto, area, prioridad, fecha_tope: fecha || null }),
      });
      onCreada(r.tarea);
      setTexto(""); setFecha(""); setPrioridad("normal");
    } catch (err) { onError((err as Error).message); }
    finally { setEnviando(false); }
  }

  if (!abierto) return <button className={s.agregar} onClick={() => setAbierto(true)}>+ Agregar tarea</button>;

  return (
    <form className={s.nueva} onSubmit={crear}>
      <textarea id="nueva-texto" className={s.input} rows={2} placeholder="¿Qué hay que hacer?" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
      <div className={s.fila}>
        <select id="nueva-area" className={s.input} value={area} onChange={(e) => setArea(e.target.value as Area)} aria-label="Área">
          {AREAS.map((a) => <option key={a} value={a}>{AREA_NOMBRE[a]}</option>)}
        </select>
        <select id="nueva-prio" className={s.input} value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)} aria-label="Prioridad">
          {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIO_TXT[p]}</option>)}
        </select>
        <input id="nueva-fecha" className={s.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha tope" />
      </div>
      <div className={s.fila}>
        <button className={s.primario} disabled={!texto.trim() || enviando}>{enviando ? "Guardando…" : "Agregar"}</button>
        <button type="button" className={s.link} onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </form>
  );
}

function Editor({ t, onGuardar, onBorrar }: { t: Pendiente; onGuardar: (c: Partial<Pendiente>) => void; onBorrar: () => void }) {
  const [texto, setTexto] = useState(t.texto);
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className={s.editor}>
      <textarea id={`ed-${t.id}`} className={s.input} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={() => texto.trim() && texto !== t.texto && onGuardar({ texto })} />
      <div className={s.fila}>
        <select className={s.input} value={t.prioridad} onChange={(e) => onGuardar({ prioridad: e.target.value as Prioridad })} aria-label="Prioridad">
          {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIO_TXT[p]}</option>)}
        </select>
        <input className={s.input} type="date" value={t.fecha_tope ?? ""} onChange={(e) => onGuardar({ fecha_tope: e.target.value || null })} aria-label="Fecha tope" />
        <select className={s.input} value={t.area} onChange={(e) => onGuardar({ area: e.target.value as Area })} aria-label="Mover a área">
          {AREAS.map((a) => <option key={a} value={a}>{AREA_NOMBRE[a]}</option>)}
        </select>
        <button type="button" className={s.borrar} onClick={() => (confirmar ? onBorrar() : setConfirmar(true))}>
          {confirmar ? "¿Seguro? Borrar" : "Borrar"}
        </button>
      </div>
    </div>
  );
}
