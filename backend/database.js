const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const {
  makeSalt,
  hashPassword
} = require("./auth");


// ============================================================
// RUTAS
// ============================================================

const DB_DIR =
  path.join(
    __dirname,
    "db"
  );

const DB_PATH =
  path.join(
    DB_DIR,
    "inventario.db"
  );


// ============================================================
// DIRECTORIO
// ============================================================

if (!fs.existsSync(DB_DIR)) {

  fs.mkdirSync(
    DB_DIR,
    {
      recursive: true
    }
  );
}


// ============================================================
// SQLITE
// ============================================================

const db =
  new DatabaseSync(
    DB_PATH
  );


db.exec(`
  PRAGMA foreign_keys = ON;
`);

db.exec(`
  PRAGMA journal_mode = WAL;
`);

db.exec(`
  PRAGMA synchronous = NORMAL;
`);


// ============================================================
// MIGRACIONES
// ============================================================

function ensureColumn(
  table,
  column,
  definition
) {

  const columns =
    db.prepare(
      `PRAGMA table_info(${table})`
    ).all();


  const exists =
    columns.some(
      item =>
        item.name ===
        column
    );


  if (!exists) {

    console.log(
      `Migración: agregando ${table}.${column}`
    );


    db.exec(`
      ALTER TABLE ${table}
      ADD COLUMN ${column} ${definition}
    `);
  }
}


// ============================================================
// INICIALIZAR
// ============================================================

