// ============================================================
//  COTIZA.CHAT v5 — Bot WhatsApp Business
//  Sistema Nacional de Proveedores Ecuador 🇪🇨
//  ServicioNacionaldeCotizaciones.com
//  Archivo único — sin dependencias externas
// ============================================================

require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const app     = express();

app.set("trust proxy", true);
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ══════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ══════════════════════════════════════════════════════════
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "cotizachat2024";
const WA_TOKEN     = process.env.WA_TOKEN     || "";
const PHONE_ID     = process.env.PHONE_ID     || "";
const ADMIN_WA     = process.env.ADMIN_WA     || "";

// ══════════════════════════════════════════════════════════
//  REGISTRO DE PROVEEDORES
//  ► Para agregar un proveedor real:
//    1. Copia uno de los bloques de ejemplo
//    2. Rellena los datos reales
//    3. Cambia activo: false → activo: true
//    4. El teléfono va SIN + ni espacios: 593XXXXXXXXX
// ══════════════════════════════════════════════════════════
const PROVEEDORES = [

  // ── ADMIN — recibe TODOS los leads siempre ──────────────
  {
    id        : "ADMIN",
    nombre    : "Admin Sistema Nacional",
    contacto  : "Admin",
    telefono  : ADMIN_WA,
    categorias: ["todo"],
    ciudades  : ["todo"],
    activo    : true,
    esAdmin   : true,
  },

  // ── AGREGA TUS PROVEEDORES AQUÍ ─────────────────────────
  // Ejemplo 1 — Construcción
  {
    id        : "PROV-001",
    nombre    : "Distribuidora Constructor",
    contacto  : "Carlos Mendoza",
    telefono  : "593999000001",   // ← Reemplaza con número real
    categorias: ["construccion", "maquinaria"],
    ciudades  : ["Quito", "Ambato", "todo"],
    activo    : false,            // ← Cambia a true cuando tengas el número
  },

  // Ejemplo 2 — Tecnología
  {
    id        : "PROV-002",
    nombre    : "TechSuministros Ecuador",
    contacto  : "Ana Torres",
    telefono  : "593999000002",   // ← Reemplaza con número real
    categorias: ["tecnologia"],
    ciudades  : ["Guayaquil", "Quito", "todo"],
    activo    : false,
  },

  // Ejemplo 3 — Textiles
  {
    id        : "PROV-003",
    nombre    : "Uniformes Andes",
    contacto  : "Roberto Silva",
    telefono  : "593999000003",   // ← Reemplaza con número real
    categorias: ["textiles"],
    ciudades  : ["Cuenca", "Guayaquil", "todo"],
    activo    : false,
  },

  // Ejemplo 4 — Limpieza
  {
    id        : "PROV-004",
    nombre    : "CleanPro Servicios",
    contacto  : "María Vásquez",
    telefono  : "593999000004",   // ← Reemplaza con número real
    categorias: ["limpieza"],
    ciudades  : ["Quito", "todo"],
    activo    : false,
  },

];

// ── Detectar categoría por palabras clave ─────────────────
function detectarCategoria(producto) {
  const p = producto.toLowerCase();
  if (/cemento|hierro|ladrillo|bloque|arena|madera|pintura|tubería|varilla|construccion|material|obra|piso|cerámica/.test(p)) return "construccion";
  if (/computadora|laptop|servidor|impresora|router|switch|monitor|tecnologia|equipo|hardware|red/.test(p)) return "tecnologia";
  if (/uniforme|camisa|pantalón|ropa|tela|bordado|overol|textil|confección|zapato/.test(p)) return "textiles";
  if (/limpieza|desinfectante|jabón|escoba|cloro|detergente|papel|higiene|aseo/.test(p)) return "limpieza";
  if (/transporte|flete|camión|logistica|bodega|courier|envío|carga/.test(p)) return "logistica";
  if (/alimento|comida|bebida|agua|café|azúcar|arroz|aceite|víveres|catering/.test(p)) return "alimentos";
  if (/máquina|maquinaria|motor|compresor|generador|grúa|bomba|industrial/.test(p)) return "maquinaria";
  return "general";
}

