/* Abre el portal de Stripe donde el socio cambia la tarjeta, ve sus
   recibos o cancela la suscripción. */
const { stripe, firebase, usuarioDe, urlBase, leeCuerpo, conErrores, json, Aviso } = require('../lib/comun');

exports.handler = conErrores(async (event) => {
  leeCuerpo(event);
  const usuario = await usuarioDe(event);
  if (!usuario) throw new Aviso('Entra en tu cuenta para gestionar tu suscripción.', 401);

  const snap = await firebase().db.collection('users').doc(usuario.uid).get();
  const cliente = snap.exists ? snap.data().stripeCustomerId : null;
  if (!cliente) throw new Aviso('No encontramos ninguna suscripción en tu cuenta.', 404);

  const sesion = await stripe().billingPortal.sessions.create({
    customer: cliente,
    return_url: urlBase(event) + '/cuenta.html'
  });
  return json(200, { url: sesion.url });
});