function initDatabase() {

  // ==========================================================
  // USUARIOS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      nombre TEXT
        NOT NULL,

      usuario TEXT
        NOT NULL
        UNIQUE,

      password_hash TEXT
        NOT NULL,

      password_salt TEXT
        NOT NULL,

      rol TEXT
        NOT NULL
        DEFAULT 'usuario',

      activo INTEGER
        NOT NULL
        DEFAULT 1,

      fecha_creado TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      fecha_actualizado TEXT
    );
  `);


  // ==========================================================
  // SESIONES
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS sesiones (

      token TEXT
        PRIMARY KEY,

      usuario_id INTEGER
        NOT NULL,

      expira_en TEXT
        NOT NULL,

      fecha_creado TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        usuario_id
      )
      REFERENCES usuarios(id)
      ON DELETE CASCADE
    );
  `);


  // ==========================================================
  // CATEGORÍAS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      nombre TEXT
        NOT NULL
        UNIQUE,

      activo INTEGER
        NOT NULL
        DEFAULT 1,

      fecha_creado TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP
    );
  `);


  // ==========================================================
  // PRODUCTOS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS productos (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      codigo TEXT
        NOT NULL
        UNIQUE,

      nombre TEXT
        NOT NULL,

      categoria_id INTEGER,

      precio_compra REAL
        NOT NULL
        DEFAULT 0,

      precio_venta REAL
        NOT NULL
        DEFAULT 0,

      stock REAL
        NOT NULL
        DEFAULT 0,

      stock_minimo REAL
        NOT NULL
        DEFAULT 0,

      imagen TEXT,

      activo INTEGER
        NOT NULL
        DEFAULT 1,

      fecha_creado TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      fecha_actualizado TEXT,

      FOREIGN KEY (
        categoria_id
      )
      REFERENCES categorias(id)
    );
  `);


  // ==========================================================
  // CLIENTES
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      nombre TEXT
        NOT NULL,

      identificacion TEXT,

      telefono TEXT,

      correo TEXT,

      direccion TEXT,

      activo INTEGER
        NOT NULL
        DEFAULT 1,

      fecha_creado TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      fecha_actualizado TEXT
    );
  `);


  // ==========================================================
  // VENDEDORES
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS vendedores (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      nombre TEXT
        NOT NULL,

      telefono TEXT,

      correo TEXT,

      comision REAL
        NOT NULL
        DEFAULT 0,

      activo INTEGER
        NOT NULL
        DEFAULT 1,

      fecha_creado TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      fecha_actualizado TEXT
    );
  `);


  // ==========================================================
  // COMPRAS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS compras (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      producto_id INTEGER
        NOT NULL,

      cantidad REAL
        NOT NULL,

      precio_compra REAL
        NOT NULL,

      proveedor TEXT,

      usuario_id INTEGER,

      fecha TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        producto_id
      )
      REFERENCES productos(id),

      FOREIGN KEY (
        usuario_id
      )
      REFERENCES usuarios(id)
    );
  `);


  // ==========================================================
  // VENTAS LEGACY
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS ventas (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      numero_factura TEXT
        NOT NULL
        UNIQUE,

      producto_id INTEGER
        NOT NULL,

      cantidad REAL
        NOT NULL,

      precio_venta REAL
        NOT NULL,

      cliente TEXT,

      usuario_id INTEGER,

      fecha TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        producto_id
      )
      REFERENCES productos(id),

      FOREIGN KEY (
        usuario_id
      )
      REFERENCES usuarios(id)
    );
  `);


  // ==========================================================
  // VENTAS POS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS ventas_pos (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      numero_factura TEXT
        NOT NULL
        UNIQUE,

      cliente_id INTEGER,

      vendedor_id INTEGER,

      usuario_id INTEGER
        NOT NULL,

      subtotal REAL
        NOT NULL
        DEFAULT 0,

      descuento REAL
        NOT NULL
        DEFAULT 0,

      total REAL
        NOT NULL
        DEFAULT 0,

      porcentaje_comision REAL
        NOT NULL
        DEFAULT 0,

      monto_comision REAL
        NOT NULL
        DEFAULT 0,

      estado TEXT
        NOT NULL
        DEFAULT 'COMPLETADA',

      fecha TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        cliente_id
      )
      REFERENCES clientes(id),

      FOREIGN KEY (
        vendedor_id
      )
      REFERENCES vendedores(id),

      FOREIGN KEY (
        usuario_id
      )
      REFERENCES usuarios(id)
    );
  `);


  // ==========================================================
  // DETALLE DE VENTAS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS detalle_ventas (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      venta_id INTEGER
        NOT NULL,

      producto_id INTEGER
        NOT NULL,

      cantidad REAL
        NOT NULL,

      precio_unitario REAL
        NOT NULL,

      subtotal REAL
        NOT NULL,

      FOREIGN KEY (
        venta_id
      )
      REFERENCES ventas_pos(id)
      ON DELETE CASCADE,

      FOREIGN KEY (
        producto_id
      )
      REFERENCES productos(id)
    );
  `);


  // ==========================================================
  // PAGOS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS pagos (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      venta_id INTEGER
        NOT NULL,

      metodo TEXT
        NOT NULL,

      monto_recibido REAL
        NOT NULL
        DEFAULT 0,

      monto_pagado REAL
        NOT NULL
        DEFAULT 0,

      cambio REAL
        NOT NULL
        DEFAULT 0,

      referencia TEXT,

      fecha TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        venta_id
      )
      REFERENCES ventas_pos(id)
      ON DELETE CASCADE
    );
  `);


  // ==========================================================
  // MOVIMIENTOS
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS movimientos_inventario (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      producto_id INTEGER
        NOT NULL,

      tipo TEXT
        NOT NULL,

      cantidad REAL
        NOT NULL,

      stock_anterior REAL
        NOT NULL,

      stock_nuevo REAL
        NOT NULL,

      referencia TEXT,

      usuario_id INTEGER,

      fecha TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        producto_id
      )
      REFERENCES productos(id),

      FOREIGN KEY (
        usuario_id
      )
      REFERENCES usuarios(id)
    );
  `);


  // ==========================================================
  // AUDITORÍA
  // ==========================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS auditoria (

      id INTEGER
        PRIMARY KEY AUTOINCREMENT,

      usuario_id INTEGER,

      accion TEXT
        NOT NULL,

      entidad TEXT,

      entidad_id TEXT,

      detalle TEXT,

      fecha TEXT
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (
        usuario_id
      )
      REFERENCES usuarios(id)
    );
  `);


  // ==========================================================
  // MIGRACIONES
  // ==========================================================

  ensureColumn(
    "productos",
    "imagen",
    "TEXT"
  );

  ensureColumn(
    "productos",
    "stock_minimo",
    "REAL NOT NULL DEFAULT 0"
  );

  ensureColumn(
    "productos",
    "fecha_actualizado",
    "TEXT"
  );

  ensureColumn(
    "usuarios",
    "password_salt",
    "TEXT"
  );

  ensureColumn(
    "usuarios",
    "fecha_actualizado",
    "TEXT"
  );

  ensureColumn(
    "categorias",
    "activo",
    "INTEGER NOT NULL DEFAULT 1"
  );

  ensureColumn(
    "clientes",
    "identificacion",
    "TEXT"
  );

  ensureColumn(
    "clientes",
    "telefono",
    "TEXT"
  );

  ensureColumn(
    "clientes",
    "correo",
    "TEXT"
  );

  ensureColumn(
    "clientes",
    "direccion",
    "TEXT"
  );

  ensureColumn(
    "clientes",
    "fecha_actualizado",
    "TEXT"
  );

  ensureColumn(
    "vendedores",
    "correo",
    "TEXT"
  );

  ensureColumn(
    "vendedores",
    "comision",
    "REAL NOT NULL DEFAULT 0"
  );

  ensureColumn(
    "vendedores",
    "fecha_actualizado",
    "TEXT"
  );

  ensureColumn(
    "auditoria",
    "entidad",
    "TEXT"
  );

  ensureColumn(
    "auditoria",
    "entidad_id",
    "TEXT"
  );


  // ==========================================================
  // ÍNDICES
  // ==========================================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_productos_codigo
    ON productos(codigo);

    CREATE INDEX IF NOT EXISTS
      idx_productos_nombre
    ON productos(nombre);

    CREATE INDEX IF NOT EXISTS
      idx_clientes_nombre
    ON clientes(nombre);

    CREATE INDEX IF NOT EXISTS
      idx_vendedores_nombre
    ON vendedores(nombre);

    CREATE INDEX IF NOT EXISTS
      idx_ventas_pos_fecha
    ON ventas_pos(fecha);

    CREATE INDEX IF NOT EXISTS
      idx_detalle_venta
    ON detalle_ventas(venta_id);

    CREATE INDEX IF NOT EXISTS
      idx_movimientos_producto
    ON movimientos_inventario(producto_id);
  `);


  // ==========================================================
  // CLIENTE POR DEFECTO
  // ==========================================================

  const defaultClient =
    db.prepare(`
      SELECT id
      FROM clientes
      WHERE nombre = ?
    `).get(
      "Consumidor Final"
    );


  if (!defaultClient) {

    db.prepare(`
      INSERT INTO clientes (
        nombre,
        activo
      )
      VALUES (?, 1)
    `).run(
      "Consumidor Final"
    );
  }


  // ==========================================================
  // ADMIN
  // ==========================================================

  const admin =
    db.prepare(`
      SELECT id
      FROM usuarios
      WHERE usuario = ?
      COLLATE NOCASE
    `).get(
      "admin"
    );


  if (!admin) {

    const salt =
      makeSalt();


    const hash =
      hashPassword(
        "Admin123!",
        salt
      );


    db.prepare(`
      INSERT INTO usuarios (
        nombre,
        usuario,
        password_hash,
        password_salt,
        rol,
        activo
      )

      VALUES (
        ?, ?, ?, ?, ?, 1
      )
    `).run(
      "Administrador",
      "admin",
      hash,
      salt,
      "admin"
    );
  }


  console.log(
    "Base de datos SQLite V3.1 inicializada."
  );


  return db;
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

  db,

  initDatabase,

  DB_PATH
};