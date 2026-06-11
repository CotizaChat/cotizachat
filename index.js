// ============================================================
//  COTIZA.CHAT v8 — Bot WhatsApp Business
//  Sistema Nacional de Proveedores Ecuador 🇪🇨
//  ServicioNacionaldeCotizaciones.com
//  Flujo comprador + registro de proveedores
// ============================================================

require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const app     = express();

app.set("trust proxy", true);
app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); next(); });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Configuración ──────────────────────────────────────────
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "cotizachat2024";
const WA_TOKEN     = process.env.WA_TOKEN     || "";
const PHONE_ID     = process.env.PHONE_ID     || "";
const ADMIN_WA     = process.env.ADMIN_WA     || "";

// ── Logos (URLs públicas) ──────────────────────────────────
// Sube los logos a tu web Hostinger y coloca aquí las URLs públicas.
// Ejemplo: https://www.ServicioNacionaldeCotizaciones.com/logos/registro.png
const LOGO_REGISTRO = process.env.LOGO_REGISTRO || "https://www.servicionacionaldecotizaciones.com/registro-nacional-proveedores.png";
const LOGO_COTIZA   = process.env.LOGO_COTIZA   || "https://www.servicionacionaldecotizaciones.com/cotiza-chat.png";

// ── Almacenamiento ─────────────────────────────────────────
const sesiones     = {};
const cotizaciones = [];
const leads        = [];
const proveedoresRegistrados = [];

// ── Estados del flujo ──────────────────────────────────────
const E = {
  INICIO       : "INICIO",
  PRODUCTO     : "PRODUCTO",
  NOMBRE       : "NOMBRE",
  CIUDAD       : "CIUDAD",
  EMPRESA_OPC  : "EMPRESA_OPC",
  EMPRESA_NOM  : "EMPRESA_NOM",
  EMPRESA_RUC  : "EMPRESA_RUC",
  EMAIL        : "EMAIL",
  CANT_COTS    : "CANT_COTS",
  COBERTURA    : "COBERTURA",
  DETALLE      : "DETALLE",
  AUTORIZACION : "AUTORIZACION",
  CONFIRMADO   : "CONFIRMADO",
  // ── Registro de proveedores ──
  PROV_NOMBRE   : "PROV_NOMBRE",
  PROV_PROFESION: "PROV_PROFESION",
  PROV_TELEFONO : "PROV_TELEFONO",
  PROV_CIUDAD   : "PROV_CIUDAD",
  PROV_EMP_OPC  : "PROV_EMP_OPC",
  PROV_EMP_NOM  : "PROV_EMP_NOM",
  PROV_EMP_RUC  : "PROV_EMP_RUC",
  PROV_EMAIL    : "PROV_EMAIL",
  PROV_SERVICIOS: "PROV_SERVICIOS",
  PROV_PAGO     : "PROV_PAGO",
  PROV_CONFIRMAR: "PROV_CONFIRMAR",
};

// ── Helpers ────────────────────────────────────────────────
const cap   = s => s && s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const folio = () => "COT-" + Date.now().toString(36).toUpperCase();
const folioProv = () => "PROV-" + Date.now().toString(36).toUpperCase();
const hora  = () => new Date().toLocaleString("es-EC", {
  timeZone: "America/Guayaquil", dateStyle: "short", timeStyle: "short"
});

// ── Detectar categoría y emoji ─────────────────────────────
function categoriaProducto(producto) {
  const p = producto.toLowerCase();
  if (/cemento|cerámica|ceramica|hierro|ladrillo|bloque|arena|madera|pintura|tubería|tuberia|varilla|construc|material|ferret|clavo|tornillo|alambre|malla|piso|baldosa|azulejo|zinc|adoquín/.test(p))
    return { cat: "Ferreterías", emoji: "🏗️" };
  if (/computadora|laptop|servidor|impresora|router|monitor|tecnolog|hardware|tablet|celular|software/.test(p))
    return { cat: "Tecnología", emoji: "💻" };
  if (/uniforme|camisa|pantalón|ropa|tela|bordado|overol|textil|confección|zapato/.test(p))
    return { cat: "Textiles", emoji: "👕" };
  if (/limpieza|desinfectante|jabón|escoba|cloro|detergente|papel|higiene|aseo/.test(p))
    return { cat: "Limpieza", emoji: "🧹" };
  if (/transporte|flete|camión|logística|courier|envío|carga/.test(p))
    return { cat: "Logística", emoji: "🚛" };
  if (/alimento|comida|bebida|agua|café|azúcar|arroz|aceite|víveres|catering/.test(p))
    return { cat: "Alimentos", emoji: "🍱" };
  if (/máquina|maquinaria|motor|compresor|generador|grúa|bomba|industrial/.test(p))
    return { cat: "Maquinaria", emoji: "⚙️" };
  if (/médico|salud|farmacia|medicina|mascarilla/.test(p))
    return { cat: "Salud", emoji: "🏥" };
  if (/seguridad|guardia|vigilancia|casco|epp|extintor/.test(p))
    return { cat: "Seguridad", emoji: "🛡️" };
  if (/escritorio|silla|oficina|tóner|cartucho|mueble/.test(p))
    return { cat: "Oficina", emoji: "📋" };
  return { cat: "General", emoji: "📦" };
}

