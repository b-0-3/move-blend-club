/* Tienda: productos, cesta y salto al pago con Stripe. */
(function () {
  'use strict';
  const { $, $$, esc, euros } = MB;
  let datos = null;

  const esSocio = () => !!(MB.usuario && MB.usuario.plan === 'socio');
  const precioDe = (p) => {
    const base = Number(p.precio) || 0;
    return esSocio() ? Math.round(base * (100 - datos.tarifas.descuentoSocio)) / 100 : base;
  };

  /* ── Productos ────────────────────────────────────────── */
  function pintaProductos() {
    if (!datos) return;
    const lista = datos.productos;
    $('#notaSocio').hidden = false;
    if (esSocio()) $('#notaSocio').textContent = `Eres socio: ya tienes aplicado tu ${datos.tarifas.descuentoSocio} % de descuento.`;
    if (!lista.length) { $('#productos').innerHTML = '<li class="vacio">La nueva colección está en camino. Vuelve pronto.</li>'; return; }
    $('#productos').innerHTML = lista.map((p) => {
      const tallas = Array.isArray(p.tallas) ? p.tallas.filter(Boolean) : [];
      const img = MB.urlSegura(p.img) || 'img/mb.webp';
      const base = Number(p.precio) || 0, final = precioDe(p);
      return `<li class="producto" data-id="${esc(p.id)}">
        <div class="producto-foto">
          <img src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy" width="720" height="960">
          ${p.agotado ? '<span class="pegatina">Agotado</span>' : p.ejemplo ? '<span class="pegatina pegatina-ej">Ejemplo</span>' : ''}
        </div>
        <h2 class="producto-nombre">${esc(p.nombre)}</h2>
        ${p.descripcion ? `<p class="producto-desc">${esc(p.descripcion)}</p>` : ''}
        ${tallas.length ? `<fieldset class="tallas"><legend class="nota" style="margin-bottom:.3rem">Talla</legend>${tallas.map((t) => `<label><input type="radio" name="talla-${esc(p.id)}" value="${esc(t)}"><span>${esc(t)}</span></label>`).join('')}</fieldset>` : ''}
        <p class="producto-precio cifra">${euros(final)}${final < base ? `<s>${euros(base)}</s>` : ''}</p>
        <button class="boton boton-mini" data-anadir="${esc(p.id)}"${p.agotado ? ' disabled' : ''}>${p.agotado ? 'Agotado' : 'Añadir a la cesta'}</button>
      </li>`;
    }).join('');
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-anadir]');
    if (!b) return;
    const p = datos.productos.find((x) => x.id === b.dataset.anadir);
    if (!p || p.agotado) return;
    const tallas = Array.isArray(p.tallas) ? p.tallas.filter(Boolean) : [];
    let talla = '';
    if (tallas.length) {
      const marcada = $(`input[name="talla-${CSS.escape(p.id)}"]:checked`);
      if (!marcada) { MB.aviso('Elige primero tu talla.', true); return; }
      talla = marcada.value;
    }
    MB.cesta.anadir(p.id, talla);
    MB.aviso(`${p.nombre}${talla ? ' (talla ' + talla + ')' : ''} añadido a la cesta.`);
  });

  /* ── Cesta ────────────────────────────────────────────── */
  const cesta = $('#cesta'), velo = $('#velo');
  let antesFoco = null;

  function lineas() {
    // Cruza lo guardado con los productos actuales (precio siempre al día).
    return MB.cesta.items().map((it, i) => {
      const p = datos.productos.find((x) => x.id === it.id);
      return p && !p.agotado ? { i, p, talla: it.talla, qty: it.qty, precio: precioDe(p) } : null;
    }).filter(Boolean);
  }

  function pintaCesta() {
    if (!datos) return;
    const ls = lineas();
    const cuerpo = $('#cestaCuerpo'), pie = $('#cestaPie');
    if (!ls.length) {
      cuerpo.innerHTML = '<p class="vacio">Tu cesta está vacía. Añade algo de la colección y aparecerá aquí.</p>';
      pie.innerHTML = '';
      return;
    }
    cuerpo.innerHTML = ls.map((l) => `
      <div class="cesta-item">
        <img src="${esc(MB.urlSegura(l.p.img) || 'img/mb.webp')}" alt="">
        <b>${esc(l.p.nombre)}${l.talla ? ` <span class="nota">Talla ${esc(l.talla)}</span>` : ''}</b>
        <span class="cifra">${euros(l.precio * l.qty)}</span>
        <div class="cant">
          <button data-cant="${l.i}" data-d="-1" aria-label="Quitar una unidad de ${esc(l.p.nombre)}">−</button>
          <span aria-label="Cantidad">${l.qty}</span>
          <button data-cant="${l.i}" data-d="1" aria-label="Añadir una unidad de ${esc(l.p.nombre)}">+</button>
        </div>
      </div>`).join('');
    const sub = ls.reduce((s, l) => s + l.precio * l.qty, 0);
    const envio = Number(datos.tarifas.envio) || 0;
    pie.innerHTML = `
      <div class="fila"><span>Productos${esSocio() ? ` (con tu ${datos.tarifas.descuentoSocio} % de socio)` : ''}</span><span>${euros(sub)}</span></div>
      <div class="fila"><span>Envío a España</span><span>${euros(envio)}</span></div>
      <div class="fila fila-total"><span>Total</span><span>${euros(sub + envio)}</span></div>
      <button class="boton boton-ancho" id="btnPagar">Pagar ${euros(sub + envio)}</button>
      <p class="nota">Pagas con tarjeta en Stripe. Allí pones la dirección de envío.</p>`;
  }

  function abrir() {
    antesFoco = document.activeElement;
    pintaCesta();
    cesta.classList.add('abierto'); velo.classList.add('abierto');
    document.body.style.overflow = 'hidden';
    $('#cestaCerrar').focus();
  }
  function cerrar() {
    cesta.classList.remove('abierto'); velo.classList.remove('abierto');
    document.body.style.overflow = '';
    if (location.hash === '#cesta') history.replaceState(null, '', location.pathname + location.search);
    if (antesFoco && antesFoco.focus) antesFoco.focus();
  }
  $('#cestaCerrar').addEventListener('click', cerrar);
  velo.addEventListener('click', cerrar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cesta.classList.contains('abierto')) cerrar(); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#tiraCestaBtn')) { e.preventDefault(); abrir(); }
    const c = e.target.closest('[data-cant]');
    if (c) MB.cesta.cambiar(Number(c.dataset.cant), Number(c.dataset.d));
  });
  document.addEventListener('mb:cesta', pintaCesta);

  /* ── Pagar ────────────────────────────────────────────── */
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#btnPagar');
    if (!b) return;
    const items = lineas().map((l) => ({ id: l.p.id, talla: l.talla, qty: l.qty }));
    if (!items.length) return;
    const texto = b.textContent;
    b.disabled = true; b.textContent = 'Abriendo el pago…';
    try {
      const r = await MB.funcion('crear-pago', { items });
      location.href = r.url;
    } catch (err) {
      MB.aviso(err.message, true);
      b.disabled = false; b.textContent = texto;
    }
  });

  /* ── Arranque ─────────────────────────────────────────── */
  MB.cargar().then((d) => {
    datos = d;
    $$('[data-tarifa="descuentoSocio"]').forEach((el) => (el.textContent = d.tarifas.descuentoSocio));
    $$('[data-tarifa="envio"]').forEach((el) => (el.textContent = euros(d.tarifas.envio)));
    pintaProductos();
    if (location.hash === '#cesta') abrir();
  });
  MB.alUsuario(() => { pintaProductos(); if (cesta.classList.contains('abierto')) pintaCesta(); });
})();
