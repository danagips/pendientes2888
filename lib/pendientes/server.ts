import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { esUsuario, type Usuario } from "./permisos";

const COOKIE = "pendientes_sesion";
const DURACION_S = 60 * 60 * 24 * 30; // 30 días: el equipo entra desde el celu y no quiere loguearse a cada rato

function secreto(): string {
  const s = process.env.PENDIENTES_SECRET;
  if (!s || s.length < 32) throw new Error("Falta PENDIENTES_SECRET (mínimo 32 caracteres)");
  return s;
}

/** PINs desde la variable de entorno PENDIENTES_PINS, p. ej. {"dana":"4821","tami":"7730",...} */
function pins(): Partial<Record<Usuario, string>> {
  try {
    return JSON.parse(process.env.PENDIENTES_PINS ?? "{}");
  } catch {
    return {};
  }
}

function firmar(payload: string): string {
  return crypto.createHmac("sha256", secreto()).update(payload).digest("base64url");
}

function iguales(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verificarPin(usuario: Usuario, pin: string): boolean {
  const esperado = pins()[usuario];
  if (!esperado) return false;
  return iguales(pin, esperado);
}

export function abrirSesion(usuario: Usuario): void {
  const payload = Buffer.from(
    JSON.stringify({ u: usuario, exp: Math.floor(Date.now() / 1000) + DURACION_S }),
  ).toString("base64url");
  cookies().set(COOKIE, `${payload}.${firmar(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_S,
  });
}

export function cerrarSesion(): void {
  cookies().delete(COOKIE);
}

export function usuarioActual(): Usuario | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, firma] = raw.split(".");
  if (!payload || !firma || !iguales(firma, firmar(payload))) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp < Date.now() / 1000) return null;
    // Si se saca a alguien de PENDIENTES_PINS, su sesión deja de valer.
    if (!esUsuario(u) || !pins()[u]) return null;
    return u;
  } catch {
    return null;
  }
}

/** Cliente con service role: solo se usa en el servidor, nunca llega al navegador. */
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
