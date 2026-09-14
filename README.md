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
