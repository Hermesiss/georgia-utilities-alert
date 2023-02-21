import fs from "fs"
import stringSimilarity from "string-similarity"
import dayjs from "dayjs";
import {GeoJsonData, Geometry, SavedStreet} from "./types";
import dotenv from "dotenv";
import polyline from "google-polyline";

import {staticMapUrl} from 'static-google-map';
import {loadImage, createCanvas} from 'canvas';
import {Translator} from "../translator";
import routeLineTranslations from "./data/route_line_translated.json";

dotenv.config();

const translatedRouteMap = new Map<string, string>(Object.entries(routeLineTranslations))

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

fs.readFile("./src/map/data/route_line.geojson", "utf8", async (err, data) => {
  if (err) {
    console.error(err)
    return
  }

  const obj: GeoJsonData = JSON.parse(data)
  console.log("Total items", obj.features?.length)
  let empty = 0

  for (let road of obj.features) {
    if (road.properties.name == null || typeof road.properties.name === 'undefined') continue
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

  console.log("Empty", empty)
  console.log("Total", realStreets.size)

  fs.writeFileSync("./src/map/data/route_line_translated.json", JSON.stringify(Object.fromEntries(translatedRouteMap), null, 2))

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
        console.log(`Find similar for ${street} is ${best.target} with ${best.rating}`)
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
  });

  console.log(url)

  drawImage(url, dayjs().format("YYYY.MM.DD"), "12:00 - 14:30", "@alerts_batumi")
})

function drawImage(url: string, date: string, time: string, watermark?: string) {
  const canvas = createCanvas(640, 760)
  const context = canvas.getContext('2d')
  loadImage(url).then((data) => {
    context.drawImage(data, 0, 120, 640, 640)

    context.textBaseline = 'top'
    context.textAlign = 'center'
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 640, 120)

    context.fillStyle = '#000'
    context.strokeStyle = '#222'
    context.shadowColor = '#00000040';
    context.shadowBlur = 3;

    const textX = 320
    context.font = '16pt Helvetica'
    context.fillText(date, textX, 14)
    context.lineWidth = 2;
    context.font = '30pt Helvetica'
    //context.strokeText(date, textX, 24)
    context.fillText(time, textX, 50)

    if (watermark) {
      context.lineWidth = 2;
      context.font = '16pt Helvetica'
      context.textAlign = 'left'
      context.fillStyle = '#FFFFFF'
      context.strokeStyle = '#00000055'
      context.shadowColor = '#00000080';
      context.fillText(watermark, 12, 132)
    }

    const imgBuffer = canvas.toBuffer('image/png')
    fs.writeFileSync('./dist/drawnImage.png', imgBuffer)
  })
}



