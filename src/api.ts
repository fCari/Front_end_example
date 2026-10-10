export type User = { id: number | string; name: string; email: string };
export type NewUser = Pick<User, 'name' | 'email'>;
export type RequestInfo = { durationMs: number; cache: string | null };
export type Result<T> = { data: T; info: RequestInfo };

const source = import.meta.env.VITE_DATA_SOURCE ?? 'demo';
const rawBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
export const isDemo = source === 'demo';
export const apiBaseUrl = rawBase;
const storageKey = 'nexo-demo-users-v1';

const initialUsers: User[] = [
  { id: 1, name: 'Ana Torres', email: 'ana.torres@equipo.demo' },
  { id: 2, name: 'Mateo Rivera', email: 'mateo.rivera@equipo.demo' },
  { id: 3, name: 'Camila Flores', email: 'camila.flores@cloud.demo' },
  { id: 4, name: 'Diego Ramos', email: 'diego.ramos@equipo.demo' },
  { id: 5, name: 'Valentina Cruz', email: 'valentina.cruz@cloud.demo' },
  { id: 6, name: 'Sebastián Vega', email: 'sebastian.vega@equipo.demo' },
  { id: 7, name: 'Lucía Mendoza', email: 'lucia.mendoza@design.demo' },
  { id: 8, name: 'Nicolás Paredes', email: 'nicolas.paredes@design.demo' },
  { id: 9, name: 'Isabella Díaz', email: 'isabella.diaz@equipo.demo' },
  { id: 10, name: 'Gabriel Ruiz', email: 'gabriel.ruiz@cloud.demo' },
  { id: 11, name: 'Mariana León', email: 'mariana.leon@design.demo' },
  { id: 12, name: 'Andrés Salas', email: 'andres.salas@equipo.demo' },
];

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Record<string, unknown>;
  return (typeof user.id === 'number' || typeof user.id === 'string')
    && typeof user.name === 'string' && typeof user.email === 'string';
}

let volatileDemoUsers: User[] | null = null;

function readDemoUsers(): User[] {
  if (volatileDemoUsers) return [...volatileDemoUsers];
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const users: unknown = JSON.parse(stored);
      if (Array.isArray(users) && users.every(isUser)) return users;
    }
  } catch { /* También funciona si el navegador bloquea localStorage. */ }
  return initialUsers.map(user => ({ ...user }));
}

function storeDemoUsers(users: User[]) {
  volatileDemoUsers = users;
  try { localStorage.setItem(storageKey, JSON.stringify(users)); } catch { /* Memoria local. */ }
}

function endpoint(path: string): string {
  if (source !== 'api') throw new ApiError('VITE_DATA_SOURCE debe ser demo o api.');
  if (!rawBase) throw new ApiError('Falta configurar VITE_API_BASE_URL. Consulta el README.');
  let url: URL;
  try { url = new URL(rawBase); } catch { throw new ApiError('La URL de la API no es válida.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new ApiError('Usa una URL HTTP o HTTPS sin credenciales, parámetros ni fragmentos.');
  }
  if (window.location.protocol === 'https:' && url.protocol === 'http:') {
    throw new ApiError('Esta página usa HTTPS: configura también una URL HTTPS para la API.');
  }
  return rawBase + path;
}

function errorMessage(status: number, body: unknown): string {
  if (status === 409) return 'Este correo ya está registrado. Prueba con otro.';
  if (status === 401 || status === 403) return 'La API rechazó el acceso. Revisa su configuración de autenticación.';
  if (status === 404) return 'No se encontró el endpoint. Revisa la URL y el prefijo de la API.';
  if (status >= 500) return 'El servidor no pudo completar la solicitud. Inténtalo de nuevo en unos momentos.';
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return 'La API rechazó los datos. Revisa el nombre y el formato del correo.';
  }
  return `No se pudo completar la solicitud (HTTP ${status}).`;
}

async function request(path: string, options: RequestInit = {}): Promise<Result<unknown>> {
  const url = endpoint(path);
  const started = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...options.headers },
    });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch {
      if (response.ok) throw new ApiError('La API respondió con un formato diferente de JSON.');
    }
    if (!response.ok) throw new ApiError(errorMessage(response.status, body), response.status);
    return {
      data: body,
      info: { durationMs: Math.round(performance.now() - started), cache: response.headers.get('X-Cache') },
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(options.method === 'POST'
        ? 'No se pudo confirmar el registro a tiempo. Actualiza el listado antes de volver a enviarlo.'
        : 'La API tardó más de 15 segundos en responder. Intenta actualizar.');
    }
    throw new ApiError(options.method === 'POST'
      ? 'No se pudo confirmar el registro. Actualiza el listado antes de repetirlo; revisa también la conexión y CORS.'
      : 'No se pudo conectar con la API. Revisa su URL, disponibilidad y configuración CORS.');
  } finally { window.clearTimeout(timeout); }
}

export async function getUsers(): Promise<Result<User[]>> {
  if (isDemo) return { data: readDemoUsers(), info: { durationMs: 0, cache: null } };
  const result = await request('/users');
  if (!Array.isArray(result.data) || !result.data.every(isUser)) {
    throw new ApiError('GET /users debe devolver una lista de usuarios con id, name y email.');
  }
  return { ...result, data: result.data };
}

export async function createUser(user: NewUser): Promise<Result<User>> {
  if (isDemo) {
    const users = readDemoUsers();
    if (users.some(item => item.email.toLowerCase() === user.email.toLowerCase())) {
      throw new ApiError('Este correo ya está registrado. Prueba con otro.', 409);
    }
    const nextId = Math.max(0, ...users.map(item => Number(item.id) || 0)) + 1;
    const created = { id: nextId, ...user };
    storeDemoUsers([...users, created]);
    return { data: created, info: { durationMs: 0, cache: null } };
  }
  const result = await request('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!isUser(result.data)) {
    throw new ApiError('El servidor recibió la solicitud, pero la respuesta no tiene id, name y email. Actualiza el listado antes de repetirla.');
  }
  return { ...result, data: result.data };
}

export async function checkHealth(): Promise<Result<unknown>> {
  if (isDemo) return { data: { status: 'demo', message: 'Datos ficticios; no se ha consultado una API.' }, info: { durationMs: 0, cache: null } };
  return request('/health');
}
