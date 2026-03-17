export interface TerrainParams {
  extraCaves:   number;
  blobsMin:     number;
  blobsMax:     number;
  blobRMin:     number;
  blobRMax:     number;
  blobSpread:   number;
  rockClusters: number;
}

export interface LevelPreset {
  name:    string;
  width:   number;
  height:  number;
  terrain: TerrainParams;
}

export const LEVEL_PRESETS: LevelPreset[] = [
  {
    name: 'Normal',
    width: 800, height: 500,
    terrain: {
      extraCaves: 3,
      blobsMin: 8,  blobsMax: 14, blobRMin: 18, blobRMax: 42, blobSpread: 40,
      rockClusters: 30,
    },
  },
  {
    name: 'Large Open',
    width: 1600, height: 1000,
    terrain: {
      extraCaves: 8,
      blobsMin: 12, blobsMax: 20, blobRMin: 40, blobRMax: 80, blobSpread: 60,
      rockClusters: 20,
    },
  },
  {
    name: 'Tiny',
    width: 400, height: 250,
    terrain: {
      extraCaves: 1,
      blobsMin: 3,  blobsMax: 5,  blobRMin: 8,  blobRMax: 16, blobSpread: 15,
      rockClusters: 8,
    },
  },
];
