import fs from "fs";
import {FeaturesEntity, GeoJsonData, Geometry} from "./types";
import {compareTwoStrings} from "string-similarity";

type StreetType = keyof typeof StreetTypes

export class MatchResult {
  original: string
  similarity: number = 0
  partSimilarity: Array<{ name: string; similarity: number, reason: string }> = []

  constructor(original: string) {
    this.original = MatcherStreet.removeStreetType(original)
    // TODO remove street type from original
  }

  toString(): string {
    return `similarity: ${this.similarity}, partSimilarity: ${this.partSimilarity.map((x) => `${x.name}: ${x.similarity} [${x.reason}]`).join(", ")}`
  }
}

const StreetTypes = {
  Street: {
    ge: ["ქუჩა", "ქუჩის", "ქუხა"],
    en: "Street",
  },
  Avenue: {
    ge: ["გამზირი"],
    en: "Avenue",
  },
  Lane: {
    ge: ["შესახვევი", "შეს"],
    en: "Lane",
  },
  DeadEnd: {
    ge: ["ჩიხი"],
    en: "DeadEnd",
  },
  Highway: {
    ge: ["მაგისტრალი", "გზატკეცილი"],
    en: "Highway",
  },
  Uphill: {
    ge: ["აღმართი"],
    en: "Uphill",
  },
  Square: {
    ge: ["მოედანი"],
    en: "Square",
  }
}

export class StreetMaps {
  public streetsByType = new Map<StreetType | null, MatcherStreet[]>()
  public entitiesByName = new Map<string, MatcherStreet>()
}

const streetMapsByCity = new Map<string, StreetMaps>()

export class MatcherStreet {
  public streetType: StreetType | null = null
  public name: string
  public streetParts: string[] = []
  public geometries: Geometry[] = []
  public features: FeaturesEntity[] = []

  public combined = 0

  constructor(feature: FeaturesEntity) {
    this.features.push(feature)
    const geoName = (feature.properties.name ?? feature.properties["name:ka"] ?? "").toString()
    console.log("Geo name", geoName)
    this.name = MatcherStreet.cleanName(geoName)
    this.streetType = MatcherStreet.getStreetType(this.name)
    this.streetParts = this.name.split(" ")
    if (this.streetType != null) {
      this.streetParts = this.streetParts.filter((x) => !StreetTypes[this.streetType as StreetType].ge.includes(x))
      // sort this.streetParts by length
      this.streetParts.sort((a, b) => b.length - a.length)
      //console.log("Extracted street parts: ", this.streetParts, " from ", this.name)
    }
    this.geometries.push(feature.geometry)
  }

  public static removeStreetType(street: string): string {
    for (let streetTypesKey in StreetTypes) {
      const streetType = StreetTypes[streetTypesKey as StreetType]
      for (let string of streetType.ge) {
        street = street.replace(string, "")
      }
    }
    return street
  }

