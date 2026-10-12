# Sistema de Inventario v2.1 Local

Esta versión reemplaza Google Apps Script/Google Sheets como backend principal por:

- Frontend: HTML + CSS + JavaScript (puedes abrirlo con Live Server en VS Code)
- Backend: Node.js + Express
- Base de datos: SQLite
- Autenticación: sesiones con token almacenadas en SQLite
- Roles: admin, supervisor, usuario

## Credenciales iniciales

- Usuario: `admin`
- Contraseña: `Admin123!`

## 1. Instalar dependencias

Desde la raíz del proyecto:

```bash
npm install
```

## 2. Levantar el backend

```bash
npm run server
```

Debe aparecer:

```text
API Inventario local activa en http://localhost:3001
Prueba: http://localhost:3001/api/ping
```

Prueba en el navegador:

```text
http://localhost:3001/api/ping
```

## 3. Abrir el frontend

En VS Code abre `frontend/index.html` con Live Server.

Normalmente será:

```text
http://127.0.0.1:5500/frontend/index.html
```

El frontend apunta por defecto a:

```js
const API_URL = 'http://localhost:3001/api';
```

## Base de datos

El archivo está en:

```text
backend/db/inventario.db
```

La base ya incluye el usuario administrador inicial y las tablas necesarias para esta versión y para continuar con la V3.

## Tablas principales

- usuarios
- sesiones
- categorias
- productos
- clientes
- vendedores
- compras
- ventas
- movimientos_inventario
- auditoria

## Permisos

### Admin
- Dashboard
- Inventario
- Productos
- Categorías
- Compras
- Ventas
- Usuarios y roles

### Supervisor
- Dashboard
- Inventario
- Productos
- Categorías
- Compras
- Ventas

### Usuario
- Inventario
- Ventas

## Lector de código de barras

Los campos de compra y venta aceptan lectores USB tipo teclado. Escanea el código; al enviar Enter el sistema busca el producto.

## Copias de seguridad

Con el backend detenido, copia este archivo:

```text
backend/db/inventario.db
```

Ese archivo contiene la información principal del sistema.

## Siguiente versión

La V3 se construirá sobre esta base para agregar:

- imágenes de productos
- Caja/POS con carrito de múltiples productos
- clientes
- vendedores
- comisiones
- métodos de pago
- dinero recibido y cambio
- factura/voucher imprimible
- detalle de ventas
- reportes y auditoría ampliada