// ── FAQ ────────────────────────────────────────────────────
const FAQ = [
  {
    keywords: ["precio","costo","cuánto","cuanto","cobran","gratis","pago"],
    respuesta:
      `💰 *¿Cuánto cuesta Cotiza.Chat?*\n\n` +
      `✅ *Para compradores: GRATIS*\n` +
      `Solicitar cotizaciones no tiene ningún costo.\n\n` +
      `✅ *Para proveedores: GRATIS para empezar*\n` +
      `Regístrate gratis en:\n` +
      `👉 RegistroNacionaldeProveedores.com\n\n` +
      `_Servicio Nacional de Cotizaciones Ecuador_ 🇪🇨`
  },
  {
    keywords: ["proveedor","registrar","registrarme","registrarse","vender","publicar"],
    respuesta:
      `🏪 *¿Quieres ser Proveedor Verificado?*\n\n` +
      `Regístrate gratis en:\n` +
      `👉 *RegistroNacionaldeProveedores.com*\n\n` +
      `Beneficios:\n` +
      `✅ Recibe solicitudes de cotización directas\n` +
      `✅ Aparece en la Revista de Proveedores\n` +
      `✅ Accede a compradores de todo Ecuador\n` +
      `✅ Verificación de tu negocio incluida\n\n` +
      `📞 Más info en *ServicioNacionaldeCotizaciones.com*`
  },
  {
    keywords: ["garantía","garantia","confiable","seguro","verificado","confiar"],
    respuesta:
      `🛡️ *¿Cómo verificamos a los proveedores?*\n\n` +
      `Todos los proveedores de nuestra red:\n` +
      `✅ Tienen RUC activo en el SRI Ecuador\n` +
      `✅ Han sido validados por nuestro equipo\n` +
      `✅ Tienen calificaciones de otros compradores\n` +
      `✅ Están en RegistroNacionaldeProveedores.com\n\n` +
      `Consulta el perfil completo antes de comprar. 🇪🇨`
  },
  {
    keywords: ["tiempo","tarda","cuando","demora","rápido","rapido"],
    respuesta:
      `⏱️ *¿Cuánto tarda en llegar mi cotización?*\n\n` +
      `📱 Los proveedores te contactan por WhatsApp\n` +
      `en un tiempo estimado de *24 horas*.\n\n` +
      `_Horario de atención:_\n` +
      `Lun-Vie 8:00 - 18:00 · Sáb 9:00 - 13:00`
  },
  {
    keywords: ["humano","persona","hablar","asesor","soporte"],
    respuesta:
      `👋 *¿Necesitas hablar con una persona?*\n\n` +
      `Visítanos en:\n` +
      `🌐 *ServicioNacionaldeCotizaciones.com*\n\n` +
      `_O escribe *COTIZAR* para continuar\n` +
      `con tu solicitud._ 🇪🇨`
  },
];

function detectarFAQ(texto) {
  const t = texto.toLowerCase();
  for (const faq of FAQ) {
    if (faq.keywords.some(k => t.includes(k))) return faq.respuesta;
  }
  return null;
}

// ══════════════════════════════════════════════════════════
//  WEBHOOK
// ══════════════════════════════════════════════════════════
app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (value?.statuses) return;
    const msg = value?.messages?.[0];
    if (!msg) return;

    const tel  = msg.from;
    const tipo = msg.type;
    let texto  = "";

    if (tipo === "text")        texto = msg.text.body.trim();
    else if (tipo === "interactive") {
      texto = msg.interactive?.button_reply?.id ||
              msg.interactive?.list_reply?.id   || "";
    } else {
      return enviarTexto(tel, "Solo proceso mensajes de texto. Escribe *Hola* para iniciar. 😊");
    }

    if (!texto) return;
    if (!sesiones[tel]) sesiones[tel] = { estado: E.INICIO, datos: {} };
    console.log(`📩 [${tel}] ${sesiones[tel].estado} → "${texto.slice(0,60)}"`);
    await flujo(tel, texto);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
});

