import * as THREE from 'three';

/*
  Material de bloques de la mazmorra (Phong: color + relieve + brillo, 2 texturas por píxel).
  - Proyección plana en coordenadas del nivel: arriba usa XZ, los lados XY o ZY; cada textura cubre
    2x2 casillas y es continua (las losas cruzan de un bloque a otro sin cortes).
    No depende de UVs y la textura no se desliza cuando la escena se inclina.
  - Variación de tono a gran escala (ruido en coordenadas del nivel) para que no se note la repetición.
  - Color por instancia (instanceColor) como tinte suave sobre la textura.
  - Mapa de normales orientado con los ejes del nivel y brillo especular sacado del color.
  - Lados más oscuros cuanto más bajan hacia el vacío.
  - Oclusión ambiental opcional en la cara de arriba: atributo por instancia `aAO`
    con 8 bits de vecinos más altos (W, E, N, S, NW, NE, SW, SE).
*/

export const AO_W = 1, AO_E = 2, AO_N = 4, AO_S = 8, AO_NW = 16, AO_NE = 32, AO_SW = 64, AO_SE = 128;

export interface SurfaceMaps { color: THREE.Texture; normal: THREE.Texture }

export interface BlockMaterialOptions {
  top: SurfaceMaps;
  side: SurfaceMaps;
  ao?: boolean;
  /** Brillo especular (Phong). */
  shininess?: number;
  specular?: number;
  /** Intensidad del relieve de los mapas de normales. */
  bump?: number;
}

export function createBlockMaterial(o: BlockMaterialOptions): THREE.MeshPhongMaterial {
  const { top, side, ao = false, shininess = 40, specular = 0x5a5048, bump = 1 } = o;
  const mat = new THREE.MeshPhongMaterial({ shininess, specular });
  if (ao) mat.defines = { USE_BLOCK_AO: '' };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTopMap = { value: top.color };
    shader.uniforms.uTopNormal = { value: top.normal };
    shader.uniforms.uSideMap = { value: side.color };
    shader.uniforms.uSideNormal = { value: side.normal };
    shader.uniforms.uBump = { value: bump };
    shader.vertexShader = `
      varying vec3 vLevelPos;
      varying vec3 vLevelNormal;
      varying vec3 vViewX;
      varying vec3 vViewY;
      varying vec3 vViewZ;
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
      // ejes del nivel en espacio de vista (para orientar el relieve)
      vViewX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
      vViewY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
      vViewZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
      #ifdef USE_BLOCK_AO
        vAO = aAO;
        vCellOrigin = vLevelPos.xz - position.xz - 0.5;
      #endif`);

    shader.fragmentShader = `
      uniform sampler2D uTopMap;
      uniform sampler2D uTopNormal;
      uniform sampler2D uSideMap;
      uniform sampler2D uSideNormal;
      uniform float uBump;
      varying vec3 vLevelPos;
      varying vec3 vLevelNormal;
      varying vec3 vViewX;
      varying vec3 vViewY;
      varying vec3 vViewZ;
      vec3 blockNormalSample;
      vec3 blockDetailSample;
      vec3 blockTan;
      vec3 blockBit;
      float blockGloss;
      vec3 levelToView(vec3 l) { return l.x * vViewX + l.y * vViewY + l.z * vViewZ; }
      float blockHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float blockNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(blockHash(i), blockHash(i + vec2(1.0, 0.0)), f.x), mix(blockHash(i + vec2(0.0, 1.0)), blockHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      #ifdef USE_BLOCK_AO
        varying float vAO;
        varying vec2 vCellOrigin;
        float aoEdge(float d) { return mix(0.5, 1.0, smoothstep(0.0, 0.45, d)); }
        float aoCorner(float d) { return mix(0.62, 1.0, smoothstep(0.0, 0.5, d)); }
      #endif
      ${shader.fragmentShader}`
      .replace('#include <map_fragment>', `
      vec3 bn = normalize(vLevelNormal);
      vec3 texel;
      if (bn.y > 0.5) {
        vec2 lp = vLevelPos.xz * 0.5;
        texel = texture2D(uTopMap, lp).rgb;
        blockNormalSample = texture2D(uTopNormal, lp).xyz;
        // detalle: el mismo relieve a otra escala, para que de cerca no se vea liso
        blockDetailSample = texture2D(uTopNormal, lp.yx * 3.7 + 0.31).xyz;
        blockTan = vec3(1.0, 0.0, 0.0);
        blockBit = vec3(0.0, 0.0, 1.0);
      } else {
        bool alongZ = abs(bn.x) > abs(bn.z);
        vec2 suv = (alongZ ? vec2(vLevelPos.z, -vLevelPos.y) : vec2(vLevelPos.x, -vLevelPos.y)) * 0.5;
        texel = texture2D(uSideMap, suv).rgb;
        blockNormalSample = texture2D(uSideNormal, suv).xyz;
        blockDetailSample = texture2D(uSideNormal, suv * 3.7 + 0.31).xyz;
        blockTan = alongZ ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
        blockBit = vec3(0.0, -1.0, 0.0);
        // más oscuro hacia abajo: da profundidad al vacío
        texel *= clamp(1.0 + vLevelPos.y * 0.32, 0.38, 1.0);
      }
      // manchas de tono muy suaves a varias casillas de escala
      float macro = blockNoise(vLevelPos.xz * 0.21 + vLevelPos.y * 0.13) * 0.65 + blockNoise(vLevelPos.xz * 0.63 - vLevelPos.y * 0.4) * 0.35;
      texel *= 0.9 + 0.2 * macro;
      // la piedra clara brilla, las juntas oscuras no
      blockGloss = smoothstep(0.25, 0.85, dot(texel, vec3(0.333)));
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
          blockGloss *= occ;
        }
      #endif`)
      .replace('#include <normal_fragment_maps>', `
      {
        vec3 mapN = blockNormalSample * 2.0 - 1.0;
        mapN.xy += (blockDetailSample.xy * 2.0 - 1.0) * 0.3;
        mapN.xy *= uBump;
        vec3 T = levelToView(blockTan);
        vec3 B = levelToView(blockBit);
        normal = normalize(T * mapN.x + B * mapN.y + normal * mapN.z);
      }`)
      .replace('#include <specularmap_fragment>', 'float specularStrength = blockGloss;');
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