// ── Buscar proveedores por categoría y ciudad ─────────────
function buscarProveedores(producto, ciudad) {
  const categoria  = detectarCategoria(producto);
  const ciudadNorm = ciudad.toLowerCase();

  return PROVEEDORES.filter(p => {
    if (!p.activo || !p.telefono) return false;
    if (p.esAdmin) return !!p.telefono; // admin siempre incluido si tiene teléfono

    const ciudadOk    = p.ciudades.some(c => c.toLowerCase() === ciudadNorm || c === "todo");
    const categoriaOk = p.categorias.includes(categoria) || p.categorias.includes("todo") || p.categorias.includes("general");

    return ciudadOk && categoriaOk;
  }).slice(0, 4); // máximo 4 proveedores por lead
}

// ══════════════════════════════════════════════════════════
//  ALMACENAMIENTO EN MEMORIA
// ══════════════════════════════════════════════════════════
const sesiones     = {};
const cotizaciones = [];
const leads        = [];

// ── Helpers ────────────────────────────────────────────────
const folio = () => "COT-" + Date.now().toString(36).toUpperCase();
const hora  = () => new Date().toLocaleString("es-EC", {
  timeZone: "America/Guayaquil", dateStyle: "short", timeStyle: "short"
});
const cap = s => s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// ── Estados ────────────────────────────────────────────────
const E = {
  PRODUCTO : "PRODUCTO",
  CANTIDAD : "CANTIDAD",
  CIUDAD   : "CIUDAD",
  FECHA    : "FECHA",
  EMPRESA  : "EMPRESA",
  CONTACTO : "CONTACTO",
  CONFIRMAR: "CONFIRMAR",
  LISTO    : "LISTO",
};

// ══════════════════════════════════════════════════════════
//  WEBHOOK — Verificación Meta (GET)
// ══════════════════════════════════════════════════════════
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  console.log(`🔍 Webhook verify: mode=${mode} token=${token}`);
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ══════════════════════════════════════════════════════════
//  WEBHOOK — Mensajes entrantes (POST)
// ══════════════════════════════════════════════════════════
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

    if (tipo === "text") {
      texto = msg.text.body.trim();
    } else if (tipo === "interactive") {
      texto = msg.interactive?.button_reply?.id ||
              msg.interactive?.list_reply?.id   || "";
    } else {
      return enviarTexto(tel, "Solo proceso texto. Escribe *Hola* para iniciar. 😊");
    }

    if (!texto) return;
    if (!sesiones[tel]) sesiones[tel] = { estado: E.PRODUCTO, datos: {} };
    console.log(`📩 [${tel}] ${sesiones[tel].estado} → "${texto.slice(0,60)}"`);
    await flujo(tel, texto);
  } catch (err) {
    console.error("❌ Error webhook:", err.message);
  }
});

