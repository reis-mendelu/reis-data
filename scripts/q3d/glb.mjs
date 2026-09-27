// A minimal glTF 2.0 binary (.glb) writer: untextured PBR materials, flat-shaded
// triangle primitives, one named node per group. Nothing else — no textures, no
// Draco/KTX2, because decoding either would force `wasm-unsafe-eval` into the
// extension's CSP.

/**
 * @param {object} model
 * @param {{name: string, color: number[], metallic?: number, roughness?: number}[]} model.materials
 *   color is linear RGBA 0..1.
 * @param {{name: string, extras?: object, primitives: {material: number, positions: number[], normals: number[], indices: number[]}[]}[]} model.nodes
 * @returns {Uint8Array}
 */
export function writeGlb({ materials, nodes, generator }) {
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [];
  const accessors = [];

  function addView(typed, target) {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, target });
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  }

  function vec3Accessor(values) {
    const arr = new Float32Array(values);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < arr.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], arr[i + k]);
        max[k] = Math.max(max[k], arr[i + k]);
      }
    accessors.push({ bufferView: addView(arr, 34962), componentType: 5126, count: arr.length / 3, type: 'VEC3', min, max });
    return accessors.length - 1;
  }

  function indexAccessor(values, vertexCount) {
    const arr = vertexCount > 65535 ? new Uint32Array(values) : new Uint16Array(values);
    accessors.push({
      bufferView: addView(arr, 34963),
      componentType: vertexCount > 65535 ? 5125 : 5123,
      count: arr.length,
      type: 'SCALAR',
    });
    return accessors.length - 1;
  }

  const meshes = [];
  const gltfNodes = [];
  for (const node of nodes) {
    const primitives = node.primitives
      .filter((p) => p.indices.length > 0)
      .map((p) => ({
        attributes: { POSITION: vec3Accessor(p.positions), NORMAL: vec3Accessor(p.normals) },
        indices: indexAccessor(p.indices, p.positions.length / 3),
        material: p.material,
        mode: 4,
      }));
    if (primitives.length === 0) continue;
    meshes.push({ name: node.name, primitives });
    gltfNodes.push({ name: node.name, mesh: meshes.length - 1, ...(node.extras ? { extras: node.extras } : {}) });
  }

  const json = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes,
    materials: materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.color,
        metallicFactor: m.metallic ?? 0,
        roughnessFactor: m.roughness ?? 0.9,
      },
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };

  const bin = new Uint8Array(Math.ceil(byteLength / 4) * 4);
  let off = 0;
  for (const c of chunks) {
    bin.set(c, off);
    off += c.byteLength;
  }
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }

  const total = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  const binStart = 20 + jsonBytes.byteLength;
  dv.setUint32(binStart, bin.byteLength, true);
  dv.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
  out.set(bin, binStart + 8);
  return out;
}

/** Parse a .glb back into { json, bin } — used by the tests. */
export function readGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  const bin = bytes.subarray(28 + jsonLen, 28 + jsonLen + binLen);
  return { json, bin };
}
