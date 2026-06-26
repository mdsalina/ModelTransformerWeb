import type { JsonModelData, JsonGrid } from '../types';

/**
 * Filtra los ejes (grids) duplicados físicamente (con las mismas coordenadas extremas)
 * y renombra los ejes homónimos pero físicamente distintos agregando un sufijo numérico (_1, _2, etc.).
 */
export const cleanGridsInModel = (modelData: JsonModelData): JsonModelData => {
  if (!modelData || !modelData.grids) return modelData;

  const arePointsEqual = (pt1: [number, number], pt2: [number, number], tol = 0.001) => {
    return Math.abs(pt1[0] - pt2[0]) < tol && Math.abs(pt1[1] - pt2[1]) < tol;
  };

  const areGridsFisicamenteIguales = (g1: JsonGrid, g2: JsonGrid, tol = 0.001) => {
    return (
      (arePointsEqual(g1.p1, g2.p1, tol) && arePointsEqual(g1.p2, g2.p2, tol)) ||
      (arePointsEqual(g1.p1, g2.p2, tol) && arePointsEqual(g1.p2, g2.p1, tol))
    );
  };

  // 1. Filtrar duplicados físicos
  const physicallyUniqueGrids: JsonGrid[] = [];
  for (const grid of modelData.grids) {
    const isDuplicate = physicallyUniqueGrids.some(g => areGridsFisicamenteIguales(g, grid));
    if (!isDuplicate) {
      physicallyUniqueGrids.push({ ...grid });
    }
  }

  // 2. Identificar nombres de grilla duplicados
  const nameCounts: Record<string, number> = {};
  for (const grid of physicallyUniqueGrids) {
    nameCounts[grid.name] = (nameCounts[grid.name] || 0) + 1;
  }

  // 3. Renombrar grillas homónimas pero físicamente distintas
  const nameIndexTracker: Record<string, number> = {};
  const cleanedGrids = physicallyUniqueGrids.map(grid => {
    const count = nameCounts[grid.name];
    if (count > 1) {
      const currentIdx = (nameIndexTracker[grid.name] || 0) + 1;
      nameIndexTracker[grid.name] = currentIdx;
      return {
        ...grid,
        name: `${grid.name}_${currentIdx}`
      };
    }
    return grid;
  });

  return {
    ...modelData,
    grids: cleanedGrids
  };
};
