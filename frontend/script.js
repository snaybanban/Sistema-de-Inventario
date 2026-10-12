const API_URL =
  "https://mlpv651b-3001.use.devtunnels.ms/api";

// ============================================================
// CONFIG
// ============================================================

const BACKEND_URL =
  API_URL.replace(
    /\/api\/?$/,
    ""
  );

const SESSION_KEY =
  "inventario_v33";

let session = null;

let productsCache = [];

let categoriesCache = [];

let clientsCache = [];

let sellersCache = [];

let posCart = [];

let invoicesCache = [];

let currentInvoice = null;

// ============================================================
// DOM
// ============================================================

const $ =
  id =>
    document.getElementById(id);

// ============================================================
// HELPERS
// ============================================================

function money(value) {

  return new Intl.NumberFormat(
    "es-NI",
    {
      style: "currency",
      currency: "NIO"
    }
  ).format(
    Number(value || 0)
  );
}

function esc(value) {

  return String(value ?? "")
    .replace(
      /[&<>'"]/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;"
      })[char]
    );
}

function status(
  id,
  type,
  message
) {

  const node = $(id);

  if (!node) {
    return;
  }

  node.className =
    `status ${type}`;

  node.textContent =
    message;
}

function clearStatus(id) {

  const node = $(id);

  if (!node) {
    return;
  }

  node.className =
    "status";

  node.textContent =
    "";
}

// ============================================================
// SESSION
// ============================================================

function saveSession(value) {

  session = value;

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(value)
  );
}

function clearSession() {

  session = null;

  localStorage.removeItem(
    SESSION_KEY
  );
}

function storedSession() {

  try {

    return JSON.parse(
      localStorage.getItem(
        SESSION_KEY
      ) || "null"
    );

  } catch {

    return null;
  }
}

// ============================================================
// API
// ============================================================

