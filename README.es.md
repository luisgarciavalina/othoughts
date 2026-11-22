# Othoughts

Convierte el Canvas de Obsidian en una herramienta de mapas mentales, al estilo de iThoughts: colapsar y mover ramas enteras, organizar el mapa solo en cualquier dirección, armarlo desde el teclado, cambiarle el estilo, trabajarlo como esquema y exportarlo a los formatos que leen otros programas de mapas.

Funciona sobre archivos `.canvas` comunes. Tus tarjetas, notas, imágenes y links siguen siendo lo que son; el plugin agrega estructura sobre las flechas que dibujás.

*Read it in English: [README.md](README.md).*

Othoughts es un proyecto independiente. No tiene relación con toketaWare ni con iThoughts.

## Para empezar

1. Abrí un canvas (o creá uno) y agregá una tarjeta. Escribí su texto y apretá `Escape`.
2. Con la tarjeta seleccionada, apretá `Tab`: aparece una hija a la derecha, lista para escribir. `Escape` de nuevo, después `Enter` para una hermana, `Tab` para una nieta. Las flechas del teclado te mueven entre tarjetas.
3. Tocá la ruedita de abajo a la izquierda del canvas. Elegí el tipo de mapa (a la derecha, a los dos lados, hacia abajo...), un estilo y un fondo, y tocá *Reorganizar*.
4. Clic derecho en cualquier tarjeta para las acciones de rama: colapsar, pintar, organizar, enfocar. Clic derecho en una flecha para cambiar su tipo, trazo y color.
5. Abrí el *Historial del mapa* desde la ruedita y tomá una primera instantánea. Activá las automáticas en las opciones si querés una por día sin pensarlo.

## Qué hace

**Ramas**
- Colapsar y expandir cualquier rama, desde un botón redondo en la tarjeta, el menú contextual o el esquema. Una tarjeta colapsada muestra cuántas oculta.
- Arrastrás una tarjeta y su rama entera va con ella.
- Soltás una rama al lado de otra tarjeta para reengancharla: a su altura queda como hija, justo arriba o abajo queda como hermana. Una rama que cruza al otro lado de la raíz se da vuelta, con sus flechas.

**Auto-organización**
- Organizar una rama o el mapa entero: hacia la derecha, la izquierda, abajo, arriba, o a los dos lados de la raíz.
- Tres grados de alineación automática por canvas: *completa* (se reacomoda al colapsar o mover una rama), *parcial* (solo al colapsar o expandir) y *manual* (nada se mueve solo).
- Solo se organizan los mapas. Las tarjetas, imágenes y notas sueltas se quedan donde las pusiste.

**Teclado**
- `Tab` crea un hijo, `Enter` un hermano, y la tarjeta nueva queda lista para escribir.
- `Escape` sale de la tarjeta; `Alt+Enter` agrega un renglón dentro de ella.
- Las flechas saltan de tarjeta en tarjeta siguiendo el mapa.
- Esto solo actúa sobre tarjetas que son parte de un mapa. En una tarjeta suelta, `Enter` y las flechas hacen lo de siempre en Obsidian.

**Aspecto**
- Siete estilos de mapa por canvas (papel, clásico, subrayado, pizarra, cuaderno, noche, o ninguno) y siete fondos, que se eligen por separado.
- Un cuadradito en cada tarjeta estira la caja y la letra juntas.
- Opcionales: letra más grande en la raíz y las ramas principales, un zoom al abrir cada canvas y un indicador de zoom.

**Líneas que se mantienen prolijas**
- Mientras arrastrás una tarjeta, sus flechas cambian de lado sobre la marcha: salen por las caras que se miran a lo largo del mapa, y una tarjeta puesta justo arriba o abajo de otra se une por arriba o por abajo. Un pequeño margen evita que titilen en el límite.
- Curvas suaves: las flechas salen y llegan derechas y cruzan en una diagonal suave, como en iThoughts, en vez de los ganchos cerrados que dibuja Obsidian entre tarjetas cercanas. Las dos cosas se pueden apagar.

**Esquema y exportación**
- Un panel muestra el mapa entero como lista con sangrías, incluido lo que está dentro de ramas colapsadas. Se puede editar el texto, indentar con `Tab` y crear hermanos con `Enter`.
- Exporta el mapa a **FreeMind (`.mm`)**, que abren iThoughts, XMind, Freeplane, MindManager, MindNode y SimpleMind; a **OPML**; o a un esquema en **Markdown**. Viajan las ramas ocultas, los colores, el lado de cada rama, los enlaces y las conexiones cruzadas.

**Instantáneas: la historia de un mapa**
- Tomá una instantánea para guardar el mapa tal como está ahora, con un nombre si querés ("antes del congreso"). Activá las automáticas para guardar una por día (o por semana) de cada mapa que trabajás, solo cuando cambió.
- El panel *Historial del mapa* las muestra en una línea de tiempo, con cuántos nodos tenía cada una y qué cambió respecto de la anterior (+ nuevos, − quitados, ~ reescritos).
- Abrí cualquiera para mirarla: se abre en solo lectura, así tu historia no se modifica por accidente. Restaurá una para volver el mapa a esa versión; antes se guarda la versión actual, así que restaurar se puede deshacer.
- Las instantáneas son canvas comunes en una carpeta de tu bóveda (*Instantáneas de mapas*, por defecto): viajan con tu bóveda y sus copias de seguridad. Si movés o renombrás un canvas, su historia lo sigue.

