# Move Blend Club — guía para ponerla en marcha

Esta carpeta es la web completa. Piensa en ella como un local con tres partes:

- **El escaparate** (carpeta `public/`, lo que ve la gente): `index.html`, `club.html`, `tienda.html`, `cuenta.html` y las páginas legales.
- **La trastienda** (solo tú): `public/admin.html`, el panel donde cambias eventos, productos, pedidos, etc.
- **La caja registradora** (`netlify/functions/`): cuatro programitas que hablan con Stripe para cobrar. Viven en el servidor, no en el móvil del visitante, y por eso nadie puede trucar precios ni hacerse socio sin pagar.

Los datos (cuentas, eventos, pedidos…) se guardan en **Firebase**, en el mismo proyecto que ya tenías (`moveblend-259f6`).

---

## Paso 1 · Subir la web (GitHub + Netlify)

Hasta ahora subías un zip a Netlify. **Eso ya no vale para los pagos**: la caja registradora necesita que Netlify instale las piezas de Stripe y Firebase, y eso solo lo hace cuando la web viene de GitHub.

1. Crea un repositorio nuevo en GitHub (privado va bien) y sube **todo el contenido de esta carpeta**.
2. En Netlify: **Add new project → Import an existing project → GitHub** y elige ese repositorio. No toques nada de la configuración: ya viene en `netlify.toml`.
3. Netlify te da una dirección tipo `algo.netlify.app`. Apúntala, la usarás más abajo.

A partir de ahí, cada cambio que hagas en GitHub se publica solo.

## Paso 2 · Firebase

Entra en la consola de Firebase, en tu proyecto.

1. **Authentication → Método de acceso:** comprueba que están activados *Correo electrónico/contraseña* y *Google*.
2. **Authentication → Configuración → Dominios autorizados:** añade tu dirección de Netlify (y tu dominio propio cuando lo tengas). Si no, el botón de Google da error.
3. **Firestore Database → Reglas:** borra lo que haya, pega el contenido entero de `firestore.rules` y pulsa **Publicar**.
   Esto es el candado de la base de datos. **Hazlo cuanto antes**: en la web antigua cualquiera podía marcarse como socio.
4. **Hazte admin:** abre `tu-web/admin.html`, entra con tu cuenta y verás un código. En Firestore crea una colección llamada `admins` y, como ID del documento, pega ese código. Recarga el panel.
5. En el panel pulsa **Cargar contenido inicial**. Desde ese momento todo se edita desde ahí.
6. **La llave para el servidor:** *Configuración del proyecto (la rueda) → Cuentas de servicio → Generar nueva clave privada*. Se descarga un archivo `.json`. Ábrelo, copia **todo** el texto y guárdalo para el paso 3. Ese archivo es como la llave maestra: no lo subas a GitHub ni lo compartas.

## Paso 3 · Stripe (los pagos)

Hazlo primero entero en **modo de prueba** (no se mueve dinero real).

1. Crea tu cuenta en stripe.com y quédate en el modo de prueba.
2. Copia tu **clave secreta** de prueba (empieza por `sk_test_`).
3. En Netlify: **Project configuration → Environment variables** y crea estas tres:

   | Nombre | Qué pegas |
   |---|---|
   | `STRIPE_SECRET_KEY` | la clave `sk_test_...` |
   | `FIREBASE_SERVICE_ACCOUNT` | el texto entero del `.json` del paso 2.6 |
   | `STRIPE_WEBHOOK_SECRET` | la que sale en el punto 4 |

4. **El aviso de Stripe a tu web (webhook):** en Stripe abre `dashboard.stripe.com/webhooks`, crea un destino nuevo de tipo *webhook endpoint* con esta dirección:

   `https://TU-DIRECCION/.netlify/functions/stripe-webhook`

   y marca estos cuatro eventos:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Al guardarlo, Stripe te enseña un **secreto de firma** que empieza por `whsec_`. Ese es el que va en `STRIPE_WEBHOOK_SECRET`.
