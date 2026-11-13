/* Portada: vídeos de las dos mitades, próximos eventos y precios. */
(function () {
  'use strict';
  const { $, $$ } = MB;

  /* Vídeos: en móvil (mitades tumbadas) usamos el clip horizontal;
     en pantalla grande, el vertical. Si el visitante pide menos
     movimiento, se queda la foto fija. */
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grande = window.matchMedia('(min-width: 760px)');
  function ponVideos() {
    $$('.mitad video').forEach((v) => {
      const base = grande.matches ? v.dataset.v : v.dataset.h;
      v.poster = base + '.jpg';
      if (quieto) return;
      if (v.dataset.puesto === base) return;
      v.dataset.puesto = base;
      v.src = base + '.mp4';
      v.play().catch(() => {});
    });
  }
  ponVideos();
  grande.addEventListener('change', ponVideos);

  MB.cargar().then((d) => {
    // Precios
    $$('[data-tarifa="socioMes"]').forEach((el) => (el.textContent = MB.euros(d.tarifas.socioMes)));
    $$('[data-tarifa="descuentoSocio"]').forEach((el) => (el.textContent = d.tarifas.descuentoSocio));

    // Tres próximos eventos
    const prox = d.eventos.filter((e) => !MB.fecha(e.fecha).pasado && e.estado !== 'cancelado').slice(0, 3);
    $('#proximos').innerHTML = prox.length
      ? prox.map((e) => MB.pintaEvento(e, '<a class="boton boton-linea boton-mini" href="club.html#eventos">Ver y apuntarme</a>')).join('')
      : '<li class="vacio">Estamos preparando las próximas fechas. Crea tu cuenta y te avisamos.</li>';
  });

  MB.alUsuario((u) => {
    const cta = $('#ctaPrincipal');
    if (u) { cta.textContent = 'Ver próximos eventos'; cta.href = 'club.html#eventos'; }
    else { cta.textContent = 'Crear cuenta gratis'; cta.href = 'cuenta.html'; }
    const socio = $('#ctaSocio');
    if (u && u.plan === 'socio') { socio.textContent = 'Ya eres socio: ver mi cuenta'; socio.href = 'cuenta.html'; }
  });
})();
