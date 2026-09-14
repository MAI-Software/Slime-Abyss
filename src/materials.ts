import * as THREE from 'three';

/*
  Material de bloques de la mazmorra (barato para móvil: Lambert + 1 textura por píxel).
  - Proyección plana en coordenadas del nivel: arriba usa XZ, los lados XY o ZY.
    No depende de UVs y la textura no se desliza cuando la escena se inclina.
  - Color por instancia (instanceColor) multiplicado por la textura en gris.
  - Lados más oscuros cuanto más bajan hacia el vacío.
  - Oclusión ambiental opcional en la cara de arriba: atributo por instancia `aAO`
    con 8 bits de vecinos más altos (W, E, N, S, NW, NE, SW, SE).
*/

export const AO_W = 1, AO_E = 2, AO_N = 4, AO_S = 8, AO_NW = 16, AO_NE = 32, AO_SW = 64, AO_SE = 128;

export interface BlockMaterialOptions {
  top: THREE.Texture;
  side: THREE.Texture;
  ao?: boolean;
}

export function createBlockMaterial({ top, side, ao = false }: BlockMaterialOptions): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial();
  if (ao) mat.defines = { USE_BLOCK_AO: '' };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTopMap = { value: top };
    shader.uniforms.uSideMap = { value: side };
    shader.vertexShader = `
      varying vec3 vLevelPos;
      varying vec3 vLevelNormal;
      #ifdef USE_BLOCK_AO
        attribute float aAO;
        varying float vAO;
        varying vec2 vCellOrigin;
      #endif
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vLevelPos = (instanceMatrix * vec4(position, 1.0)).xyz;
        vLevelNormal = mat3(instanceMatrix) * normal;
      #else
        vLevelPos = position;
        vLevelNormal = normal;
      #endif
      #ifdef USE_BLOCK_AO
        vAO = aAO;
        vCellOrigin = vLevelPos.xz - position.xz - 0.5;
      #endif`);

    shader.fragmentShader = `
      uniform sampler2D uTopMap;
      uniform sampler2D uSideMap;
      varying vec3 vLevelPos;
      varying vec3 vLevelNormal;
      #ifdef USE_BLOCK_AO
        varying float vAO;
        varying vec2 vCellOrigin;
        float aoEdge(float d) { return mix(0.5, 1.0, smoothstep(0.0, 0.45, d)); }
        float aoCorner(float d) { return mix(0.62, 1.0, smoothstep(0.0, 0.5, d)); }
      #endif
      ${shader.fragmentShader}`.replace('#include <map_fragment>', `
      vec3 bn = normalize(vLevelNormal);
      vec3 texel;
      if (bn.y > 0.5) {
        // cada casilla gira la textura al azar (0/90/180/270°): rompe la repetición
        vec2 cellId = floor(vLevelPos.xz);
        vec2 lp = vLevelPos.xz - cellId;
        int rot = int(fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453) * 4.0);
        if (rot == 1) lp = vec2(1.0 - lp.y, lp.x);
        else if (rot == 2) lp = 1.0 - lp;
        else if (rot == 3) lp = vec2(lp.y, 1.0 - lp.x);
        // derivadas de la coordenada continua: sin costuras de mipmap en los bordes
        texel = textureGrad(uTopMap, lp, dFdx(vLevelPos.xz), dFdy(vLevelPos.xz)).rgb;
      } else {
        vec2 suv = abs(bn.x) > abs(bn.z) ? vec2(vLevelPos.z, -vLevelPos.y) : vec2(vLevelPos.x, -vLevelPos.y);
        texel = texture2D(uSideMap, suv).rgb;
        // más oscuro hacia abajo: da profundidad al vacío
        texel *= clamp(1.0 + vLevelPos.y * 0.32, 0.38, 1.0);
      }
      diffuseColor.rgb *= texel;
      #ifdef USE_BLOCK_AO
        if (bn.y > 0.5) {
          vec2 lc = vLevelPos.xz - vCellOrigin;
          int m = int(vAO + 0.5);
          float occ = 1.0;
          if ((m & ${AO_W}) != 0) occ *= aoEdge(lc.x);
          if ((m & ${AO_E}) != 0) occ *= aoEdge(1.0 - lc.x);
          if ((m & ${AO_N}) != 0) occ *= aoEdge(lc.y);
          if ((m & ${AO_S}) != 0) occ *= aoEdge(1.0 - lc.y);
          if ((m & ${AO_NW}) != 0) occ *= aoCorner(length(lc));
          if ((m & ${AO_NE}) != 0) occ *= aoCorner(length(lc - vec2(1.0, 0.0)));
          if ((m & ${AO_SW}) != 0) occ *= aoCorner(length(lc - vec2(0.0, 1.0)));
          if ((m & ${AO_SE}) != 0) occ *= aoCorner(length(lc - vec2(1.0, 1.0)));
          diffuseColor.rgb *= occ;
        }
      #endif`);
  };
  // shaders distintos según AO: que three no reutilice el programa equivocado
  mat.customProgramCacheKey = () => (ao ? 'block-ao' : 'block');
  return mat;
}

/** Degradado radial aditivo sobre un disco (resplandor de fuego, tesoro...). */
export function createGlowMaterial(color: number, time: { value: number }, pulse = 1): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `varying vec3 vGlowPos;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowPos = position;');
    shader.fragmentShader = `uniform float uTime;\nvarying vec3 vGlowPos;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        float r = clamp(length(vGlowPos.xz) / 0.5, 0.0, 1.0);
        diffuseColor.a *= pow(1.0 - r, 2.4) * (1.0 - ${pulse.toFixed(2)} * 0.25 * (0.5 + 0.5 * sin(uTime * 9.0 + vGlowPos.x * 30.0)));`);
  };
  mat.customProgramCacheKey = () => `glow-${pulse}`;
  return mat;
}

/** Sombra de contacto suave (disco oscuro) para apoyar objetos en el suelo. */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
