# Auge — Conclusión y hoja de ruta

> Borrador para desarrollar y pulir más adelante.

## Principio de diseño

**En Auge no vienes a contarle al mundo lo que piensas. Vienes a descubrir qué está pasando en el mundo y conocer lo que otros piensan sobre ello.**

Es la diferencia que hay que proteger en cada funcionalidad que se añada. No es otro Twitter, Reddit o Feedly: es una categoría de producto propia.

Las redes sociales tradicionales conectan personas entre sí. **Auge conecta personas a través de lo que sucede en el mundo.** Esa puede ser su identidad internacional.

No limitarlo a una red social de actualidad: plantearlo como una **plataforma global de acontecimientos, información y opinión**. Eso abre muchas más posibilidades de crecimiento.

## 1. Filosofía del producto

Auge no es una red social donde las personas crean contenido. Es una plataforma donde el mundo genera acontecimientos y las personas conversan sobre ellos.

Pilares:

- Las noticias generan los Auges, no los usuarios.
- Los usuarios siguen acontecimientos, no personas.
- Las opiniones siempre están vinculadas a una noticia o acontecimiento.
- No existen seguidores ni influencers.
- Las cuentas son anónimas públicamente.
- La información y las opiniones están claramente diferenciadas.

## 2. Funcionalidades a desarrollar

### 2.1 Auges como acontecimientos vivos

- Un Auge puede agrupar múltiples noticias relacionadas.
- Tiene su propia cronología.
- Recibe actualizaciones a medida que evoluciona el acontecimiento.
- Puede permanecer activo durante días, semanas o meses.
- Agrupa noticias, informes y análisis relacionados.

### 2.2 Sistema de opiniones

Las opiniones son el verdadero contenido social de Auge. Cuatro interacciones:

- **Opinar:** publicar una opinión.
- **Responder:** debatir otra opinión.
- **Apoyar:** mostrar acuerdo.
- **Contrastar:** mostrar desacuerdo.

Evitar que se conviertan simplemente en publicaciones tradicionales.

### 2.3 Anonimato público

- No mostrar identidades personales.
- No permitir seguidores.
- No fomentar marcas personales.
- Mantener cuentas e historial internamente.
- Incorporar moderación y mecanismos contra cuentas falsas y manipulaciones.

### 2.4 Algoritmo de relevancia

El posicionamiento de los Auges depende de:

- Relevancia mundial.
- Actualidad.
- Importancia del acontecimiento.
- Evolución de la información.
- Actividad de la comunidad.

Importante: una noticia importante no debe desaparecer simplemente porque tenga pocas interacciones.

### 2.5 Estados de la información

Etiquetas de fiabilidad y evolución:

- **Confirmado:** información contrastada.
- **En desarrollo:** información todavía cambiante.
- **Rectificado:** información corregida o desmentida.

### 2.6 Separación entre información y comunidad

Cada Auge tiene dos dimensiones:

- **Información:** noticias, informes, cronología, actualizaciones, fuentes.
- **Comunidad:** opiniones, respuestas, apoyos, contrastes.

### 2.7 Un solo Auge mundial, traducido (funcionalidad clave)

Escenario: un usuario español entra en un Auge sobre las elecciones de Estados Unidos y encuentra:

- Noticias originales de medios estadounidenses.
- Opiniones de usuarios estadounidenses, europeos y latinoamericanos.
- Informes y cronologías.

Todo traducido a su idioma. Y un usuario japonés participa exactamente en esa misma conversación.

Consecuencias:

- **Las noticias se juntan por acontecimiento, no por país ni por idioma.** Se rompe la barrera de «país»: un Auge reúne la cobertura de medios de todo el mundo. Esto sustituye al modelo actual de un feed separado por edición/idioma.
- **Cada usuario lo ve todo en su idioma** (titulares, informes, cronología y opiniones).
- **Opción para ver Auges por país** como filtro o vista (qué está en auge en España, en Japón…), nunca como división del contenido.

**Cómo hacerlo sin gastar dinero** (principio: coste cero, nada de APIs de pago):

- **Traducción:** [Argos Translate](https://github.com/argosopentech/argos-translate) (libre, MIT, funciona sin conexión) o [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate), que es un servidor HTTP construido sobre Argos.
- **Dónde ejecutarlo:** es Python y necesita memoria, así que no cabe en las Edge Functions de Supabase. Alojarlo en un servidor gratuito (por ejemplo, la capa Always Free de Oracle Cloud) o en un PC propio.
- **Traducir una sola vez:** cada texto se traduce una vez por idioma y se guarda en la base de datos; nunca en tiempo real por cada lectura.
- **Agrupar entre idiomas:** en ese mismo servidor, un modelo de embeddings multilingüe libre (por ejemplo, `paraphrase-multilingual-MiniLM-L12-v2`) para detectar que noticias en distintos idiomas hablan del mismo acontecimiento. Alternativa más simple: traducir todos los titulares al inglés con Argos y agrupar sobre esa versión.

## 3. Reglas fundamentales (no romper nunca)

1. No existen publicaciones independientes de los Auges.
2. No existen seguidores.
3. No existen perfiles orientados a conseguir popularidad.
4. Las conversaciones siempre están vinculadas a acontecimientos reales.
5. La información periodística no se mezcla con las opiniones.
6. La popularidad no determina la importancia informativa.

## 4. Decisión de arquitectura: dos niveles

**Nivel 1 — Acontecimiento principal.** Puede permanecer activo durante meses o años.
Ejemplo: *Conflicto entre Rusia y Ucrania*.

**Nivel 2 — Auges dentro del acontecimiento**, cada uno con noticias, informes, cronología y opiniones. Ejemplos:

- Rusia anuncia un nuevo ataque
- Nuevas negociaciones de paz
- Nuevo paquete de sanciones