// ══════════════════════════════════════════════════════════
//  MOTOR DE CONVERSACIÓN
// ══════════════════════════════════════════════════════════
async function flujo(tel, texto) {
  const ses = sesiones[tel];
  const t   = texto.toLowerCase().trim();

  const reinicio = ["hola","hi","inicio","start","menu","reiniciar","cotizar",
                    "nueva","0","buenos días","buenas","buenas tardes","buenas noches",
                    "nueva cotización","empezar"];
  if (reinicio.includes(t)) {
    sesiones[tel] = { estado: E.INICIO, datos: {} };
    return bienvenida(tel);
  }

  if (t === "como_funciona")  return comoFunciona(tel);
  if (t === "mis_cots")       return misCotizaciones(tel);
  if (t === "nueva_cot")      { sesiones[tel] = { estado: E.INICIO, datos: {} }; return bienvenida(tel); }
  if (t === "quiero_proveedor") return iniciarRegistroProveedor(tel);

  if (t.startsWith("lead_si_") || t.startsWith("lead_no_")) {
    return respuestaProveedor(tel, texto);
  }

  // ── Manejo del flujo de registro de proveedores ──────────
  if (ses.estado && ses.estado.startsWith("PROV_")) {
    return flujoProveedor(tel, texto);
  }

  const faqResp = detectarFAQ(texto);
  if (faqResp && ses.estado === E.INICIO) {
    await enviarTexto(tel, faqResp);
    await new Promise(r => setTimeout(r, 800));
    return enviarTexto(tel, "¿Algo más? Escribe *COTIZAR* para solicitar una cotización. 😊");
  }

  switch (ses.estado) {

    // ── INICIO ───────────────────────────────────────────
    case E.INICIO:
      return bienvenida(tel);

    // ── PRODUCTO → confirma y pide nombre ────────────────
    case E.PRODUCTO:
      if (texto.length < 3) return enviarTexto(tel, "✏️ Por favor describe con más detalle el producto o servicio.");
      ses.datos.producto = cap(texto);
      const info = categoriaProducto(ses.datos.producto);
      ses.datos.categoria = info.cat;
      ses.datos.emoji = info.emoji;
      ses.estado = E.NOMBRE;
      await enviarTexto(tel,
        `${info.emoji} *${ses.datos.producto}* — anotado.\n\n` +
        `Para enviarte las mejores cotizaciones necesitamos algunos datos rápidos 👇`
      );
      await new Promise(r => setTimeout(r, 600));
      return enviarTexto(tel, `👤 *Su nombre y apellido:*`);

    // ── NOMBRE → pide ciudad ─────────────────────────────
    case E.NOMBRE:
      if (texto.length < 3) return enviarTexto(tel, "Por favor escribe su nombre y apellido.");
      ses.datos.nombre = cap(texto);
      ses.estado = E.CIUDAD;
      return enviarTexto(tel, `📍 *Su ciudad:*`);

    // ── CIUDAD → pregunta empresa ────────────────────────
    case E.CIUDAD:
      ses.datos.ciudad = cap(texto);
      ses.estado = E.EMPRESA_OPC;
      return preguntaEmpresa(tel);

    // ── ¿EMPRESA O PERSONAL? ─────────────────────────────
    case E.EMPRESA_OPC:
      if (t === "es_empresa") {
        ses.estado = E.EMPRESA_NOM;
        return enviarTexto(tel, `🏢 *Nombre de su empresa:*`);
      } else {
        ses.datos.empresa = "Persona natural";
        ses.datos.ruc = "";
        ses.estado = E.EMAIL;
        return enviarTexto(tel, `📧 *Su correo electrónico:*`);
      }

    // ── NOMBRE EMPRESA → pide RUC ────────────────────────
    case E.EMPRESA_NOM:
      ses.datos.empresa = cap(texto);
      ses.estado = E.EMPRESA_RUC;
      return enviarTexto(tel, `🔢 *RUC de su empresa:*`);

    // ── RUC → pide email ─────────────────────────────────
    case E.EMPRESA_RUC:
      ses.datos.ruc = texto.trim();
      ses.estado = E.EMAIL;
      return enviarTexto(tel, `📧 *Su correo electrónico:*`);

    // ── EMAIL → pide cantidad ────────────────────────────
    case E.EMAIL:
      ses.datos.email = texto.toLowerCase().trim();
      ses.estado = E.CANT_COTS;
      return elegirCantidad(tel);

    // ── CANTIDAD → pide cobertura ────────────────────────
    case E.CANT_COTS:
      ses.datos.cant_cots = texto.replace("CANT_","");
      ses.estado = E.COBERTURA;
      return enviarTexto(tel,
        `🌎 *Cobertura:*\n\n` +
        `¿Requiere cotizaciones de su ciudad, de Ecuador o internacionales?\n\n` +
        `_Escríbanos: el nombre de su ciudad, "Ecuador" o "Internacional"_`
      );

    // ── COBERTURA → pide detalle ─────────────────────────
    case E.COBERTURA:
      ses.datos.cobertura = cap(texto);
      ses.estado = E.DETALLE;
      return enviarTexto(tel,
        `📝 *Cuéntenos de manera detallada lo que requiere cotizar:*\n\n` +
        `Incluye si puedes:\n` +
        `• Especificaciones técnicas o marca preferida\n` +
        `• Cantidad exacta\n` +
        `• Fecha en que lo necesitas\n` +
        `• Cualquier detalle importante`
      );

    // ── DETALLE → pide autorización ──────────────────────
    case E.DETALLE:
      ses.datos.detalle = texto;
      ses.estado = E.AUTORIZACION;
      return pedirAutorizacion(tel);

    // ── AUTORIZACIÓN → finaliza ──────────────────────────
    case E.AUTORIZACION:
      if (t === "si_autorizo" || t === "autorizo") {
        ses.datos.autorizado = true;
        return finalizar(tel, ses);
      }
      if (t === "no_autorizo") {
        sesiones[tel] = { estado: E.INICIO, datos: {} };
        return enviarTexto(tel,
          "Entendido. Sin tu autorización no podemos enviar tu solicitud a los proveedores.\n\n" +
          "Si cambias de opinión escribe *Hola* cuando quieras. 😊"
        );
      }
      return pedirAutorizacion(tel);

    case E.CONFIRMADO:
      return enviarBotones(tel, {
        body   : "✅ Tu cotización ya fue enviada.\n\n¿Necesitas cotizar algo más?",
        botones: [{ id: "nueva_cot", titulo: "🔄 Nueva cotización" }]
      });

    default:
      sesiones[tel] = { estado: E.INICIO, datos: {} };
      return bienvenida(tel);
  }
}