// ══════════════════════════════════════════════════════════
//  FLUJO DE CONVERSACIÓN
// ══════════════════════════════════════════════════════════
async function flujo(tel, texto) {
  const ses = sesiones[tel];
  const t   = texto.toLowerCase().trim();

  // Comandos de reinicio global
  const reinicio = ["hola","hi","inicio","start","menu","reiniciar","cotizar","nueva","0",
                    "buenos días","buenas","buenas tardes","buenas noches"];
  if (reinicio.includes(t)) {
    sesiones[tel] = { estado: E.PRODUCTO, datos: {} };
    return bienvenida(tel);
  }

  // Botones especiales
  if (t === "como_funciona") return comoFunciona(tel);
  if (t === "mis_cots")      return misCotizaciones(tel);
  if (t === "nueva_cot")     { sesiones[tel] = { estado: E.PRODUCTO, datos: {} }; return bienvenida(tel); }

  // Respuesta de proveedor a lead
  if (t.startsWith("lead_si_") || t.startsWith("lead_no_")) {
    return respuestaProveedor(tel, texto);
  }

  switch (ses.estado) {

    case E.PRODUCTO:
      if (texto.length < 3) return enviarTexto(tel, "✏️ Por favor describe el producto con más detalle.");
      ses.datos.producto = cap(texto);
      ses.estado = E.CANTIDAD;
      return enviarTexto(tel,
        `📦 *${ses.datos.producto}* — anotado.\n\n` +
        `¿Qué *cantidad* necesitas?\n` +
        `_Ej: 100 unidades · 5 toneladas · 1 servicio mensual_`
      );

    case E.CANTIDAD:
      ses.datos.cantidad = texto;
      ses.estado = E.CIUDAD;
      return elegirCiudad(tel);

    case E.CIUDAD:
      ses.datos.ciudad = texto.replace("CIUDAD_", "");
      ses.estado = E.FECHA;
      return elegirFecha(tel);

    case E.FECHA:
      ses.datos.fecha = texto;
      ses.estado = E.EMPRESA;
      return enviarTexto(tel, `🏢 ¿Cuál es el *nombre de tu empresa*?`);

    case E.EMPRESA:
      if (texto.length < 2) return enviarTexto(tel, "Por favor escribe el nombre de tu empresa.");
      ses.datos.empresa = cap(texto);
      ses.estado = E.CONTACTO;
      return enviarTexto(tel, `👤 ¿Tu *nombre* y *cargo*?\n_Ej: María González, Jefa de Compras_`);

    case E.CONTACTO:
      if (texto.length < 3) return enviarTexto(tel, "Por favor escribe tu nombre y cargo.");
      ses.datos.contacto = cap(texto);
      ses.estado = E.CONFIRMAR;
      return mostrarResumen(tel, ses.datos);

    case E.CONFIRMAR:
      if (["si_enviar","si","sí","confirmar","yes","1"].includes(t)) {
        return finalizar(tel, ses);
      }
      if (["no_cancelar","no","cancelar","0"].includes(t)) {
        sesiones[tel] = { estado: E.PRODUCTO, datos: {} };
        return enviarTexto(tel, "❌ Cancelado.\n\nEscribe *Hola* para empezar de nuevo. 😊");
      }
      return confirmarBotones(tel, "Por favor confirma: ¿envío tu solicitud a los proveedores?");

    case E.LISTO:
      return enviarBotones(tel, {
        body   : "✅ Tu cotización ya fue enviada.\n\n¿Necesitas cotizar algo más?",
        botones: [{ id: "nueva_cot", titulo: "🔄 Nueva cotización" }]
      });

    default:
      sesiones[tel] = { estado: E.PRODUCTO, datos: {} };
      return bienvenida(tel);
  }
}

