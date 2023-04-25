import {Geometry} from "../../src/map/types";
import {optimizeGeometries} from "../../src/map";

describe('optimizeGeometries', () => {
  test('should remove duplicates and retain the highest rated geometry', () => {
    const geometries: Geometry[] = [
      {type: "LineString", coordinates: [[0, 0], [1, 1]], rating: 3},
      {type: "LineString", coordinates: [[0, 0], [1, 1]], rating: 5},
      {type: "LineString", coordinates: [[1, 1], [2, 2]], rating: 2},
    ];

    const optimizedGeometries = optimizeGeometries(geometries);
    expect(optimizedGeometries).toEqual([
      {type: "LineString", coordinates: [[0, 0], [1, 1]], rating: 5},
      {type: "LineString", coordinates: [[1, 1], [2, 2]], rating: 2},
    ]);
  });

  test('should handle geometries without ratings', () => {
    const geometries: Geometry[] = [
      {type: "LineString", coordinates: [[0, 0], [1, 1]]},
      {type: "LineString", coordinates: [[0, 0], [1, 1]], rating: 3},
      {type: "LineString", coordinates: [[1, 1], [2, 2]]},
    ];

    const optimizedGeometries = optimizeGeometries(geometries);
    expect(optimizedGeometries).toEqual([
      {type: "LineString", coordinates: [[0, 0], [1, 1]], rating: 3},
      {type: "LineString", coordinates: [[1, 1], [2, 2]]},
    ]);
  });

  test('should return an empty array when given an empty input', () => {
    const geometries: Geometry[] = [];

    const optimizedGeometries = optimizeGeometries(geometries);
    expect(optimizedGeometries).toEqual([]);
  });
});