// ══════════════════════════════════════════════════════════
//  MENSAJES UI
// ══════════════════════════════════════════════════════════

async function bienvenida(tel) {
  sesiones[tel].estado = E.PRODUCTO;
  return enviarBotones(tel, {
    header : "🇪🇨 SERVICIO NACIONAL DE COTIZACIONES",
    body   :
      "¡Hola! 👋 Un gusto saludarte.\n\n" +
      "Bienvenido a *Cotiza.Chat* 🤖\n" +
      "El Buscador de Cotizaciones más potente del Ecuador.\n\n" +
      "Te conectamos con *Proveedores Verificados*.\n" +
      "Sin llamadas, sin esperas.\n\n" +
      "¿Qué deseas *cotizar hoy*?\n" +
      "_Escribe el producto o servicio que necesitas:_\n\n" +
      "📍 Encuéntranos en nuestra Web:\n" +
      "ServicioNacionaldeCotizaciones.com",
    botones: [
      { id: "como_funciona",    titulo: "❓ ¿Cómo funciona?"   },
      { id: "mis_cots",         titulo: "📋 Mis cotizaciones"  },
      { id: "quiero_proveedor", titulo: "🏪 Ser Proveedor" },
    ]
  });
}

async function comoFunciona(tel) {
  sesiones[tel].estado = E.PRODUCTO;
  return enviarTexto(tel,
    `🤖 *¿Cómo funciona Cotiza.Chat?*\n\n` +
    `1️⃣ Escríbenos qué necesitas cotizar\n` +
    `2️⃣ Completa tus datos en 2 minutos\n` +
    `3️⃣ Notificamos a Proveedores Verificados\n` +
    `4️⃣ Los proveedores te contactan por WhatsApp\n` +
    `5️⃣ Tú eliges la mejor oferta\n\n` +
    `✅ *Gratis para compradores*\n` +
    `✅ *Proveedores verificados con RUC*\n` +
    `✅ *Cobertura en todo Ecuador*\n\n` +
    `Escribe el *producto* que necesitas para empezar 👇`
  );
}

async function misCotizaciones(tel) {
  const mias = cotizaciones.filter(c => c.telefono === tel).slice(-3).reverse();
  if (!mias.length) {
    sesiones[tel].estado = E.PRODUCTO;
    return enviarTexto(tel, "No tienes cotizaciones registradas aún.\nEscribe *Hola* para crear una. 😊");
  }
  const lista = mias.map(c =>
    `📄 *${c.folio}*\n${c.emoji} ${c.producto}\n📍 ${c.ciudad} · 🕐 ${c.creado}`
  ).join("\n\n");
  return enviarTexto(tel, `📋 *Tus últimas cotizaciones:*\n\n${lista}\n\nEscribe *COTIZAR* para una nueva.`);
}

async function preguntaEmpresa(tel) {
  return enviarBotones(tel, {
    body   : `🏢 ¿Tu solicitud es para tu empresa o es personal?`,
    botones: [
      { id: "es_empresa",  titulo: "🏢 Para mi empresa" },
      { id: "es_personal", titulo: "👤 Es personal"      },
    ]
  });
}

async function elegirCantidad(tel) {
  return enviarBotones(tel, {
    body   : `📊 Cantidad de cotizaciones que desea recibir:`,
    botones: [
      { id: "CANT_1", titulo: "1️⃣ Una"          },
      { id: "CANT_3", titulo: "3️⃣ Tres"         },
      { id: "CANT_5", titulo: "5️⃣ Cinco o más"  },
    ]
  });
}

async function pedirAutorizacion(tel) {
  return enviarBotones(tel, {
    header : "🔐 Autorización de datos — LOPDP Ecuador",
    body   :
      `Para enviarte las cotizaciones necesitamos\n` +
      `tu autorización según la *Ley LOPDP Ecuador*.\n\n` +
      `Al continuar autorizas que:\n` +
      `✅ Compartamos tu solicitud con Proveedores\n` +
      `   Verificados de nuestra plataforma\n` +
      `✅ Los proveedores te contacten por WhatsApp\n` +
      `✅ Guardemos tu solicitud por 12 meses\n\n` +
      `🔒 *Tus datos NO se venden ni se comparten\n` +
      `con terceros fuera de este servicio.*`,
    footer : "Protegemos tus datos según la ley ecuatoriana",
    botones: [
      { id: "si_autorizo", titulo: "✅ Sí, autorizo" },
      { id: "no_autorizo", titulo: "❌ No autorizo"  },
    ]
  });
}

