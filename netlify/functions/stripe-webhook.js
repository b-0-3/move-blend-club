/* Stripe llama a esta función cuando pasa algo con un pago.
   Es el ÚNICO sitio donde:
     · se guarda un pedido de la tienda (colección "orders")
     · alguien pasa a ser socio o deja de serlo (campo "plan" del usuario)
   Antes de hacer nada se comprueba la firma: así sabemos que el aviso
   viene de Stripe de verdad y no de alguien haciéndose pasar por él. */
const { stripe, firebase, json } = require('../lib/comun');

const ACTIVOS = ['active', 'trialing', 'past_due']; // past_due: el cobro falló y Stripe lo está reintentando

async function guardarPedido(sesion) {
  const { db, FieldValue } = firebase();
  const lineas = await stripe().checkout.sessions.listLineItems(sesion.id, { limit: 100, expand: ['data.price.product'] });
  const items = lineas.data.map((l) => {
    const prod = l.price && l.price.product && typeof l.price.product === 'object' ? l.price.product : {};
    const meta = prod.metadata || {};
    return { nombre: l.description || prod.name || 'Producto', cantidad: l.quantity || 1, importe: (l.amount_total || 0) / 100, productoId: meta.id || '', talla: meta.talla || '' };
  });
  const cliente = sesion.customer_details || {};
  const envio = (sesion.collected_information && sesion.collected_information.shipping_details) || sesion.shipping_details || {};
  const dir = envio.address || cliente.address || {};
  // El id del pedido es el de la sesión de Stripe: si Stripe repite el aviso, no se duplica.
  await db.collection('orders').doc(sesion.id).set({
    uid: (sesion.metadata && sesion.metadata.uid) || sesion.client_reference_id || null,
    email: cliente.email || sesion.customer_email || '',
    telefono: cliente.phone || '',
    nombre: envio.name || cliente.name || '',
    direccion: { linea1: dir.line1 || '', linea2: dir.line2 || '', cp: dir.postal_code || '', ciudad: dir.city || '', provincia: dir.state || '', pais: dir.country || '' },
    items,
    total: (sesion.amount_total || 0) / 100,
    envio: ((sesion.total_details && sesion.total_details.amount_shipping) || 0) / 100,
    pagoId: typeof sesion.payment_intent === 'string' ? sesion.payment_intent : '',
    pruebas: sesion.livemode === false,
    estado: 'pagado',
    createdAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function ponerPlan(uid, datos) {
  if (!uid) { console.warn('Aviso de suscripción sin usuario:', JSON.stringify(datos)); return; }
  await firebase().db.collection('users').doc(uid).set(datos, { merge: true });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) { console.error('Falta STRIPE_WEBHOOK_SECRET'); return json(503, { error: 'Webhook sin configurar.' }); }

  let aviso;
  try {
    const crudo = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : event.body || '';
    const firma = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    aviso = stripe().webhooks.constructEvent(crudo, firma, secreto);
  } catch (e) {
    console.warn('Firma de webhook no válida:', e.message);
    return json(400, { error: 'Firma no válida.' });
  }

  try {
    const obj = aviso.data.object;
    switch (aviso.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (obj.mode === 'payment' && obj.payment_status === 'paid') await guardarPedido(obj);
        if (obj.mode === 'subscription') {
          await ponerPlan((obj.metadata && obj.metadata.uid) || obj.client_reference_id, {
            plan: 'socio',
            stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : '',
            subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : '',
            subscriptionStatus: 'active',
            cancelaAlFinal: false
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const activo = aviso.type !== 'customer.subscription.deleted' && ACTIVOS.includes(obj.status);
        const uid = obj.metadata && obj.metadata.uid;
        if (!activo && uid) {
          // Si el aviso es de una suscripción antigua y el usuario ya tiene otra en marcha, no lo bajamos de plan.
          const ficha = await firebase().db.collection('users').doc(uid).get();
          const actual = ficha.exists ? ficha.data().subscriptionId : '';
          if (actual && actual !== obj.id) break;
        }
        await ponerPlan(obj.metadata && obj.metadata.uid, {
          plan: activo ? 'socio' : 'miembro',
          stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : '',
          subscriptionId: activo ? obj.id : '',
          subscriptionStatus: aviso.type === 'customer.subscription.deleted' ? 'canceled' : obj.status,
          cancelaAlFinal: !!obj.cancel_at_period_end && activo
        });
        break;
      }
      default: break; // el resto de avisos no nos interesan
    }
  } catch (e) {
    console.error('Error procesando', aviso.type, e);
    return json(500, { error: 'Error interno.' }); // Stripe lo reintentará más tarde
  }
  return json(200, { recibido: true });
};
