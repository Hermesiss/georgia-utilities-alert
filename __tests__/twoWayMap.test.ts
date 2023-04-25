import {TwoWayMap} from "../src/common/twoWayMap";

describe('TwoWayMap', () => {
  let twoWayMap: TwoWayMap<string, number>;

  beforeEach(() => {
    twoWayMap = new TwoWayMap<string, number>();
  });

  test('constructor with no arguments', () => {
    expect(twoWayMap.get('a')).toBeUndefined();
    expect(twoWayMap.revGet(1)).toBeUndefined();
  });

  test('constructor with Map argument', () => {
    const initialMap = new Map<string, number>([['a', 1], ['b', 2]]);
    twoWayMap = new TwoWayMap(initialMap);

    expect(twoWayMap.get('a')).toBe(1);
    expect(twoWayMap.revGet(2)).toBe('b');
  });

  test('add', () => {
    twoWayMap.add('a', 1);

    expect(twoWayMap.get('a')).toBe(1);
    expect(twoWayMap.revGet(1)).toBe('a');
  });

  test('get and revGet', () => {
    twoWayMap.add('a', 1);
    twoWayMap.add('b', 2);

    expect(twoWayMap.get('a')).toBe(1);
    expect(twoWayMap.get('b')).toBe(2);
    expect(twoWayMap.revGet(1)).toBe('a');
    expect(twoWayMap.revGet(2)).toBe('b');
  });

  test('keys and values', () => {
    twoWayMap.add('a', 1);
    twoWayMap.add('b', 2);

    expect(Array.from(twoWayMap.keys())).toEqual(['a', 'b']);
    expect(Array.from(twoWayMap.values())).toEqual([1, 2]);
  });

  test('clear', () => {
    twoWayMap.add('a', 1);
    twoWayMap.add('b', 2);
    twoWayMap.clear();

    expect(twoWayMap.get('a')).toBeUndefined();
    expect(twoWayMap.get('b')).toBeUndefined();
    expect(twoWayMap.revGet(1)).toBeUndefined();
    expect(twoWayMap.revGet(2)).toBeUndefined();
  });
});
