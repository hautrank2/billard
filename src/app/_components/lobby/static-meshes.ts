import * as THREE from "three";

// Keep independently hidden parts (the roof and near walls) in their own batch.
export const instanceStaticMeshes = (root: THREE.Group, excluded?: THREE.Group) => {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  const collect = (object: THREE.Object3D) => {
    if (object === excluded) return;
    if (object instanceof THREE.Mesh && !Array.isArray(object.material) && !object.material.transparent) {
      const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      const batch = batches.get(key) ?? [];
      batch.push(object);
      batches.set(key, batch);
    }
    for (const child of object.children) collect(child);
  };
  collect(root);
  for (const meshes of batches.values()) {
    const first = meshes[0];
    if (meshes.length < 2 || !first) continue;
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    meshes.forEach((mesh, index) => {
      batch.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      mesh.removeFromParent();
    });
    batch.computeBoundingSphere();
    root.add(batch);
  }
};
