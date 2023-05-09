import fs from "fs"
import stringSimilarity, {Rating} from "string-similarity"
import {GeoJsonData, Geometry, SavedStreet, StreetFinderResult} from "./types";
import dotenv from "dotenv";
import polyline from "google-polyline";

import {staticMapUrl} from 'static-google-map';
import {Translator} from "../translator";
import routeLineTranslations from "./data/route_line_translated.json";
import aliases from "./data/aliases.json";
import {Alert, AreaTree} from "../batumiElectricity/types";
import {AlertColor} from "../imageGeneration";
import tinygradient from "tinygradient";
import {getBestMatches} from "./matcher";

dotenv.config();

const translatedRouteMap = new Map<string, string>(Object.entries(routeLineTranslations))
const aliasesMap = new Map<string, string>(Object.entries(aliases))
const aliasesNames = Array.from(aliasesMap.keys());

const realStreets = new Map<string, SavedStreet[]>()
let realStreetsNames: string[]

function getGeometry(name: string): Geometry[] | null {
  const saved = realStreets.get(name)
  if (!saved) {
    return null
  }

  return saved.map(s => s.geometry)
}

const googleMapApiKey = process.env.GOOGLE_MAP_API_KEY || "";

export async function prepareGeoJson() {
  const data = fs.readFileSync("./src/map/data/route_line.geojson", "utf8")
  const obj: GeoJsonData = JSON.parse(data)
  console.log("Total items", obj.features?.length)

  for (let road of obj.features) {
    if (road.properties.name == null || typeof road.properties.name === 'undefined') continue
    if (road.properties.route) continue // skip route lines
    let name = road.properties['name:en']
    if (name == null || typeof name === 'undefined') {
      if (!translatedRouteMap.has(road.properties.name)) {
        const t = await Translator.getTranslation(road.properties.name)
        translatedRouteMap.set(road.properties.name, t)
      }
      road.properties['name:en'] = translatedRouteMap.get(road.properties.name) || road.properties.name
      name = road.properties['name:en']
    }

    const saved = {
      name: road.properties.name,
      en: name,
      ru: road.properties['name:ru'],
      geometry: road.geometry
    }

    if (!realStreets.has(name)) {
      realStreets.set(name, [])
    }

    realStreets.get(name)?.push(saved)
  }

  fs.writeFileSync("./src/map/data/route_line_translated.json", JSON.stringify(Object.fromEntries(translatedRouteMap), null, 2))
  realStreetsNames = Array.from(realStreets.keys());
}

export async function drawMapFromAlert(alert: Alert, color: AlertColor, cityGe: string | null): Promise<string | null> {
  const streets = await getStreets(alert.areaTree, cityGe)
  const result: StreetFinderResult[] = [];
  getRealStreets(streets, result)
  return drawMapFromStreetFinderResults(result, color)
}

export function drawMapFromInput(input: string, color: AlertColor): string | null {
  const streets = getStreetsFromInput(input)

  const result: StreetFinderResult[] = [];
  getRealStreets(streets, result)
  return drawMapFromStreetFinderResults(result, color)
}

export function drawMapFromStreets(realStreets: Set<string>, color: AlertColor): string | null {
  const geometry = createGeometry(realStreets)
  return drawMap(geometry, color)
}

export function drawMapFromStreetFinderResults(results: StreetFinderResult[], color: AlertColor): string | null {
  const geometry = createGeometryFromStreetFinderResults(results)
  return drawMap(geometry, color)
}

/**
 * Get unique streets from area tree
 * @param tree
 * @param cityGe if set, only streets from this cityGe will be returned
 * @param level
 * @return streets - unique streets, georgian names
 */
export async function getStreets(tree: AreaTree, cityGe: string | null, level = 0): Promise<Set<string>> {
  await tree.prepareTranslation()
  if (!tree.nameGe) throw new Error("tree.nameGe is null")
  const result = new Set<string>()
  if (level > 5) return result
  if (level == 1) {
    if (cityGe) {
      if (tree.nameGe != cityGe) {
        return result
      } else if (tree.children.size == 0) {
        result.add(tree.nameGe) //if this is our cityGe, and it has no children, add it
      }
    }
  }

  // do no add root
  if (level >= 2) {
    result.add(tree.nameGe)
  }
  for (let child of tree.children.values()) {
    if (!cityGe || child.nameGe == cityGe) {
      const streets = await getStreets(child, null, level + 1)
      streets.forEach(s => result.add(s))
    }
  }

  return result
}

export function getStreetsFromInput(input: string): Set<string> {
  let streets = new Set<string>()

  const lines = input.split("\n")

  for (let line of lines) {
    const individual = line.split("/")
    for (let string of individual) {
      streets.add(string.trim())
    }
  }

  return streets
}

/**
 *
 * @param streets - streets to draw, georgian names
 * @param result - if set, will be filled with match results
 * @return realStreets
 */