async function api(
  path,
  options = {}
) {

  const headers = {
    ...(options.headers || {})
  };

  const isFormData =
    options.body instanceof
    FormData;

  if (
    !isFormData &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  if (session?.token) {
    headers.Authorization =
      `Bearer ${session.token}`;
  }

  let response;

  try {

    response = await fetch(
      `${API_URL}${path}`,
      {
        ...options,
        headers
      }
    );

  } catch {

    throw new Error(
      "No se pudo conectar con el servidor."
    );
  }

  const raw =
    await response.text();

  let data = {};

  try {

    data =
      raw
        ? JSON.parse(raw)
        : {};

  } catch {

    throw new Error(
      "El servidor devolvió una respuesta inválida."
    );
  }

  if (
    response.status === 401 &&
    path !== "/auth/login"
  ) {

    clearSession();

    showLogin();
  }

  if (!response.ok) {

    throw new Error(
      data.message ||
      `Error HTTP ${response.status}`
    );
  }

  return data;
}

// ============================================================
// LOGIN / APP
// ============================================================

function showLogin() {

  $("loginScreen")
    ?.classList
    .remove("hidden");

  $("app")
    ?.classList
    .add("hidden");
}

function showApp() {

  $("loginScreen")
    ?.classList
    .add("hidden");

  $("app")
    ?.classList
    .remove("hidden");

  applyRoles();

  const first =
    document.querySelector(
      "#nav button:not(.role-hidden)"
    );

  if (first) {
    openSection(
      first.dataset.section
    );
  }
}

// ============================================================
// ROLES
// ============================================================

function applyRoles() {

  if (!session?.user) {
    return;
  }

  $("sessionName").textContent =
    session.user.nombre;

  $("sessionRole").textContent =
    session.user.rol.toUpperCase();

  document
    .querySelectorAll(
      "[data-roles]"
    )
    .forEach(
      node => {

        const roles =
          node.dataset.roles
            .split(",")
            .map(
              item =>
                item.trim()
            );

        node.classList.toggle(
          "role-hidden",
          !roles.includes(
            session.user.rol
          )
        );
      }
    );
}

// ============================================================
// MOBILE MENU
// ============================================================

function openMobileMenu() {

  $("sidebar")
    ?.classList
    .add("mobile-open");

  $("sidebarBackdrop")
    ?.classList
    .add("active");
}

function closeMobileMenu() {

  $("sidebar")
    ?.classList
    .remove("mobile-open");

  $("sidebarBackdrop")
    ?.classList
    .remove("active");
}

// ============================================================
// NAVIGATION
// ============================================================

function openSection(id) {

  document
    .querySelectorAll(
      ".section"
    )
    .forEach(
      node =>
        node.classList.remove(
          "active"
        )
    );

  document
    .querySelectorAll(
      "#nav button"
    )
    .forEach(
      node =>
        node.classList.remove(
          "active"
        )
    );

  $(id)
    ?.classList
    .add("active");

  document
    .querySelector(
      `#nav button[data-section="${id}"]`
    )
    ?.classList
    .add("active");

  closeMobileMenu();

  if (id === "dashboard") {
    loadDashboard();
  }

  if (id === "inventario") {
    loadProducts();
  }

  if (
    id === "productos" ||
    id === "categorias"
  ) {
    loadCategories();
  }

  if (id === "clientes") {
    loadClients();
  }

  if (id === "vendedores") {
    loadSellers();
  }

  if (id === "caja") {

    loadPosData();

    setTimeout(
      () =>
        $("posBarcode")
          ?.focus(),
      100
    );
  }

  if (id === "facturas") {
    loadInvoices();
  }

  if (id === "resumenes") {

    loadSummaryGeneral();

    loadSummaryDaily();
  }

  if (id === "usuarios") {
    loadUsers();
  }
}

// ============================================================
// RESTORE
// ============================================================

async function restoreSession() {

  const saved =
    storedSession();

  if (!saved?.token) {
    return false;
  }

  session = saved;

  try {

    const result =
      await api("/auth/me");

    saveSession({
      token: saved.token,
      user: result.user
    });

    return true;

  } catch {

    clearSession();

    return false;
  }
}

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {

  try {

    const response =
      await api("/dashboard");

    const data =
      response.data;

    $("dashVentas").textContent =
      money(data.ventas);

    $("dashCompras").textContent =
      money(data.compras);

    $("dashBalance").textContent =
      money(data.balance);

    $("dashProductos").textContent =
      data.productos;

    $("dashStockBajo").textContent =
      data.stock_bajo;

  } catch (error) {

    console.error(error);
  }
}

// ============================================================
// CATEGORIES
// ============================================================

async function loadCategories() {

  const response =
    await api("/categories");

  categoriesCache =
    response.data || [];

  if ($("pCategoria")) {

    $("pCategoria").innerHTML =
      `
            <option value="">
                Sin categoría
            </option>
            `
      +
      categoriesCache
        .map(
          item => `
                    <option value="${item.id}">
                        ${esc(item.nombre)}
                    </option>
                    `
        )
        .join("");
  }

  if ($("categoryList")) {

    $("categoryList").innerHTML =
      categoriesCache.length
        ? categoriesCache
          .map(
            item => `
                        <li>
                            ${esc(item.nombre)}
                        </li>
                        `
          )
          .join("")
        : `
                <li>
                    No hay categorías.
                </li>
                `;
  }
}

// ============================================================
// PRODUCTS
// ============================================================

async function loadProducts() {

  const response =
    await api("/products");

  productsCache =
    response.data || [];

  renderProducts(
    productsCache
  );
}

function renderProducts(products) {

  const table =
    $("productsTable");

  if (!table) {
    return;
  }

  if (!products.length) {

    table.innerHTML =
      `
            <tr>
                <td colspan="9">
                    No hay productos.
                </td>
            </tr>
            `;

    return;
  }

  table.innerHTML =
    products
      .map(
        product => `
                <tr>

                    <td>

                        ${product.imagen
            ? `
                                <img
                                    src="${BACKEND_URL}${product.imagen}"
                                    class="product-thumb"
                                >
                                `
            : `
                                <div class="product-no-image">
                                    <i class="fas fa-image"></i>
                                </div>
                                `
          }

                    </td>

                    <td>
                        ${product.id}
                    </td>

                    <td>
                        ${esc(product.codigo)}
                    </td>

                    <td>
                        <strong>
                            ${esc(product.nombre)}
                        </strong>
                    </td>

                    <td>
                        ${esc(
            product.categoria ||
            "Sin categoría"
          )}
                    </td>

                    <td>
                        ${product.stock}
                    </td>

                    <td>
                        ${product.stock_minimo}
                    </td>

                    <td>
                        ${money(
            product.precio_compra
          )}
                    </td>

                    <td>
                        ${money(
            product.precio_venta
          )}
                    </td>

                </tr>
                `
      )
      .join("");
}

// ============================================================
// FIND PRODUCT
// ============================================================

async function findProduct(query) {

  const value =
    String(query || "")
      .trim();

  if (!value) {

    throw new Error(
      "Ingrese un código."
    );
  }

  try {

    const response =
      await api(
        `/products/barcode/${encodeURIComponent(value)
        }`
      );

    if (response.data) {
      return response.data;
    }

  } catch { }

  const response =
    await api(
      `/products?q=${encodeURIComponent(value)
      }`
    );

  if (!response.data?.length) {

    throw new Error(
      "Producto no encontrado."
    );
  }

  return response.data[0];
}

// ============================================================
// CLIENTES
// ============================================================

async function loadClients() {

  const response =
    await api("/clients");

  clientsCache =
    response.data || [];

  const table =
    $("clientsTable");

  if (!table) {
    return;
  }

  table.innerHTML =
    clientsCache.length
      ? clientsCache
        .map(
          item => `
                    <tr>

                        <td>${item.id}</td>

                        <td>
                            ${esc(item.nombre)}
                        </td>

                        <td>
                            ${esc(
            item.identificacion || ""
          )}
                        </td>

                        <td>
                            ${esc(
            item.telefono || ""
          )}
                        </td>

                        <td>
                            ${esc(
            item.correo || ""
          )}
                        </td>

                        <td>
                            ${esc(
            item.direccion || ""
          )}
                        </td>

                    </tr>
                    `
        )
        .join("")
      : `
            <tr>
                <td colspan="6">
                    No hay clientes.
                </td>
            </tr>
            `;
}

// ============================================================
// SELLERS
// ============================================================

async function loadSellers() {

  const response =
    await api("/sellers");

  sellersCache =
    response.data || [];

  const table =
    $("sellersTable");

  if (!table) {
    return;
  }

  table.innerHTML =
    sellersCache.length
      ? sellersCache
        .map(
          item => `
                    <tr>

                        <td>${item.id}</td>

                        <td>
                            ${esc(item.nombre)}
                        </td>

                        <td>
                            ${esc(
            item.telefono || ""
          )}
                        </td>

                        <td>
                            ${esc(
            item.correo || ""
          )}
                        </td>

                        <td>
                            ${Number(
            item.comision || 0
          ).toFixed(2)}%
                        </td>

                    </tr>
                    `
        )
        .join("")
      : `
            <tr>
                <td colspan="5">
                    No hay vendedores.
                </td>
            </tr>
            `;
}

// ============================================================
// POS DATA
// ============================================================

async function loadPosData() {

  await Promise.all([
    loadPosClients(),
    loadPosSellers()
  ]);

  renderPosCart();

  calculatePosTotals();
}

async function loadPosClients() {

  const response =
    await api("/clients");

  clientsCache =
    response.data || [];

  $("posClient").innerHTML =
    clientsCache
      .map(
        client => `
                <option
                    value="${client.id}"
                    ${client.nombre ===
            "Consumidor Final"
            ? "selected"
            : ""
          }
                >
                    ${esc(client.nombre)}
                </option>
                `
      )
      .join("");
}

async function loadPosSellers() {

  const response =
    await api("/sellers");

  sellersCache =
    response.data || [];

  $("posSeller").innerHTML =
    `
        <option value="">
            Sin vendedor
        </option>
        `
    +
    sellersCache
      .map(
        seller => `
                <option value="${seller.id}">
                    ${esc(seller.nombre)}
                </option>
                `
      )
      .join("");
}

// ============================================================
// POS ADD
// ============================================================

async function addProductToPos(query) {

  const value =
    String(query || "")
      .trim();

  if (!value) {
    return;
  }

  try {

    const product =
      await findProduct(value);

    const existing =
      posCart.find(
        item =>
          Number(item.id) ===
          Number(product.id)
      );

    if (existing) {

      if (
        existing.cantidad + 1 >
        Number(product.stock)
      ) {

        throw new Error(
          "No hay suficiente stock."
        );
      }

      existing.cantidad += 1;

    } else {

      if (
        Number(product.stock) <= 0
      ) {

        throw new Error(
          "El producto no tiene existencias."
        );
      }

      posCart.push({
        id:
          product.id,

        codigo:
          product.codigo,

        nombre:
          product.nombre,

        precio:
          Number(
            product.precio_venta
          ),

        stock:
          Number(
            product.stock
          ),

        cantidad:
          1
      });
    }

    $("posBarcode").value =
      "";

    renderPosCart();

    calculatePosTotals();

    status(
      "statusPos",
      "success",
      `${product.nombre} agregado.`
    );

    $("posBarcode")?.focus();

  } catch (error) {

    status(
      "statusPos",
      "error",
      error.message
    );
  }
}

// ============================================================
// POS CART
// ============================================================

function renderPosCart() {

  const table =
    $("posCartTable");

  if (!posCart.length) {

    table.innerHTML =
      `
            <tr>

                <td colspan="5">
                    No hay productos.
                </td>

            </tr>
            `;

    return;
  }

  table.innerHTML =
    posCart
      .map(
        item => `
                <tr>

                    <td>

                        <strong>
                            ${esc(item.nombre)}
                        </strong>

                        <div class="product-code">
                            ${esc(item.codigo)}
                        </div>

                    </td>

                    <td>
                        ${money(item.precio)}
                    </td>

                    <td>

                        <div class="pos-qty">

                            <button
                                type="button"
                                onclick="
                                    changePosQuantity(
                                        ${item.id},
                                        -1
                                    )
                                "
                            >
                                −
                            </button>

                            <input
                                type="number"
                                min="1"
                                max="${item.stock}"
                                value="${item.cantidad}"

                                onchange="
                                    setPosQuantity(
                                        ${item.id},
                                        this.value
                                    )
                                "
                            >

                            <button
                                type="button"
                                onclick="
                                    changePosQuantity(
                                        ${item.id},
                                        1
                                    )
                                "
                            >
                                +
                            </button>

                        </div>

                    </td>

                    <td>

                        <strong>
                            ${money(
          item.precio *
          item.cantidad
        )}
                        </strong>

                    </td>

                    <td>

                        <button
                            type="button"
                            class="icon-delete"

                            onclick="
                                removePosItem(
                                    ${item.id}
                                )
                            "
                        >

                            <i class="fas fa-trash"></i>

                        </button>

                    </td>

                </tr>
                `
      )
      .join("");
}

window.changePosQuantity =
  function (
    id,
    change
  ) {

    const item =
      posCart.find(
        product =>
          Number(product.id) ===
          Number(id)
      );

    if (!item) {
      return;
    }

    const quantity =
      item.cantidad +
      change;

    if (quantity < 1) {

      removePosItem(id);

      return;
    }

    if (quantity > item.stock) {

      status(
        "statusPos",
        "error",
        `Stock máximo: ${item.stock}`
      );

      return;
    }

    item.cantidad =
      quantity;

    renderPosCart();

    calculatePosTotals();
  };

window.setPosQuantity =
  function (
    id,
    value
  ) {

    const item =
      posCart.find(
        product =>
          Number(product.id) ===
          Number(id)
      );

    if (!item) {
      return;
    }

    let quantity =
      Number(value);

    if (
      !Number.isFinite(quantity) ||
      quantity < 1
    ) {
      quantity = 1;
    }

    if (quantity > item.stock) {
      quantity =
        item.stock;
    }

    item.cantidad =
      quantity;

    renderPosCart();

    calculatePosTotals();
  };

window.removePosItem =
  function (id) {

    posCart =
      posCart.filter(
        item =>
          Number(item.id) !==
          Number(id)
      );

    renderPosCart();

    calculatePosTotals();
  };

// ============================================================
// POS TOTALS
// ============================================================

function calculatePosTotals() {

  const subtotal =
    posCart.reduce(
      (
        total,
        item
      ) =>
        total +
        item.precio *
        item.cantidad,
      0
    );

  let discount =
    Number(
      $("posDiscount")?.value || 0
    );

  if (
    !Number.isFinite(discount) ||
    discount < 0
  ) {
    discount = 0;
  }

  if (discount > subtotal) {
    discount = subtotal;
  }

  const total =
    subtotal -
    discount;

  const method =
    $("posPaymentMethod")
      ?.value ||
    "EFECTIVO";

  const received =
    Number(
      $("posReceived")
        ?.value || 0
    );

  const change =
    method === "EFECTIVO"
      ? Math.max(
        0,
        received - total
      )
      : 0;

  const sellerId =
    Number(
      $("posSeller")
        ?.value || 0
    );

  const seller =
    sellersCache.find(
      item =>
        Number(item.id) ===
        sellerId
    );

  const commissionPercentage =
    seller
      ? Number(
        seller.comision || 0
      )
      : 0;

  const commission =
    total *
    commissionPercentage /
    100;

  $("posSubtotal").textContent =
    money(subtotal);

  $("posDiscountDisplay").textContent =
    money(discount);

  $("posTotal").textContent =
    money(total);

  $("posChange").textContent =
    money(change);

  $("posCommission").textContent =
    `${commissionPercentage.toFixed(
      2
    )}%`;

  $("posCommissionAmount").textContent =
    money(commission);

  return {
    subtotal,
    discount,
    total,
    received,
    change,
    commissionPercentage,
    commission
  };
}

// ============================================================
// PAYMENT METHOD
// ============================================================

function updatePaymentMethod() {

  const cash =
    $("posPaymentMethod")
      .value ===
    "EFECTIVO";

  $("posReceivedContainer")
    .classList
    .toggle(
      "hidden",
      !cash
    );

  $("posReferenceContainer")
    .classList
    .toggle(
      "hidden",
      cash
    );

  calculatePosTotals();
}

// ============================================================
// CLEAR POS
// ============================================================

function clearPos() {

  posCart = [];

  renderPosCart();

  $("posBarcode").value = "";

  $("posDiscount").value = 0;

  $("posReceived").value = 0;

  $("posReference").value = "";

  $("posSeller").value = "";

  $("posPaymentMethod").value =
    "EFECTIVO";

  const consumer =
    clientsCache.find(
      item =>
        item.nombre ===
        "Consumidor Final"
    );

  if (consumer) {
    $("posClient").value =
      consumer.id;
  }

  updatePaymentMethod();

  calculatePosTotals();

  $("posBarcode")?.focus();
}

// ============================================================
// CHECKOUT
// ============================================================

async function checkoutPos() {

  if (!posCart.length) {

    status(
      "statusPos",
      "error",
      "Agregue productos al carrito."
    );

    return;
  }

  const totals =
    calculatePosTotals();

  const method =
    $("posPaymentMethod")
      .value;

  if (
    method === "EFECTIVO" &&
    totals.received <
    totals.total
  ) {

    status(
      "statusPos",
      "error",
      "El dinero recibido es menor que el total."
    );

    return;
  }

  const button =
    $("posCheckoutBtn");

  button.disabled = true;

  try {

    const response =
      await api(
        "/pos/sales",
        {
          method: "POST",

          body:
            JSON.stringify({
              cliente_id:
                $("posClient")
                  .value ||
                null,

              vendedor_id:
                $("posSeller")
                  .value ||
                null,

              descuento:
                totals.discount,

              metodo_pago:
                method,

              monto_recibido:
                totals.received,

              referencia:
                $("posReference")
                  .value
                  .trim(),

              items:
                posCart.map(
                  item => ({
                    producto_id:
                      item.id,

                    cantidad:
                      item.cantidad
                  })
                )
            })
        }
      );

    const invoice =
      response.data;

    status(
      "statusPos",
      "success",
      `Venta ${invoice.numero_factura} realizada correctamente.`
    );

    showInvoiceModal(invoice);

    clearPos();

    await loadProducts();

  } catch (error) {

    status(
      "statusPos",
      "error",
      error.message
    );

  } finally {

    button.disabled =
      false;
  }
}

// ============================================================
// INVOICES
// ============================================================

function formatInvoiceDate(value) {

  if (!value) {
    return "";
  }

  const date =
    new Date(
      String(value)
        .replace(
          " ",
          "T"
        )
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "es-NI"
  );
}

async function loadInvoices() {

  try {

    const response =
      await api(
        "/pos/sales"
      );

    invoicesCache =
      response.data || [];

    renderInvoices(
      invoicesCache
    );

  } catch (error) {

    console.error(error);
  }
}

function renderInvoices(invoices) {

  const table =
    $("invoicesTable");

  if (!table) {
    return;
  }

  if (!invoices.length) {

    table.innerHTML =
      `
            <tr>
                <td colspan="7">
                    No hay facturas.
                </td>
            </tr>
            `;

    return;
  }

  table.innerHTML =
    invoices
      .map(
        invoice => `
                <tr>

                    <td>
                        <strong>
                            ${esc(
          invoice.numero_factura
        )}
                        </strong>
                    </td>

                    <td>
                        ${esc(
          formatInvoiceDate(
            invoice.fecha
          )
        )}
                    </td>

                    <td>
                        ${esc(
          invoice.cliente
        )}
                    </td>

                    <td>
                        ${esc(
          invoice.vendedor ||
          "-"
        )}
                    </td>

                    <td>
                        ${esc(
          invoice.metodo_pago ||
          ""
        )}
                    </td>

                    <td>
                        <strong>
                            ${money(
          invoice.total
        )}
                        </strong>
                    </td>

                    <td>

                        <button
                            class="btn primary small"

                            onclick="
                                openInvoice(
                                    ${invoice.id}
                                )
                            "
                        >
                            <i class="fas fa-eye"></i>
                            Ver
                        </button>

                    </td>

                </tr>
                `
      )
      .join("");
}

window.openInvoice =
  async function (id) {

    try {

      const response =
        await api(
          `/pos/sales/${id}`
        );

      showInvoiceModal(
        response.data
      );

    } catch (error) {

      alert(error.message);
    }
  };

// ============================================================
// INVOICE MODAL
// ============================================================

function showInvoiceModal(invoice) {

  currentInvoice =
    invoice;

  $("invoiceModalNumber").textContent =
    invoice.numero_factura;

  $("receiptInvoiceNumber").textContent =
    invoice.numero_factura;

  $("receiptDate").textContent =
    formatInvoiceDate(
      invoice.fecha
    );

  $("receiptClient").textContent =
    invoice.cliente ||
    "Consumidor Final";

  $("receiptSeller").textContent =
    invoice.vendedor ||
    "Sin vendedor";

  $("receiptCashier").textContent =
    invoice.cajero ||
    session?.user?.nombre ||
    "";

  $("receiptItems").innerHTML =
    (invoice.items || [])
      .map(
        item => `
                <div class="receipt-item">

                    <div class="receipt-item-name">

                        <strong>
                            ${esc(item.nombre)}
                        </strong>

                        <small>
                            ${esc(
          item.codigo || ""
        )}
                        </small>

                    </div>

                    <div class="receipt-item-line">

                        <span>
                            ${item.cantidad}
                            ×
                            ${money(item.precio)}
                        </span>

                        <strong>
                            ${money(
          item.subtotal
        )}
                        </strong>

                    </div>

                </div>
                `
      )
      .join("");

  $("receiptSubtotal").textContent =
    money(invoice.subtotal);

  $("receiptDiscount").textContent =
    money(invoice.descuento);

  $("receiptTotal").textContent =
    money(invoice.total);

  $("receiptPaymentMethod").textContent =
    invoice.metodo_pago ||
    "";

  $("receiptReceived").textContent =
    money(
      invoice.monto_recibido
    );

  $("receiptChange").textContent =
    money(invoice.cambio);

  $("receiptCommission").textContent =
    `${Number(
      invoice.porcentaje_comision ||
      0
    ).toFixed(2)}% · ${money(
      invoice.monto_comision
    )}`;

  const reference =
    String(
      invoice.referencia || ""
    );

  $("receiptReferenceRow")
    .classList
    .toggle(
      "hidden",
      !reference
    );

  $("receiptReference").textContent =
    reference;

  $("invoiceModal")
    .classList
    .remove("hidden");

  document.body
    .classList
    .add("modal-open");
}

function closeInvoiceModal() {

  $("invoiceModal")
    ?.classList
    .add("hidden");

  document.body
    .classList
    .remove("modal-open");
}

// ============================================================
// PRINT INVOICE
// ============================================================

function printInvoice() {

  if (!currentInvoice) {
    return;
  }

  const receipt =
    $("invoiceReceipt")
      .innerHTML;

  const popup =
    window.open(
      "",
      "_blank",
      "width=420,height=720"
    );

  if (!popup) {

    alert(
      "El navegador bloqueó la ventana de impresión."
    );

    return;
  }

  popup.document.write(`
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<title>
${esc(
    currentInvoice.numero_factura
  )}
</title>

<style>

@page {
    size: 80mm auto;
    margin: 3mm;
}

* {
    box-sizing: border-box;
}

body {
    width: 74mm;
    margin: 0 auto;
    font-family: Arial, sans-serif;
    font-size: 11px;
    color: #000;
}

.receipt-logo {
    display: none;
}

.receipt-company {
    text-align: center;
}

.receipt-company h2 {
    font-size: 15px;
    margin: 0;
}

.receipt-company p {
    margin: 3px 0;
}

.receipt-divider {
    border-top: 1px dashed #000;
    margin: 8px 0;
}

.receipt-info > div,
.receipt-totals > div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 3px 0;
}

.receipt-item {
    margin: 7px 0;
}

.receipt-item-name {
    display: flex;
    flex-direction: column;
}

.receipt-item-line {
    display: flex;
    justify-content: space-between;
    margin-top: 3px;
}

.receipt-total {
    font-weight: bold;
    font-size: 14px;
}

.receipt-footer {
    text-align: center;
    margin-top: 12px;
}

.hidden {
    display: none !important;
}

</style>

</head>

<body>

${receipt}

<script>

window.onload = function() {

    window.print();

    window.onafterprint =
        function() {

            window.close();

        };

};

<\/script>

</body>
</html>
`);

  popup.document.close();
}

// ============================================================
// SUMMARY
// ============================================================

async function loadSummaryGeneral() {

  try {

    const response =
      await api(
        "/reports/summary"
      );

    const data =
      response.data;

    $("summarySales").textContent =
      money(data.ventas);

    $("summaryPurchases").textContent =
      money(data.compras);

    $("summaryBalance").textContent =
      money(data.balance);

    $("summarySalesCount").textContent =
      data.cantidad_ventas;

    $("summaryPurchasesCount").textContent =
      data.cantidad_compras;

  } catch (error) {

    status(
      "statusSummary",
      "error",
      error.message
    );
  }
}

function renderSummaryTable(
  columns,
  rows
) {

  $("summaryTableHead").innerHTML =
    `
        <tr>
            ${columns
      .map(
        column =>
          `<th>${esc(
            column.label
          )}</th>`
      )
      .join("")
    }
        </tr>
        `;

  $("summaryTableBody").innerHTML =
    rows.length
      ? rows
        .map(
          row => `
                    <tr>
                        ${columns
              .map(
                column => {

                  let value =
                    row[
                    column.key
                    ];

                  if (
                    column.money
                  ) {
                    value =
                      money(value);
                  }

                  return `
                                        <td>
                                            ${esc(
                    value ?? ""
                  )}
                                        </td>
                                        `;
                }
              )
              .join("")
            }
                    </tr>
                    `
        )
        .join("")
      : `
            <tr>
                <td colspan="${columns.length}">
                    No hay datos.
                </td>
            </tr>
            `;
}

async function loadSummarySales() {

  const response =
    await api(
      "/reports/sales"
    );

  renderSummaryTable(
    [
      {
        key:
          "numero_factura",
        label:
          "Factura"
      },
      {
        key:
          "fecha",
        label:
          "Fecha"
      },
      {
        key:
          "producto",
        label:
          "Producto"
      },
      {
        key:
          "cantidad",
        label:
          "Cantidad"
      },
      {
        key:
          "total",
        label:
          "Total",
        money:
          true
      },
      {
        key:
          "cliente",
        label:
          "Cliente"
      }
    ],
    response.data || []
  );
}

async function loadSummaryPurchases() {

  const response =
    await api(
      "/reports/purchases"
    );

  renderSummaryTable(
    [
      {
        key:
          "fecha",
        label:
          "Fecha"
      },
      {
        key:
          "producto",
        label:
          "Producto"
      },
      {
        key:
          "cantidad",
        label:
          "Cantidad"
      },
      {
        key:
          "total",
        label:
          "Total",
        money:
          true
      },
      {
        key:
          "proveedor",
        label:
          "Proveedor"
      }
    ],
    response.data || []
  );
}

async function loadSummaryDaily() {

  const response =
    await api(
      "/reports/daily"
    );

  renderSummaryTable(
    [
      {
        key:
          "fecha",
        label:
          "Fecha"
      },
      {
        key:
          "ventas",
        label:
          "Ventas",
        money:
          true
      },
      {
        key:
          "compras",
        label:
          "Compras",
        money:
          true
      },
      {
        key:
          "balance",
        label:
          "Balance",
        money:
          true
      }
    ],
    response.data || []
  );
}

// ============================================================
// USERS
// ============================================================

async function loadUsers() {

  const response =
    await api("/users");

  $("usersTable").innerHTML =
    (response.data || [])
      .map(
        user => `
                <tr>

                    <td>
                        ${esc(user.nombre)}
                    </td>

                    <td>
                        ${esc(user.usuario)}
                    </td>

                    <td>

                        <select
                            onchange="
                                changeRole(
                                    ${user.id},
                                    this.value
                                )
                            "
                        >

                            <option
                                value="usuario"
                                ${user.rol ===
            "usuario"
            ? "selected"
            : ""
          }
                            >
                                Usuario
                            </option>

                            <option
                                value="supervisor"
                                ${user.rol ===
            "supervisor"
            ? "selected"
            : ""
          }
                            >
                                Supervisor
                            </option>

                            <option
                                value="admin"
                                ${user.rol ===
            "admin"
            ? "selected"
            : ""
          }
                            >
                                Admin
                            </option>

                        </select>

                    </td>

                    <td>
                        ${user.activo
            ? "Activo"
            : "Inactivo"
          }
                    </td>

                    <td>

                        <button
                            class="btn small ${user.activo
            ? "danger"
            : "primary"
          }"

                            onclick="
                                changeStatus(
                                    ${user.id},
                                    ${user.activo
            ? 0
            : 1
          }
                                )
                            "
                        >
                            ${user.activo
            ? "Desactivar"
            : "Activar"
          }
                        </button>

                    </td>

                </tr>
                `
      )
      .join("");
}

window.changeRole =
  async function (
    id,
    rol
  ) {

    await api(
      `/users/${id}/role`,
      {
        method: "PATCH",

        body:
          JSON.stringify({
            rol
          })
      }
    );

    loadUsers();
  };

window.changeStatus =
  async function (
    id,
    activo
  ) {

    await api(
      `/users/${id}/status`,
      {
        method: "PATCH",

        body:
          JSON.stringify({
            activo:
              Boolean(activo)
          })
      }
    );

    loadUsers();
  };

// ============================================================
// EVENTS
// ============================================================

function bindEvents() {

  $("mobileMenuBtn")
    ?.addEventListener(
      "click",
      openMobileMenu
    );

  $("sidebarBackdrop")
    ?.addEventListener(
      "click",
      closeMobileMenu
    );

  $("togglePassword")
    ?.addEventListener(
      "click",
      () => {

        const input =
          $("loginPassword");

        input.type =
          input.type ===
            "password"
            ? "text"
            : "password";
      }
    );

  $("loginForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        try {

          const response =
            await api(
              "/auth/login",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    usuario:
                      $("loginUsuario")
                        .value
                        .trim(),

                    password:
                      $("loginPassword")
                        .value
                  })
              }
            );

          saveSession({
            token:
              response.token,

            user:
              response.user
          });

          showApp();

        } catch (error) {

          status(
            "statusLogin",
            "error",
            error.message
          );
        }
      }
    );

  $("logoutBtn")
    ?.addEventListener(
      "click",
      async () => {

        try {
          await api(
            "/auth/logout",
            {
              method: "POST"
            }
          );
        } catch { }

        clearSession();

        showLogin();
      }
    );

  document
    .querySelectorAll(
      "#nav button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            openSection(
              button.dataset.section
            )
        );
      }
    );

  $("refreshDashboard")
    ?.addEventListener(
      "click",
      loadDashboard
    );

  $("refreshProducts")
    ?.addEventListener(
      "click",
      loadProducts
    );

  $("productSearch")
    ?.addEventListener(
      "input",
      event => {

        const q =
          event.target
            .value
            .toLowerCase();

        renderProducts(
          productsCache.filter(
            product =>
              String(
                product.codigo
              )
                .toLowerCase()
                .includes(q)
              ||
              String(
                product.nombre
              )
                .toLowerCase()
                .includes(q)
          )
        );
      }
    );

  $("categoryForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        try {

          const response =
            await api(
              "/categories",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    nombre:
                      $("categoryName")
                        .value
                        .trim()
                  })
              }
            );

          status(
            "statusCategory",
            "success",
            response.message
          );

          $("categoryForm")
            .reset();

          loadCategories();

        } catch (error) {

          status(
            "statusCategory",
            "error",
            error.message
          );
        }
      }
    );

  $("pImagen")
    ?.addEventListener(
      "change",
      event => {

        const file =
          event.target.files[0];

        if (!file) {
          return;
        }

        $("productImagePreview")
          .src =
          URL.createObjectURL(file);

        $("productImagePreviewContainer")
          .classList
          .remove("hidden");
      }
    );

  $("productForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        const form =
          new FormData();

        form.append(
          "codigo",
          $("pCodigo").value
        );

        form.append(
          "nombre",
          $("pNombre").value
        );

        form.append(
          "categoria_id",
          $("pCategoria").value
        );

        form.append(
          "precio_compra",
          $("pCompra").value
        );

        form.append(
          "precio_venta",
          $("pVenta").value
        );

        form.append(
          "stock",
          $("pStock").value
        );

        form.append(
          "stock_minimo",
          $("pStockMin").value
        );

        if (
          $("pImagen").files[0]
        ) {
          form.append(
            "imagen",
            $("pImagen")
              .files[0]
          );
        }

        try {

          const response =
            await api(
              "/products",
              {
                method: "POST",
                body: form
              }
            );

          status(
            "statusProduct",
            "success",
            response.message
          );

          $("productForm")
            .reset();

          $("productImagePreviewContainer")
            .classList
            .add("hidden");

        } catch (error) {

          status(
            "statusProduct",
            "error",
            error.message
          );
        }
      }
    );

  $("clientForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        try {

          const response =
            await api(
              "/clients",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    nombre:
                      $("clientName").value,

                    identificacion:
                      $("clientIdNumber").value,

                    telefono:
                      $("clientPhone").value,

                    correo:
                      $("clientEmail").value,

                    direccion:
                      $("clientAddress").value
                  })
              }
            );

          status(
            "statusClient",
            "success",
            response.message
          );

          $("clientForm")
            .reset();

          loadClients();

        } catch (error) {

          status(
            "statusClient",
            "error",
            error.message
          );
        }
      }
    );

  $("sellerForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        try {

          const response =
            await api(
              "/sellers",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    nombre:
                      $("sellerName").value,

                    telefono:
                      $("sellerPhone").value,

                    correo:
                      $("sellerEmail").value,

                    comision:
                      $("sellerCommission").value
                  })
              }
            );

          status(
            "statusSeller",
            "success",
            response.message
          );

          $("sellerForm")
            .reset();

          loadSellers();

        } catch (error) {

          status(
            "statusSeller",
            "error",
            error.message
          );
        }
      }
    );

  $("purchaseSearch")
    ?.addEventListener(
      "keydown",
      async event => {

        if (
          event.key !== "Enter"
        ) {
          return;
        }

        event.preventDefault();

        try {

          const product =
            await findProduct(
              event.target.value
            );

          $("purchaseProductId")
            .value =
            product.id;

          $("purchasePrice")
            .value =
            product.precio_compra;

          $("purchaseSelected")
            .textContent =
            `${product.nombre} · Stock ${product.stock}`;

        } catch (error) {

          status(
            "statusPurchase",
            "error",
            error.message
          );
        }
      }
    );

  $("purchaseForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        try {

          const response =
            await api(
              "/purchases",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    producto_id:
                      Number(
                        $("purchaseProductId").value
                      ),

                    cantidad:
                      Number(
                        $("purchaseQty").value
                      ),

                    precio_compra:
                      Number(
                        $("purchasePrice").value
                      ),

                    proveedor:
                      $("purchaseSupplier").value
                  })
              }
            );

          status(
            "statusPurchase",
            "success",
            response.message
          );

        } catch (error) {

          status(
            "statusPurchase",
            "error",
            error.message
          );
        }
      }
    );

  $("saleSearch")
    ?.addEventListener(
      "keydown",
      async event => {

        if (
          event.key !== "Enter"
        ) {
          return;
        }

        event.preventDefault();

        try {

          const product =
            await findProduct(
              event.target.value
            );

          $("saleProductId").value =
            product.id;

          $("salePrice").value =
            product.precio_venta;

          $("saleSelected")
            .textContent =
            `${product.nombre} · Stock ${product.stock}`;

        } catch (error) {

          status(
            "statusSale",
            "error",
            error.message
          );
        }
      }
    );

  $("saleForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        try {

          const response =
            await api(
              "/sales",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    producto_id:
                      Number(
                        $("saleProductId").value
                      ),

                    cantidad:
                      Number(
                        $("saleQty").value
                      ),

                    precio_venta:
                      Number(
                        $("salePrice").value
                      ),

                    cliente:
                      $("saleClient").value
                  })
              }
            );

          status(
            "statusSale",
            "success",
            `${response.message} ${response.data.numero_factura}`
          );

        } catch (error) {

          status(
            "statusSale",
            "error",
            error.message
          );
        }
      }
    );

  $("posBarcode")
    ?.addEventListener(
      "keydown",
      async event => {

        if (
          event.key === "Enter"
        ) {

          event.preventDefault();

          await addProductToPos(
            event.target.value
          );
        }
      }
    );

  $("posSearchBtn")
    ?.addEventListener(
      "click",
      () =>
        addProductToPos(
          $("posBarcode").value
        )
    );

  $("posDiscount")
    ?.addEventListener(
      "input",
      calculatePosTotals
    );

  $("posReceived")
    ?.addEventListener(
      "input",
      calculatePosTotals
    );

  $("posSeller")
    ?.addEventListener(
      "change",
      calculatePosTotals
    );

  $("posPaymentMethod")
    ?.addEventListener(
      "change",
      updatePaymentMethod
    );

  $("posClearBtn")
    ?.addEventListener(
      "click",
      clearPos
    );

  $("posCheckoutBtn")
    ?.addEventListener(
      "click",
      checkoutPos
    );

  $("refreshInvoices")
    ?.addEventListener(
      "click",
      loadInvoices
    );

  $("invoiceSearch")
    ?.addEventListener(
      "input",
      event => {

        const query =
          event.target
            .value
            .toLowerCase();

        renderInvoices(
          invoicesCache.filter(
            invoice =>
              String(
                invoice.numero_factura
              )
                .toLowerCase()
                .includes(query)
              ||
              String(
                invoice.cliente
              )
                .toLowerCase()
                .includes(query)
              ||
              String(
                invoice.vendedor
              )
                .toLowerCase()
                .includes(query)
          )
        );
      }
    );

  $("invoiceCloseBtn")
    ?.addEventListener(
      "click",
      closeInvoiceModal
    );

  $("invoiceCloseBottomBtn")
    ?.addEventListener(
      "click",
      closeInvoiceModal
    );

  $("invoiceModalBackdrop")
    ?.addEventListener(
      "click",
      closeInvoiceModal
    );

  $("invoicePrintBtn")
    ?.addEventListener(
      "click",
      printInvoice
    );

  $("refreshSummary")
    ?.addEventListener(
      "click",
      async () => {
        await loadSummaryGeneral();
        await loadSummaryDaily();
      }
    );

  $("summarySalesBtn")
    ?.addEventListener(
      "click",
      loadSummarySales
    );

  $("summaryPurchasesBtn")
    ?.addEventListener(
      "click",
      loadSummaryPurchases
    );

  $("summaryDailyBtn")
    ?.addEventListener(
      "click",
      loadSummaryDaily
    );

  $("userForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        try {

          const response =
            await api(
              "/users",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    nombre:
                      $("uNombre").value,

                    usuario:
                      $("uUsuario").value,

                    password:
                      $("uPassword").value,

                    rol:
                      $("uRol").value
                  })
              }
            );

          status(
            "statusUser",
            "success",
            response.message
          );

          $("userForm")
            .reset();

          loadUsers();

        } catch (error) {

          status(
            "statusUser",
            "error",
            error.message
          );
        }
      }
    );

  document
    .addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Escape"
        ) {
          closeInvoiceModal();
          closeMobileMenu();
        }
      }
    );
}

// ============================================================
// INIT
// ============================================================

async function init() {

  bindEvents();

  if (
    await restoreSession()
  ) {
    showApp();
  } else {
    showLogin();
  }
}

document.addEventListener(
  "DOMContentLoaded",
  init
);