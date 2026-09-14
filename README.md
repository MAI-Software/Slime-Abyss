# Blub! Mazmorras de Limo

Juego 3D para móvil controlado con el giroscopio (inspirado en Mercury y LocoRoco).
Un limo azul formado por muchos limitos se desliza por mazmorras de bloques hasta el tesoro.
Se puede dividir y reagrupar; los trozos que caen al vacío o se evaporan en el fuego se pierden.

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

## Cómo se juega
- Solo en horizontal. Joystick virtual (por defecto) o giroscopio, sin botones de acción.
  El mando fija una velocidad objetivo: arranque y frenado rápidos (el hielo resbala).
- El limo es un montón de limitos pequeños: lo que asoma por un borde se descuelga y cae, y el limo encoge.
- Cuchillas (`K` izquierda/derecha, `k` delante/detrás) y pinchos (`Y`) lo dividen; los trozos se reúnen al tocarse.
- Niveles lisos con caminos largos: los cambios de altura son solo bajadas.
- Cada piso da hasta 3 estrellas: llegar al tesoro, todas las monedas (`C`) y conservar el % de limo del nivel.
- Al terminar el último piso de un capítulo se muestra el desglose (estrellas, monedas, limo, tiempo y rango).

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
- En desarrollo: `__blub.quality()` muestra nivel de calidad y fps.

## Iluminación
Luz de cielo fría, sol cálido con sombras suaves y contraluz azul; tone mapping Neutral para colores cartoon.
Texturas proyectadas en coordenadas del nivel (sin UVs), giro aleatorio por casilla, oclusión ambiental
en suelos junto a muros, resplandores falsos (fuego, tesoro) y sombra de contacto bajo el limo.

## Despliegue (Cloudflare Pages conectado a GitHub)
Repo público: https://github.com/MAI-Software/mai-slime · rama `main`
- Framework preset: Vite (o ninguno) · Build command: `npm run build` · Output directory: `dist`
- Node: `.node-version` fija 22
