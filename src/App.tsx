import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { apiBaseUrl, checkHealth, createUser, getUsers, isDemo } from './api';
import type { NewUser, RequestInfo, User } from './api';
import { Icon } from './icons';

type View = 'directory' | 'connection';
type Order = 'az' | 'za' | 'newest';
type Toast = { message: string; kind: 'success' | 'error' };
const pageSize = 8;
const colors = ['sage', 'peach', 'lilac', 'sky', 'sand'];

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es');
}

function avatarColor(user: User) {
  return colors[Array.from(String(user.id)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

function domainOf(email: string) { return email.split('@')[1]?.toLowerCase() || 'Sin dominio'; }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es'); }
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'; }

function exportUsers(users: User[]) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const lines = [['ID', 'Nombre', 'Correo'], ...users.map(user => [user.id, user.name, user.email])];
  const blob = new Blob(['\uFEFF' + lines.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'nexo-personas.csv';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NewUserDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (user: User) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<NewUser>({ name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      setForm({ name: '', email: '' });
      setError('');
      dialog.current.showModal();
    } else if (!open) dialog.current?.close();
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = { name: form.name.trim(), email: form.email.trim() };
    if (!values.name || !values.email) { setError('Completa el nombre y el correo.'); return; }
    setSaving(true);
    setError('');
    try {
      const created = await createUser(values);
      onCreate(created.data);
      onClose();
    } catch (error) { setError(messageOf(error)); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} className="user-dialog" aria-labelledby="dialog-title" onCancel={event => {
    event.preventDefault();
    if (!saving) onClose();
  }} onClick={event => { if (event.target === dialog.current && !saving) onClose(); }}>
    <div className="dialog-content">
      <button className="icon-button dialog-close" type="button" aria-label="Cerrar formulario" onClick={onClose} disabled={saving}><Icon name="close" /></button>
      <div className="dialog-symbol"><Icon name="people" size={26} /></div>
      <p className="eyebrow">EL EQUIPO SIGUE CRECIENDO</p>
      <h2 id="dialog-title">Una nueva conexión.</h2>
      <p className="muted">Añade una persona al directorio. Solo necesitas su nombre y correo.</p>
      <form onSubmit={submit}>
        <label htmlFor="person-name">Nombre completo</label>
        <input id="person-name" autoFocus autoComplete="name" placeholder="Ej. Ana Torres" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required disabled={saving} />
        <label htmlFor="person-email">Correo electrónico</label>
        <input id="person-email" type="email" autoComplete="email" placeholder="ana@tu-equipo.com" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required disabled={saving} />
        {error && <p className="form-error" role="alert"><Icon name="info" size={18} />{error}</p>}
        {isDemo && <p className="form-note">Modo demostración: el registro se guarda en este navegador.</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? <><span className="spinner" /> Guardando…</> : <><Icon name="plus" size={18} /> Añadir persona</>}</button>
        </div>
      </form>
    </div>
  </dialog>;
}

function ConnectionView({ info, loaded, lastUpdated, onRefresh }: { info: RequestInfo | null; loaded: boolean; lastUpdated: Date | null; onRefresh: () => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ data: unknown; duration: number } | null>(null);
  const [error, setError] = useState('');

  async function test() {
    setTesting(true);
    setError('');
    setResult(null);
    try { const response = await checkHealth(); setResult({ data: response.data, duration: response.info.durationMs }); }
    catch (error) { setError(messageOf(error)); }
    finally { setTesting(false); }
  }

  return <section className="connection-view">
    <p className="eyebrow">TODO EMPIEZA CON UNA CONEXIÓN</p>
    <h1>Conexión del directorio</h1>
    <p className="section-description">Comprueba de dónde vienen los datos y si el servicio está respondiendo.</p>
    <div className="connection-card">
      <div className="connection-heading"><div className="stat-symbol"><Icon name="cloud" size={24} /></div><div><h2>{isDemo ? 'Demostración local' : 'API de usuarios'}</h2><p>{isDemo ? 'Datos ficticios en tu navegador' : 'Servicio FastAPI configurado para este sitio'}</p></div><span className={`pill ${isDemo ? 'demo-pill' : loaded ? 'online-pill' : 'error-pill'}`}>{isDemo ? 'Demo' : loaded ? 'Listado disponible' : 'Sin confirmar'}</span></div>
      <dl className="connection-details">
        <div><dt>Origen</dt><dd>{isDemo ? 'Modo demostración · no usa la API' : apiBaseUrl || 'Falta configurar VITE_API_BASE_URL'}</dd></div>
        <div><dt>Última actualización</dt><dd>{lastUpdated ? lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Todavía no hay una respuesta válida'}</dd></div>
        <div><dt>Tiempo del último listado</dt><dd>{isDemo ? 'No aplica en demostración' : info ? `${info.durationMs} ms · medido desde el navegador` : 'Sin medición'}</dd></div>
        <div><dt>Caché del último listado</dt><dd>{isDemo ? 'No aplica en demostración' : info?.cache || 'La API no expuso X-Cache'}</dd></div>
      </dl>
      <div className="connection-actions"><button className="button primary" onClick={test} disabled={testing}>{testing ? <span className="spinner" /> : <Icon name="link" size={18} />}{isDemo ? 'Ver respuesta de demo' : 'Consultar /health'}</button><button className="button secondary" onClick={onRefresh}><Icon name="refresh" size={18} />Actualizar listado</button></div>
      {error && <p className="form-error" role="alert"><Icon name="info" size={18} />{error}</p>}
      {result && <div className="health-result"><div><Icon name="check" size={18} />{isDemo ? 'Respuesta simulada · no se consultó el servidor' : `Respuesta HTTP correcta · ${result.duration} ms`}</div><pre>{JSON.stringify(result.data, null, 2)}</pre></div>}
    </div>
    <div className="connection-tip"><Icon name="info" size={21} /><p>{isDemo ? 'Para usar tu API, cambia VITE_DATA_SOURCE a api y configura VITE_API_BASE_URL en .env. Después vuelve a compilar el proyecto.' : 'El estado del listado y el de /health son comprobaciones independientes. Una consulta correcta no garantiza que todas las dependencias del servidor estén disponibles.'}</p></div>
  </section>;
}

export default function App() {
  const [view, setView] = useState<View>('directory');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('all');
  const [order, setOrder] = useState<Order>('az');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError('');
    try {
      const response = await getUsers();
      if (current !== requestId.current) return;
      setUsers(response.data);
      setInfo(response.info);
      setLoaded(true);
      setLastUpdated(new Date());
    } catch (error) {
      if (current !== requestId.current) return;
      setLoadError(messageOf(error));
      setLoaded(false);
    } finally { if (current === requestId.current) setLoading(false); }
  }, []);

  useEffect(() => { void load(); return () => { ++requestId.current; }; }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => { setPage(1); }, [search, domain, order]);

  const domains = useMemo(() => [...new Set(users.map(user => domainOf(user.email)))].sort(), [users]);
  const filtered = useMemo(() => {
    const query = normalize(search.trim());
    const found = users.filter(user => (!query || normalize(`${user.name} ${user.email}`).includes(query)) && (domain === 'all' || domainOf(user.email) === domain));
    return found.sort((a, b) => order === 'newest'
      ? (Number(b.id) || 0) - (Number(a.id) || 0)
      : a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) * (order === 'za' ? -1 : 1));
  }, [users, search, domain, order]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function copyEmail(email: string) {
    try { await navigator.clipboard.writeText(email); setToast({ message: 'Correo copiado al portapapeles.', kind: 'success' }); }
    catch { setToast({ message: 'No se pudo copiar. Puedes seleccionar el correo directamente.', kind: 'error' }); }
  }

  function onCreate(user: User) {
    // Invalida cualquier GET anterior para que no sobrescriba el registro recién creado.
    ++requestId.current;
    setLoading(false);
    setUsers(current => [...current.filter(item => item.id !== user.id), user]);
    setSearch('');
    setDomain('all');
    setOrder('newest');
    setPage(1);
    setToast({ message: `${user.name} ya forma parte del directorio${isDemo ? ' de demostración' : ''}.`, kind: 'success' });
    // Un POST exitoso confirma el registro, no el estado ni la duración del último GET.
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">Ir al contenido</a>
    <aside className="sidebar">
      <a href="#" className="brand" aria-label="Nexo, ir al directorio" onClick={event => { event.preventDefault(); setView('directory'); }}><span className="brand-mark"><i /><i /><i /></span><span>nexo<span className="brand-dot">.</span></span></a>
      <div className="workspace-label"><span className="workspace-icon">N</span><div><strong>Mi equipo</strong><small>Espacio de trabajo</small></div></div>
      <p className="nav-label">ESPACIO DE TRABAJO</p>
      <nav aria-label="Navegación principal">
        <button className={`nav-item ${view === 'directory' ? 'active' : ''}`} onClick={() => setView('directory')} aria-current={view === 'directory' ? 'page' : undefined}><Icon name="people" /><span>Personas</span><span className="nav-count">{users.length}</span></button>
        <button className={`nav-item ${view === 'connection' ? 'active' : ''}`} onClick={() => setView('connection')} aria-current={view === 'connection' ? 'page' : undefined}><Icon name="link" /><span>Conexión</span></button>
      </nav>
      <div className="sidebar-note"><div className="sidebar-note-art" aria-hidden="true"><span>↗</span><i /><i /></div><strong>Mejor, juntos.</strong><p>Cada persona es una nueva oportunidad para conectar.</p></div>
      <div className="sidebar-footer"><span className="team-avatar">Fcc</span><div><strong>Fredy CC</strong><small>Directorio del equipo</small></div><span className="footer-dot" /></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>Espacio de trabajo</span><Icon name="chevron" size={14} /><strong>{view === 'directory' ? 'Personas' : 'Conexión'}</strong></div><div className="topbar-status"><span className={`status-dot ${isDemo || loaded ? '' : 'offline'}`} /><span>{isDemo ? 'Modo demostración' : loading ? 'Consultando API…' : loaded ? 'API conectada' : 'Conexión pendiente'}</span></div></header>
      <main id="main">
        {isDemo && <div className="demo-banner"><Icon name="info" size={17} /><span><strong>Vista de demostración.</strong> Los datos son ficticios y se guardan en este navegador.</span><button onClick={() => setView('connection')}>Conectar API <Icon name="arrow" size={15} /></button></div>}
        {view === 'directory' ? <>
          <section className="hero">
            <div className="hero-text"><p className="eyebrow"><span className="tiny-star">✳</span> TU EQUIPO, MÁS CERCA</p><h1>Las personas hacen<br />la diferencia<span>.</span></h1><p>Un espacio para conocer, encontrar y conectar<br className="desktop-break" /> con las personas de tu equipo.</p><button className="button primary" onClick={() => setDialogOpen(true)}><Icon name="plus" size={19} />Añadir persona<Icon name="arrow" size={17} /></button></div>
            <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="art-avatar art-one">AT</div><div className="art-avatar art-two">MR</div><div className="art-avatar art-three">CF</div><div className="art-center"><Icon name="people" size={32} /></div><span className="art-spark spark-one">✳</span><span className="art-spark spark-two">+</span><div className="art-tag"><span />Conectamos personas</div></div>
          </section>
          <section className="stats" aria-label="Resumen del directorio">
            <article className="stat-card"><div><p>Personas en el listado</p><strong>{loading && !lastUpdated ? '—' : users.length.toLocaleString('es-PE')}</strong><small>Registros recibidos{isDemo ? ' · demo' : ''}</small></div><div className="stat-symbol"><Icon name="people" size={22} /></div></article>
            <article className="stat-card"><div><p>Dominios de correo</p><strong>{loading && !lastUpdated ? '—' : domains.length}</strong><small>Diferentes dominios en el listado</small></div><div className="stat-symbol warm"><Icon name="mail" size={22} /></div></article>
            <article className="stat-card connection-stat"><div><p>Origen de los datos</p><strong className="text-stat">{isDemo ? 'Demo local' : loaded ? 'API disponible' : 'Sin conexión'}</strong><small>{isDemo ? 'Sin llamadas al servidor' : lastUpdated ? `Última consulta · ${lastUpdated.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}` : 'Pendiente de una respuesta válida'}</small></div><button className="stat-symbol" aria-label="Ver conexión de la API" onClick={() => setView('connection')}><Icon name="cloud" size={23} /></button></article>
          </section>
          <section className="directory" aria-labelledby="directory-title">
            <div className="directory-heading"><div><h2 id="directory-title">El directorio<span className="count-label">{users.length}</span></h2><p>Las conexiones empiezan con un nombre.</p></div><div className="directory-actions"><button className="button subtle" onClick={() => { exportUsers(filtered); setToast({ message: 'Listado exportado como CSV.', kind: 'success' }); }} disabled={!filtered.length}><Icon name="download" size={17} />Exportar</button><button className="button secondary" onClick={() => void load()} disabled={loading}><Icon name="refresh" size={17} className={loading ? 'rotate' : ''} />Actualizar</button></div></div>
            <div className="directory-toolbar"><div className="search-field"><Icon name="search" size={19} /><input aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="icon-button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><Icon name="close" size={16} /></button>}</div><div className="filter-controls"><select value={domain} onChange={event => setDomain(event.target.value)} aria-label="Filtrar por dominio"><option value="all">Todos los dominios</option>{domains.map(item => <option value={item} key={item}>{item}</option>)}</select><select value={order} onChange={event => setOrder(event.target.value as Order)} aria-label="Ordenar personas"><option value="az">Nombre: A–Z</option><option value="za">Nombre: Z–A</option><option value="newest">ID: mayor primero</option></select><div className="view-switch" role="group" aria-label="Formato del listado"><button className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')} aria-label="Vista de tarjetas" aria-pressed={layout === 'grid'}><Icon name="grid" size={18} /></button><button className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')} aria-label="Vista de lista" aria-pressed={layout === 'list'}><Icon name="list" size={19} /></button></div></div></div>
            {loadError && <div className="load-error" role="alert"><Icon name="info" size={20} /><div><strong>No pudimos actualizar el directorio</strong><p>{loadError}{users.length ? ' Se conserva el último listado recibido.' : ''}</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}>Reintentar</button></div>}
            <div className="results" aria-busy={loading}>
              {loading && !users.length ? <div className="user-grid" aria-label="Cargando personas">{Array.from({ length: 8 }, (_, index) => <div className="skeleton-card" key={index}><div className="skeleton-circle" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div> : visible.length ? <div className={layout === 'grid' ? 'user-grid' : 'user-list'}>{visible.map(user => <article className="user-card" key={user.id}><div className={`avatar ${avatarColor(user)}`}>{initials(user.name) || '?'}</div><div className="user-content"><h3>{user.name}</h3><p className="user-id">ID {user.id}</p><span className="domain-tag">{domainOf(user.email)}</span></div><div className="user-card-footer"><Icon name="mail" size={16} /><span className="email-text" title={user.email}>{user.email}</span><button className="icon-button copy-email" aria-label={`Copiar correo de ${user.name}`} onClick={() => void copyEmail(user.email)} title="Copiar correo"><Icon name="copy" size={15} /></button></div></article>)}</div> : <div className="empty-state"><div className="stat-symbol"><Icon name={search || domain !== 'all' ? 'search' : 'people'} size={28} /></div><h3>{loadError ? 'Aún no hay datos disponibles' : search || domain !== 'all' ? 'No encontramos coincidencias' : 'El primer paso es conectar'}</h3><p>{loadError ? 'Revisa la conexión y vuelve a intentarlo.' : search || domain !== 'all' ? 'Prueba con otro nombre, correo o dominio.' : 'Añade la primera persona a tu directorio.'}</p>{!loadError && <button className="button secondary" onClick={() => { if (search || domain !== 'all') { setSearch(''); setDomain('all'); } else setDialogOpen(true); }}>{search || domain !== 'all' ? 'Limpiar filtros' : 'Añadir persona'}</button>}</div>}
            </div>
            <div className="pagination"><p role="status">{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} de ${filtered.length} personas` : '0 personas'}{(search || domain !== 'all') && ` · ${users.length} en el listado`}</p><div><button className="page-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior"><Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} /></button><span>Página <strong>{currentPage}</strong> de {totalPages}</span><button className="page-button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Página siguiente"><Icon name="chevron" size={16} /></button></div></div>
          </section>
          <footer className="page-footer"><span>nexo<span> · </span>Un equipo, muchas conexiones.</span><span>Hecho para trabajar juntos <span className="tiny-star">✳</span></span></footer>
        </> : <ConnectionView info={info} loaded={loaded} lastUpdated={lastUpdated} onRefresh={() => void load()} />}
      </main>
    </div>
    <NewUserDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={onCreate} />
    {toast && <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}><Icon name={toast.kind === 'success' ? 'check' : 'info'} size={19} /><span>{toast.message}</span><button className="icon-button" onClick={() => setToast(null)} aria-label="Cerrar notificación"><Icon name="close" size={16} /></button></div>}
  </div>;
}
