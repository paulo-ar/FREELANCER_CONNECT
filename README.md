# Freelancer Conect

Freelancer Conect es una aplicacion web para conectar clientes con freelancers. Permite registrar usuarios por rol, publicar proyectos, enviar propuestas, gestionar perfiles, aceptar o rechazar propuestas y conversar por proyecto.

## Stack Tecnico

### Frontend

- **HTML5**: estructura de paginas publicas y vistas principales.
- **CSS3**: estilos globales en `public/styles.css`, con layout responsive, componentes reutilizables y tema visual minimalista.
- **JavaScript Vanilla**: logica del cliente sin framework, organizada por modulos en `public/js`.
- **Supabase JS CDN**: autenticacion desde navegador y obtencion de sesion activa.

### Backend

- **Node.js**: runtime del servidor.
- **Express**: servidor HTTP, API REST y publicacion de archivos estaticos.
- **CORS**: habilita peticiones HTTP entre origenes si se requiere.
- **dotenv**: carga variables de entorno desde `.env`.
- **multer**: recibe archivos en memoria para subida de foto de perfil.
- **@supabase/supabase-js**: cliente de Supabase para operaciones administrativas y operaciones autenticadas.

### Base de Datos y Servicios

- **Supabase Auth**: registro, login, recuperacion de password y sesiones.
- **PostgreSQL en Supabase**: tablas relacionales, enums, triggers y politicas RLS.
- **Supabase Storage**: almacenamiento publico de fotos de perfil.
- **Row Level Security (RLS)**: politicas de seguridad para usuarios, proyectos, propuestas, conversaciones y mensajes.

## Requisitos

- Node.js 18 o superior.
- npm.
- Proyecto activo en Supabase.
- Variables de entorno configuradas en `.env`.
- SQL de `database/schema.sql` ejecutado en Supabase.

## Instalacion

```bash
npm install
```

## Configuracion

Crear un archivo `.env` en la raiz del proyecto con estas variables:

```env
PORT=3000
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
SUPABASE_PROFILE_BUCKET=profile-pictures
```

Notas:

- `SUPABASE_ANON_KEY` se usa para sesiones del cliente.
- `SUPABASE_SERVICE_ROLE_KEY` se usa solo en el backend para operaciones administrativas.
- No subir `.env` al repositorio.
- `SUPABASE_PROFILE_BUCKET` es opcional; si no existe, el servidor usa `profile-pictures`.

## Base de Datos

El esquema esta en:

```text
database/schema.sql
```

Incluye:

- Enums para roles, disponibilidad, tamano de empresa, presupuesto, experiencia, estado de proyecto y estado de propuesta.
- Tablas:
  - `users`
  - `freelancer_profiles`
  - `client_profiles`
  - `projects`
  - `proposals`
  - `conversations`
  - `messages`
- Trigger `handle_new_user()` para crear perfil automaticamente al registrarse.
- Politicas RLS para limitar lectura y escritura segun usuario autenticado, rol y propiedad de los datos.

Relaciones importantes:

- Un usuario puede ser `client` o `freelancer`.
- Un cliente puede crear muchos proyectos.
- Un freelancer puede enviar una propuesta por proyecto.
- Las conversaciones estan asociadas a proyecto, cliente y freelancer.
- Al eliminar un proyecto, sus propuestas y conversaciones relacionadas se eliminan por cascada segun las claves foraneas.

## Scripts

```bash
npm start
```

Inicia el servidor con `node server.js`.

```bash
npm run dev
```

Inicia el servidor con `node --watch server.js` para reiniciar automaticamente al detectar cambios.

## Estructura del Proyecto

```text
.
├── database/
│   └── schema.sql
├── public/
│   ├── js/
│   │   ├── app.js
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── messages.js
│   │   ├── profile.js
│   │   └── projects.js
│   ├── create-project.html
│   ├── dashboard.html
│   ├── forgot-password.html
│   ├── index.html
│   ├── login.html
│   ├── messages.html
│   ├── profile.html
│   ├── project-details.html
│   ├── projects.html
│   ├── register.html
│   └── styles.css
├── server.js
├── package.json
└── README.md
```

## Funcionalidades

### Autenticacion

- Registro de usuarios.
- Seleccion de rol: freelancer o cliente.
- Inicio de sesion.
- Cierre de sesion.
- Recuperacion de password.
- Carga de sesion activa con Supabase Auth.

Archivos principales:

- `public/js/auth.js`
- `public/js/app.js`
- `server.js`

### Roles

#### Cliente

- Publicar proyectos.
- Ver dashboard con proyectos propios.
- Ver propuestas recibidas.
- Aceptar propuestas.
- Denegar propuestas.
- Abrir conversacion desde una propuesta.
- Eliminar proyectos propios.
- Editar perfil de cliente.
- Subir foto de perfil.

#### Freelancer

- Explorar proyectos abiertos.
- Ver detalle de proyecto.
- Enviar propuesta.
- Ver estado de propuestas enviadas.
- Ver proyectos recomendados.
- Abrir mensajes asociados a conversaciones.
- Editar perfil profesional.
- Subir foto de perfil.

## API REST

