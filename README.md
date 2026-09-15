# Slime Abyss

Juego 3D para móvil (joystick doble o giroscopio), inspirado en Mercury y LocoRoco.
Un limo formado por muchos limitos desciende por un abismo lleno de tesoros, capas y pruebas de todo tipo
(a veces, con enemigos). Se divide y se reagrupa; lo que cae al vacío o se evapora en el fuego se pierde.
Las gotitas sueltas pisan interruptores y saltan en plataformas, pero solo los trozos grandes recogen objetos.

## Stack
Vite + TypeScript + Three.js (sin motor de físicas: partículas con cohesión propia, render con MarchingCubes).

## Desarrollo
```
npm install
npm run dev      # abre en el móvil con la IP local (misma wifi)
npm run build
```
Controles de prueba en ordenador: flechas/WASD inclinar, espacio saltar, Q dividir, E unir.

## Estructura
- `src/level/format.ts` formato de nivel (JSON versionado), paleta de casillas `TILES`, validación, códigos para compartir
- `src/level/campaign/chapter1/*.json` pisos del Capítulo 1 · `src/level/campaign.ts` capítulos
- `src/hud-liquid.ts` vida como líquido en un frasco
- `src/blob-mesh.ts` superficie del limo (metaballs que solo procesan celdas cercanas)
- `src/fire.ts` fuego con shader, resplandor y chispas
- `src/world.ts` bloques, colisiones, fuego, interruptores, puertas, tesoro
- `src/slime.ts` física del limo, dividir/unir, render metaball y ojos
- `src/input.ts` giroscopio + botones
- `src/main.ts` escena, cámara, bucle, menús

## Modelos 3D (Blender)
Todos los modelos (bloques, fuego, plataformas, interruptores, puertas, cofre y la cara del limo con sus expresiones)
se hacen en Blender. El cuerpo del limo es procedural (metaballs) porque tiene que dividirse y unirse en tiempo real.

- Regenerar desde cero: `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/build_assets.py`
  (sobrescribe `blender/assets.blend`)
- Tras retocar `blender/assets.blend` a mano: `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b blender/assets.blend -P blender/export_assets.py`
- Salida: `src/models/assets.glb`. El juego busca los objetos por nombre: no renombrar.
- Texturas (losas, ladrillo, piedra): `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P blender/build_textures.py`
  → `src/textures/*.png` (256 px, repetibles, en gris: el juego las tiñe con el color de cada bloque). Se pueden repintar a mano.

## Menú
El menú es la habitación del limo, con estanterías y vitrinas donde se exponen sus coleccionables. Modo Historia · Colección · Mi limo (color, ojos, boca y mofletes; `src/look.ts`) · Perfil (Google) · Opciones (idioma, control, sonido, vibración, nivel de pruebas).
Idiomas: castellano, inglés, francés, alemán e italiano (`src/i18n/`; castellano es la base y todas las traducciones tienen las mismas claves).

## Cómo se juega
- Solo en horizontal. Joystick virtual (por defecto) o giroscopio, sin botones de acción.
  El mando fija una velocidad objetivo: arranque y frenado rápidos (el hielo resbala).
- El limo es un montón de limitos pequeños: lo que asoma por un borde se descuelga y cae, y el limo encoge.
- Cuchillas (`K` izquierda/derecha, `k` delante/detrás) y pinchos (`Y`) lo dividen; los trozos se reúnen al tocarse.
- Niveles lisos con caminos largos: los cambios de altura son solo bajadas.
- Cada piso da hasta 3 estrellas: llegar al tesoro, todas las monedas (`C`) y conservar el % de limo del nivel.
- Al terminar el último piso de un capítulo se muestra el desglose (estrellas, monedas, secretos, limo, tiempo y rango).
- Puertas: las del camino principal se abren con cualquier cantidad de limo sobre el interruptor.
  Solo las puertas secretas piden peso (`need`) y guardan un tesoro secreto (`G`, gema) opcional que no da estrella.
- Plataformas de salto: lanzan todo el trozo que está sobre la tapa o pegado a ella; solo se quedan gotas lejanas.
- Si el jugador agita mucho el mando, el limo se marea (ojos en espiral).
- No hay mínimo para completar un piso: solo se pierde si no queda nada de limo. Lo conservado cuenta para la 3ª estrella.
- Capítulos de 10 pisos. Cada capítulo tiene coleccionables (`src/collectibles.ts`): tesoros secretos, completar el capítulo, todas las monedas y el 100 %. Se exponen en la habitación del menú (huecos `slot_col_*` del modelo `menu_room`).

## Reacciones
| Casilla | Qué hace |
|---|---|
| `O` botella de aceite | el limo se vuelve aceite (color ámbar) |
| `F`/`X` fuego | limo normal: se evapora · con aceite: arde 12 s sin daño · congelado: se derrite |
| `W` plantas / `Z` bloque de hielo | el limo en llamas los elimina al tocarlos |
| `^ v < >` ventilador | corriente de 9 casillas: deshace el limo normal (sobre el vacío lo hunde) |
| `Q` aire frío | congela 30 s: rígido, no gotea y flota entero sobre las corrientes · apaga las llamas |

## Inicio de sesión con Google (Firebase)
Preparado pero desactivado hasta configurar un proyecto:
1. Firebase Console → nuevo proyecto → app web.
2. Authentication → activar Google; en Dominios autorizados añadir el dominio de Cloudflare Pages.
3. Copiar la config web a `.env.local` (ver `.env.example`) y a las variables de entorno de Cloudflare Pages.
Firebase se carga bajo demanda. En la futura app Android hará falta un plugin nativo de Firebase Auth para Capacitor.

## Camino a Play Store
- Todo va empaquetado (fuentes con @fontsource, modelos locales): funciona sin conexión.
- Pendiente: Capacitor Android, icono/splash, orientación horizontal fija, firma y AAB.

## Niveles y futuro creador de niveles
Los pisos se escriben como mapas ASCII en `scripts/author-levels.mjs` (`node scripts/author-levels.mjs` genera los JSON y avisa si algún tramo sube).

Cada nivel es un JSON (`LevelData`, `format: 1`) con dos capas del mismo tamaño:
`tiles` (un carácter por casilla, ver `TILES`) y `heights` (dígito 0-9, altura = dígito × 0,5).
El editor solo necesita: paleta desde `TILES`, pintar ambas capas, `validateLevel()` antes de guardar,
y `toShareCode()` / `decodeLevel()` para compartir. `createEmptyLevel()` y `autoWallHeights()` ayudan a empezar.

## Rendimiento
- Física a 60 Hz fija con interpolación al dibujar (suave en pantallas de 90/120 Hz).
- Sin basura por frame en física/render (evita tirones del recolector).
- Calidad adaptativa: si baja de ~45 fps reduce resolución y sombras; si va sobrado las sube.
- En desarrollo: `__slime.quality()` muestra nivel de calidad y fps.

## Iluminación
Luz de cielo fría, sol cálido con sombras suaves y contraluz azul; tone mapping Neutral para colores cartoon.
Texturas proyectadas en coordenadas del nivel (sin UVs), giro aleatorio por casilla, oclusión ambiental
en suelos junto a muros, resplandores falsos (fuego, tesoro) y sombra de contacto bajo el limo.

## Despliegue (Cloudflare Pages conectado a GitHub)
Repo público: https://github.com/MAI-Software/Slime-Abyss · rama `main`
- Framework preset: Vite (o ninguno) · Build command: `npm run build` · Output directory: `dist`
- Node: `.node-version` fija 22
