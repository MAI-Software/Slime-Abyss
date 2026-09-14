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
- `src/levels.ts` niveles en ASCII (leyenda en el archivo)
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
- Salida: `public/models/assets.glb`. El juego busca los objetos por nombre: no renombrar.

## Controles
Joystick virtual (por defecto) o giroscopio; se elige en el menú de niveles o en pausa.

## Camino a Play Store
- Todo va empaquetado (fuentes con @fontsource, modelos locales): funciona sin conexión.
- Pendiente: Capacitor Android, icono/splash, orientación horizontal fija, firma y AAB.