La API se sirve desde `server.js`.

### Configuracion

```http
GET /api/config
```

Devuelve configuracion publica necesaria para inicializar Supabase en el frontend.

### Usuario

```http
GET /api/me
```

Devuelve el usuario autenticado con perfiles relacionados.

```http
GET /api/users/:id
```

Devuelve un perfil publico activo.

### Dashboard

```http
GET /api/dashboard
```

Devuelve datos resumidos segun el rol del usuario autenticado.

### Proyectos

```http
GET /api/projects
```

Lista proyectos abiertos. Soporta filtros por texto, categoria y presupuesto.

Query params:

- `q`
- `category`
- `minBudget`
- `maxBudget`

```http
POST /api/projects
```

Crea un proyecto. Requiere usuario autenticado con rol `client`.

```http
GET /api/projects/:id
```

Devuelve detalle de proyecto, cliente y propuestas asociadas.

```http
DELETE /api/projects/:id
```

Elimina un proyecto. Requiere que el usuario sea cliente y dueno del proyecto.

### Propuestas

```http
POST /api/proposals
```

Crea una propuesta. Requiere usuario autenticado con rol `freelancer`.

```http
PATCH /api/proposals/:id/status
```

Actualiza una propuesta a `accepted` o `rejected`. Solo puede hacerlo el cliente dueno del proyecto.

```http
POST /api/proposals/:id/conversation
```

Crea o recupera una conversacion entre cliente y freelancer para una propuesta.

### Perfil

```http
PATCH /api/profile
```

Actualiza datos del perfil del usuario autenticado.

```http
POST /api/profile/photo
```

Sube foto de perfil a Supabase Storage.

### Conversaciones y Mensajes

```http
GET /api/conversations
```

Lista conversaciones del usuario autenticado.

```http
POST /api/messages
```

Envia mensaje dentro de una conversacion donde participa el usuario autenticado.

## Frontend

### `public/js/app.js`

Modulo compartido:

- Carga configuracion.
- Inicializa Supabase.
- Obtiene sesion.
- Envuelve llamadas autenticadas con `apiFetch`.
- Renderiza navegacion.
- Aplica visibilidad segun rol.
- Renderiza tarjetas de proyecto.
- Expone utilidades de formato.

### `public/js/auth.js`

Gestiona:

- Login.
- Registro.
- Recuperacion de password.
- Selector de rol en registro.

### `public/js/projects.js`

Gestiona:

- Listado y filtros de proyectos.
- Creacion de proyectos.
- Detalle de proyecto.
- Envio de propuestas.
- Gestion de propuestas recibidas.
- Eliminacion de proyectos propios.

### `public/js/dashboard.js`

Gestiona:

- Dashboard de cliente.
- Dashboard de freelancer.
- Acciones sobre propuestas.
- Eliminacion de proyectos desde el dashboard del cliente.

### `public/js/profile.js`

Gestiona:

- Visualizacion de perfil.
- Edicion de perfil propio.
- Subida de foto.
- Diferencias entre perfil cliente y freelancer.

### `public/js/messages.js`

Gestiona:

- Listado de conversaciones.
- Carga de mensajes.
- Envio de mensajes.

## Estilos

La hoja principal es:

```text
public/styles.css
```

Incluye:

- Variables CSS globales.
- Layout responsive.
- Componentes reutilizables:
  - navbar
  - cards
  - botones
  - formularios
  - badges
  - listas
  - chat
  - modales
- Tema minimalista con bordes rectos.
- Tipografias monoespaciadas y estilo pixel/programacion para titulos.

## Seguridad

- Las rutas privadas usan middleware `requireUser`.
- El token Bearer de Supabase se envia desde `apiFetch`.
- El backend valida el usuario autenticado con `auth.getUser()`.
- Los proyectos solo pueden ser creados o eliminados por clientes.
- Las propuestas solo pueden ser creadas por freelancers.
- El cliente solo puede modificar propuestas de sus propios proyectos.
- RLS protege las tablas en Supabase.

## Flujo de Uso

1. El usuario se registra como cliente o freelancer.
2. Supabase ejecuta el trigger y crea el registro en `users` y el perfil correspondiente.
3. El frontend obtiene la sesion y carga `/api/me`.
4. La navegacion se adapta segun el rol.
5. El cliente publica proyectos.
6. El freelancer explora proyectos y envia propuestas.
7. El cliente acepta o rechaza propuestas.
8. Cliente y freelancer conversan por proyecto.
9. El cliente puede eliminar un proyecto propio si ya no desea mostrarlo.

## Ejecucion Local

```bash
npm install
npm start
```

Abrir:

```text
http://localhost:3000
```

Para desarrollo:

```bash
npm run dev
```

## Consideraciones

- El frontend no usa framework; cualquier nueva vista debe incluir `app.js` y el modulo especifico necesario.
- Las operaciones sensibles deben pasar por el backend.
- La `SERVICE_ROLE_KEY` nunca debe exponerse en archivos del frontend.
- Si se cambian tablas o relaciones, actualizar `database/schema.sql` y las politicas RLS.
- Si se agregan nuevas rutas protegidas, usar `requireUser`.