// ══════════════════════════════════════════════════════════
//  FINALIZAR
// ══════════════════════════════════════════════════════════
async function finalizar(tel, ses) {
  const d   = ses.datos;
  const num = folio();
  const ts  = hora();

  const cantTexto = {
    "1": "1 cotización",
    "3": "3 cotizaciones",
    "5": "5 o más cotizaciones",
  }[d.cant_cots] || d.cant_cots;

  cotizaciones.push({ folio: num, ...d, telefono: tel, creado: ts });
  sesiones[tel] = { estado: E.CONFIRMADO, datos: {} };

  // ── Confirmar al comprador ────────────────────────────
  await enviarBotones(tel, {
    header : "🎉 ¡Solicitud Enviada Exitosamente!",
    body   :
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 Solicitud N.: *${num}*\n` +
      `${d.emoji} Producto: *${d.producto}*.\n` +
      `📍 Ciudad: *${d.ciudad}*.\n` +
      `🏷️ Categoría: *${d.categoria}*.\n` +
      `🌎 Cobertura: *${d.cobertura}*.\n` +
      `📊 Cotizaciones: *${cantTexto}*.\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Los Proveedores Verificados te enviarán\n` +
      `sus Cotizaciones directamente a tu WhatsApp.\n\n` +
      `⏱️ *Tiempo estimado:* 24 horas.\n\n` +
      `💡 *Tips para elegir la mejor cotización:*\n\n` +
      `1️⃣ Revisa la *garantía* del proveedor.\n` +
      `2️⃣ Verifica que el precio se ajuste a tu presupuesto.\n` +
      `3️⃣ Consulta el perfil del proveedor en\n` +
      `   RegistroNacionaldeProveedores.com.\n` +
      `4️⃣ Compara al menos 3 cotizaciones.\n` +
      `5️⃣ Solicita *factura* y documentos de respaldo.\n\n` +
      `📋 Más información de nuestro servicio en:\n` +
      `Cotizaciones.ec 🇪🇨`,
    botones: [{ id: "nueva_cot", titulo: "🔄 Nueva cotización" }]
  });

  // ── Notificar al admin ────────────────────────────────
  if (ADMIN_WA) {
    await new Promise(r => setTimeout(r, 500));
    await enviarTexto(ADMIN_WA,
      `🔔 *NUEVO LEAD — ${num}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${d.emoji} *Producto:* ${d.producto}\n` +
      `🏷️ *Categoría:* ${d.categoria}\n` +
      `📝 *Detalle:* ${d.detalle?.slice(0,120) || "No especificado"}\n` +
      `👤 *Nombre:* ${d.nombre}\n` +
      `📍 *Ciudad:* ${d.ciudad}\n` +
      `🌎 *Cobertura:* ${d.cobertura}\n` +
      `🏢 *Empresa:* ${d.empresa || "Personal"}\n` +
      `🔢 *RUC:* ${d.ruc || "No aplica"}\n` +
      `📧 *Email:* ${d.email || "No proporcionado"}\n` +
      `📊 *Cotizaciones:* ${cantTexto}\n` +
      `📞 *WhatsApp:* https://wa.me/${tel}\n` +
      `🕐 *Hora:* ${ts}`
    );
  }

  console.log(`✅ Cotización: ${num} | ${d.nombre} | ${d.producto} | ${d.categoria} | ${d.ciudad}`);
}

// ── Respuesta proveedor ────────────────────────────────────
async function respuestaProveedor(tel, texto) {
  const t = texto.toLowerCase();
  if (t.startsWith("lead_si_")) {
    const partes     = texto.replace("lead_si_","").split("__");
    const folioL     = partes[0];
    const telCliente = partes[1];
    const cot        = cotizaciones.find(c => c.folio === folioL);
    await enviarTexto(tel,
      `✅ *¡Aquí está el contacto del cliente!*\n\n` +
      `🏢 *Empresa:* ${cot?.empresa || "Ver folio"}\n` +
      `👤 *Contacto:* ${cot?.nombre || ""}\n` +
      `📧 *Email:* ${cot?.email || "No proporcionado"}\n` +
      `📞 *WhatsApp:* https://wa.me/${telCliente}\n\n` +
      `💡 Responde rápido — hay otros proveedores compitiendo.\n\n` +
      `¡Mucho éxito! 🚀\n_ServicioNacionaldeCotizaciones.com_ 🇪🇨`
    );
    if (ADMIN_WA) {
      await enviarTexto(ADMIN_WA,
        `💰 *LEAD ACEPTADO — ${folioL}*\nProveedor: +${tel}\nCliente: ${cot?.nombre}`
      );
    }
    return;
  }
  if (t.startsWith("lead_no_")) {
    return enviarTexto(tel, `Entendido 👍\nTe seguiremos enviando solicitudes de tu categoría.`);
  }
}

// ══════════════════════════════════════════════════════════
//  REGISTRO DE PROVEEDORES
// ══════════════════════════════════════════════════════════
async function iniciarRegistroProveedor(tel) {
  sesiones[tel] = { estado: E.PROV_NOMBRE, datos: { tipo: "proveedor" } };
  // Enviar logo del Registro Nacional de Proveedores
  await enviarImagen(tel, LOGO_REGISTRO,
    `🏪 *Registro Nacional de Proveedores*\nServicio Nacional de Cotizaciones 🇪🇨`
  );
  await new Promise(r => setTimeout(r, 600));
  await enviarTexto(tel,
    `🏪 *¡Excelente decisión!*\n\n` +
    `Únete a la red de *Proveedores Verificados*\n` +
    `del Servicio Nacional de Cotizaciones.\n\n` +
    `✅ Recibe solicitudes de cotización directas.\n` +
    `✅ Estarás en el Anuario del Registro\n` +
    `   Nacional de Proveedores.\n` +
    `✅ Accede a compradores de todo Ecuador.\n\n` +
    `💰 *Suscripción: GRATUITA por lanzamiento* 🎉\n\n` +
    `Vamos a registrarte en 2 minutos 👇`
  );
  await new Promise(r => setTimeout(r, 800));
  return enviarTexto(tel, `👤 *Ingrese su nombre completo:*`);
}

