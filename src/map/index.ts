import fs from "fs"
import stringSimilarity from "string-similarity"
import dayjs from "dayjs";
import {FeaturesEntity, GeoJsonData, Geometry, SavedStreet} from "./types";
import dotenv from "dotenv";
import polyline from "google-polyline";

import {staticMapUrl} from 'static-google-map';
import {exec} from "child_process";
import open from "open";

dotenv.config();

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

let streets = new Set<string>()

const lines = input.split("\n")

const realStreets = new Map<string, SavedStreet[]>()


for (let line of lines) {
  const individual = line.split("/")
  for (let string of individual) {
    streets.add(string.trim())
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

const googleMapApiKey = process.env.GOOGLE_MAP_API_KEY || "";

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


  const start = dayjs()

  const targetStrings = Array.from(realStreets.keys());

  const threshold = 0.5

  const geometries: Geometry[] = []
  const processed = new Set<string>()

  const mapPaths: Path[] = []

  for (let street of streets) {
    const similar = stringSimilarity.findBestMatch(street, targetStrings)
    let found = 0
    for (let best of similar.ratings) {
      if (best.rating > threshold) {
        found++
        console.log(`Find similar for ${street} is ${JSON.stringify(best.target)} with ${best.rating}`)
        if (processed.has(best.target)) {
          continue
        }

        processed.add(best.target)
        const geometry = getGeometry(best.target);
        if (geometry)
          geometries.push(...geometry)
      }
    }
    if (found == 0) {
      const best = similar.bestMatch
      if (similar.bestMatch.rating > 0.3) {
        console.log(`Find BAD similar for ${street} ${JSON.stringify(best.target)} with ${best.rating}`)
        if (!processed.has(best.target)) {
          processed.add(best.target)
          const geometry = getGeometry(best.target);
          if (geometry) {
            geometries.push(...geometry)
          }
        }
      } else {
        console.log(`Not found similar for ${street}`)
      }
    }

  }
  const end = dayjs()
  const duration = end.diff(start, "ms")
  const paths: number[][][] = geometries.map(g => g.coordinates)

  console.log("Processed", processed)

  for (let path of paths) {

    const points: [number, number][] = []
    for (let coord of path) {

      points.push([coord[1], coord[0]]) //TODO check
    }
    /*    const randomColorFromPathStyles = () => {
          const colors = ["red", "blue", "green", "yellow", "pink", "purple", "orange", "black", "white"]
          return colors[Math.floor(Math.random() * colors.length)]
        }*/
    const encodedPoints = polyline.encode(points)
    mapPaths.push({points: `enc:${encodedPoints}`, color: 'red', weight: 5})

  }

  console.log(`Duration: ${duration}ms`)

  const url = staticMapUrl({
    key: googleMapApiKey,
    scale: 1,
    size: '640x640',
    format: 'png',
    maptype: 'roadmap',
    paths: mapPaths,
    language: 'en',
    /*pathGroups: [{
      color: 'red',
      paths: mapPaths
    }]*/
  });

  console.log(url)
})



