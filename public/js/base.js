/* ═══════════════════════════════════════════════════════════
   MOVE BLEND CLUB — base común a todas las páginas
   Cabecera y pie, sesión de usuario, datos, cesta y avisos.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const MB = (window.MB = {});

  /* ── Utilidades ───────────────────────────────────────── */
  const $ = (MB.$ = (sel, raiz) => (raiz || document).querySelector(sel));
  MB.$$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  MB.esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  MB.euros = (n) => {
    const v = Math.round(Number(n) * 100) / 100;
    return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' €';
  };

  /* Solo dejamos pasar enlaces http(s) y rutas del propio sitio. */
  MB.urlSegura = (u) => {
    u = String(u || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (/^(img\/|data:image\/(png|jpeg|webp);base64,)/i.test(u)) return u;
    return '';
  };

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  MB.fecha = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return { d, dia: m[3], mes: MESES[d.getMonth()], anio: m[1], semana: DIAS[d.getDay()], pasado: d < hoy };
  };

  MB.aviso = (texto, mal) => {
    let raiz = $('#avisos');
    if (!raiz) { raiz = document.createElement('div'); raiz.id = 'avisos'; raiz.setAttribute('role', 'status'); raiz.setAttribute('aria-live', 'polite'); document.body.appendChild(raiz); }
    const el = document.createElement('div');
    el.className = 'aviso' + (mal ? ' aviso-mal' : '');
    el.textContent = texto;
    while (raiz.children.length >= 2) raiz.firstChild.remove(); // como mucho dos avisos a la vez
    raiz.appendChild(el);
    setTimeout(() => el.remove(), mal ? 5200 : 3200);
  };

  const conTiempo = (promesa, ms) => Promise.race([promesa, new Promise((_, no) => setTimeout(() => no(new Error('tiempo agotado')), ms))]);

  /* ── Firebase ─────────────────────────────────────────── */
  MB.auth = null; MB.db = null;
  try {
    if (window.firebase && window.MB_FIREBASE) {
      if (!firebase.apps.length) firebase.initializeApp(window.MB_FIREBASE);
      MB.auth = firebase.auth();
      MB.db = firebase.firestore();
      MB.ahora = () => firebase.firestore.FieldValue.serverTimestamp();
    }
  } catch (e) { console.warn('Firebase no disponible:', e); }

  /* ── Sesión ───────────────────────────────────────────── */
  // MB.usuario: undefined = aún no se sabe · null = sin sesión · objeto = con sesión
  MB.usuario = undefined;
  const oyentes = [];
  MB.alUsuario = (fn) => { oyentes.push(fn); if (MB.usuario !== undefined) fn(MB.usuario); };
  const avisarUsuario = () => { pintaSesion(); oyentes.forEach((fn) => { try { fn(MB.usuario); } catch (e) { console.error(e); } }); };

  let soltarPerfil = null;
  if (MB.auth) {
    MB.auth.onAuthStateChanged((user) => {
      if (soltarPerfil) { soltarPerfil(); soltarPerfil = null; }
      if (!user) { MB.usuario = null; avisarUsuario(); return; }
      const nombreBase = MB.nombrePendiente || user.displayName || (user.email || '').split('@')[0];
      const ref = MB.db.collection('users').doc(user.uid);
      let admin = false;
      MB.db.collection('admins').doc(user.uid).get().then((s) => { admin = s.exists; if (MB.usuario) { MB.usuario.admin = admin; avisarUsuario(); } }).catch(() => {});
      soltarPerfil = ref.onSnapshot((snap) => {
        const p = snap.exists ? snap.data() : null;
        if (!p) {
          // Primera vez (por ejemplo, al entrar con Google): creamos su ficha.
          ref.set({ username: nombreBase, email: user.email || '', plan: 'miembro', createdAt: MB.ahora() }).catch((e) => console.warn('No se pudo crear la ficha:', e));
        }
        MB.usuario = {
          uid: user.uid, email: user.email || '',
          nombre: (p && p.username) || nombreBase,
          plan: p && p.plan === 'socio' ? 'socio' : 'miembro',
          perfil: p || {}, admin, firebase: user
        };
        avisarUsuario();
      }, (err) => {
        console.warn('Perfil no disponible:', err);
        MB.usuario = { uid: user.uid, email: user.email || '', nombre: nombreBase, plan: 'miembro', perfil: {}, admin, firebase: user };
        avisarUsuario();
      });
    });
  } else {
    MB.usuario = null;
  }

  /* ── Datos (eventos, productos, colaboradores, ajustes) ── */
  let promesaDatos = null;
  MB.cargar = () => promesaDatos || (promesaDatos = (async () => {
    let base = { tarifas: { envio: 5, socioMes: 9.99, descuentoSocio: 10 }, ajustes: {}, eventos: [], productos: [], colaboradores: [] };
    try { base = Object.assign(base, await fetch('data/contenido.json').then((r) => r.json())); } catch (e) { console.warn('contenido.json no disponible', e); }
    const datos = { tarifas: base.tarifas, ajustes: base.ajustes || {}, eventos: base.eventos, productos: base.productos, colaboradores: base.colaboradores, origen: 'archivo' };
    if (MB.db) {
      try {
        const aj = await conTiempo(MB.db.collection('ajustes').doc('sitio').get(), 7000);
        if (aj.exists) {
          const lee = (col) => MB.db.collection(col).get().then((q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data())));
          const [ev, pr, co] = await conTiempo(Promise.all([lee('events'), lee('products'), lee('collaborators')]), 9000);
          Object.assign(datos, { ajustes: aj.data(), eventos: ev, productos: pr, colaboradores: co, origen: 'firestore' });
        }
      } catch (e) { console.warn('Usando el contenido del archivo:', e.message); }
    }
    datos.eventos = (datos.eventos || []).filter((e) => MB.fecha(e.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    datos.productos = (datos.productos || []).filter((p) => p.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    datos.colaboradores = (datos.colaboradores || []).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    return datos;
  })());

  /* ── Pintar un evento (lo usan portada y club) ────────── */
  MB.pintaEvento = (ev, accionHtml) => {
    const f = MB.fecha(ev.fecha);
    const socios = ev.acceso === 'socios';
    const plazas = Number(ev.plazas) > 0 ? ev.plazas + ' plazas' : 'Aforo libre';
    return `<li class="evento${f.pasado ? ' evento-pasado' : ''}" data-id="${MB.esc(ev.id)}">
      <div class="evento-fecha"><span class="evento-dia cifra">${f.dia}</span><span class="evento-mes">${f.mes} ${f.anio}</span></div>
      <h3 class="evento-titulo">${MB.esc(ev.titulo)}
        <span class="pegatina ${socios ? 'pegatina-rosa' : 'pegatina-linea'}">${socios ? 'Solo socios' : 'Abierto a todos'}</span>
        ${ev.ejemplo ? '<span class="pegatina pegatina-ej">Ejemplo</span>' : ''}
      </h3>
      <p class="evento-datos"><span>${MB.esc(ev.tipo || 'Evento')}</span><span>${MB.esc(ev.lugar || 'Lugar por confirmar')}</span><span>${MB.esc(plazas)}</span></p>
      ${accionHtml ? `<div class="evento-accion">${accionHtml}</div>` : ''}
    </li>`;
  };

  /* ── Cesta (se guarda en el móvil del visitante) ──────── */
  const CLAVE = 'mbCesta';
  const leeCesta = () => { try { const c = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } };
  const guardaCesta = (c) => { try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch (e) {} pintaCesta(); document.dispatchEvent(new CustomEvent('mb:cesta')); };
  MB.cesta = {
    items: leeCesta,
    unidades: () => leeCesta().reduce((s, i) => s + (i.qty || 0), 0),
    anadir(id, talla) {
      const c = leeCesta();
      const ya = c.find((i) => i.id === id && (i.talla || '') === (talla || ''));
      if (ya) ya.qty = Math.min(20, ya.qty + 1); else c.push({ id, talla: talla || '', qty: 1 });
      guardaCesta(c);
    },
    cambiar(indice, delta) {
      const c = leeCesta();
      if (!c[indice]) return;
      c[indice].qty = Math.min(20, c[indice].qty + delta);
      if (c[indice].qty <= 0) c.splice(indice, 1);
      guardaCesta(c);
    },
    vaciar() { guardaCesta([]); }
  };

  /* ── Llamar a una función del servidor (pagos) ────────── */
  MB.funcion = async (nombre, cuerpo) => {
    const cab = { 'Content-Type': 'application/json' };
    if (MB.usuario && MB.usuario.firebase) cab.Authorization = 'Bearer ' + (await MB.usuario.firebase.getIdToken());
    let r;
    try { r = await fetch('/.netlify/functions/' + nombre, { method: 'POST', headers: cab, body: JSON.stringify(cuerpo || {}) }); }
    catch (e) { throw new Error('Sin conexión. Revisa tu internet e inténtalo otra vez.'); }
    let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j) throw new Error((j && j.error) || (r.status === 404 ? 'Los pagos todavía no están activados en esta web.' : 'No se pudo completar. Inténtalo otra vez.'));
    return j;
  };

  /* ── Cabecera y pie ───────────────────────────────────── */
  const pagina = document.body.dataset.pagina || '';
  const actual = (p) => (pagina === p ? ' aria-current="page"' : '');
  const ICONO_CESTA = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.5l2.2 11h10.6L20.5 7H7"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg>';

  const tira = $('#tira');
  if (tira) {
    tira.className = 'tira';
    tira.innerHTML = `
      <a class="tira-logo" href="index.html" aria-label="Move Blend Club, ir a la portada"><img src="img/mb.webp" alt="" width="470" height="245"></a>
      <nav class="tira-nav" aria-label="Principal">
        <a href="club.html"${actual('club')}>Club</a>
        <a href="tienda.html"${actual('tienda')}>Tienda</a>
        <a href="cuenta.html" id="tiraCuenta"${actual('cuenta')}>Entrar</a>
        <a href="tienda.html#cesta" class="tira-cesta" id="tiraCestaBtn" aria-label="Cesta">${ICONO_CESTA}<span id="tiraCesta"></span></a>
      </nav>`;
  }

  function pintaSesion() {
    const a = $('#tiraCuenta');
    if (!a) return;
    const u = MB.usuario;
    a.textContent = u ? 'Cuenta' : 'Entrar';
    a.classList.toggle('tira-socio', !!(u && u.plan === 'socio'));
    a.title = u ? (u.plan === 'socio' ? 'Socio: ' : 'Miembro: ') + u.nombre : '';
  }
  function pintaCesta() {
    const s = $('#tiraCesta');
    if (!s) return;
    const n = MB.cesta.unidades();
    s.textContent = n ? n : '';
    const b = $('#tiraCestaBtn');
    if (b) b.setAttribute('aria-label', n ? `Cesta, ${n} artículos` : 'Cesta vacía');
  }
  pintaSesion(); pintaCesta();
  window.addEventListener('storage', (e) => { if (e.key === CLAVE) pintaCesta(); });

  const pie = $('#pie');
  if (pie) {
    pie.className = 'pie';
    pie.innerHTML = `<div class="ancho">
      <div class="pie-rejilla">
        <nav aria-label="Redes sociales"><img src="img/moveblend.webp" alt="Move Blend" width="276" height="218" loading="lazy"><span id="pieRedes" style="display:contents"></span></nav>
        <nav aria-label="Club"><b>Club</b><a href="club.html#historia">Quiénes somos</a><a href="club.html#eventos">Eventos</a><a href="club.html#colaboradores">Colaboradores</a><a href="club.html#contacto">Contacto</a></nav>
        <nav aria-label="Tienda y cuenta"><b>Tienda</b><a href="tienda.html">Merch oficial</a><a href="cuenta.html">Mi cuenta</a></nav>
        <nav aria-label="Legal"><b>Legal</b><a href="aviso-legal.html">Aviso legal</a><a href="privacidad.html">Privacidad</a><a href="cookies.html">Cookies</a><a href="terminos.html">Términos y condiciones</a></nav>
      </div>
      <p class="pie-fin">© ${new Date().getFullYear()} Move Blend Club, Madrid. Defined by no one. Recognized by all.</p>
    </div>`;
    MB.cargar().then((d) => {
      const redes = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']]
        .filter(([k]) => /^https?:\/\//i.test(d.ajustes[k] || ''))
        .map(([k, n]) => `<a href="${MB.esc(d.ajustes[k])}" target="_blank" rel="noopener">${n}</a>`).join('');
      $('#pieRedes').innerHTML = redes;
    });
  }

  /* Rellena los huecos de las páginas legales con los datos de Ajustes. */
  if (document.querySelector('[data-legal]')) {
    MB.cargar().then((d) => {
      MB.$$('[data-legal]').forEach((el) => {
        const v = (d.ajustes[el.dataset.legal] || '').trim();
        if (v) { el.textContent = v; el.classList.remove('hueco'); }
      });
    });
  }
})();