async function flujoProveedor(tel, texto) {
  const ses = sesiones[tel];
  const t   = texto.toLowerCase().trim();
  const d   = ses.datos;

  switch (ses.estado) {

    case E.PROV_NOMBRE:
      if (texto.length < 3) return enviarTexto(tel, "Por favor ingrese su nombre completo.");
      d.nombre = cap(texto);
      ses.estado = E.PROV_PROFESION;
      return enviarTexto(tel, `💼 *Su profesión u ocupación:*`);

    case E.PROV_PROFESION:
      d.profesion = cap(texto);
      ses.estado = E.PROV_TELEFONO;
      return enviarTexto(tel,
        `📱 *Su teléfono de contacto:*\n` +
        `_Ejemplo: 0999123456_`
      );

    case E.PROV_TELEFONO:
      d.telefono_contacto = texto.trim();
      ses.estado = E.PROV_CIUDAD;
      return enviarTexto(tel, `📍 *Su ciudad:*`);

    case E.PROV_CIUDAD:
      d.ciudad = cap(texto);
      ses.estado = E.PROV_EMP_OPC;
      return enviarBotones(tel, {
        body: `🏢 ¿Tiene empresa registrada?`,
        botones: [
          { id: "prov_si_empresa", titulo: "🏢 Sí, tengo empresa" },
          { id: "prov_no_empresa", titulo: "👤 Soy independiente"  },
        ]
      });

    case E.PROV_EMP_OPC:
      if (t === "prov_si_empresa") {
        ses.estado = E.PROV_EMP_NOM;
        return enviarTexto(tel, `🏢 *Nombre de su empresa:*`);
      } else {
        d.empresa = "Independiente";
        d.ruc = "";
        ses.estado = E.PROV_EMAIL;
        return enviarTexto(tel, `📧 *Su correo electrónico:*`);
      }

    case E.PROV_EMP_NOM:
      d.empresa = cap(texto);
      ses.estado = E.PROV_EMP_RUC;
      return enviarTexto(tel, `🔢 *RUC de su empresa:*`);

    case E.PROV_EMP_RUC:
      d.ruc = texto.trim();
      ses.estado = E.PROV_EMAIL;
      return enviarTexto(tel, `📧 *Su correo electrónico:*`);

    case E.PROV_EMAIL:
      d.email = texto.toLowerCase().trim();
      ses.estado = E.PROV_SERVICIOS;
      return enviarTexto(tel,
        `🛒 *¿Qué productos o servicios ofrece?*\n\n` +
        `Describa detalladamente lo que vende:\n` +
        `• Categorías (ej: ferretería, construcción)\n` +
        `• Productos principales\n` +
        `• Marcas que maneja`
      );

    case E.PROV_SERVICIOS:
      d.servicios = texto;
      ses.estado = E.PROV_PAGO;
      return enviarTexto(tel,
        `💳 *¿Cuáles son sus condiciones de pago?*\n\n` +
        `Ejemplos:\n` +
        `• Contado\n` +
        `• Crédito 30 días\n` +
        `• Transferencia / Efectivo / Cheque`
      );

    case E.PROV_PAGO:
      d.pago = texto;
      ses.estado = E.PROV_CONFIRMAR;
      return mostrarResumenProveedor(tel, d);

    case E.PROV_CONFIRMAR:
      if (["prov_confirmar","si","sí","confirmar"].includes(t)) {
        return finalizarRegistroProveedor(tel, ses);
      }
      if (["prov_cancelar","no","cancelar"].includes(t)) {
        sesiones[tel] = { estado: E.INICIO, datos: {} };
        return enviarTexto(tel, "Registro cancelado.\n\nEscribe *Hola* cuando quieras intentarlo de nuevo. 😊");
      }
      return mostrarResumenProveedor(tel, d);

    default:
      sesiones[tel] = { estado: E.INICIO, datos: {} };
      return bienvenida(tel);
  }
}