Todo está en la ruedita de abajo a la izquierda del canvas, en el menú contextual de tarjetas y flechas, y en la paleta de comandos.

## Atajos sugeridos

El plugin no trae atajos, para no chocar con los tuyos. Estos son los que vale la pena asignar en **Ajustes → Atajos de teclado** (buscá "Othoughts"):

| Comando | Sugerencia |
| --- | --- |
| Colapsar o expandir rama | `Ctrl/Cmd+Alt+C` |
| Expandir todas las ramas | `Ctrl/Cmd+Alt+E` |
| Seleccionar la rama completa | `Ctrl/Cmd+Alt+A` |
| Enfocar la rama seleccionada | `Ctrl/Cmd+Alt+F` |
| Abrir el esquema del mapa | `Ctrl/Cmd+Alt+O` |
| Auto-organizar: a la derecha / izquierda / abajo / arriba | `Ctrl/Cmd+Alt+flechas` |
| Tomar una instantánea del mapa | `Ctrl/Cmd+Alt+H` |

`Tab`, `Enter`, `Escape`, `Alt+Enter` y las flechas funcionan dentro del canvas sin configurar nada.

## Cómo se arma la jerarquía

El árbol sale de tus flechas. Una tarjeta sin flecha entrante es una raíz. Si a una tarjeta le llegan varias flechas, la primera es la de su madre y las otras son conexiones cruzadas; el plugin las marca en el archivo del canvas para que la jerarquía no cambie sola. Para elegir otra madre, clic derecho en la flecha → *Usar esta flecha como rama*.

Por defecto la flecha va de madre a hija. Si una flecha tiene la punta solo del lado de donde sale, la relación se invierte (se puede desactivar).

## Para tener en cuenta

**Qué cambia apenas lo instalás.** Nada de tus archivos cambia hasta que uses un comando, con dos excepciones que se apagan en las opciones: las flechas cambian de lado cuando arrastrás una tarjeta (*Reacomodar los lados de las flechas*, que guarda los lados nuevos en el archivo del canvas), y las flechas se dibujan con curvas suaves (*Curvas suaves*, solo visual). Las dos valen para todos los canvas, no solo para los mapas.


- **Las ramas colapsadas se guardan dentro del archivo del canvas**, en la tarjeta que las oculta. No las ven otros programas, ni Obsidian sin este plugin. **Antes de desinstalar el plugin, ejecutá *Expandir todas las ramas* en cada canvas que tenga ramas colapsadas.** Como red de seguridad, las últimas ramas colapsadas también quedan en los datos del plugin (*Restaurar ramas colapsadas perdidas*).
- El plugin usa partes internas del Canvas que no están en la API pública de Obsidian. Al colapsar una rama comprueba que los datos se hayan conservado y revierte el cambio si no, pero una actualización futura de Obsidian puede requerir actualizar el plugin. Se desarrolló sobre Obsidian 1.13 a 1.15.
- El plugin agrega algunas claves a tarjetas y flechas en el archivo del canvas (`mmCollapsed`, `mmCollapsedData`, `mmEdgeStyle`, `mmFontScale`, `mmLink`). Otros programas las ignoran.
- No usa la red, no tiene telemetría y no toca archivos fuera de tu bóveda. Las exportaciones quedan al lado del canvas y nunca pisan un archivo que no haya creado el plugin. Las instantáneas van a su propia carpeta; las automáticas vienen apagadas. Para que no aparezcan en la búsqueda ni en el grafo, agregá su carpeta en *Archivos excluidos*, dentro de las opciones de *Archivos y enlaces*.
- Las curvas suaves funcionan ajustando cómo dibuja Obsidian las flechas del canvas. Si una actualización de Obsidian cambia eso, las flechas simplemente vuelven a las curvas de Obsidian.
- No trae atajos de teclado por defecto. Asigná los tuyos en **Ajustes → Atajos de teclado** (buscá "Othoughts").
- No usa nada exclusivo de escritorio, así que debería cargar en el celular, pero solo está probado en escritorio. Mostrar el archivo exportado en el explorador es solo de escritorio.

## Idiomas

Inglés y castellano. El plugin sigue el idioma de Obsidian y se puede elegir uno en sus opciones.

## Instalación

Desde Obsidian: **Ajustes → Complementos de la comunidad → Explorar**, y buscar "Othoughts".

A mano: bajar `main.js`, `manifest.json` y `styles.css` de la última versión a `<bóveda>/.obsidian/plugins/othoughts/`.

## Desarrollo

```bash
npm install
npm run build   # arma main.js a partir de src/
npm test        # chequeos estáticos, pruebas y una prueba de estrés al azar
```

## Licencia

[MIT](LICENSE)
