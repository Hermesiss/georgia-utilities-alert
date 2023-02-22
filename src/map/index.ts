import fs from "fs"
import stringSimilarity from "string-similarity"
import {GeoJsonData, Geometry, SavedStreet} from "./types";
import dotenv from "dotenv";
import polyline from "google-polyline";

import {staticMapUrl} from 'static-google-map';
import {Translator} from "../translator";
import routeLineTranslations from "./data/route_line_translated.json";
import aliases from "./data/aliases.json";
import {Alert, AreaTree} from "../batumiElectricity/types";
import {AlertColor} from "../imageGeneration";

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
  let empty = 0

  for (let road of obj.features) {
    if (road.properties.name == null || typeof road.properties.name === 'undefined') continue
    if (road.properties.route) continue // skip route lines
    const name = road.properties['name:en']
    if (name == null || typeof name === 'undefined') {
      if (!translatedRouteMap.has(road.properties.name)) {
        const t = await Translator.getTranslation(road.properties.name)
        translatedRouteMap.set(road.properties.name, t)
      }
      road.properties['name:en'] = translatedRouteMap.get(road.properties.name) || road.properties.name
      empty++
      continue
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

export function drawMapFromAlert(alert: Alert, color: AlertColor, city: string | null): string | null {
  const streets = getStreets(alert.areaTree, city)
  const realStreets = getRealStreets(streets)
  return drawMapFromStreets(realStreets, color)
}

export function drawMapFromInput(input: string, color: AlertColor): string | null {
  const streets = getStreetsFromInput(input)
  const realStreets = getRealStreets(streets)
  return drawMapFromStreets(realStreets, color)
}

export function drawMapFromStreets(realStreets: Set<string>, color: AlertColor): string | null {
  const geometry = createGeometry(realStreets)
  return drawMap(geometry, color)
}

/**
 * Get unique streets from area tree
 * @param tree
 * @param city if set, only streets from this city will be returned
 * @param level
 */
function getStreets(tree: AreaTree, city: string | null, level = 0): Set<string> {
  const result = new Set<string>()
  if (level > 5) return result
  if (level == 1) {
    if (city) {
      if (tree.name != city) {
        return result
      } else if (tree.children.size == 0) {
        result.add(tree.name) //if this is out city, and it has no children, add it
      }
    }
  }

  // do no add root
  if (level >= 2) {
    result.add(tree.name)
  }
  for (let child of tree.children.values()) {
    if (!city || child.name == city) {
      const streets = getStreets(child, null, level + 1)
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
 * @param streets
 * @return realStreets
 */
export function getRealStreets(streets: Set<string>): Set<string> {
  const threshold = 0.5

  const processed = new Set<string>()

  for (let street of streets) {
    const similar = stringSimilarity.findBestMatch(street, realStreetsNames)
    let found = 0
    const similarAlias = stringSimilarity.findBestMatch(street, aliasesNames)
    if (similarAlias.bestMatch.rating > 0.8) {
      if (processed.has(similarAlias.bestMatch.target)) {
        continue
      }

      const street = aliasesMap.get(similarAlias.bestMatch.target) ?? ""
      processed.add(street)
      continue
    }

    for (let best of similar.ratings) {
      if (best.rating > threshold) {
        found++
        console.log(`Find similar for ${street} is ${best.target} with ${best.rating}`)
        if (processed.has(best.target)) {
          continue
        }

        processed.add(best.target)
      }
    }
    if (found == 0) {
      const best = similar.bestMatch
      if (similar.bestMatch.rating > 0.3) {
        console.log(`Find BAD similar for ${street} ${JSON.stringify(best.target)} with ${best.rating}`)
        if (!processed.has(best.target)) {
          processed.add(best.target)
        }
      } else {
        console.log(`Not found similar for ${street}`)
      }
    }
  }

  return processed
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

/**
 *
 * @param geometries
 * @param selectedColor
 * @returns url for static map
 */
function drawMap(geometries: Geometry[], selectedColor: AlertColor): string | null {
  if (geometries.length == 0) return null
  const mapPaths: Path[] = []

  const paths: number[][][] = geometries.map(g => g.coordinates)

  for (let path of paths) {

    const points: [number, number][] = []
    for (let coord of path) {

      points.push([coord[1], coord[0]]) //TODO check
    }

    const encodedPoints = polyline.encode(points)
    mapPaths.push({points: `enc:${encodedPoints}`, color: selectedColor.line, weight: 4})
  }

  const url = staticMapUrl({
    key: googleMapApiKey,
    scale: 2,
    size: '640x640',
    format: 'png',
    maptype: 'roadmap',
    paths: mapPaths,
    language: 'en',
  });

  console.log(url)

  return url
}



