import fs from "fs"
import stringSimilarity from "string-similarity"
import dayjs from "dayjs";
import {FeaturesEntity, GeoJsonData, Geometry, SavedStreet} from "./types";

const input =
  `Alexander Pushkin
  G.B.C. 173  /  Odzelashvili 7
  G.Brtskinvale
  George Brilliant
  Javakhishvili
  Javakhishvili1Shea
  Javakhishvili2shes
  Odzelashvili
  Pushkin  /  Tbel Abuseridze`

let streets: string[] = []

const lines = input.split("\n")

const realStreets = new Map<string, SavedStreet[]>()


for (let line of lines) {
  const individual = line.split("/")
  for (let string of individual) {
    streets.push(string.trim())
  }
}

console.log(streets)

const getGeometry = (name: string): Geometry[] | null => {
  const saved = realStreets.get(name)
  if (!saved) {
    return null
  }

  return saved.map(s => s.geometry)
}

fs.readFile("./src/map/data/route_line.geojson", "utf8", (err, data) => {
  if (err) {
    console.error(err)
    return
  }

  const obj: GeoJsonData = JSON.parse(data)
  console.log("Total items", obj.features?.length)
  let empty = 0

  for (let road of obj.features) {
    const name = road.properties['name:en']
    if (name == null || typeof name === 'undefined') {
      empty++
      continue
    }

    //if ( road.properties['name:en']==null) continue

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

  console.log("Empty", empty)
  console.log("Total", realStreets.size)

  //console.log("Geometry", realStreets.realStreets().next().value[0].geometry)
  const start = dayjs()
  //console.log(Array.from(realStreets.keys()))
  const targetStrings = Array.from(realStreets.keys());

  const threshold = 0.5

  const geometries: Geometry[] = []

  for (let street of streets) {
    const similar = stringSimilarity.findBestMatch(street, targetStrings)
    const best = similar.bestMatch
    console.log(`Find similar for ${street} is ${JSON.stringify(best.target)} with ${best.rating}`)
    if (best.rating > threshold) {
      const geometry = getGeometry(best.target);
      if (geometry)
        geometries.push(...geometry)
    }
  }
  const end = dayjs()
  const duration = end.diff(start, "ms")
  const paths: number[][][] = geometries.map(g => g.coordinates)
  //console.log(geometries.join("\n"))
  for (let path of paths) {
    console.log("PATH")
    for (let coord of path) {
      console.log(coord)
    }
  }
  //console.log("COORDINATES\n", paths.join("\n"))
  console.log(`Duration: ${duration}ms`)
})



