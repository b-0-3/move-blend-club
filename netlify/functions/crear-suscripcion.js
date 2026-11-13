/* Abre el pago de la cuota de Socio (suscripción mensual) en Stripe.
   Hace falta haber iniciado sesión. El plan NO cambia aquí: lo cambia
   el webhook cuando Stripe confirma que el cobro ha salido bien. */
const { stripe, firebase, usuarioDe, urlBase, leeCuerpo, conErrores, json, tarifas, Aviso } = require('../lib/comun');

exports.handler = conErrores(async (event) => {
  leeCuerpo(event);
  const usuario = await usuarioDe(event);
  if (!usuario) throw new Aviso('Entra en tu cuenta para hacerte socio.', 401);

  const { db } = firebase();
  const snap = await db.collection('users').doc(usuario.uid).get();
  const ficha = snap.exists ? snap.data() : {};
  if (ficha.plan === 'socio' && ficha.subscriptionId) throw new Aviso('Ya eres socio. Puedes gestionar tu suscripción desde tu cuenta.', 409);

  const base = urlBase(event);
  const datos = {
    mode: 'subscription',
    locale: 'es',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(tarifas.socioMes * 100),
        recurring: { interval: 'month' },
        product_data: { name: 'Socio Move Blend Club', description: 'Cuota mensual. Sin permanencia.' }
      }
    }],
    client_reference_id: usuario.uid,
    metadata: { tipo: 'socio', uid: usuario.uid },
    subscription_data: { metadata: { uid: usuario.uid } },
    success_url: base + '/gracias.html?tipo=socio',
    cancel_url: base + '/cuenta.html'
  };
  // Si ya fue cliente antes, reutilizamos su ficha de Stripe.
  if (ficha.stripeCustomerId) datos.customer = ficha.stripeCustomerId;
  else if (usuario.email) datos.customer_email = usuario.email;

  const sesion = await stripe().checkout.sessions.create(datos);
  return json(200, { url: sesion.url });
});