async function mostrarResumenProveedor(tel, d) {
  return enviarBotones(tel, {
    header: "📋 Resumen de su Registro",
    body:
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Nombre:* ${d.nombre}\n` +
      `💼 *Profesión:* ${d.profesion}\n` +
      `📱 *Teléfono:* ${d.telefono_contacto}\n` +
      `📍 *Ciudad:* ${d.ciudad}\n` +
      `🏢 *Empresa:* ${d.empresa}\n` +
      `🔢 *RUC:* ${d.ruc || "No aplica"}\n` +
      `📧 *Email:* ${d.email}\n` +
      `🛒 *Servicios:* ${d.servicios?.slice(0,100)}\n` +
      `💳 *Pago:* ${d.pago?.slice(0,80)}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 *Suscripción: GRATUITA* 🎉\n\n` +
      `¿Confirma su registro como Proveedor?`,
    botones: [
      { id: "prov_confirmar", titulo: "✅ Sí, registrarme" },
      { id: "prov_cancelar",  titulo: "❌ Cancelar"        },
    ]
  });
}

async function finalizarRegistroProveedor(tel, ses) {
  const d   = ses.datos;
  const num = folioProv();
  const ts  = hora();

  proveedoresRegistrados.push({ folio: num, ...d, telefono: tel, creado: ts, estado: "En verificación" });
  sesiones[tel] = { estado: E.INICIO, datos: {} };

  // Confirmar al proveedor
  await enviarTexto(tel,
    `🎉 *¡Bienvenido a la red de Proveedores!*\n\n` +
    `✅ Su registro N.: *${num}*\n` +
    `✅ Estado: *En verificación*\n\n` +
    `Nuestro equipo verificará sus datos y\n` +
    `activará su cuenta en *24-48 horas*.\n\n` +
    `Una vez activo, comenzará a recibir\n` +
    `solicitudes de cotización directamente\n` +
    `a su WhatsApp.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `⭐ *CLAVES PARA SER UN PROVEEDOR EXITOSO:*\n\n` +
    `1️⃣ Responde rápido tus solicitudes — la\n` +
    `   velocidad gana clientes.\n` +
    `2️⃣ Sé claro y honesto en los servicios\n` +
    `   que ofreces.\n` +
    `3️⃣ Entrega un precio justo, correcto y\n` +
    `   final desde el inicio.\n` +
    `4️⃣ Actúa siempre con honestidad — tu\n` +
    `   reputación habla por ti.\n` +
    `5️⃣ Cumple los plazos que prometes.\n` +
    `6️⃣ Brinda buen trato y atención\n` +
    `   profesional a cada cliente.\n` +
    `7️⃣ Entrega factura y respaldo de tus\n` +
    `   productos o servicios.\n\n` +
    `Los proveedores serios y confiables reciben\n` +
    `más solicitudes y mejores calificaciones. 🌟\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📋 Más información de nuestro servicio en:\n` +
    `Cotizaciones.ec\n\n` +
    `¡Gracias por unirse! 🇪🇨`
  );

  // Notificar al admin
  if (ADMIN_WA) {
    await new Promise(r => setTimeout(r, 500));
    await enviarTexto(ADMIN_WA,
      `🏪 *NUEVO PROVEEDOR REGISTRADO — ${num}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Nombre:* ${d.nombre}\n` +
      `💼 *Profesión:* ${d.profesion}\n` +
      `📱 *Teléfono:* ${d.telefono_contacto}\n` +
      `📍 *Ciudad:* ${d.ciudad}\n` +
      `🏢 *Empresa:* ${d.empresa}\n` +
      `🔢 *RUC:* ${d.ruc || "No aplica"}\n` +
      `📧 *Email:* ${d.email}\n` +
      `🛒 *Servicios:* ${d.servicios}\n` +
      `💳 *Pago:* ${d.pago}\n` +
      `📞 *WhatsApp:* https://wa.me/${tel}\n` +
      `🕐 *Hora:* ${ts}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ Pendiente de verificación`
    );
  }

  console.log(`🏪 Proveedor registrado: ${num} | ${d.nombre} | ${d.ciudad}`);
}

// ══════════════════════════════════════════════════════════
//  API WHATSAPP
// ══════════════════════════════════════════════════════════
async function enviarTexto(tel, body) {
  return apiWA({ messaging_product:"whatsapp", to:tel, type:"text", text:{ body } });
}

async function enviarImagen(tel, urlImagen, caption) {
  // Si la URL no es válida o es placeholder, omite la imagen silenciosamente
  if (!urlImagen || !urlImagen.startsWith("http")) {
    if (caption) return enviarTexto(tel, caption);
    return;
  }
  try {
    return await apiWA({
      messaging_product: "whatsapp", to: tel, type: "image",
      image: { link: urlImagen, ...(caption ? { caption } : {}) }
    });
  } catch (err) {
    // Si falla el envío de imagen, envía solo el texto
    if (caption) return enviarTexto(tel, caption);
  }
}

async function enviarBotones(tel, { header, body, footer, botones }) {
  return apiWA({
    messaging_product: "whatsapp", to: tel, type: "interactive",
    interactive: {
      type: "button",
      ...(header ? { header: { type:"text", text:header } } : {}),
      body: { text: body },
      ...(footer ? { footer: { text:footer } } : {}),
      action: { buttons: botones.map(b => ({ type:"reply", reply:{ id:b.id.slice(0,256), title:b.titulo.slice(0,20) } })) }
    }
  });
}

async function enviarLista(tel, { body, footer, boton, secciones }) {
  return apiWA({
    messaging_product: "whatsapp", to: tel, type: "interactive",
    interactive: {
      type: "list", body: { text: body },
      ...(footer ? { footer: { text:footer } } : {}),
      action: { button: boton, sections: secciones.map(s => ({ title:s.titulo, rows:s.filas.map(f => ({ id:f.id.slice(0,256), title:f.titulo.slice(0,24) })) })) }
    }
  });
}

async function apiWA(payload) {
  if (!WA_TOKEN || !PHONE_ID) {
    console.log("⚙️  [DEMO]", JSON.stringify(payload).slice(0,120));
    return;
  }
  try {
    await axios.post(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, payload, {
      headers: { Authorization:`Bearer ${WA_TOKEN}`, "Content-Type":"application/json" },
      timeout: 10000
    });
  } catch (err) {
    const e = err.response?.data?.error;
    console.error("❌ API WA:", e?.message || err.message);
    if (e?.code === 190) console.error("🔑 Token expirado");
  }
}

// ══════════════════════════════════════════════════════════
//  PANEL ADMIN
// ══════════════════════════════════════════════════════════
app.get("/admin", (req, res) => {
  if (req.query.key !== VERIFY_TOKEN) return res.status(401).send("No autorizado");
  const filas = cotizaciones.length === 0
    ? `<tr><td colspan="9" style="text-align:center;padding:30px;color:#888">Sin cotizaciones aún</td></tr>`
    : [...cotizaciones].reverse().map((c,i) => `
      <tr style="background:${i%2===0?"#fff":"#f9fafb"}">
        <td><b style="color:#16a34a">${c.folio}</b></td>
        <td>${c.emoji} ${c.producto}</td>
        <td>${c.categoria||""}</td>
        <td>${c.nombre||""}</td>
        <td>${c.ciudad}</td>
        <td>${c.cobertura||""}</td>
        <td>${c.empresa||"Personal"}</td>
        <td>${c.email||""}</td>
        <td><small style="color:#888">${c.creado}</small></td>
      </tr>`).join("");
  const filasProv = proveedoresRegistrados.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">Sin proveedores registrados aún</td></tr>`
    : [...proveedoresRegistrados].reverse().map((p,i) => `
      <tr style="background:${i%2===0?"#fff":"#f9fafb"}">
        <td><b style="color:#2563eb">${p.folio}</b></td>
        <td>${p.nombre||""}</td>
        <td>${p.profesion||""}</td>
        <td>${p.ciudad||""}</td>
        <td>${p.empresa||"Independiente"}</td>
        <td>${(p.servicios||"").slice(0,40)}</td>
        <td><span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${p.estado||"En verificación"}</span></td>
      </tr>`).join("");

  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CotizaBot Admin v8</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f3f4f6;padding:20px;color:#1c1e21}
.top{background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;padding:20px;border-radius:12px;margin-bottom:16px}
.top h1{font-size:18px;margin-bottom:2px}.top p{font-size:12px;opacity:.85}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px}
.stat{background:#fff;border-radius:10px;padding:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat .n{font-size:24px;font-weight:700;color:#25D366}.stat .l{font-size:11px;color:#888;margin-top:2px}
h2{font-size:14px;font-weight:600;margin:16px 0 8px;color:#444}
.card{background:#fff;border-radius:10px;overflow-x:auto;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:16px}
table{width:100%;border-collapse:collapse;min-width:800px}
th{background:#f9fafb;padding:8px 12px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;border-bottom:1px solid #eee}
td{padding:8px 12px;font-size:12px;border-bottom:1px solid #f3f4f6}
.btn{display:inline-block;background:#25D366;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;text-decoration:none;margin-bottom:12px}
</style></head><body>
<div class="top"><h1>🤖 CotizaBot v8 — Panel Admin</h1><p>Sistema Nacional de Proveedores Ecuador · ServicioNacionaldeCotizaciones.com</p></div>
<div class="stats">
  <div class="stat"><div class="n">${cotizaciones.length}</div><div class="l">Cotizaciones</div></div>
  <div class="stat"><div class="n">${proveedoresRegistrados.length}</div><div class="l">Proveedores nuevos</div></div>
  <div class="stat"><div class="n">${new Set(cotizaciones.map(c=>c.categoria)).size}</div><div class="l">Categorías</div></div>
  <div class="stat"><div class="n">${Object.keys(sesiones).length}</div><div class="l">Sesiones activas</div></div>
</div>
<a class="btn" href="?key=${VERIFY_TOKEN}">🔄 Actualizar</a>
<h2>🏪 Proveedores registrados (pendientes de verificar)</h2>
<div class="card"><table>
<thead><tr><th>Registro N.</th><th>Nombre</th><th>Profesión</th><th>Ciudad</th><th>Empresa</th><th>Servicios</th><th>Estado</th></tr></thead>
<tbody>${filasProv}</tbody></table></div>
<h2>📋 Cotizaciones recibidas</h2>
<div class="card"><table>
<thead><tr><th>Folio</th><th>Producto</th><th>Categoría</th><th>Nombre</th><th>Ciudad</th><th>Cobertura</th><th>Empresa</th><th>Email</th><th>Fecha</th></tr></thead>
<tbody>${filas}</tbody></table></div>
</body></html>`);
});

app.get("/", (req, res) => res.json({
  status: "✅ CotizaBot activo", version: "8.0",
  servicio: "Cotiza.Chat — Sistema Nacional de Proveedores Ecuador 🇪🇨",
  cotizaciones: cotizaciones.length,
  proveedores_registrados: proveedoresRegistrados.length,
  uptime_min: Math.floor(process.uptime()/60),
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 CotizaBot v8 corriendo en puerto ${PORT}`);
  console.log(`🇪🇨  ServicioNacionaldeCotizaciones.com`);
  console.log(`⚙️   Modo: ${WA_TOKEN ? "PRODUCCIÓN ✅" : "DEMO"}\n`);
});
