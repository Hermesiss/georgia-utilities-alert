export class TwoWayMap<K, V> {
  private map: Map<K, V>;
  private reverseMap: Map<V, K>;

  public keys(): IterableIterator<K> {
    return this.map.keys()
  }

  public values(): IterableIterator<V> {
    return this.reverseMap.keys()
  }

  constructor(map?: Map<K, V>) {
    if (!map) {
      map = new Map<K, V>()
    }
    this.map = map;
    this.reverseMap = new Map<V, K>();
    for (const [key, value] of map) {
      this.reverseMap.set(value, key)
    }
  }

  public add(key: K, value: V) {
    this.map.set(key, value)
    this.reverseMap.set(value, key)
  }

  public get(key: K) {
    return this.map.get(key);
  }

  public revGet(key: V) {
    return this.reverseMap.get(key);
  }

  public clear() {
    this.map.clear()
    this.reverseMap.clear()
  }
}
