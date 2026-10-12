const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const {
  db,
  initDatabase,
  DB_PATH,
} = require("./database");

const {
  makeSalt,
  hashPassword,
  verifyPassword,
  createSessionToken,
} = require("./auth");

// ============================================================
// DATABASE
// ============================================================

initDatabase();

// ============================================================
// EXPRESS
// ============================================================

const app = express();

const PORT = process.env.PORT || 3001;

const SESSION_HOURS = 8;

// ============================================================
// UPLOADS
// ============================================================

const UPLOAD_DIR = path.join(
  __dirname,
  "uploads",
  "productos"
);

fs.mkdirSync(UPLOAD_DIR, {
  recursive: true,
});

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename(req, file, cb) {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const filename =
      `producto-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

    cb(null, filename);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter(req, file, cb) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          "Solo se permiten imágenes JPG, PNG o WEBP."
        )
      );
    }

    cb(null, true);
  },
});

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  cors({
    origin: true,
  })
);

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads")
  )
);

// ============================================================
// HELPERS
// ============================================================

function nowPlusHours(hours) {
  return new Date(
    Date.now() +
    hours * 60 * 60 * 1000
  ).toISOString();
}

function sqliteId(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return value;
}

function transaction(callback) {
  db.exec("BEGIN IMMEDIATE TRANSACTION");

  try {
    const result = callback();

    db.exec("COMMIT");

    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch { }

    throw error;
  }
}

function audit(
  userId,
  accion,
  entidad = null,
  entidadId = null,
  detalle = null
) {
  db.prepare(`
    INSERT INTO auditoria (
      usuario_id,
      accion,
      entidad,
      entidad_id,
      detalle
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId || null,
    accion,
    entidad,
    entidadId == null
      ? null
      : String(entidadId),
    detalle
  );
}

// ============================================================
// AUTH
// ============================================================

function authRequired(req, res, next) {
  const header =
    req.headers.authorization || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token) {
    return res.status(401).json({
      status: "error",
      message: "Sesión requerida.",
    });
  }

  const session = db.prepare(`
    SELECT
      s.token,
      s.expira_en,
      u.id,
      u.nombre,
      u.usuario,
      u.rol,
      u.activo
    FROM sesiones s
    JOIN usuarios u
      ON u.id = s.usuario_id
    WHERE s.token = ?
  `).get(token);

  if (
    !session ||
    !session.activo ||
    new Date(session.expira_en) <=
    new Date()
  ) {
    if (session) {
      db.prepare(`
        DELETE FROM sesiones
        WHERE token = ?
      `).run(token);
    }

    return res.status(401).json({
      status: "error",
      message:
        "Sesión inválida o expirada.",
    });
  }

  req.token = token;

  req.user = {
    id: session.id,
    nombre: session.nombre,
    usuario: session.usuario,
    rol: session.rol,
  };

  next();
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (
      !req.user ||
      !roles.includes(req.user.rol)
    ) {
      return res.status(403).json({
        status: "error",
        message:
          "No tiene permisos para realizar esta acción.",
      });
    }

    next();
  };
}

// ============================================================
// PING
// ============================================================

app.get("/api/ping", (req, res) => {
  res.json({
    status: "success",
    message: "API local activa",
    version: "3.3",
    database: DB_PATH,
  });
});

// ============================================================
// LOGIN
// ============================================================

