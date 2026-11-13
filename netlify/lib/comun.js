/* Piezas comunes de las funciones del servidor (pagos con Stripe).
   Las claves NO están aquí: se leen de las variables de entorno de Netlify
     STRIPE_SECRET_KEY          clave secreta de Stripe (sk_test_... o sk_live_...)
     STRIPE_WEBHOOK_SECRET      secreto del webhook de Stripe (whsec_...)
     FIREBASE_SERVICE_ACCOUNT   el archivo JSON de la cuenta de servicio de Firebase, entero
*/
const Stripe = require('stripe');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const contenido = require('../../public/data/contenido.json');

const tarifas = contenido.tarifas;

class Aviso extends Error {
  constructor(mensaje, estado) { super(mensaje); this.estado = estado || 400; }
}

function json(estado, cuerpo) {
  return { statusCode: estado, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(cuerpo) };
}

let _stripe = null;
function stripe() {
  if (_stripe) return _stripe;
  const clave = process.env.STRIPE_SECRET_KEY;
  if (!clave) throw new Aviso('Los pagos todavía no están activados en esta web.', 503);
  _stripe = new Stripe(clave);
  return _stripe;
}
const stripeEnPruebas = () => String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');

function firebase() {
  if (!getApps().length) {
    let crudo = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!crudo) throw new Aviso('Falta configurar Firebase en el servidor.', 503);
    crudo = crudo.trim();
    if (!crudo.startsWith('{')) crudo = Buffer.from(crudo, 'base64').toString('utf8'); // también vale pegado en base64
    let cuenta;
    try { cuenta = JSON.parse(crudo); } catch (e) { throw new Aviso('La clave de Firebase del servidor no es válida.', 503); }
    if (cuenta.private_key) cuenta.private_key = cuenta.private_key.replace(/\\n/g, '\n');
    initializeApp({ credential: cert(cuenta) });
  }
  return { db: getFirestore(), auth: getAuth(), FieldValue };
}

/* Devuelve el usuario que llama (o null si no ha iniciado sesión). */
async function usuarioDe(event) {
  const cab = event.headers || {};
  const aut = cab.authorization || cab.Authorization || '';
  const m = /^Bearer (.+)$/.exec(aut);
  if (!m) return null;
  try {
    const t = await firebase().auth.verifyIdToken(m[1]);
    return { uid: t.uid, email: t.email || '' };
  } catch (e) {
    throw new Aviso('Tu sesión ha caducado. Vuelve a entrar en tu cuenta.', 401);
  }
}

function urlBase(event) {
  const u = process.env.URL || (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  return String(u).replace(/\/$/, '');
}

function leeCuerpo(event) {
  if (event.httpMethod !== 'POST') throw new Aviso('Método no permitido.', 405);
  try {
    const texto = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '{}';
    return JSON.parse(texto || '{}');
  } catch (e) { throw new Aviso('Petición no válida.', 400); }
}

/* Envuelve una función: los Aviso llegan al visitante con su mensaje;
   cualquier otro fallo se apunta en el registro y se devuelve uno genérico. */
function conErrores(fn) {
  return async (event, context) => {
    try { return await fn(event, context); }
    catch (e) {
      if (e instanceof Aviso) return json(e.estado, { error: e.message });
      console.error(e);
      return json(500, { error: 'Algo ha fallado al preparar el pago. Inténtalo otra vez en un momento.' });
    }
  };
}

/* Catálogo de productos: el del panel de admin si ya se cargó contenido,
   y si no, el de public/data/contenido.json. */
async function catalogo() {
  const { db } = firebase();
  const aj = await db.collection('ajustes').doc('sitio').get();
  if (!aj.exists) return contenido.productos;
  const q = await db.collection('products').get();
  return q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

module.exports = { stripe, stripeEnPruebas, firebase, usuarioDe, urlBase, leeCuerpo, conErrores, catalogo, json, tarifas, Aviso };
