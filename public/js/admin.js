/* Panel de admin: eventos, productos, pedidos, gente, mensajes,
   colaboradores y ajustes. Solo funciona para cuentas que estén en la
   colección "admins" (lo comprueban también las reglas de Firestore). */
(function () {
  'use strict';
  const { $, $$, esc, euros } = MB;
  const db = MB.db;
  const ver = (id, si) => { $(id).hidden = !si; };

  if (!db) { $('#aEspera').textContent = 'No se puede conectar con la base de datos. Recarga la página.'; return; }

  /* ── Acceso ───────────────────────────────────────────── */
  let arrancado = false;
  MB.alUsuario((u) => {
    ver('#aEspera', false);
    ver('#aFuera', !u);
    ver('#aSinPermiso', !!u && !u.admin);
    ver('#aPanel', !!u && u.admin);
    if (u && !u.admin) $('#aUid').textContent = u.uid;
    if (u && u.admin && !arrancado) { arrancado = true; arrancar(); }
  });
  $('#aCopiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#aUid').textContent); MB.aviso('Código copiado.'); }
    catch (e) { MB.aviso('Mantén pulsado el código para copiarlo.', true); }
  });

  /* ── Definición de lo que se puede editar ─────────────── */
  const fechaCorta = (ts) => { try { return ts.toDate().toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const TIPOS = {
    events: {
      uno: 'evento', nuevo: 'Añadir evento',
      campos: [
        { k: 'titulo', e: 'Título', req: true, max: 80 },
        { k: 'fecha', e: 'Fecha', t: 'date', req: true },
        { k: 'tipo', e: 'Tipo', t: 'select', ops: ['Ruta', 'Track day', 'Show', 'Workshop', 'Quedada', 'Otro'] },
        { k: 'acceso', e: 'Quién puede apuntarse', t: 'select', ops: [['comunidad', 'Todo el mundo'], ['socios', 'Solo socios']] },
        { k: 'lugar', e: 'Lugar', max: 80 },
        { k: 'plazas', e: 'Plazas', t: 'number', ayuda: 'Pon 0 si el aforo es libre.' },
        { k: 'estado', e: 'Estado', t: 'select', ops: [['abierto', 'Abierto'], ['completo', 'Completo (no deja apuntarse)'], ['cancelado', 'Cancelado']] },
        { k: 'descripcion', e: 'Descripción', t: 'textarea', max: 600 }
      ],
      orden: (a, b) => String(b.fecha).localeCompare(String(a.fecha)),
      fila: (d, extra) => {
        const f = MB.fecha(d.fecha);
        const n = (extra.apuntados[d.id] || []).length;
        return `<div><p class="a-titulo">${esc(d.titulo)} ${d.ejemplo ? '<span class="pegatina pegatina-ej">Ejemplo</span>' : ''} ${d.estado && d.estado !== 'abierto' ? `<span class="pegatina pegatina-linea">${esc(d.estado)}</span>` : ''}</p>
          <p class="a-sub">${f ? `${f.dia} ${f.mes} ${f.anio}${f.pasado ? ' (ya pasó)' : ''}` : 'Sin fecha'} · ${d.acceso === 'socios' ? 'Solo socios' : 'Abierto a todos'} · ${n} apuntado${n === 1 ? '' : 's'}${Number(d.plazas) > 0 ? ' de ' + esc(d.plazas) : ''}</p></div>
          <div class="a-acciones">${n ? `<button class="boton boton-linea boton-mini" data-apuntados="${esc(d.id)}">Ver apuntados</button>` : ''}<button class="boton boton-linea boton-mini" data-editar="${esc(d.id)}">Editar</button></div>`;
      }
    },
    products: {
      uno: 'producto', nuevo: 'Añadir producto', foto: 'img',
      campos: [
        { k: 'nombre', e: 'Nombre', req: true, max: 80 },
        { k: 'descripcion', e: 'Descripción corta', max: 160 },
        { k: 'precio', e: 'Precio en euros', t: 'number', paso: '0.01', req: true },
        { k: 'img', e: 'Foto', t: 'imagen', lado: 900 },
        { k: 'tallas', e: 'Tallas', t: 'lista', ayuda: 'Separadas por comas: S, M, L, XL. Déjalo vacío si no tiene tallas.' },
        { k: 'orden', e: 'Posición en la tienda', t: 'number', ayuda: '1 sale el primero.' },
        { k: 'activo', e: 'Visible en la tienda', t: 'check', def: true },
        { k: 'agotado', e: 'Agotado (se ve, pero no se puede comprar)', t: 'check' }
      ],
      orden: (a, b) => (a.orden || 0) - (b.orden || 0),
      fila: (d) => `<img src="${esc(MB.urlSegura(d.img) || 'img/mb.webp')}" alt="">
        <div><p class="a-titulo">${esc(d.nombre)} ${d.ejemplo ? '<span class="pegatina pegatina-ej">Ejemplo</span>' : ''} ${d.activo === false ? '<span class="pegatina pegatina-linea">Oculto</span>' : ''} ${d.agotado ? '<span class="pegatina pegatina-linea">Agotado</span>' : ''}</p>
        <p class="a-sub">${euros(d.precio || 0)}${Array.isArray(d.tallas) && d.tallas.length ? ' · Tallas ' + esc(d.tallas.join(', ')) : ''}</p></div>
        <div class="a-acciones"><button class="boton boton-linea boton-mini" data-editar="${esc(d.id)}">Editar</button></div>`
    },
    collaborators: {
      uno: 'colaborador', nuevo: 'Añadir colaborador', foto: 'logo',
      campos: [
        { k: 'nombre', e: 'Nombre', req: true, max: 60 },
        { k: 'rol', e: 'Qué es', max: 60, ayuda: 'Por ejemplo: patrocinador, taller oficial, fotógrafo.' },
        { k: 'url', e: 'Enlace a su web o Instagram', t: 'url' },
        { k: 'logo', e: 'Logo', t: 'imagen', lado: 320 },
        { k: 'orden', e: 'Posición', t: 'number' }
      ],
      orden: (a, b) => (a.orden || 0) - (b.orden || 0),
      fila: (d) => `<img src="${esc(MB.urlSegura(d.logo) || 'img/mb.webp')}" alt="">
        <div><p class="a-titulo">${esc(d.nombre)}</p><p class="a-sub">${esc(d.rol || '')}</p></div>
        <div class="a-acciones"><button class="boton boton-linea boton-mini" data-editar="${esc(d.id)}">Editar</button></div>`
    }
  };
  const AJUSTES = [
    { k: 'instagram', e: 'Instagram (enlace completo)', t: 'url' },
    { k: 'tiktok', e: 'TikTok (enlace completo)', t: 'url' },
    { k: 'youtube', e: 'YouTube (enlace completo)', t: 'url' },
    { k: 'email', e: 'Email de contacto del club', t: 'email', ayuda: 'Sale en las páginas legales.' },
    { k: 'titular', e: 'Titular de la web (nombre y apellidos o empresa)', ayuda: 'Para el aviso legal.' },
    { k: 'nif', e: 'NIF o CIF del titular' },
    { k: 'domicilio', e: 'Domicilio del titular' }
  ];

  /* ── Estado ───────────────────────────────────────────── */
  let pestana = 'events';
  let filas = [];                 // documentos de la pestaña actual
  let extra = { apuntados: {} };  // inscripciones agrupadas por evento
  let sembrado = false;

  const lee = (col) => db.collection(col).get().then((q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data())));

  async function arrancar() {
    try { sembrado = (await db.collection('ajustes').doc('sitio').get()).exists; } catch (e) { console.warn(e); }
    ver('#aSembrar', !sembrado);
    pinta();
  }

  /* ── Cargar contenido inicial ─────────────────────────── */
  $('#aSembrarBtn').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Cargando…';
    try {
      const base = await fetch('data/contenido.json').then((r) => r.json());
      const lote = db.batch();
      const mete = (col, lista) => (lista || []).forEach((d) => { const c = Object.assign({}, d); delete c.id; lote.set(db.collection(col).doc(d.id), c); });
      mete('events', base.eventos); mete('products', base.productos); mete('collaborators', base.colaboradores);
      lote.set(db.collection('ajustes').doc('sitio'), Object.assign({}, base.ajustes, { creado: MB.ahora() }));
      await lote.commit();
      sembrado = true; ver('#aSembrar', false);
      MB.aviso('Contenido cargado. Ya puedes editarlo.');
      pinta();
    } catch (err) {
      console.warn(err);
      MB.aviso('No se pudo cargar. Revisa que has publicado las reglas de Firestore.', true);
      b.disabled = false; b.textContent = 'Cargar contenido inicial';
    }
  });

  /* ── Pestañas ─────────────────────────────────────────── */
  $('#aTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    pestana = b.dataset.tab;
    $$('#aTabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
    pinta();
  });

  async function pinta() {
    const cuerpo = $('#aCuerpo'), resumen = $('#aResumen'), nuevo = $('#aNuevo');
    cuerpo.innerHTML = '<p class="vacio">Cargando…</p>'; resumen.textContent = ''; nuevo.hidden = true;
    const actual = pestana;
    try {
      if (TIPOS[actual]) {
        const T = TIPOS[actual];
        const tareas = [lee(actual)];
        if (actual === 'events') tareas.push(lee('inscripciones'));
        const [docs, ins] = await Promise.all(tareas);
        if (actual !== pestana) return;
        filas = docs.sort(T.orden);
        if (ins) { extra.apuntados = {}; ins.forEach((i) => (extra.apuntados[i.eventId] = extra.apuntados[i.eventId] || []).push(i)); }
        nuevo.hidden = false; nuevo.textContent = T.nuevo;
        const ejemplos = filas.filter((d) => d.ejemplo).length;
        resumen.textContent = sembrado
          ? `${filas.length} en total${ejemplos ? `. ${ejemplos} de ejemplo: edítalos o bórralos antes de publicar la web.` : '.'}`
          : 'Carga primero el contenido inicial (arriba).';
        cuerpo.innerHTML = filas.length
          ? `<ul class="a-lista">${filas.map((d) => `<li class="a-fila${T.foto ? ' a-fila-foto' : ''}">${T.fila(d, extra)}</li>`).join('')}</ul>`
          : `<p class="vacio">Todavía no hay nada aquí. Pulsa "${T.nuevo}".</p>`;
      } else if (actual === 'orders') { await pintaPedidos(cuerpo, resumen, actual); }
      else if (actual === 'users') { await pintaGente(cuerpo, resumen, actual); }
      else if (actual === 'mensajes') { await pintaMensajes(cuerpo, resumen, actual); }
      else if (actual === 'ajustes') { await pintaAjustes(cuerpo, resumen, actual); }
    } catch (err) {
      console.warn(err);
      cuerpo.innerHTML = '<p class="vacio">No se pudo cargar. Comprueba tu conexión y que las reglas de Firestore están publicadas.</p>';
    }
  }

  /* ── Editor (eventos, productos, colaboradores) ───────── */
  const editor = $('#editor');
  let editando = null;      // { col, id (o null si es nuevo), datos }
  let fotoNueva = null;     // imagen recién elegida, ya reducida

  function campoHtml(c, v) {
    const id = 'ed_' + c.k;
    const ayuda = c.ayuda ? `<small>${esc(c.ayuda)}</small>` : '';
    if (c.t === 'check') return `<label class="campo-check" style="color:var(--tiza)"><input type="checkbox" id="${id}"${(v === undefined ? c.def : v) ? ' checked' : ''}><span>${esc(c.e)}</span></label>`;
    if (c.t === 'select') return `<div class="campo"><label for="${id}">${esc(c.e)}</label><select id="${id}">${c.ops.map((o) => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(txt)}</option>`; }).join('')}</select>${ayuda}</div>`;
    if (c.t === 'textarea') return `<div class="campo"><label for="${id}">${esc(c.e)}</label><textarea id="${id}" maxlength="${c.max || 1000}">${esc(v || '')}</textarea>${ayuda}</div>`;
    if (c.t === 'imagen') return `<div class="campo"><span class="etq">${esc(c.e)}</span><div class="editor-foto"><img id="${id}_ver" src="${esc(MB.urlSegura(v) || 'img/mb.webp')}" alt=""><label class="boton boton-linea boton-mini">Elegir foto<input type="file" id="${id}" accept="image/*" hidden></label></div><small>Se reduce sola para que la web cargue rápido.</small></div>`;
    if (c.t === 'lista') return `<div class="campo"><label for="${id}">${esc(c.e)}</label><input id="${id}" value="${esc(Array.isArray(v) ? v.join(', ') : '')}">${ayuda}</div>`;
    // Los precios van como texto con teclado numérico: así vale escribir 22,5 o 22.5.
    const decimal = c.t === 'number' && c.paso;
    const tipo = decimal ? 'text' : c.t || 'text';
    const valor = decimal && v != null ? String(v).replace('.', ',') : v;
    return `<div class="campo"><label for="${id}">${esc(c.e)}</label><input id="${id}" type="${tipo}"${decimal ? ' inputmode="decimal"' : tipo === 'number' ? ' inputmode="numeric" min="0" step="1"' : ''}${c.max ? ` maxlength="${c.max}"` : ''} value="${esc(valor == null ? '' : valor)}">${ayuda}</div>`;
  }

  function abrirEditor(col, doc) {
    const T = TIPOS[col];
    editando = { col, id: doc ? doc.id : null, datos: doc || {} };
    fotoNueva = null;
    $('#editorTitulo').textContent = (doc ? 'Editar ' : 'Nuevo ') + T.uno;
    $('#editorCampos').innerHTML = T.campos.map((c) => campoHtml(c, editando.datos[c.k])).join('');
    $('#editorMsg').textContent = '';
    ver('#editorBorrar', !!doc);
    $('#editorGuardar').disabled = false;
    editor.showModal();
  }
  $('#editorCerrar').addEventListener('click', () => editor.close());
  $('#aNuevo').addEventListener('click', () => { if (TIPOS[pestana]) abrirEditor(pestana, null); });

  // Reduce una foto en el propio móvil antes de guardarla.
  function reducir(archivo, lado) {
    return new Promise((bien, mal) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        const png = archivo.type === 'image/png' && lado <= 400; // los logos conservan el fondo transparente
        let l = lado, calidad = 0.82, salida = '';
        for (let i = 0; i < 6; i++) {
          const esc_ = Math.min(1, l / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * esc_); c.height = Math.round(img.height * esc_);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          salida = c.toDataURL(png ? 'image/png' : 'image/jpeg', calidad);
          if (salida.length < 400000) break;   // ~300 KB: cabe de sobra en la base de datos
          l = Math.round(l * 0.8); calidad = Math.max(0.6, calidad - 0.06);
        }
        URL.revokeObjectURL(url);
        salida.length < 900000 ? bien(salida) : mal(new Error('grande'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('formato')); };
      img.src = url;
    });
  }
  $('#editorCampos').addEventListener('change', async (e) => {
    if (e.target.type !== 'file' || !e.target.files[0]) return;
    const campo = TIPOS[editando.col].campos.find((c) => 'ed_' + c.k === e.target.id);
    $('#editorMsg').textContent = 'Preparando la foto…'; $('#editorMsg').className = 'msg';
    try {
      fotoNueva = { k: campo.k, url: await reducir(e.target.files[0], campo.lado || 900) };
      $('#' + e.target.id + '_ver').src = fotoNueva.url;
      $('#editorMsg').textContent = '';
    } catch (err) { $('#editorMsg').textContent = 'No se pudo usar esa foto. Prueba con otra (JPG o PNG).'; $('#editorMsg').className = 'msg msg-mal'; }
  });

  $('#editorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const T = TIPOS[editando.col];
    const datos = {};
    for (const c of T.campos) {
      const el = $('#ed_' + c.k);
      if (c.t === 'check') datos[c.k] = el.checked;
      else if (c.t === 'number') datos[c.k] = Math.max(0, Math.round((parseFloat(String(el.value).replace(',', '.')) || 0) * 100) / 100);
      else if (c.t === 'lista') datos[c.k] = el.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
      else if (c.t === 'imagen') datos[c.k] = fotoNueva && fotoNueva.k === c.k ? fotoNueva.url : editando.datos[c.k] || '';
      else datos[c.k] = el.value.trim();
      if (c.req && (datos[c.k] === '' || datos[c.k] === 0)) { $('#editorMsg').textContent = `Falta rellenar: ${c.e}.`; $('#editorMsg').className = 'msg msg-mal'; el.focus(); return; }
      if (c.t === 'url' && datos[c.k] && !/^https?:\/\//i.test(datos[c.k])) { $('#editorMsg').textContent = `"${c.e}" tiene que empezar por https://`; $('#editorMsg').className = 'msg msg-mal'; el.focus(); return; }
    }
    $('#editorGuardar').disabled = true;
    try {
      // Al guardar se quita la marca "Ejemplo": lo que guardas tú ya es contenido real.
      const ref = editando.id ? db.collection(editando.col).doc(editando.id) : db.collection(editando.col).doc();
      await ref.set(datos);
      editor.close(); MB.aviso('Guardado. Ya se ve en la web.'); pinta();
    } catch (err) {
      console.warn(err);
      $('#editorMsg').textContent = 'No se pudo guardar. Inténtalo otra vez.'; $('#editorMsg').className = 'msg msg-mal';
      $('#editorGuardar').disabled = false;
    }
  });

  $('#editorBorrar').addEventListener('click', async () => {
    if (!editando || !editando.id) return;
    const T = TIPOS[editando.col];
    if (!confirm(`¿Borrar este ${T.uno}? No se puede deshacer.`)) return;
    try { await db.collection(editando.col).doc(editando.id).delete(); editor.close(); MB.aviso('Borrado.'); pinta(); }
    catch (err) { console.warn(err); MB.aviso('No se pudo borrar.', true); }
  });

  /* ── Pedidos ──────────────────────────────────────────── */
  const ESTADOS = [['pagado', 'Pagado, por preparar'], ['enviado', 'Enviado'], ['entregado', 'Entregado'], ['cancelado', 'Cancelado']];
  async function pintaPedidos(cuerpo, resumen, actual) {
    const docs = (await lee('orders')).sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
    if (actual !== pestana) return;
    const pend = docs.filter((d) => d.estado === 'pagado').length;
    resumen.textContent = docs.length ? `${docs.length} pedidos. ${pend} por preparar.` : '';
    cuerpo.innerHTML = docs.length ? docs.map((d) => {
      const dir = d.direccion || {};
      return `<div class="a-pedido" data-pedido="${esc(d.id)}">
        <p class="a-titulo">${esc(d.nombre || d.email || 'Cliente')} <span class="cifra" style="font-size:1.25rem">${euros(d.total || 0)}</span> ${d.pruebas ? '<span class="pegatina pegatina-ej">De prueba</span>' : ''}</p>
        <p class="a-sub">${esc(fechaCorta(d.createdAt))} · ${esc(d.email || '')}${d.telefono ? ' · ' + esc(d.telefono) : ''}</p>
        <p>${esc((d.items || []).map((i) => `${i.cantidad} × ${i.nombre}`).join(', '))}</p>
        <p class="a-sub">Enviar a: ${esc([dir.linea1, dir.linea2, dir.cp, dir.ciudad, dir.provincia].filter(Boolean).join(', ') || 'sin dirección')}</p>
        <div class="dos">
          <div class="campo"><label for="pe_${esc(d.id)}">Estado</label><select id="pe_${esc(d.id)}" data-campo="estado">${ESTADOS.map(([v, t]) => `<option value="${v}"${d.estado === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="campo"><label for="ps_${esc(d.id)}">Nº de seguimiento (opcional)</label><input id="ps_${esc(d.id)}" data-campo="seguimiento" maxlength="60" value="${esc(d.seguimiento || '')}"></div>
        </div>
        <div><button class="boton boton-linea boton-mini" data-guardar-pedido="${esc(d.id)}">Guardar cambios del pedido</button></div>
      </div>`;
    }).join('') : '<p class="vacio">Aún no hay pedidos. Cuando alguien pague en la tienda, aparece aquí solo.</p>';
  }

  /* ── Gente ────────────────────────────────────────────── */
  async function pintaGente(cuerpo, resumen, actual) {
    const docs = (await lee('users')).sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
    if (actual !== pestana) return;
    const socios = docs.filter((d) => d.plan === 'socio');
    const raros = socios.filter((d) => !d.subscriptionId).length;
    resumen.textContent = `${docs.length} cuentas. ${socios.length} socios.${raros ? ` ${raros} marcados como socio sin suscripción de pago.` : ''}`;
    cuerpo.innerHTML = docs.length ? `<ul class="a-lista">${docs.map((d) => {
      const socio = d.plan === 'socio', sinPago = socio && !d.subscriptionId;
      return `<li class="a-fila"><div><p class="a-titulo">${esc(d.username || 'Sin nombre')} <span class="pegatina ${socio ? 'pegatina-rosa' : 'pegatina-linea'}">${socio ? 'Socio' : 'Miembro'}</span>${sinPago ? ' <span class="pegatina pegatina-ej">Sin pago</span>' : ''}</p>
        <p class="a-sub">${esc(d.email || '')}${d.telefono ? ' · ' + esc(d.telefono) : ''}${d.vehiculo ? ' · ' + esc(d.vehiculo) : ''}</p></div>
        <div class="a-acciones">${socio
          ? (sinPago ? `<button class="boton boton-linea boton-mini" data-plan="miembro" data-uid="${esc(d.id)}">Pasar a miembro</button>` : '')
          : `<button class="boton boton-linea boton-mini" data-plan="socio" data-uid="${esc(d.id)}">Regalar socio</button>`}</div></li>`;
    }).join('')}</ul><p class="nota" style="margin-top:1rem">"Sin pago" son socios que no tienen suscripción en Stripe: los que tú regalas, o cuentas de la web antigua, donde cualquiera podía marcarse como socio sin pagar. Los socios que pagan se dan de baja ellos solos desde su cuenta.</p>` : '<p class="vacio">Todavía no se ha registrado nadie.</p>';
  }

  /* ── Mensajes ─────────────────────────────────────────── */
  async function pintaMensajes(cuerpo, resumen, actual) {
    const docs = (await lee('mensajes')).sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
    if (actual !== pestana) return;
    resumen.textContent = docs.length ? `${docs.length} mensajes.` : '';
    cuerpo.innerHTML = docs.length ? `<ul class="a-lista">${docs.map((d) => `<li class="a-fila"><div><p class="a-titulo">${esc(d.nombre || '')}</p><p class="a-sub">${esc(fechaCorta(d.createdAt))} · ${esc(d.email || '')}</p><p style="margin-top:.4rem;white-space:pre-wrap;overflow-wrap:anywhere">${esc(d.mensaje || '')}</p></div>
      <div class="a-acciones">${/^[^\s@<>"'?&]+@[^\s@<>"'?&]+$/.test(d.email || '') ? `<a class="boton boton-linea boton-mini" href="mailto:${esc(d.email)}?subject=Move%20Blend%20Club">Responder</a>` : ''}<button class="boton boton-peligro boton-mini" data-borrar-msg="${esc(d.id)}">Borrar</button></div></li>`).join('')}</ul>`
      : '<p class="vacio">No hay mensajes. Los que envíen desde el formulario de contacto aparecen aquí.</p>';
  }

  /* ── Ajustes ──────────────────────────────────────────── */
  async function pintaAjustes(cuerpo, resumen, actual) {
    const snap = await db.collection('ajustes').doc('sitio').get();
    if (actual !== pestana) return;
    const v = snap.exists ? snap.data() : {};
    resumen.textContent = 'Redes sociales y datos para las páginas legales.';
    cuerpo.innerHTML = `<form class="form" id="formAjustes" novalidate>${AJUSTES.map((c) => campoHtml(c, v[c.k])).join('')}
      <p class="msg" id="ajMsg" role="status"></p><div><button class="boton" type="submit">Guardar ajustes</button></div></form>`;
  }
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'formAjustes') return;
    e.preventDefault();
    const datos = {}, msg = $('#ajMsg');
    for (const c of AJUSTES) {
      datos[c.k] = $('#ed_' + c.k).value.trim();
      if (c.t === 'url' && datos[c.k] && !/^https?:\/\//i.test(datos[c.k])) { msg.textContent = `"${c.e}" tiene que empezar por https://`; msg.className = 'msg msg-mal'; return; }
    }
    try { await db.collection('ajustes').doc('sitio').set(datos, { merge: true }); sembrado = true; msg.textContent = 'Ajustes guardados.'; msg.className = 'msg msg-bien'; }
    catch (err) { console.warn(err); msg.textContent = 'No se pudieron guardar.'; msg.className = 'msg msg-mal'; }
  });

  /* ── Botones de las listas ────────────────────────────── */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const ed = t.closest('[data-editar]');
    if (ed) { const d = filas.find((x) => x.id === ed.dataset.editar); if (d) abrirEditor(pestana, d); return; }

    const ap = t.closest('[data-apuntados]');
    if (ap) {
      const lista = extra.apuntados[ap.dataset.apuntados] || [];
      const ev = filas.find((x) => x.id === ap.dataset.apuntados) || {};
      editando = null;
      $('#editorTitulo').textContent = 'Apuntados';
      $('#editorCampos').innerHTML = `<p><b>${esc(ev.titulo || '')}</b>: ${lista.length} persona${lista.length === 1 ? '' : 's'}.</p>
        <ul class="a-lista">${lista.map((i) => `<li class="a-fila"><div><p class="a-titulo">${esc(i.nombre || '')} ${i.plan === 'socio' ? '<span class="pegatina pegatina-rosa">Socio</span>' : ''}</p><p class="a-sub">${esc(i.email || '')}</p></div></li>`).join('')}</ul>
        <div><button class="boton boton-linea boton-mini" type="button" id="copiarEmails">Copiar todos los emails</button></div>`;
      $('#copiarEmails').onclick = async () => { try { await navigator.clipboard.writeText(lista.map((i) => i.email).filter(Boolean).join(', ')); MB.aviso('Emails copiados.'); } catch (err) { MB.aviso('No se pudo copiar.', true); } };
      $('#editorMsg').textContent = ''; ver('#editorBorrar', false); ver('#editorGuardar', false);
      editor.showModal();
      editor.addEventListener('close', () => ver('#editorGuardar', true), { once: true });
      return;
    }

    const gp = t.closest('[data-guardar-pedido]');
    if (gp) {
      const caja = gp.closest('[data-pedido]');
      try {
        await db.collection('orders').doc(gp.dataset.guardarPedido).update({ estado: $('[data-campo="estado"]', caja).value, seguimiento: $('[data-campo="seguimiento"]', caja).value.trim() });
        MB.aviso('Pedido actualizado. El cliente lo ve en su cuenta.');
      } catch (err) { console.warn(err); MB.aviso('No se pudo actualizar el pedido.', true); }
      return;
    }

    const pl = t.closest('[data-plan]');
    if (pl) {
      const aSocio = pl.dataset.plan === 'socio';
      if (!confirm(aSocio ? '¿Hacer socio a esta persona sin cobrarle? Podrás quitárselo cuando quieras.' : '¿Pasar a esta persona a miembro?')) return;
      try { await db.collection('users').doc(pl.dataset.uid).update({ plan: pl.dataset.plan }); MB.aviso('Plan cambiado.'); pinta(); }
      catch (err) { console.warn(err); MB.aviso('No se pudo cambiar el plan.', true); }
      return;
    }

    const bm = t.closest('[data-borrar-msg]');
    if (bm) {
      if (!confirm('¿Borrar este mensaje?')) return;
      try { await db.collection('mensajes').doc(bm.dataset.borrarMsg).delete(); pinta(); }
      catch (err) { console.warn(err); MB.aviso('No se pudo borrar.', true); }
    }
  });
})();