app.post(
  "/api/auth/login",
  (req, res) => {
    const usuario = String(
      req.body.usuario || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ""
    );

    if (!usuario || !password) {
      return res.status(400).json({
        status: "error",
        message:
          "Ingrese usuario y contraseña.",
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM usuarios
      WHERE usuario = ?
      COLLATE NOCASE
    `).get(usuario);

    if (
      !user ||
      !user.activo ||
      !verifyPassword(
        password,
        user.password_salt,
        user.password_hash
      )
    ) {
      return res.status(401).json({
        status: "error",
        message:
          "Usuario o contraseña incorrectos.",
      });
    }

    db.prepare(`
      DELETE FROM sesiones
      WHERE
        usuario_id = ?
        OR expira_en <= ?
    `).run(
      user.id,
      new Date().toISOString()
    );

    const token =
      createSessionToken();

    db.prepare(`
      INSERT INTO sesiones (
        token,
        usuario_id,
        expira_en
      )
      VALUES (?, ?, ?)
    `).run(
      token,
      user.id,
      nowPlusHours(SESSION_HOURS)
    );

    audit(
      user.id,
      "LOGIN",
      "usuarios",
      user.id,
      `Inicio de sesión de ${user.usuario}`
    );

    res.json({
      status: "success",
      token,

      user: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        rol: user.rol,
      },
    });
  }
);

// ============================================================
// AUTH ME
// ============================================================

app.get(
  "/api/auth/me",
  authRequired,
  (req, res) => {
    res.json({
      status: "success",
      user: req.user,
    });
  }
);

// ============================================================
// LOGOUT
// ============================================================

app.post(
  "/api/auth/logout",
  authRequired,
  (req, res) => {
    db.prepare(`
      DELETE FROM sesiones
      WHERE token = ?
    `).run(req.token);

    audit(
      req.user.id,
      "LOGOUT",
      "usuarios",
      req.user.id,
      "Cierre de sesión"
    );

    res.json({
      status: "success",
      message: "Sesión cerrada.",
    });
  }
);

// ============================================================
// CATEGORIAS
// ============================================================

app.get(
  "/api/categories",
  authRequired,
  (req, res) => {
    const rows = db.prepare(`
      SELECT *
      FROM categorias
      WHERE activo = 1
      ORDER BY nombre
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

app.post(
  "/api/categories",
  authRequired,
  allowRoles("admin", "supervisor"),
  (req, res) => {
    const nombre = String(
      req.body.nombre || ""
    ).trim();

    if (!nombre) {
      return res.status(400).json({
        status: "error",
        message:
          "Ingrese el nombre de la categoría.",
      });
    }

    try {
      const info = db.prepare(`
        INSERT INTO categorias (
          nombre
        )
        VALUES (?)
      `).run(nombre);

      const id = sqliteId(
        info.lastInsertRowid
      );

      audit(
        req.user.id,
        "CREAR_CATEGORIA",
        "categorias",
        id,
        nombre
      );

      res.status(201).json({
        status: "success",
        message:
          "Categoría registrada.",
        id,
      });
    } catch (error) {
      if (
        String(error.code || "").includes(
          "SQLITE_CONSTRAINT"
        )
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "La categoría ya existe.",
        });
      }

      throw error;
    }
  }
);

// ============================================================
// PRODUCTOS
// ============================================================

app.get(
  "/api/products",
  authRequired,
  (req, res) => {
    const q = String(
      req.query.q || ""
    ).trim();

    const base = `
      SELECT
        p.*,
        c.nombre AS categoria
      FROM productos p
      LEFT JOIN categorias c
        ON c.id = p.categoria_id
      WHERE p.activo = 1
    `;

    let rows;

    if (q) {
      rows = db.prepare(
        base +
        `
        AND (
          p.codigo = ?
          OR p.nombre LIKE ?
          OR CAST(p.id AS TEXT) LIKE ?
        )
        ORDER BY p.nombre
        `
      ).all(
        q,
        `%${q}%`,
        `%${q}%`
      );
    } else {
      rows = db.prepare(
        base +
        `
        ORDER BY p.nombre
        `
      ).all();
    }

    res.json({
      status: "success",
      data: rows,
    });
  }
);

app.get(
  "/api/products/barcode/:code",
  authRequired,
  (req, res) => {
    const row = db.prepare(`
      SELECT
        p.*,
        c.nombre AS categoria
      FROM productos p
      LEFT JOIN categorias c
        ON c.id = p.categoria_id
      WHERE
        p.codigo = ?
        AND p.activo = 1
    `).get(
      String(req.params.code)
    );

    if (!row) {
      return res.status(404).json({
        status: "error",
        message:
          "Producto no encontrado.",
      });
    }

    res.json({
      status: "success",
      data: row,
    });
  }
);

app.post(
  "/api/products",
  authRequired,
  allowRoles("admin", "supervisor"),
  upload.single("imagen"),
  (req, res) => {
    const codigo = String(
      req.body.codigo || ""
    ).trim();

    const nombre = String(
      req.body.nombre || ""
    ).trim();

    const categoriaId =
      req.body.categoria_id
        ? Number(
          req.body.categoria_id
        )
        : null;

    const precioCompra = Number(
      req.body.precio_compra || 0
    );

    const precioVenta = Number(
      req.body.precio_venta || 0
    );

    const stock = Number(
      req.body.stock || 0
    );

    const stockMinimo = Number(
      req.body.stock_minimo || 0
    );

    if (!codigo || !nombre) {
      return res.status(400).json({
        status: "error",
        message:
          "Código y nombre son obligatorios.",
      });
    }

    const imagePath = req.file
      ? `/uploads/productos/${req.file.filename}`
      : null;

    try {
      const id = transaction(() => {
        const info = db.prepare(`
          INSERT INTO productos (
            codigo,
            nombre,
            categoria_id,
            precio_compra,
            precio_venta,
            stock,
            stock_minimo,
            imagen,
            fecha_actualizado
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            datetime('now','localtime')
          )
        `).run(
          codigo,
          nombre,
          categoriaId,
          precioCompra,
          precioVenta,
          stock,
          stockMinimo,
          imagePath
        );

        const productId =
          sqliteId(
            info.lastInsertRowid
          );

        if (stock > 0) {
          db.prepare(`
            INSERT INTO movimientos_inventario (
              producto_id,
              tipo,
              cantidad,
              stock_anterior,
              stock_nuevo,
              referencia,
              usuario_id
            )
            VALUES (
              ?,
              'INICIAL',
              ?,
              0,
              ?,
              'Registro inicial',
              ?
            )
          `).run(
            productId,
            stock,
            stock,
            req.user.id
          );
        }

        audit(
          req.user.id,
          "CREAR_PRODUCTO",
          "productos",
          productId,
          `${codigo} - ${nombre}`
        );

        return productId;
      });

      res.status(201).json({
        status: "success",
        message:
          "Producto registrado.",
        id,
      });
    } catch (error) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch { }
      }

      if (
        String(error.code || "").includes(
          "SQLITE_CONSTRAINT"
        )
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "El código ya está registrado.",
        });
      }

      throw error;
    }
  }
);