// ══════════════════════════════════════════════════════════
//  FINALIZAR — Guardar y notificar proveedores
// ══════════════════════════════════════════════════════════
async function finalizar(tel, ses) {
  const d   = ses.datos;
  const num = folio();
  const ts  = hora();

  cotizaciones.push({ folio: num, ...d, telefono: tel, creado: ts });
  sesiones[tel] = { estado: E.LISTO, datos: {} };

  // 1 — Confirmar al comprador
  await enviarBotones(tel, {
    header : "✅ ¡Solicitud Enviada!",
    body   :
      `Tu folio: *${num}*\n\n` +
      `Notificando a proveedores verificados en *${d.ciudad}*.\n\n` +
      `Te contactarán directamente por WhatsApp.\n\n` +
      `⏱️ *Tiempo estimado:* 30 min a 2 horas hábiles`,
    footer : "ServicioNacionaldeCotizaciones.com 🇪🇨",
    botones: [{ id: "nueva_cot", titulo: "🔄 Nueva cotización" }]
  });

  // 2 — Buscar y notificar proveedores
  const provs = buscarProveedores(d.producto, d.ciudad);
  console.log(`🔔 Notificando ${provs.length} proveedores para: ${d.producto} en ${d.ciudad}`);

  for (const prov of provs) {
    if (!prov.telefono) continue;
    await new Promise(r => setTimeout(r, 800)); // pausa entre mensajes

    if (prov.esAdmin) {
      // Notificación completa al admin
      await enviarTexto(prov.telefono,
        `🔔 *NUEVO LEAD — ${num}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🛒 *Producto:* ${d.producto}\n` +
        `📦 *Cantidad:* ${d.cantidad}\n` +
        `📍 *Ciudad:* ${d.ciudad}\n` +
        `📅 *Fecha:* ${d.fecha}\n` +
        `🏢 *Empresa:* ${d.empresa}\n` +
        `👤 *Contacto:* ${d.contacto}\n` +
        `📞 *Tel:* +${tel}\n` +
        `🕐 *Hora:* ${ts}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `wa.me/${tel}`
      );
    } else {
      // Notificación al proveedor — sin teléfono del cliente aún
      const leadId = `${num}__${tel}`;
      leads.push({ folio: num, proveedor: prov.id, nombre: prov.nombre, estado: "enviado", ts });

      await enviarBotones(prov.telefono, {
        header : "🔔 Nueva Solicitud de Cotización",
        body   :
          `Hola *${prov.contacto}* 👋\n\n` +
          `Nueva solicitud en *ServicioNacionaldeCotizaciones.com*\n\n` +
          `📋 Folio: *${num}*\n` +
          `🛒 Producto: *${d.producto}*\n` +
          `📦 Cantidad: *${d.cantidad}*\n` +
          `📍 Ciudad: *${d.ciudad}*\n` +
          `📅 Fecha: *${d.fecha}*\n` +
          `🏢 Empresa: *${d.empresa}*\n\n` +
          `¿Te interesa recibir el contacto del cliente?`,
        footer : "ServicioNacionaldeCotizaciones.com 🇪🇨",
        botones: [
          { id: `lead_si_${leadId}`, titulo: "✅ Sí, me interesa" },
          { id: `lead_no_${num}`,    titulo: "❌ No me interesa"  },
        ]
      });
    }
  }

  // Sin proveedores activos
  if (provs.filter(p => !p.esAdmin).length === 0) {
    console.log(`⚠️ Sin proveedores activos para: ${d.producto} en ${d.ciudad}`);
  }
}

// ══════════════════════════════════════════════════════════
//  RESPUESTA DEL PROVEEDOR AL LEAD
// ══════════════════════════════════════════════════════════
async function respuestaProveedor(tel, texto) {
  const t = texto.toLowerCase();

  if (t.startsWith("lead_si_")) {
    // Extraer folio y teléfono del cliente
    const partes  = texto.replace("lead_si_", "").split("__");
    const folioL  = partes[0];
    const telCliente = partes[1];

    // Actualizar estado del lead
    const lead = leads.find(l => l.folio === folioL && l.estado === "enviado");
    if (lead) lead.estado = "aceptado";

    // Buscar datos de la cotización
    const cot = cotizaciones.find(c => c.folio === folioL);

    await enviarTexto(tel,
      `✅ *¡Aquí está el contacto del cliente!*\n\n` +
      `🏢 *Empresa:* ${cot?.empresa || "Ver folio"}\n` +
      `👤 *Contacto:* ${cot?.contacto || "Ver folio"}\n` +
      `📞 *WhatsApp:* https://wa.me/${telCliente}\n\n` +
      `💡 Responde rápido — compites con otros proveedores.\n\n` +
      `¡Mucho éxito! 🚀\n` +
      `_ServicioNacionaldeCotizaciones.com_ 🇪🇨`
    );

    // Notificar admin del lead aceptado
    if (ADMIN_WA) {
      await enviarTexto(ADMIN_WA,
        `💰 *LEAD ACEPTADO — ${folioL}*\n` +
        `Proveedor: +${tel}\n` +
        `Cliente: ${cot?.empresa || folioL}\n` +
        `Producto: ${cot?.producto || ""}`
      );
    }
    return;
  }

  if (t.startsWith("lead_no_")) {
    const lead = leads.find(l => l.folio === texto.replace("lead_no_","") && l.estado === "enviado");
    if (lead) lead.estado = "rechazado";
    await enviarTexto(tel,
      `Entendido, no hay problema. 👍\n\n` +
      `Te seguiremos enviando solicitudes de tu categoría.\n\n` +
      `_ServicioNacionaldeCotizaciones.com_ 🇪🇨`
    );
  }
}

// ══════════════════════════════════════════════════════════
//  MENSAJES UI
// ══════════════════════════════════════════════════════════
async function bienvenida(tel) {
  return enviarBotones(tel, {
    header : "🇪🇨 Sistema Nacional de Proveedores",
    body   :
      "¡Hola! Soy *CotizaBot* 🤖\n\n" +
      "Te conecto con *proveedores verificados* en minutos.\n\n" +
      "¿Qué necesitas *cotizar hoy*?\n" +
      "_Ej: Cemento · Uniformes · Limpieza · Equipos_",
    footer : "ServicioNacionaldeCotizaciones.com",
    botones: [
      { id: "como_funciona", titulo: "❓ ¿Cómo funciona?" },
      { id: "mis_cots",      titulo: "📋 Mis cotizaciones" },
    ]
  });
}

async function comoFunciona(tel) {
  sesiones[tel] = { estado: E.PRODUCTO, datos: {} };
  return enviarTexto(tel,
    `🤖 *¿Cómo funciona CotizaBot?*\n\n` +
    `1️⃣ Me dices qué necesitas cotizar\n` +
    `2️⃣ Te hago 5 preguntas rápidas\n` +
    `3️⃣ Notifico a proveedores verificados\n` +
    `4️⃣ Ellos te contactan con sus mejores precios\n` +
    `5️⃣ Tú eliges la mejor oferta\n\n` +
    `✅ Gratis para compradores\n` +
    `✅ Proveedores verificados y confiables\n` +
    `✅ Respuesta en menos de 2 horas\n\n` +
    `Escribe el producto que necesitas 👇`
  );
}

async function misCotizaciones(tel) {
  const mias = cotizaciones.filter(c => c.telefono === tel).slice(-3).reverse();
  if (!mias.length) {
    sesiones[tel] = { estado: E.PRODUCTO, datos: {} };
    return enviarTexto(tel, "No tienes cotizaciones aún.\nEscribe *Hola* para crear una. 😊");
  }
  const lista = mias.map(c =>
    `📄 *${c.folio}*\n🛒 ${c.producto} | 📍 ${c.ciudad}\n🕐 ${c.creado}`
  ).join("\n\n");
  return enviarTexto(tel, `📋 *Tus últimas cotizaciones:*\n\n${lista}\n\nEscribe *Hola* para una nueva.`);
}

async function elegirCiudad(tel) {
  return enviarLista(tel, {
    body     : "🏙️ ¿En qué ciudad necesitas el producto?",
    footer   : "Selecciona tu ciudad",
    boton    : "Ver ciudades",
    secciones: [
      {
        titulo: "Sierra",
        filas : [
          { id: "CIUDAD_Quito",    titulo: "📍 Quito"    },
          { id: "CIUDAD_Cuenca",   titulo: "📍 Cuenca"   },
          { id: "CIUDAD_Ambato",   titulo: "📍 Ambato"   },
          { id: "CIUDAD_Ibarra",   titulo: "📍 Ibarra"   },
          { id: "CIUDAD_Riobamba", titulo: "📍 Riobamba" },
          { id: "CIUDAD_Loja",     titulo: "📍 Loja"     },
        ]
      },
      {
        titulo: "Costa",
        filas : [
          { id: "CIUDAD_Guayaquil",  titulo: "📍 Guayaquil"  },
          { id: "CIUDAD_Manta",      titulo: "📍 Manta"      },
          { id: "CIUDAD_Portoviejo", titulo: "📍 Portoviejo" },
          { id: "CIUDAD_Esmeraldas", titulo: "📍 Esmeraldas" },
        ]
      },
      {
        titulo: "Nacional",
        filas : [
          { id: "CIUDAD_Nacional", titulo: "🇪🇨 Todo Ecuador" },
        ]
      }
    ]
  });
}

async function elegirFecha(tel) {
  return enviarBotones(tel, {
    body   : "📅 ¿Para cuándo lo necesitas?\n_O escribe una fecha específica_",
    botones: [
      { id: "Esta semana",    titulo: "⚡ Esta semana"    },
      { id: "Este mes",       titulo: "📅 Este mes"       },
      { id: "Sin fecha fija", titulo: "🔄 Sin fecha fija" },
    ]
  });
}

async function mostrarResumen(tel, d) {
  return confirmarBotones(tel,
    `📋 *RESUMEN DE TU SOLICITUD*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🛒 *Producto:* ${d.producto}\n` +
    `📦 *Cantidad:* ${d.cantidad}\n` +
    `📍 *Ciudad:* ${d.ciudad}\n` +
    `📅 *Fecha:* ${d.fecha}\n` +
    `🏢 *Empresa:* ${d.empresa}\n` +
    `👤 *Contacto:* ${d.contacto}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `¿Envío esta solicitud a los proveedores?`
  );
}

async function confirmarBotones(tel, msg) {
  return enviarBotones(tel, {
    body   : msg,
    botones: [
      { id: "SI_ENVIAR",   titulo: "✅ Sí, enviar" },
      { id: "NO_CANCELAR", titulo: "❌ Cancelar"   },
    ]
  });
}

// ══════════════════════════════════════════════════════════
//  API WHATSAPP
// ══════════════════════════════════════════════════════════
async function enviarTexto(tel, body) {
  return apiWA({ messaging_product: "whatsapp", to: tel, type: "text", text: { body } });
}

async function enviarBotones(tel, { header, body, footer, botones }) {
  return apiWA({
    messaging_product: "whatsapp",
    to  : tel,
    type: "interactive",
    interactive: {
      type: "button",
      ...(header ? { header: { type: "text", text: header } } : {}),
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: botones.map(b => ({
          type : "reply",
          reply: { id: b.id.slice(0, 256), title: b.titulo.slice(0, 20) }
        }))
      }
    }
  });
}

async function enviarLista(tel, { body, footer, boton, secciones }) {
  return apiWA({
    messaging_product: "whatsapp",
    to  : tel,
    type: "interactive",
    interactive: {
      type  : "list",
      body  : { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        button  : boton,
        sections: secciones.map(s => ({
          title: s.titulo,
          rows : s.filas.map(f => ({
            id   : f.id.slice(0, 256),
            title: f.titulo.slice(0, 24)
          }))
        }))
      }
    }
  });
}

async function apiWA(payload) {
  if (!WA_TOKEN || !PHONE_ID) {
    console.log("⚙️  [DEMO]", JSON.stringify(payload).slice(0, 100));
    return;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`,
      payload,
      {
        headers: {
          Authorization : `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );
  } catch (err) {
    const e = err.response?.data?.error;
    console.error("❌ API WA:", e?.message || err.message);
    if (e?.code === 190) console.error("🔑 Token expirado — renuévalo en Meta Developer");
  }
}

// ══════════════════════════════════════════════════════════
//  PANEL ADMIN
// ══════════════════════════════════════════════════════════
app.get("/admin", (req, res) => {
  if (req.query.key !== VERIFY_TOKEN) return res.status(401).send("No autorizado");

  const filasCots = cotizaciones.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Sin cotizaciones aún</td></tr>`
    : [...cotizaciones].reverse().map((c, i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
        <td><b style="color:#16a34a">${c.folio}</b></td>
        <td>${c.producto}</td>
        <td>${c.ciudad}</td>
        <td>${c.empresa}</td>
        <td>${c.contacto}</td>
        <td><small style="color:#888">${c.creado}</small></td>
      </tr>`).join("");

  const filasLeads = leads.length === 0
    ? `<tr><td colspan="4" style="text-align:center;padding:20px;color:#888">Sin leads aún</td></tr>`
    : [...leads].reverse().map(l => `
      <tr>
        <td><b style="color:#16a34a">${l.folio}</b></td>
        <td>${l.nombre}</td>
        <td><span style="background:${l.estado==="aceptado"?"#dcfce7":l.estado==="rechazado"?"#fee2e2":"#fef9c3"};color:${l.estado==="aceptado"?"#16a34a":l.estado==="rechazado"?"#dc2626":"#854d0e"};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${l.estado.toUpperCase()}</span></td>
        <td><small style="color:#888">${l.ts}</small></td>
      </tr>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CotizaBot Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f3f4f6;padding:20px;color:#1c1e21}
.top{background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;padding:20px;border-radius:12px;margin-bottom:16px}
.top h1{font-size:18px;margin-bottom:2px}.top p{font-size:12px;opacity:.85}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px}
.stat{background:#fff;border-radius:10px;padding:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat .n{font-size:24px;font-weight:700;color:#25D366}.stat .l{font-size:11px;color:#888;margin-top:2px}
h2{font-size:14px;font-weight:600;margin:16px 0 8px;color:#444}
.card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{background:#f9fafb;padding:8px 12px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;border-bottom:1px solid #eee}
td{padding:8px 12px;font-size:12px;border-bottom:1px solid #f3f4f6}
.btn{display:inline-block;background:#25D366;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;text-decoration:none;margin-bottom:12px}
</style>
</head>
<body>
<div class="top">
  <h1>🤖 CotizaBot v5 — Panel Admin</h1>
  <p>Sistema Nacional de Proveedores Ecuador · ServicioNacionaldeCotizaciones.com</p>
</div>
<div class="stats">
  <div class="stat"><div class="n">${cotizaciones.length}</div><div class="l">Cotizaciones</div></div>
  <div class="stat"><div class="n">${leads.length}</div><div class="l">Leads enviados</div></div>
  <div class="stat"><div class="n">${leads.filter(l=>l.estado==="aceptado").length}</div><div class="l">Leads aceptados</div></div>
  <div class="stat"><div class="n">${new Set(cotizaciones.map(c=>c.ciudad)).size}</div><div class="l">Ciudades</div></div>
</div>
<a class="btn" href="?key=${VERIFY_TOKEN}">🔄 Actualizar</a>
<h2>📊 Leads enviados a proveedores</h2>
<div class="card"><table>
  <thead><tr><th>Folio</th><th>Proveedor</th><th>Estado</th><th>Hora</th></tr></thead>
  <tbody>${filasLeads}</tbody>
</table></div>
<h2>📋 Cotizaciones recibidas</h2>
<div class="card"><table>
  <thead><tr><th>Folio</th><th>Producto</th><th>Ciudad</th><th>Empresa</th><th>Contacto</th><th>Fecha</th></tr></thead>
  <tbody>${filasCots}</tbody>
</table></div>
</body></html>`);
});

// Health check
app.get("/", (req, res) => res.json({
  status          : "✅ CotizaBot activo",
  version         : "5.0",
  servicio        : "Cotiza.Chat — Sistema Nacional de Proveedores Ecuador 🇪🇨",
  cotizaciones    : cotizaciones.length,
  leads_enviados  : leads.length,
  leads_aceptados : leads.filter(l => l.estado === "aceptado").length,
  uptime_min      : Math.floor(process.uptime() / 60),
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 CotizaBot v5 corriendo en puerto ${PORT}`);
  console.log(`🇪🇨  ServicioNacionaldeCotizaciones.com`);
  console.log(`📊  Admin: http://localhost:${PORT}/admin?key=${VERIFY_TOKEN}`);
  console.log(`⚙️   Modo: ${WA_TOKEN ? "PRODUCCIÓN ✅" : "DEMO"}\n`);
});
