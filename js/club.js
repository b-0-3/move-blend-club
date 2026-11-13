/* Club: eventos con inscripción, colaboradores y formulario de contacto. */
(function () {
  'use strict';
  const { $, esc } = MB;

  // Vídeo de cabecera (foto fija si el visitante pide menos movimiento)
  const video = $('.cab-video video');
  if (video && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.src = video.dataset.src;
    video.play().catch(() => {});
  }

  /* ── Eventos ──────────────────────────────────────────── */
  let datos = null;
  let mias = new Set();      // ids de eventos a los que estoy apuntado
  let cargadasDe = null;     // uid del que se cargaron las inscripciones

  const idInscripcion = (evId, uid) => evId + '_' + uid;

  function accionDe(ev) {
    const u = MB.usuario;
    if (ev.estado === 'cancelado') return '<span class="pegatina pegatina-linea">Cancelado</span>';
    if (mias.has(ev.id)) return `<span class="pegatina">Estás apuntado</span><button class="enlace" data-borrarme="${esc(ev.id)}">Borrarme</button>`;
    if (ev.estado === 'completo') return '<span class="pegatina pegatina-linea">Completo</span>';
    if (datos.origen !== 'firestore') return '<span class="nota">Inscripciones muy pronto</span>';
    if (ev.acceso === 'socios' && u && u.plan !== 'socio') return '<a class="boton boton-linea boton-mini" href="cuenta.html?plan=socio">Hazte socio para apuntarte</a>';
    return `<button class="boton boton-mini" data-apuntarme="${esc(ev.id)}">Apuntarme</button>`;
  }

  function pinta() {
    if (!datos) return;
    const prox = datos.eventos.filter((e) => !MB.fecha(e.fecha).pasado);
    const pas = datos.eventos.filter((e) => MB.fecha(e.fecha).pasado).reverse().slice(0, 6);
    $('#listaProximos').innerHTML = prox.length
      ? prox.map((e) => MB.pintaEvento(e, accionDe(e))).join('')
      : '<li class="vacio">Estamos cerrando las próximas fechas. Vuelve pronto.</li>';
    $('#zonaPasados').hidden = !pas.length;
    $('#listaPasados').innerHTML = pas.map((e) => MB.pintaEvento(e, '')).join('');
    $('#notaEventos').textContent = MB.usuario ? '' : 'Para apuntarte necesitas una cuenta. Es gratis.';
  }

  async function cargaMias() {
    const u = MB.usuario;
    if (!u || !MB.db) { mias = new Set(); cargadasDe = null; return; }
    if (cargadasDe === u.uid) return;
    try {
      const q = await MB.db.collection('inscripciones').where('uid', '==', u.uid).get();
      mias = new Set(q.docs.map((d) => d.data().eventId));
      cargadasDe = u.uid;
    } catch (e) { console.warn('Inscripciones no disponibles:', e); }
  }

  MB.cargar().then((d) => { datos = d; pintaColabs(); return cargaMias(); }).then(pinta);
  MB.alUsuario(() => { cargaMias().then(pinta); });

  document.addEventListener('click', async (e) => {
    const ap = e.target.closest('[data-apuntarme]');
    const bo = e.target.closest('[data-borrarme]');
    if (!ap && !bo) return;
    const u = MB.usuario;
    const evId = (ap || bo).dataset.apuntarme || (ap || bo).dataset.borrarme;
    const ev = datos.eventos.find((x) => x.id === evId);
    if (!ev) return;

    if (!u) {
      location.href = 'cuenta.html?volver=' + encodeURIComponent('club.html#eventos');
      return;
    }
    const boton = ap || bo;
    boton.disabled = true;
    const ref = MB.db.collection('inscripciones').doc(idInscripcion(evId, u.uid));
    try {
      if (ap) {
        await ref.set({ eventId: evId, uid: u.uid, nombre: u.nombre, email: u.email, plan: u.plan, createdAt: MB.ahora() });
        mias.add(evId);
        MB.aviso('Apuntado a ' + ev.titulo + '. Lo verás en tu cuenta.');
      } else {
        await ref.delete();
        mias.delete(evId);
        MB.aviso('Te has borrado de ' + ev.titulo + '.');
      }
    } catch (err) {
      console.warn(err);
      MB.aviso(ap ? 'No se pudo apuntarte. Puede que el evento esté completo o sea solo para socios.' : 'No se pudo borrar la inscripción. Inténtalo otra vez.', true);
    }
    pinta();
  });

  /* ── Colaboradores ────────────────────────────────────── */
  function pintaColabs() {
    const lista = datos.colaboradores;
    if (!lista.length) return;
    $('#listaColabs').hidden = false;
    $('#listaColabs').innerHTML = lista.map((c) => {
      const url = /^https?:\/\//i.test(c.url || '') ? c.url : '';
      const logo = MB.urlSegura(c.logo);
      const dentro = `${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ''}<b>${esc(c.nombre)}</b>${c.rol ? `<span>${esc(c.rol)}</span>` : ''}`;
      return `<li>${url ? `<a class="colab" href="${esc(url)}" target="_blank" rel="noopener">${dentro}</a>` : `<div class="colab">${dentro}</div>`}</li>`;
    }).join('');
    $('#colabsTexto').innerHTML = '¿Tu marca quiere formar parte? <a class="enlace" href="#contacto">Escríbenos</a>.';
    $('#colabsTexto').style.marginTop = '1.6rem';
  }

  /* ── Contacto ─────────────────────────────────────────── */
  const form = $('#formContacto');
  const msg = $('#cMsg');
  const di = (t, tipo) => { msg.textContent = t; msg.className = 'msg' + (tipo ? ' msg-' + tipo : ''); };
  MB.alUsuario((u) => { if (u) { if (!form.nombre.value) form.nombre.value = u.nombre; if (!form.email.value) form.email.value = u.email; } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = form.nombre.value.trim(), email = form.email.value.trim(), mensaje = form.mensaje.value.trim();
    if (nombre.length < 2) return di('Escribe tu nombre.', 'mal');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return di('Ese email no parece correcto.', 'mal');
    if (mensaje.length < 10) return di('Cuéntanos un poco más (mínimo 10 letras).', 'mal');
    if (!$('#cAcepto').checked) return di('Marca la casilla de privacidad para enviar.', 'mal');
    if (!MB.db) return di('Ahora mismo no se puede enviar. Inténtalo más tarde.', 'mal');
    const boton = form.querySelector('button[type=submit]');
    boton.disabled = true; di('Enviando…');
    try {
      await MB.db.collection('mensajes').add({ nombre, email, mensaje, uid: MB.usuario ? MB.usuario.uid : null, createdAt: MB.ahora() });
      form.reset();
      di('Mensaje enviado. Te respondemos por email.', 'bien');
    } catch (err) {
      console.warn(err);
      di('No se pudo enviar. Inténtalo otra vez en un momento.', 'mal');
    }
    boton.disabled = false;
  });
})();
