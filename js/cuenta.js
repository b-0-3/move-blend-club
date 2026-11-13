/* Cuenta: crear cuenta, entrar, recuperar contraseña, plan, datos,
   eventos y pedidos del usuario. */
(function () {
  'use strict';
  const { $, esc, euros } = MB;
  const params = new URLSearchParams(location.search);

  // Solo aceptamos volver a páginas de esta misma web.
  const volver = (() => {
    const v = params.get('volver') || '';
    return /^[a-z-]+\.html(#[\w-]+)?$/.test(v) ? v : '';
  })();

  const di = (id, texto, tipo) => { const el = $(id); el.textContent = texto || ''; el.className = 'msg' + (tipo ? ' msg-' + tipo : ''); };
  const ERRORES = {
    'auth/email-already-in-use': 'Ese email ya tiene cuenta. Prueba en "Ya tengo cuenta".',
    'auth/invalid-email': 'Ese email no parece correcto.',
    'auth/weak-password': 'La contraseña es muy corta: mínimo 6 caracteres.',
    'auth/user-not-found': 'No hay ninguna cuenta con ese email.',
    'auth/wrong-password': 'La contraseña no es correcta.',
    'auth/invalid-credential': 'El email o la contraseña no son correctos.',
    'auth/invalid-login-credentials': 'El email o la contraseña no son correctos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y prueba otra vez.',
    'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de terminar.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes y repite.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
    'auth/unauthorized-domain': 'Este dominio aún no está autorizado en Firebase (mira la guía, paso de dominios).'
  };
  const errorDe = (e) => ERRORES[e && e.code] || 'No se pudo completar. Inténtalo otra vez.';

  if (!MB.auth) {
    $('#vistaEspera').textContent = 'Las cuentas no están disponibles ahora mismo. Recarga la página en un momento.';
    return;
  }

  /* ── Pestañas crear / entrar ──────────────────────────── */
  function pestana(cual) {
    const crear = cual === 'crear';
    $('#tabCrear').setAttribute('aria-selected', crear);
    $('#tabEntrar').setAttribute('aria-selected', !crear);
    $('#panelCrear').hidden = !crear;
    $('#panelEntrar').hidden = crear;
  }
  $('#tabCrear').addEventListener('click', () => pestana('crear'));
  $('#tabEntrar').addEventListener('click', () => pestana('entrar'));

  /* ── Crear cuenta ─────────────────────────────────────── */
  $('#panelCrear').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('#rNombre').value.trim(), email = $('#rEmail').value.trim(), pass = $('#rPass').value;
    if (nombre.length < 3) return di('#rMsg', 'El nombre necesita al menos 3 letras.', 'mal');
    if (pass.length < 6) return di('#rMsg', 'La contraseña necesita al menos 6 caracteres.', 'mal');
    if (!$('#rAcepto').checked) return di('#rMsg', 'Marca la casilla de términos y privacidad para seguir.', 'mal');
    const b = e.target.querySelector('button[type=submit]');
    b.disabled = true; di('#rMsg', 'Creando tu cuenta…');
    try {
      MB.nombrePendiente = nombre; // base.js crea la ficha del usuario con este nombre
      const cred = await MB.auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: nombre }).catch(() => {});
      cred.user.sendEmailVerification().catch(() => {});
      di('#rMsg', '');
    } catch (err) { di('#rMsg', errorDe(err), 'mal'); }
    b.disabled = false;
  });

  /* ── Entrar ───────────────────────────────────────────── */
  $('#panelEntrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button[type=submit]');
    b.disabled = true; di('#lMsg', 'Entrando…');
    try { await MB.auth.signInWithEmailAndPassword($('#lEmail').value.trim(), $('#lPass').value); di('#lMsg', ''); }
    catch (err) { di('#lMsg', errorDe(err), 'mal'); }
    b.disabled = false;
  });

  $('#btnGoogle').addEventListener('click', async () => {
    try { await MB.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (err) { di($('#panelCrear').hidden ? '#lMsg' : '#rMsg', errorDe(err), 'mal'); }
  });

  $('#btnOlvido').addEventListener('click', async () => {
    const email = $('#lEmail').value.trim();
    if (!email) { di('#lMsg', 'Escribe tu email arriba y vuelve a pulsar.', 'mal'); $('#lEmail').focus(); return; }
    try { await MB.auth.sendPasswordResetEmail(email); } catch (err) { if (err.code === 'auth/invalid-email') return di('#lMsg', errorDe(err), 'mal'); }
    // Mismo mensaje exista o no la cuenta: así nadie puede averiguar quién está registrado.
    di('#lMsg', 'Si ese email tiene cuenta, te llega un correo para poner una contraseña nueva.', 'bien');
  });

  $('#btnSalir').addEventListener('click', () => MB.auth.signOut());
  $('#btnReenviar').addEventListener('click', async () => {
    try { await MB.usuario.firebase.sendEmailVerification(); MB.aviso('Correo enviado. Mira también en spam.'); }
    catch (e) { MB.aviso('Espera un minuto antes de pedirlo otra vez.', true); }
  });

  /* ── Vista con sesión ─────────────────────────────────── */
  let tarifas = { socioMes: 9.99, descuentoSocio: 10 };
  let eventos = [];
  let cargadoDe = null;
  MB.cargar().then((d) => { tarifas = d.tarifas; eventos = d.eventos; if (MB.usuario) { pintaPlan(MB.usuario); cargaListas(MB.usuario, true); } });

  function pintaPlan(u) {
    const caja = $('#cajaPlan');
    const p = u.perfil || {};
    if (u.plan === 'socio') {
      const conStripe = !!p.stripeCustomerId;
      const avisoPago = p.subscriptionStatus === 'past_due' ? '<p class="msg msg-mal">El último cobro ha fallado. Actualiza tu tarjeta para no perder el plan.</p>' : '';
      const fin = p.cancelaAlFinal ? '<p class="nota">Has cancelado: sigues siendo socio hasta que termine el mes ya pagado.</p>' : '';
      caja.innerHTML = `<h2>Tu plan</h2>
        <p><span class="pegatina pegatina-rosa">Socio MBC</span></p>
        <p class="texto">Tienes rutas exclusivas, track days y tu ${tarifas.descuentoSocio} % de descuento en la tienda ya aplicado.</p>
        ${avisoPago}${fin}
        ${conStripe ? '<div><button class="boton boton-linea boton-mini" id="btnPortal">Gestionar o cancelar la suscripción</button></div><p class="nota">Se abre la página segura de Stripe: ahí cambias la tarjeta, ves tus recibos o cancelas.</p>' : '<p class="nota">Tu plan de socio lo activó el equipo del club.</p>'}`;
    } else {
      caja.innerHTML = `<h2>Tu plan</h2>
        <p><span class="pegatina">Miembro</span></p>
        <p class="texto">Como miembro compras en la tienda y te apuntas a los eventos abiertos. Los socios tienen además rutas exclusivas, track days, kit de bienvenida y ${tarifas.descuentoSocio} % de descuento en la tienda.</p>
        <div><button class="boton" id="btnSocio">Hacerme socio por ${euros(tarifas.socioMes)} al mes</button></div>
        <p class="nota">Sin permanencia. El pago se hace con tarjeta en Stripe y lo cancelas cuando quieras desde aquí.</p>`;
    }
  }

  document.addEventListener('click', async (e) => {
    const socio = e.target.closest('#btnSocio'), portal = e.target.closest('#btnPortal');
    if (!socio && !portal) return;
    const b = socio || portal, texto = b.textContent;
    b.disabled = true; b.textContent = 'Abriendo Stripe…';
    try { const r = await MB.funcion(socio ? 'crear-suscripcion' : 'portal'); location.href = r.url; }
    catch (err) { MB.aviso(err.message, true); b.disabled = false; b.textContent = texto; }
  });

  /* ── Datos personales ─────────────────────────────────── */
  let perfilPuesto = null;
  function ponPerfil(u) {
    if (perfilPuesto === u.uid) return; // no pisar lo que esté escribiendo
    perfilPuesto = u.uid;
    $('#pNombre').value = u.nombre;
    $('#pTel').value = u.perfil.telefono || '';
    $('#pCoche').value = u.perfil.vehiculo || '';
    $('#pEmail').textContent = 'Tu email: ' + u.email;
  }
  $('#formPerfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = MB.usuario; if (!u) return;
    const username = $('#pNombre').value.trim();
    if (username.length < 3) return di('#pMsg', 'El nombre necesita al menos 3 letras.', 'mal');
    try {
      await MB.db.collection('users').doc(u.uid).set({ username, telefono: $('#pTel').value.trim(), vehiculo: $('#pCoche').value }, { merge: true });
      await u.firebase.updateProfile({ displayName: username });
      di('#pMsg', 'Cambios guardados.', 'bien');
    } catch (err) { console.warn(err); di('#pMsg', 'No se pudieron guardar los cambios. Inténtalo otra vez.', 'mal'); }
  });

  /* ── Eventos y pedidos ────────────────────────────────── */
  const fechaCorta = (ts) => { try { return ts.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
  const ESTADOS = { pagado: 'Pagado, preparándolo', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };

  async function cargaListas(u, forzar) {
    if (cargadoDe === u.uid && !forzar) return;
    cargadoDe = u.uid;
    try {
      const q = await MB.db.collection('inscripciones').where('uid', '==', u.uid).get();
      const mios = q.docs.map((d) => eventos.find((ev) => ev.id === d.data().eventId)).filter(Boolean).sort((a, b) => a.fecha.localeCompare(b.fecha));
      $('#misEventos').innerHTML = mios.length
        ? mios.map((ev) => { const f = MB.fecha(ev.fecha); return `<li><span class="linea1"><span>${esc(ev.titulo)}</span><span class="cifra">${f.dia} ${f.mes} ${f.anio}</span></span><span class="nota">${esc(ev.lugar || '')}${f.pasado ? ' · ya celebrado' : ''}</span></li>`; }).join('')
        : '<li class="nota">Aún no te has apuntado a ninguno. <a class="enlace" href="club.html#eventos">Ver próximos eventos</a></li>';
    } catch (e) { $('#misEventos').innerHTML = '<li class="nota">No se pudieron cargar tus eventos.</li>'; }
    try {
      const q = await MB.db.collection('orders').where('uid', '==', u.uid).get();
      const ped = q.docs.map((d) => d.data()).sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
      $('#misPedidos').innerHTML = ped.length
        ? ped.map((p) => `<li><span class="linea1"><span>${esc(fechaCorta(p.createdAt))}</span><span class="cifra">${euros(p.total || 0)}</span></span><span class="nota">${esc((p.items || []).map((i) => i.cantidad + ' × ' + i.nombre).join(', '))}</span><span><span class="pegatina pegatina-linea">${esc(ESTADOS[p.estado] || p.estado || '')}</span>${p.seguimiento ? ` <span class="nota">Seguimiento: ${esc(p.seguimiento)}</span>` : ''}</span></li>`).join('')
        : '<li class="nota">Todavía no has comprado nada. <a class="enlace" href="tienda.html">Ir a la tienda</a></li>';
    } catch (e) { $('#misPedidos').innerHTML = '<li class="nota">No se pudieron cargar tus pedidos.</li>'; }
  }

  /* ── Cambios de sesión ────────────────────────────────── */
  MB.alUsuario((u) => {
    $('#vistaEspera').hidden = true;
    $('#vistaFuera').hidden = !!u;
    $('#vistaDentro').hidden = !u;
    if (!u) { perfilPuesto = null; cargadoDe = null; if (params.get('entrar')) pestana('entrar'); return; }
    if (volver) { location.replace(volver); return; }
    $('#saludo').textContent = 'Hola, ' + u.nombre;
    $('#irAdmin').hidden = !u.admin;
    const conPass = (u.firebase.providerData || []).some((p) => p.providerId === 'password');
    $('#avisoEmail').hidden = !(conPass && !u.firebase.emailVerified);
    pintaPlan(u); ponPerfil(u); cargaListas(u);
    if (params.get('plan') === 'socio' && u.plan !== 'socio') $('#cajaPlan').scrollIntoView({ block: 'center' });
  });
})();
