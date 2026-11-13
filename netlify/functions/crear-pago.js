/* Prepara el pago de la cesta en Stripe y devuelve la dirección a la
   que hay que mandar al comprador.
   Los precios se leen SIEMPRE aquí, en el servidor: lo que diga el
   navegador sobre precios se ignora, así nadie puede cambiarlos. */
const { stripe, stripeEnPruebas, firebase, usuarioDe, urlBase, leeCuerpo, conErrores, catalogo, json, tarifas, Aviso } = require('../lib/comun');

exports.handler = conErrores(async (event) => {
  const { items } = leeCuerpo(event);
  const pasarela = stripe(); // si faltan las claves, avisa aquí y no sigue
  if (!Array.isArray(items) || !items.length || items.length > 30) throw new Aviso('Tu cesta está vacía.');

  const usuario = await usuarioDe(event); // puede comprar sin cuenta
  let socio = false;
  if (usuario) {
    const ficha = await firebase().db.collection('users').doc(usuario.uid).get();
    socio = ficha.exists && ficha.data().plan === 'socio';
  }

  const productos = await catalogo();
  const lineas = items.map((it) => {
    const p = productos.find((x) => x.id === String(it.id));
    const qty = Math.floor(Number(it.qty));
    if (!p || p.activo === false) throw new Aviso('Uno de los productos de tu cesta ya no está disponible. Vacía la cesta y vuelve a añadirlo.');
    if (p.agotado) throw new Aviso(`"${p.nombre}" se ha agotado. Quítalo de la cesta para seguir.`);
    if (p.ejemplo && !stripeEnPruebas()) throw new Aviso(`"${p.nombre}" es un producto de ejemplo y no se puede vender. Edítalo en el panel de admin.`);
    if (!(qty >= 1 && qty <= 20)) throw new Aviso('La cantidad de algún producto no es válida.');
    const tallas = Array.isArray(p.tallas) ? p.tallas.filter(Boolean) : [];
    const talla = String(it.talla || '');
    if (tallas.length && !tallas.includes(talla)) throw new Aviso(`Elige una talla para "${p.nombre}".`);
    const centimos = Math.round(Number(p.precio) * 100);
    if (!(centimos > 0)) throw new Aviso(`"${p.nombre}" no tiene un precio válido.`);
    const conDescuento = socio ? Math.round((centimos * (100 - tarifas.descuentoSocio)) / 100) : centimos;
    return {
      quantity: qty,
      price_data: {
        currency: 'eur',
        unit_amount: conDescuento,
        product_data: {
          name: p.nombre + (tallas.length ? ` (talla ${talla})` : ''),
          metadata: { id: p.id, talla: tallas.length ? talla : '' }
        }
      }
    };
  });

  const base = urlBase(event);
  const sesion = await pasarela.checkout.sessions.create({
    mode: 'payment',
    locale: 'es',
    line_items: lineas,
    shipping_address_collection: { allowed_countries: ['ES'] },
    shipping_options: [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: 'Envío a España',
        fixed_amount: { amount: Math.round(tarifas.envio * 100), currency: 'eur' }
      }
    }],
    phone_number_collection: { enabled: true },
    customer_email: usuario && usuario.email ? usuario.email : undefined,
    client_reference_id: usuario ? usuario.uid : undefined,
    metadata: { tipo: 'pedido', uid: usuario ? usuario.uid : '', socio: socio ? 'si' : 'no' },
    success_url: base + '/gracias.html?tipo=pedido',
    cancel_url: base + '/tienda.html#cesta'
  });

  return json(200, { url: sesion.url });
});