export function getRealStreets(streets: Set<string>, result: StreetFinderResult[] | null = null): Set<string> {
  const threshold = 0.25

  const processed = new Set<string>()

  for (let street of streets) {
    const matches = getBestMatches(street)
    if (matches.length == 0) continue

    for (let match of matches) {
      let relativeRating = match.similarity.similarity / match.similarity.original.length / 4
      console.log(`Similarity: ${match.similarity.similarity} / ${match.similarity.original} / 4 = ${relativeRating}`)
      console.log("relativeRating", relativeRating, match.street.name, street)
      // clamp to 1
      relativeRating = Math.min(relativeRating, 1)
      if (relativeRating > threshold) {
        if (result) {
          result.push({input: street, match: match.street.name, rating: relativeRating, street: match.street})
          processed.add(match.street.name)
        }
      }
    }
  }

  return processed

  /*for (let street of streets) {
    const similar = stringSimilarity.findBestMatch(street, realStreetsNames)
    const similarAlias = stringSimilarity.findBestMatch(street, aliasesNames)
    if (similarAlias.bestMatch.rating > 0.8) {
      if (!processed.has(similarAlias.bestMatch.target) || result != null) {
        const realStreet = aliasesMap.get(similarAlias.bestMatch.target) ?? ""
        processed.add(realStreet)
        result?.push({input: street, match: realStreet, rating: similarAlias.bestMatch.rating})
      }
      continue

    }

    if (similar.bestMatch.rating > 0.9) {
      // found a perfect match in aliases
      if (processed.has(similar.bestMatch.target) && result == null) {
        // we already processed this street
        continue
      }


      processed.add(similar.bestMatch.target)
      result?.push({input: street, match: similar.bestMatch.target, rating: similar.bestMatch.rating})
      continue
    }

    let bestMatches = new Array<Rating>()

    for (let best of similar.ratings) {
      // trying to find matches with rating > threshold
      if (best.rating > threshold) {
        console.log(`Find similar for ${street} is ${best.target} with ${best.rating}`)

        bestMatches.push(best)
      }
    }
    if (bestMatches.length != 0) {
      // we found some matches, need to take 3 best matches
      const matches = bestMatches.sort((a, b) => b.rating - a.rating).slice(0, 3)
      for (let match of matches) {
        if (processed.has(match.target) && result == null) {
          continue
        }

        processed.add(match.target)
        result?.push({input: street, match: match.target, rating: match.rating})
      }

    } else {
      // no matches found, we can take best match with rating > 0.3
      const best = similar.bestMatch
      if (similar.bestMatch.rating > 0.3) {
        console.log(`Find BAD similar for ${street} ${JSON.stringify(best.target)} with ${best.rating}`)
        if (!processed.has(best.target)) {
          processed.add(best.target)
        }
        result?.push({input: street, match: best.target, rating: best.rating})
      } else {
        console.log(`Not found similar for ${street}`)
      }
    }
  }

  return processed*/
}

/**
 *
 * @param realStreets
 */
function createGeometry(realStreets: Set<string>): Geometry[] {
  const geometries: Geometry[] = []

  for (let string of realStreets) {
    const geometry = getGeometry(string);
    if (geometry) {
      geometries.push(...geometry)
    }
  }

  return geometries
}

function createGeometryFromStreetFinderResults(results: StreetFinderResult[]): Geometry[] {
  const geometries: Geometry[] = []

  for (let result of results) {
    const geometry: Geometry[] = JSON.parse(JSON.stringify(result.street.geometries))
    if (geometry) {
      for (let g of geometry) {
        if (g.rating && g.rating > result.rating)
          continue
        g.rating = result.rating
        geometries.push(g)
      }
    }
  }

  return geometries
}

export function optimizeGeometries(geometries: Geometry[]): Geometry[] {
  const resultMap: Map<string, Geometry> = new Map();

  geometries.forEach((geometry) => {
    // Convert coordinates array to a string, so it can be used as a key in the resultMap
    const key = JSON.stringify(geometry.coordinates);

    if (resultMap.has(key)) {
      // If the key already exists, compare the rating and update the value if the new rating is higher
      const existingGeometry = resultMap.get(key);
      if (existingGeometry) {
        if (!geometry.rating) {
          // If the new geometry has no rating, skip it
          return;
        }
        if (!existingGeometry.rating || geometry.rating > existingGeometry.rating) {
          resultMap.set(key, geometry);
        }
      }
    } else {
      // If the key doesn't exist, add the geometry to the resultMap
      resultMap.set(key, geometry);
    }
  });

  // Convert the resultMap values back to an array of Geometry objects
  console.log(`Optimized geometries from ${geometries.length} to ${resultMap.size}`)
  return Array.from(resultMap.values());
}

/**
 *
 * @param geometries
 * @param selectedColor
 * @returns url for static map
 */
function drawMap(geometries: Geometry[], selectedColor: AlertColor): string | null {
  if (geometries.length == 0) return null
  const optGeometries = optimizeGeometries(geometries)
  const mapPaths: Path[] = []

  const gradient = tinygradient([
    {color: '#000000', pos: 0.0},
    {color: '#0000ff', pos: 0.5},
    {color: '#ff0000', pos: 0.7},
    {color: '#ff5800', pos: 1},
  ])

  for (let geometry of optGeometries) {
    const points: [number, number][] = []
    const path = geometry.coordinates
    for (let coord of path) {
      points.push([coord[1], coord[0]]) //TODO check
    }

    const gradientColor = gradient.rgbAt(geometry.rating ?? 1)
    console.log(`Color for ${geometry.rating} is ${gradientColor.toHex()}`)

    const color = "0x" + gradientColor.toHex() + 'ff'

    const encodedPoints = polyline.encode(points)
    mapPaths.push({points: `enc:${encodedPoints}`, color: color, weight: 4})
  }

  let url = staticMapUrl({
    key: googleMapApiKey,
    scale: 2,
    size: '640x640',
    format: 'png',
    maptype: 'roadmap',
    paths: mapPaths,
    language: 'en',
  });

  //if url is more than 16383 characters, it will be truncated
  url = url.substring(0, 16383)

  console.log(url)

  return url
}