// ============================================================
// CLIENTES
// ============================================================

app.get(
  "/api/clients",
  authRequired,
  (req, res) => {
    const rows = db.prepare(`
      SELECT *
      FROM clientes
      WHERE activo = 1
      ORDER BY nombre
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

app.post(
  "/api/clients",
  authRequired,
  allowRoles(
    "admin",
    "supervisor",
    "usuario"
  ),
  (req, res) => {
    const nombre = String(
      req.body.nombre || ""
    ).trim();

    if (!nombre) {
      return res.status(400).json({
        status: "error",
        message:
          "Ingrese el nombre del cliente.",
      });
    }

    const info = db.prepare(`
      INSERT INTO clientes (
        nombre,
        identificacion,
        telefono,
        correo,
        direccion
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      nombre,
      String(
        req.body.identificacion || ""
      ).trim(),
      String(
        req.body.telefono || ""
      ).trim(),
      String(
        req.body.correo || ""
      ).trim(),
      String(
        req.body.direccion || ""
      ).trim()
    );

    const id = sqliteId(
      info.lastInsertRowid
    );

    audit(
      req.user.id,
      "CREAR_CLIENTE",
      "clientes",
      id,
      nombre
    );

    res.status(201).json({
      status: "success",
      message:
        "Cliente registrado.",
      id,
    });
  }
);

// ============================================================
// VENDEDORES
// ============================================================

app.get(
  "/api/sellers",
  authRequired,
  (req, res) => {
    const rows = db.prepare(`
      SELECT *
      FROM vendedores
      WHERE activo = 1
      ORDER BY nombre
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

app.post(
  "/api/sellers",
  authRequired,
  allowRoles("admin", "supervisor"),
  (req, res) => {
    const nombre = String(
      req.body.nombre || ""
    ).trim();

    const comision = Number(
      req.body.comision || 0
    );

    if (!nombre) {
      return res.status(400).json({
        status: "error",
        message:
          "Ingrese el nombre del vendedor.",
      });
    }

    if (
      !Number.isFinite(comision) ||
      comision < 0 ||
      comision > 100
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "La comisión debe estar entre 0 y 100.",
      });
    }

    const info = db.prepare(`
      INSERT INTO vendedores (
        nombre,
        telefono,
        correo,
        comision
      )
      VALUES (?, ?, ?, ?)
    `).run(
      nombre,
      String(
        req.body.telefono || ""
      ).trim(),
      String(
        req.body.correo || ""
      ).trim(),
      comision
    );

    const id = sqliteId(
      info.lastInsertRowid
    );

    audit(
      req.user.id,
      "CREAR_VENDEDOR",
      "vendedores",
      id,
      `${nombre} - ${comision}%`
    );

    res.status(201).json({
      status: "success",
      message:
        "Vendedor registrado.",
      id,
    });
  }
);

// ============================================================
// COMPRAS
// ============================================================

app.post(
  "/api/purchases",
  authRequired,
  allowRoles("admin", "supervisor"),
  (req, res) => {
    const productoId = Number(
      req.body.producto_id
    );

    const cantidad = Number(
      req.body.cantidad
    );

    const precio = Number(
      req.body.precio_compra
    );

    const proveedor = String(
      req.body.proveedor || ""
    ).trim();

    if (
      !productoId ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0 ||
      !Number.isFinite(precio) ||
      precio < 0
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Datos de compra inválidos.",
      });
    }

    try {
      const result = transaction(() => {
        const product = db.prepare(`
          SELECT *
          FROM productos
          WHERE
            id = ?
            AND activo = 1
        `).get(productoId);

        if (!product) {
          throw new Error(
            "PRODUCT_NOT_FOUND"
          );
        }

        const newStock =
          Number(product.stock) +
          cantidad;

        db.prepare(`
          UPDATE productos
          SET
            stock = ?,
            precio_compra = ?,
            fecha_actualizado =
              datetime('now','localtime')
          WHERE id = ?
        `).run(
          newStock,
          precio,
          productoId
        );

        const info = db.prepare(`
          INSERT INTO compras (
            producto_id,
            cantidad,
            precio_compra,
            proveedor,
            usuario_id
          )
          VALUES (?, ?, ?, ?, ?)
        `).run(
          productoId,
          cantidad,
          precio,
          proveedor,
          req.user.id
        );

        const compraId =
          sqliteId(
            info.lastInsertRowid
          );

        db.prepare(`
          INSERT INTO movimientos_inventario (
            producto_id,
            tipo,
            cantidad,
            stock_anterior,
            stock_nuevo,
            referencia,
            usuario_id
          )
          VALUES (
            ?,
            'COMPRA',
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `).run(
          productoId,
          cantidad,
          product.stock,
          newStock,
          `COMP-${compraId}`,
          req.user.id
        );

        return {
          id: compraId,
          stock: newStock,
        };
      });

      res.status(201).json({
        status: "success",
        message:
          "Compra registrada.",
        data: result,
      });
    } catch (error) {
      if (
        error.message ===
        "PRODUCT_NOT_FOUND"
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Producto no encontrado.",
        });
      }

      throw error;
    }
  }
);

// ============================================================
// VENTA RÁPIDA
// ============================================================

app.post(
  "/api/sales",
  authRequired,
  allowRoles(
    "admin",
    "supervisor",
    "usuario"
  ),
  (req, res) => {
    const productoId = Number(
      req.body.producto_id
    );

    const cantidad = Number(
      req.body.cantidad
    );

    const precio = Number(
      req.body.precio_venta
    );

    const cliente =
      String(
        req.body.cliente ||
        "Consumidor Final"
      ).trim() ||
      "Consumidor Final";

    try {
      const result = transaction(() => {
        const product = db.prepare(`
          SELECT *
          FROM productos
          WHERE
            id = ?
            AND activo = 1
        `).get(productoId);

        if (!product) {
          throw new Error(
            "PRODUCT_NOT_FOUND"
          );
        }

        if (
          Number(product.stock) <
          cantidad
        ) {
          throw new Error(
            "STOCK_INSUFFICIENT"
          );
        }

        const newStock =
          Number(product.stock) -
          cantidad;

        const temporary =
          `TMP-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        const info = db.prepare(`
          INSERT INTO ventas (
            numero_factura,
            producto_id,
            cantidad,
            precio_venta,
            cliente,
            usuario_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          temporary,
          productoId,
          cantidad,
          precio,
          cliente,
          req.user.id
        );

        const ventaId =
          sqliteId(
            info.lastInsertRowid
          );

        const factura =
          `FAC-${String(
            ventaId
          ).padStart(
            6,
            "0"
          )}`;

        db.prepare(`
          UPDATE ventas
          SET numero_factura = ?
          WHERE id = ?
        `).run(
          factura,
          ventaId
        );

        db.prepare(`
          UPDATE productos
          SET
            stock = ?,
            fecha_actualizado =
              datetime('now','localtime')
          WHERE id = ?
        `).run(
          newStock,
          productoId
        );

        db.prepare(`
          INSERT INTO movimientos_inventario (
            producto_id,
            tipo,
            cantidad,
            stock_anterior,
            stock_nuevo,
            referencia,
            usuario_id
          )
          VALUES (
            ?,
            'VENTA',
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `).run(
          productoId,
          -cantidad,
          product.stock,
          newStock,
          factura,
          req.user.id
        );

        return {
          id: ventaId,
          numero_factura:
            factura,
          stock:
            newStock,
        };
      });

      res.status(201).json({
        status: "success",
        message:
          "Venta registrada.",
        data:
          result,
      });
    } catch (error) {
      if (
        error.message ===
        "PRODUCT_NOT_FOUND"
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "Producto no encontrado.",
        });
      }

      if (
        error.message ===
        "STOCK_INSUFFICIENT"
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "Stock insuficiente.",
        });
      }

      throw error;
    }
  }
);

// ============================================================
// POS / CAJA
// ============================================================

app.post(
  "/api/pos/sales",
  authRequired,
  allowRoles(
    "admin",
    "supervisor",
    "usuario"
  ),
  (req, res) => {
    const items = Array.isArray(
      req.body.items
    )
      ? req.body.items
      : [];

    const clienteId =
      req.body.cliente_id
        ? Number(
          req.body.cliente_id
        )
        : null;

    const vendedorId =
      req.body.vendedor_id
        ? Number(
          req.body.vendedor_id
        )
        : null;

    const descuento = Number(
      req.body.descuento || 0
    );

    const metodoPago = String(
      req.body.metodo_pago ||
      "EFECTIVO"
    )
      .trim()
      .toUpperCase();

    let montoRecibido = Number(
      req.body.monto_recibido || 0
    );

    const referencia = String(
      req.body.referencia || ""
    ).trim();

    if (!items.length) {
      return res.status(400).json({
        status: "error",
        message:
          "La venta no contiene productos.",
      });
    }

    try {
      const result = transaction(() => {
        let client = null;

        if (clienteId) {
          client = db.prepare(`
            SELECT *
            FROM clientes
            WHERE
              id = ?
              AND activo = 1
          `).get(clienteId);

          if (!client) {
            throw new Error(
              "CLIENT_NOT_FOUND"
            );
          }
        }

        let seller = null;

        if (vendedorId) {
          seller = db.prepare(`
            SELECT *
            FROM vendedores
            WHERE
              id = ?
              AND activo = 1
          `).get(vendedorId);

          if (!seller) {
            throw new Error(
              "SELLER_NOT_FOUND"
            );
          }
        }

        const normalizedItems = [];

        let subtotal = 0;

        for (const item of items) {
          const productoId = Number(
            item.producto_id
          );

          const cantidad = Number(
            item.cantidad
          );

          if (
            !productoId ||
            !Number.isFinite(
              cantidad
            ) ||
            cantidad <= 0
          ) {
            throw new Error(
              "INVALID_ITEM"
            );
          }

          const product = db.prepare(`
            SELECT *
            FROM productos
            WHERE
              id = ?
              AND activo = 1
          `).get(productoId);

          if (!product) {
            throw new Error(
              "PRODUCT_NOT_FOUND"
            );
          }

          if (
            Number(product.stock) <
            cantidad
          ) {
            throw new Error(
              `STOCK_INSUFFICIENT:${product.nombre}`
            );
          }

          const precio =
            Number(
              product.precio_venta
            );

          const lineSubtotal =
            precio *
            cantidad;

          subtotal +=
            lineSubtotal;

          normalizedItems.push({
            product,
            cantidad,
            precio,
            subtotal:
              lineSubtotal,
          });
        }

        if (
          descuento >
          subtotal
        ) {
          throw new Error(
            "DISCOUNT_TOO_HIGH"
          );
        }

        const total =
          subtotal -
          descuento;

        const porcentajeComision =
          seller
            ? Number(
              seller.comision || 0
            )
            : 0;

        const montoComision =
          total *
          porcentajeComision /
          100;

        let cambio = 0;

        if (
          metodoPago ===
          "EFECTIVO"
        ) {
          if (
            !Number.isFinite(
              montoRecibido
            ) ||
            montoRecibido <
            total
          ) {
            throw new Error(
              "INSUFFICIENT_PAYMENT"
            );
          }

          cambio =
            montoRecibido -
            total;
        } else {
          montoRecibido =
            total;

          cambio =
            0;
        }

        const temporary =
          `TMP-POS-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        const saleInfo = db.prepare(`
          INSERT INTO ventas_pos (
            numero_factura,
            cliente_id,
            vendedor_id,
            usuario_id,
            subtotal,
            descuento,
            total,
            porcentaje_comision,
            monto_comision,
            estado
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETADA'
          )
        `).run(
          temporary,
          clienteId,
          vendedorId,
          req.user.id,
          subtotal,
          descuento,
          total,
          porcentajeComision,
          montoComision
        );

        const ventaId =
          sqliteId(
            saleInfo.lastInsertRowid
          );

        const numeroFactura =
          `POS-${String(
            ventaId
          ).padStart(
            6,
            "0"
          )}`;

        db.prepare(`
          UPDATE ventas_pos
          SET numero_factura = ?
          WHERE id = ?
        `).run(
          numeroFactura,
          ventaId
        );

        for (
          const item
          of normalizedItems
        ) {
          db.prepare(`
            INSERT INTO detalle_ventas (
              venta_id,
              producto_id,
              cantidad,
              precio_unitario,
              subtotal
            )
            VALUES (?, ?, ?, ?, ?)
          `).run(
            ventaId,
            item.product.id,
            item.cantidad,
            item.precio,
            item.subtotal
          );

          const stockAnterior =
            Number(
              item.product.stock
            );

          const stockNuevo =
            stockAnterior -
            item.cantidad;

          db.prepare(`
            UPDATE productos
            SET
              stock = ?,
              fecha_actualizado =
                datetime('now','localtime')
            WHERE id = ?
          `).run(
            stockNuevo,
            item.product.id
          );

          db.prepare(`
            INSERT INTO movimientos_inventario (
              producto_id,
              tipo,
              cantidad,
              stock_anterior,
              stock_nuevo,
              referencia,
              usuario_id
            )
            VALUES (
              ?,
              'VENTA_POS',
              ?,
              ?,
              ?,
              ?,
              ?
            )
          `).run(
            item.product.id,
            -item.cantidad,
            stockAnterior,
            stockNuevo,
            numeroFactura,
            req.user.id
          );
        }

        db.prepare(`
          INSERT INTO pagos (
            venta_id,
            metodo,
            monto_recibido,
            monto_pagado,
            cambio,
            referencia
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          ventaId,
          metodoPago,
          montoRecibido,
          total,
          cambio,
          referencia
        );

        audit(
          req.user.id,
          "VENTA_POS",
          "ventas_pos",
          ventaId,
          `${numeroFactura} - Total ${total}`
        );

        const saleDate =
          db.prepare(`
            SELECT fecha
            FROM ventas_pos
            WHERE id = ?
          `).get(
            ventaId
          ).fecha;

        return {
          id:
            ventaId,

          numero_factura:
            numeroFactura,

          fecha:
            saleDate,

          subtotal,

          descuento,

          total,

          porcentaje_comision:
            porcentajeComision,

          monto_comision:
            montoComision,

          metodo_pago:
            metodoPago,

          monto_recibido:
            montoRecibido,

          cambio,

          referencia,

          cliente:
            client
              ? client.nombre
              : "Consumidor Final",

          vendedor:
            seller
              ? seller.nombre
              : "",

          cajero:
            req.user.nombre,

          items:
            normalizedItems.map(
              item => ({
                producto_id:
                  item.product.id,

                codigo:
                  item.product.codigo,

                nombre:
                  item.product.nombre,

                cantidad:
                  item.cantidad,

                precio:
                  item.precio,

                subtotal:
                  item.subtotal,
              })
            ),
        };
      });

      res.status(201).json({
        status: "success",
        message:
          "Venta realizada correctamente.",
        data:
          result,
      });
    } catch (error) {
      if (
        error.message.startsWith(
          "STOCK_INSUFFICIENT:"
        )
      ) {
        const product =
          error.message
            .split(":")
            .slice(1)
            .join(":");

        return res.status(409).json({
          status: "error",
          message:
            `Stock insuficiente para ${product}.`,
        });
      }

      const errors = {
        CLIENT_NOT_FOUND:
          "Cliente no encontrado.",

        SELLER_NOT_FOUND:
          "Vendedor no encontrado.",

        PRODUCT_NOT_FOUND:
          "Producto no encontrado.",

        INVALID_ITEM:
          "Hay productos con cantidades inválidas.",

        DISCOUNT_TOO_HIGH:
          "El descuento no puede ser mayor que el subtotal.",

        INSUFFICIENT_PAYMENT:
          "El monto recibido es menor que el total.",
      };

      if (
        errors[error.message]
      ) {
        return res.status(400).json({
          status: "error",
          message:
            errors[
            error.message
            ],
        });
      }

      throw error;
    }
  }
);

// ============================================================
// LISTAR FACTURAS POS
// ============================================================

app.get(
  "/api/pos/sales",
  authRequired,
  allowRoles(
    "admin",
    "supervisor",
    "usuario"
  ),
  (req, res) => {
    const rows = db.prepare(`
      SELECT
        vp.id,
        vp.numero_factura,
        vp.fecha,
        vp.subtotal,
        vp.descuento,
        vp.total,
        vp.porcentaje_comision,
        vp.monto_comision,
        vp.estado,

        COALESCE(
          c.nombre,
          'Consumidor Final'
        ) AS cliente,

        COALESCE(
          v.nombre,
          ''
        ) AS vendedor,

        u.nombre AS cajero,

        p.metodo AS metodo_pago,

        p.monto_recibido,

        p.monto_pagado,

        p.cambio,

        p.referencia

      FROM ventas_pos vp

      LEFT JOIN clientes c
        ON c.id =
           vp.cliente_id

      LEFT JOIN vendedores v
        ON v.id =
           vp.vendedor_id

      LEFT JOIN usuarios u
        ON u.id =
           vp.usuario_id

      LEFT JOIN pagos p
        ON p.venta_id =
           vp.id

      ORDER BY
        vp.id DESC

      LIMIT 300
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

// ============================================================
// FACTURA INDIVIDUAL
// ============================================================

app.get(
  "/api/pos/sales/:id",
  authRequired,
  allowRoles(
    "admin",
    "supervisor",
    "usuario"
  ),
  (req, res) => {
    const ventaId =
      Number(
        req.params.id
      );

    const sale = db.prepare(`
      SELECT
        vp.*,

        COALESCE(
          c.nombre,
          'Consumidor Final'
        ) AS cliente,

        c.identificacion
          AS cliente_identificacion,

        c.telefono
          AS cliente_telefono,

        COALESCE(
          v.nombre,
          ''
        ) AS vendedor,

        u.nombre AS cajero,

        u.usuario
          AS usuario_cajero,

        p.metodo
          AS metodo_pago,

        p.monto_recibido,

        p.monto_pagado,

        p.cambio,

        p.referencia

      FROM ventas_pos vp

      LEFT JOIN clientes c
        ON c.id =
           vp.cliente_id

      LEFT JOIN vendedores v
        ON v.id =
           vp.vendedor_id

      LEFT JOIN usuarios u
        ON u.id =
           vp.usuario_id

      LEFT JOIN pagos p
        ON p.venta_id =
           vp.id

      WHERE vp.id = ?
    `).get(
      ventaId
    );

    if (!sale) {
      return res.status(404).json({
        status: "error",
        message:
          "Factura no encontrada.",
      });
    }

    const items = db.prepare(`
      SELECT
        dv.id,
        dv.producto_id,

        p.codigo,

        p.nombre,

        dv.cantidad,

        dv.precio_unitario
          AS precio,

        dv.subtotal

      FROM detalle_ventas dv

      JOIN productos p
        ON p.id =
           dv.producto_id

      WHERE dv.venta_id = ?

      ORDER BY dv.id
    `).all(
      ventaId
    );

    res.json({
      status: "success",

      data: {
        ...sale,
        items,
      },
    });
  }
);

// ============================================================
// DASHBOARD
// ============================================================

app.get(
  "/api/dashboard",
  authRequired,
  allowRoles(
    "admin",
    "supervisor"
  ),
  (req, res) => {
    const legacy =
      Number(
        db.prepare(`
          SELECT
            COALESCE(
              SUM(
                cantidad *
                precio_venta
              ),
              0
            ) AS total
          FROM ventas
        `).get().total || 0
      );

    const pos =
      Number(
        db.prepare(`
          SELECT
            COALESCE(
              SUM(total),
              0
            ) AS total
          FROM ventas_pos
          WHERE estado =
                'COMPLETADA'
        `).get().total || 0
      );

    const ventas =
      legacy +
      pos;

    const compras =
      Number(
        db.prepare(`
          SELECT
            COALESCE(
              SUM(
                cantidad *
                precio_compra
              ),
              0
            ) AS total
          FROM compras
        `).get().total || 0
      );

    const productos =
      Number(
        db.prepare(`
          SELECT
            COUNT(*) AS total
          FROM productos
          WHERE activo = 1
        `).get().total || 0
      );

    const stockBajo =
      Number(
        db.prepare(`
          SELECT
            COUNT(*) AS total
          FROM productos
          WHERE
            activo = 1
            AND stock <= stock_minimo
        `).get().total || 0
      );

    res.json({
      status: "success",

      data: {
        ventas,
        compras,

        balance:
          ventas -
          compras,

        productos,

        stock_bajo:
          stockBajo,
      },
    });
  }
);

// ============================================================
// REPORT SUMMARY
// ============================================================

app.get(
  "/api/reports/summary",
  authRequired,
  allowRoles(
    "admin",
    "supervisor"
  ),
  (req, res) => {
    const legacy = db.prepare(`
      SELECT
        COALESCE(
          SUM(
            cantidad *
            precio_venta
          ),
          0
        ) AS total,

        COUNT(*) AS cantidad

      FROM ventas
    `).get();

    const pos = db.prepare(`
      SELECT
        COALESCE(
          SUM(total),
          0
        ) AS total,

        COUNT(*) AS cantidad

      FROM ventas_pos

      WHERE estado =
            'COMPLETADA'
    `).get();

    const compras = db.prepare(`
      SELECT
        COALESCE(
          SUM(
            cantidad *
            precio_compra
          ),
          0
        ) AS total,

        COUNT(*) AS cantidad

      FROM compras
    `).get();

    const ventasTotal =
      Number(
        legacy.total || 0
      ) +
      Number(
        pos.total || 0
      );

    res.json({
      status: "success",

      data: {
        ventas:
          ventasTotal,

        cantidad_ventas:
          Number(
            legacy.cantidad || 0
          ) +
          Number(
            pos.cantidad || 0
          ),

        compras:
          Number(
            compras.total || 0
          ),

        cantidad_compras:
          Number(
            compras.cantidad || 0
          ),

        balance:
          ventasTotal -
          Number(
            compras.total || 0
          ),
      },
    });
  }
);

// ============================================================
// SALES REPORT
// ============================================================

app.get(
  "/api/reports/sales",
  authRequired,
  allowRoles(
    "admin",
    "supervisor"
  ),
  (req, res) => {
    const rows = db.prepare(`
      SELECT *
      FROM (

        SELECT
          v.numero_factura,
          v.fecha,
          p.codigo,
          p.nombre AS producto,
          v.cantidad,
          v.precio_venta,
          (
            v.cantidad *
            v.precio_venta
          ) AS total,
          v.cliente,
          u.usuario

        FROM ventas v

        JOIN productos p
          ON p.id =
             v.producto_id

        LEFT JOIN usuarios u
          ON u.id =
             v.usuario_id

        UNION ALL

        SELECT
          vp.numero_factura,
          vp.fecha,
          p.codigo,
          p.nombre AS producto,
          dv.cantidad,

          dv.precio_unitario
            AS precio_venta,

          dv.subtotal
            AS total,

          COALESCE(
            c.nombre,
            'Consumidor Final'
          ) AS cliente,

          u.usuario

        FROM ventas_pos vp

        JOIN detalle_ventas dv
          ON dv.venta_id =
             vp.id

        JOIN productos p
          ON p.id =
             dv.producto_id

        LEFT JOIN clientes c
          ON c.id =
             vp.cliente_id

        LEFT JOIN usuarios u
          ON u.id =
             vp.usuario_id

        WHERE vp.estado =
              'COMPLETADA'
      )

      ORDER BY fecha DESC
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

// ============================================================
// PURCHASES REPORT
// ============================================================

app.get(
  "/api/reports/purchases",
  authRequired,
  allowRoles(
    "admin",
    "supervisor"
  ),
  (req, res) => {
    const rows = db.prepare(`
      SELECT
        c.fecha,
        p.codigo,
        p.nombre AS producto,
        c.cantidad,
        c.precio_compra,

        (
          c.cantidad *
          c.precio_compra
        ) AS total,

        c.proveedor,

        u.usuario

      FROM compras c

      JOIN productos p
        ON p.id =
           c.producto_id

      LEFT JOIN usuarios u
        ON u.id =
           c.usuario_id

      ORDER BY
        c.id DESC
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

// ============================================================
// DAILY REPORT
// ============================================================

app.get(
  "/api/reports/daily",
  authRequired,
  allowRoles(
    "admin",
    "supervisor"
  ),
  (req, res) => {
    const rows = db.prepare(`
      SELECT
        fecha,

        SUM(ventas)
          AS ventas,

        SUM(compras)
          AS compras,

        SUM(ventas)
        -
        SUM(compras)
          AS balance

      FROM (

        SELECT
          date(fecha) AS fecha,

          cantidad *
          precio_venta
            AS ventas,

          0 AS compras

        FROM ventas

        UNION ALL

        SELECT
          date(fecha) AS fecha,

          total AS ventas,

          0 AS compras

        FROM ventas_pos

        WHERE estado =
              'COMPLETADA'

        UNION ALL

        SELECT
          date(fecha) AS fecha,

          0 AS ventas,

          cantidad *
          precio_compra
            AS compras

        FROM compras
      )

      GROUP BY fecha

      ORDER BY fecha DESC
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

// ============================================================
// USUARIOS
// ============================================================

app.get(
  "/api/users",
  authRequired,
  allowRoles("admin"),
  (req, res) => {
    const rows = db.prepare(`
      SELECT
        id,
        nombre,
        usuario,
        rol,
        activo,
        fecha_creado
      FROM usuarios
      ORDER BY nombre
    `).all();

    res.json({
      status: "success",
      data: rows,
    });
  }
);

app.post(
  "/api/users",
  authRequired,
  allowRoles("admin"),
  (req, res) => {
    const nombre = String(
      req.body.nombre || ""
    ).trim();

    const usuario = String(
      req.body.usuario || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      req.body.password || ""
    );

    const rol = String(
      req.body.rol || ""
    )
      .trim()
      .toLowerCase();

    if (
      !nombre ||
      !usuario ||
      password.length < 8 ||
      ![
        "admin",
        "supervisor",
        "usuario",
      ].includes(rol)
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Revise los datos del usuario.",
      });
    }

    try {
      const salt =
        makeSalt();

      const hash =
        hashPassword(
          password,
          salt
        );

      const info = db.prepare(`
        INSERT INTO usuarios (
          nombre,
          usuario,
          password_hash,
          password_salt,
          rol,
          activo
        )
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        nombre,
        usuario,
        hash,
        salt,
        rol
      );

      res.status(201).json({
        status: "success",
        message:
          "Usuario creado.",
        id:
          sqliteId(
            info.lastInsertRowid
          ),
      });
    } catch (error) {
      if (
        String(error.code || "").includes(
          "SQLITE_CONSTRAINT"
        )
      ) {
        return res.status(409).json({
          status: "error",
          message:
            "El usuario ya existe.",
        });
      }

      throw error;
    }
  }
);

app.patch(
  "/api/users/:id/role",
  authRequired,
  allowRoles("admin"),
  (req, res) => {
    const id =
      Number(req.params.id);

    const rol = String(
      req.body.rol || ""
    ).toLowerCase();

    if (
      ![
        "admin",
        "supervisor",
        "usuario",
      ].includes(rol)
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "Rol inválido.",
      });
    }

    db.prepare(`
      UPDATE usuarios
      SET rol = ?
      WHERE id = ?
    `).run(
      rol,
      id
    );

    res.json({
      status: "success",
      message:
        "Rol actualizado.",
    });
  }
);

app.patch(
  "/api/users/:id/status",
  authRequired,
  allowRoles("admin"),
  (req, res) => {
    const id =
      Number(req.params.id);

    const activo =
      req.body.activo
        ? 1
        : 0;

    if (
      id === req.user.id &&
      !activo
    ) {
      return res.status(400).json({
        status: "error",
        message:
          "No puede desactivar su propio usuario.",
      });
    }

    db.prepare(`
      UPDATE usuarios
      SET activo = ?
      WHERE id = ?
    `).run(
      activo,
      id
    );

    if (!activo) {
      db.prepare(`
        DELETE FROM sesiones
        WHERE usuario_id = ?
      `).run(id);
    }

    res.json({
      status: "success",
      message:
        "Estado actualizado.",
    });
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(error);

    if (
      error instanceof
      multer.MulterError
    ) {
      return res.status(400).json({
        status: "error",
        message:
          error.message,
      });
    }

    res.status(500).json({
      status: "error",
      message:
        error.message ||
        "Error interno del servidor.",
    });
  }
);

// ============================================================
// SERVER
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "========================================"
    );

    console.log(
      "Sistema Inventario V3.3"
    );

    console.log(
      `API: http://localhost:${PORT}`
    );

    console.log(
      `Prueba: http://localhost:${PORT}/api/ping`
    );

    console.log(
      `SQLite: ${DB_PATH}`
    );

    console.log(
      "========================================"
    );
  }
);