# Nexo · users-web

Frontend independiente para el laboratorio GCP. React + TypeScript + Vite, con un directorio de personas conectado a FastAPI. El resultado de la compilación es estático: HTML, JavaScript, CSS y fuentes locales.

## Qué incluye

- Directorio con tarjetas o lista, búsqueda por nombre o correo, filtro por dominio y paginación local.
- Registro de personas con nombre y correo; validación y manejo de errores de la API.
- Exportación de los resultados filtrados a CSV y botón para copiar el correo.
- Vista de conexión para consultar `/health`, medir la duración del último listado desde el navegador y mostrar `X-Cache` si está expuesto.
- Diseño adaptable a escritorio y móvil, navegación con teclado y formulario modal.
- Modo demostración claramente identificado, con datos ficticios guardados en este navegador. No consulta la API.

La versión actual usa únicamente listado y registro; no presupone endpoints para editar o eliminar usuarios. Las métricas resumen los registros recibidos, no el total de la base de datos si tu API limita los resultados. Buscar, filtrar y paginar actúa sobre ese listado.

## 1. Ejecutar en tu computadora

Requisito: Node.js 22.12 o superior compatible con Vite (recomendado: Node 24).

```bash
npm ci
cp .env.example .env
npm run dev
```

Abre la dirección que muestra Vite, normalmente `http://localhost:5173`. Por defecto el proyecto usa demostración; los registros de ese modo no llegan a PostgreSQL ni Redis.

## 2. Conectar tu API

Edita `.env`:

```dotenv
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=https://api.lab.tu-dominio.com
```

La URL es la del balanceador o del servidor que atiende FastAPI. No añadas `/users` al final. Si tu API tiene un prefijo, puedes usar por ejemplo `https://api.lab.tu-dominio.com/api`; el frontend añadirá `/users` y `/health` a ese prefijo.

Reinicia Vite después de cambiar `.env`. Para un despliegue, vuelve a compilar. Las variables `VITE_` se incorporan al JavaScript público durante el build: no son secretos.

El modo API nunca cambia automáticamente a datos ficticios ante un fallo. Un error de red se muestra como tal. El proyecto no implementa autenticación; si tu API requiere credenciales, adapta `src/api.ts` al mecanismo real antes de usarla.

### Contrato esperado

| Método | Endpoint | Entrada | Respuesta esperada |
| --- | --- | --- | --- |
| GET | `/users` | — | Array de objetos con `id`, `name`, `email` |
| POST | `/users` | JSON con `name`, `email` | Objeto creado con `id`, `name`, `email` |
| GET | `/health` | — | JSON; la vista muestra su contenido |

Ejemplo de listado:

```json
[
  { "id": 1, "name": "Ana Torres", "email": "ana@example.com" }
]
```

Ejemplo de registro:

```json
{ "name": "Ana Torres", "email": "ana@example.com" }
```

El frontend acepta un `id` numérico o de texto y cualquier respuesta HTTP exitosa con ese contrato. Maneja, entre otros, HTTP 409 para correo duplicado y HTTP 422 para datos rechazados. Si la forma de respuesta de tu API es diferente, adapta `getUsers()` o `createUser()` en `src/api.ts`.

### CORS en FastAPI

Si web y API usan orígenes distintos, añade la configuración de CORS a tu aplicación existente, antes de servirla:

```python
from fastapi.middleware.cors import CORSMiddleware

# `app` es tu aplicación FastAPI existente.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://web.lab.tu-dominio.com",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["X-Cache"],
)
```

Sustituye el origen del ejemplo por el real del frontend. El middleware atiende las solicitudes preflight `OPTIONS`. `expose_headers` permite que JavaScript lea `X-Cache`; no genera ese encabezado. Si Nginx o el balanceador atienden `OPTIONS`, verifica que preserven la configuración correcta.

Si publicas la web por HTTPS, la API también debe ser HTTPS. `/health` se consulta bajo demanda; una respuesta HTTP exitosa no demuestra por sí sola el estado de PostgreSQL o Redis: depende de lo que compruebe el endpoint.

## 3. Compilar y subir a Cloud Storage

Con `.env` configurado para tu API:

```bash
npm run build
```

Sube **el contenido de `dist/`** al bucket que utiliza el backend bucket del Application Load Balancer. `index.html` debe quedar en la raíz del bucket. El build que viene en este ZIP es de demostración; recompílalo con tu URL antes de subirlo al laboratorio.

El Application Load Balancer proporciona el acceso HTTPS al frontend. No se ejecutan Node ni React en el bucket: el navegador descarga los archivos estáticos y llama a la API. Las dos vistas se cambian dentro de la misma página, sin rutas adicionales que requieran fallback de SPA.

Para actualizaciones, evita conservar una versión antigua de `index.html` en caché. Los assets compilados tienen nombres con hash. Mantén coherentes los objetos publicados y la configuración de caché del balanceador.

## 4. Usar como repositorio separado

Descomprime este proyecto y sube el contenido de `users-web/` a tu nuevo repositorio `users-web`. Incluye `package-lock.json` para instalar las mismas versiones mediante `npm ci`. Mantén el backend en su repositorio actual; esta aplicación se comunica con él únicamente por HTTP.

No subas `.env`, `node_modules/` ni `dist/` a Git; ya están excluidos. El despliegue publica el build, mientras el repositorio conserva las fuentes. No se incluyó todavía un workflow de despliegue, porque necesita el bucket y la identidad de GCP que decidas usar.

## Estructura

```text
users-web/
├── src/
│   ├── App.tsx        # Interfaz, búsqueda, listado y registro
│   ├── api.ts         # Contrato HTTP, configuración y demostración
│   ├── icons.tsx      # Iconos SVG propios
│   ├── main.tsx       # Entrada React
│   └── styles.css     # Diseño adaptable
├── public/
│   └── favicon.svg
├── .env.example
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── README.md
```

## Verificación

```bash
npm run check
npm test
npm run build
```

Se verificó la compilación y el comportamiento del adaptador HTTP mediante diez escenarios con respuestas controladas. `npm test` permite repetir esas comprobaciones sin llamar a tu servidor. No se ha probado contra tu API real: falta su URL y comprobar el contrato actual. Tampoco se realizó una revisión visual en navegador en este entorno.

## Referencias oficiales

- React: https://react.dev/learn/build-a-react-app-from-scratch
- Vite: https://vite.dev/guide/static-deploy
- FastAPI CORS: https://fastapi.tiangolo.com/tutorial/cors/
- Cloud Storage y web estática: https://cloud.google.com/storage/docs/hosting-static-website