5. **Portal del cliente:** en los ajustes de Stripe busca *Customer portal* (portal de clientes), deja activado que puedan cancelar y pulsa guardar. Es la página donde el socio se da de baja solo.
6. En Netlify lanza un despliegue nuevo (**Deploys → Trigger deploy**) para que coja las variables.
7. **Prueba:** compra algo y hazte socio con la tarjeta de prueba `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC. Comprueba que:
   - el pedido aparece en el panel, pestaña *Pedidos*;
   - tu cuenta pasa a *Socio* sola a los pocos segundos;
   - desde *Mi cuenta* puedes cancelar la suscripción.

**Para cobrar de verdad:** activa tu cuenta de Stripe (te pedirá tus datos y tu cuenta bancaria), cambia `STRIPE_SECRET_KEY` por la clave real (`sk_live_...`), crea otra vez el webhook en modo real y cambia `STRIPE_WEBHOOK_SECRET` por el nuevo secreto. Vuelve a desplegar.

---

## Antes de publicar: lo que tienes que cambiar

Todo lo que es de mentira lleva una pegatina amarilla que pone **Ejemplo**.

- [ ] **Productos.** Los seis son de ejemplo y **las fotos no son de tu merch**. Sube fotos reales, pon precios y tallas de verdad. Con la clave real de Stripe, un producto de ejemplo no se puede comprar (está bloqueado a propósito).
- [ ] **Eventos.** Las fechas y sitios son inventados. Edítalos o bórralos.
- [ ] **Ajustes del panel.** Instagram, TikTok, YouTube, email de contacto, y tu nombre, NIF y domicilio para las páginas legales.
- [ ] **Páginas legales.** Están escritas como plantilla. Lo que está en amarillo y pone `[REVISAR: …]` lo tienes que decidir tú (IVA, plazo de entrega, devoluciones, normas de los eventos). No soy abogado: antes de vender, que les eche un ojo alguien que sepa.
- [ ] **Lo que prometes a los socios.** La web dice kit de bienvenida, fotógrafos en cada salida y track days. Deja solo lo que vayas a cumplir (se cambia en `public/index.html` y `public/js/cuenta.js`).
- [ ] **Gente → "Sin pago".** Son socios sin suscripción en Stripe (los de la web antigua). Decide si los pasas a miembro.
- [ ] **Fotos y vídeos.** Asegúrate de que son vuestros o tenéis permiso para usarlos.
- [ ] **Hacienda.** Para cobrar cuotas y vender ropa hace falta estar dado de alta y declarar esos ingresos. Háblalo con un gestor antes de pasar Stripe a modo real.

## Cosas del día a día

- **Añadir un evento o un producto:** panel de admin → pestaña → *Añadir*. Las fotos se encogen solas.
- **Alguien ha comprado:** panel → *Pedidos*. Ahí ves qué enviar y a dónde, y lo marcas como *Enviado*. El cliente lo ve en su cuenta. Stripe además te avisa por email si lo activas en sus ajustes.
- **Ver quién va a un evento:** panel → *Eventos* → *Ver apuntados* (puedes copiar todos los emails).
- **Cambiar el precio de socio, el envío o el descuento:** están en `public/data/contenido.json`, arriba del todo, en `tarifas`. Es el único sitio; la web y los pagos leen de ahí. Ojo: cambiar el precio de socio solo afecta a los socios nuevos.
- **Completo:** las plazas no se cuentan solas. Cuando un evento se llene, edítalo y ponlo en *Completo*.

## Qué está probado y qué no

Probado aquí, con una base de datos y un Stripe simulados: crear cuenta, entrar, apuntarse y borrarse de eventos, cesta, cálculo de precios y descuento de socio, que el servidor ignora precios trucados, que el webhook rechaza avisos falsos, alta y baja de socio, y todo el panel de admin.

**No probado**, porque hacen falta tus cuentas reales:
- el pago de verdad contra Stripe (por eso el paso 3.7);
- las reglas de Firestore contra tu base de datos real. Están escritas con cuidado, pero pruébalas: con una cuenta normal intenta abrir `admin.html` y no debe dejarte ver nada;
- el botón de Google en tu dominio.

Si algo de eso falla, dime exactamente qué mensaje sale y lo arreglamos.