  public static cleanName(geoName: string) {
    return geoName
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[“”"‘’'«»`„]+/g, '')
      .replace(/[-_]+/g, ' ')
  }

  public combine(feature: FeaturesEntity) {
    this.features.push(feature)
    this.geometries.push(feature.geometry)
    this.combined++
  }

  public static getStreetType(geoName: string): StreetType | null {
    for (let streetTypesKey in StreetTypes) {
      const streetType = StreetTypes[streetTypesKey as StreetType]
      const words = geoName.split(" ")
      for (let string of streetType.ge) {
        for (let word of words) {
          if (word === string) {
            return streetTypesKey as StreetType
          }
        }
      }
    }

    return null
  }

  getSimilarity(street: string): MatchResult {
    const matchResult = new MatchResult(street)
    const streetParts = street.replace(".", " ").split(" ").sort((a, b) => b.length - a.length)
    let globalSimilarity = 0
    let ignored = new Set<string>()
    for (let part of streetParts) {
      let reason = ""
      let similarity = 0
      for (let streetPart of this.streetParts) {
        if (ignored.has(streetPart)) continue
        if (streetPart.length <= similarity) continue

        if (streetPart === part) {
          similarity = part.length * 4
          reason = `Exact match of ${streetPart}`
          ignored.add(streetPart)
        } else if (streetPart.startsWith(part)) {

          const value = (streetPart.length - part.length) / 3 +
            part.length;

          if (value > similarity) {
            similarity = value
            reason = `${streetPart} Starts with ${part}`
          }

        } else {
          const comparing = compareTwoStrings(streetPart, part) * part.length * 2
          if (comparing > similarity) {
            reason = `Comparing ${streetPart} vs ${part}`
            similarity = Math.max(comparing, similarity)
          }
        }
      }

      matchResult.partSimilarity.push({name: part, similarity: similarity, reason})
      globalSimilarity += similarity
    }

    matchResult.similarity = globalSimilarity
    return matchResult
  }
}

function loadGeoJsons(city: string): GeoJsonData[] {
  const result = []


  const data = fs.readFileSync(`./src/map/data/${city}.geojson`, "utf8")
  const obj: GeoJsonData = JSON.parse(data)
  result.push(obj)

  return result
}

export const prepareCity = (city: string) => {
  const geoJsons = loadGeoJsons(city)
  const entityTypesCount = new Map<string | null | undefined, number>
  let hasName = 0
  let hasGeoName = 0
  let hasEnName = 0
  let hasRuName = 0

  const streetMaps = new StreetMaps()
  const entitiesByName = streetMaps.entitiesByName
  const streetsByType = streetMaps.streetsByType
  streetMapsByCity.set(city.toLowerCase(), streetMaps)

  for (let obj of geoJsons) {
    for (let feature of obj.features) {
      const name = feature.properties.name;
      if (name) hasName++
      const nameGe = feature.properties["name:ka"];
      if (nameGe) hasGeoName++
      const nameEn = feature.properties["name:en"];
      if (nameEn) hasEnName++
      const nameRu = feature.properties["name:ru"];
      if (nameRu) hasRuName++

      // continue if it has no names
      if (!name && !nameGe && !nameEn && !nameRu) continue

      const type = feature.properties.highway
      const count = entityTypesCount.get(type) ?? 0
      entityTypesCount.set(type, count + 1)
      const street = new MatcherStreet(feature)

      const existing = entitiesByName.get(street.name)
      if (existing) {
        existing.combine(feature)
        continue
      } else {
        entitiesByName.set(street.name, street)
      }

      if (!streetsByType.has(street.streetType)) {
        streetsByType.set(street.streetType, [])
      }

      streetsByType.get(street.streetType)?.push(street)
    }
  }

  /* const sorted = [...entityTypesCount.entries()].sort((a, b) => b[1] - a[1])
   console.log(sorted)*/

  streetsByType.forEach((streets, type) => {
    //console.log(type, streets.length, StreetTypes[type ?? "Street"].en)
  })

  //console.log("=== Nulls ===")

  const nulls = streetsByType.get(null)
  if (nulls) {
    nulls.forEach((street) => {
      //console.log(street.name)
      //console.log(street.features[0])
    })
  }

  /*console.log("=== Streets by name ===")

  const byNameSorted = [...entitiesByName.entries()].sort((a, b) => b[1].features.length - a[1].features.length).map((x) => {
    return {name: x[0], count: x[1].features.length}
  })
  console.log(byNameSorted)*/
}

export const prepare = () => {
  const files = ["batumi", "makhinjauri", "gonio"]
  for (let file of files) {
    prepareCity(file)
  }
}

prepare()

export const hasIntersection = (street: string): { result: boolean, street1?: string, street2?: string } => {
  const crossroadWords = ["კვეთა", "გადაკვეთა"]

  if (crossroadWords.some((word) => street.includes(word))) {
    crossroadWords.forEach((word) => {
      street = street.replace(word, "")
    })

    const streets = street.split(" და ")
    if (streets.length === 2) {
      return {result: true, street1: streets[0], street2: streets[1]}
    }
  }

  return {result: false}
}

/**
 * Returns all matches for given street
 * @param rawStreet
 * @param cities - Cities to search in. If null, searches in all cities
 */
export const getAllMatches = (rawStreet: string, cities: string[] | null): Array<{
  street: MatcherStreet,
  similarity: MatchResult
}> => {
  rawStreet = MatcherStreet.cleanName(rawStreet)
  const streetType = MatcherStreet.getStreetType(rawStreet)
  const results = new Array<{ street: MatcherStreet, similarity: MatchResult }>()

  let types: string[];

  types = Object.keys(StreetTypes);

  if (cities === null) {
    cities = Object.keys(streetMapsByCity)
  }

  /*if (streetType) {
    types = [streetType]
  } else {
    types = Object.keys(StreetTypes);
  }*/

  for (let type of types) {
    for (let city of cities) {
      const streets = streetMapsByCity.get(city.toLowerCase())?.streetsByType.get(type as StreetType)
      if (!streets) continue
      for (let street of streets) {
        const similarity = street.getSimilarity(rawStreet)
        results.push({street, similarity})
      }
    }
  }

  const sorted = results.sort((a, b) => b.similarity.similarity - a.similarity.similarity)
  const sliced = sorted.slice(0, 10).map((x) => {
    return {name: x.street.name, similarity: x.similarity.toString()}
  })
  console.log("SLICED", sliced)
  return sorted
}

/**
 * Returns best matches for given street
 * @param rawStreet
 * @param cities - Cities to search in. If null, searches in all cities
 */
export const getBestMatches = (rawStreet: string, cities: string[] | null): Array<{
  street: MatcherStreet,
  similarity: MatchResult
}> => {
  const result = []
  const intersections = hasIntersection(rawStreet)
  if (intersections.result) {
    if (intersections.street1 === undefined || intersections.street2 === undefined) throw new Error("Intersection is not defined")
    const street1 = getAllMatches(intersections.street1, cities)[0]
    const street2 = getAllMatches(intersections.street2, cities)[0]
    if (street1)
      result.push(street1)
    if (street2)
      result.push(street2)
  } else {
    const street = getAllMatches(rawStreet, cities)[0]
    if (street)
      result.push(street)
  }
  console.log(`Return ${result.length} results for ${rawStreet}`)
  return result
}


