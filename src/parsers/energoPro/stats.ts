import {Alert, AreaTree} from "./types";
import {OriginalAlert} from "../../mongo/originalAlert";
import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const getAreaStats = (areas: Array<AreaTree>): Map<string, number> => {
  const result = new Map<string, number>()
  for (let area of areas) {
    getStatsRecursively(area, result)
  }
  return result
}

function getStatsRecursively(area: AreaTree, result: Map<string, number>) {
  if (area.nameGe) {
    const current = result.get(area.nameGe) ?? 0
    result.set(area.nameGe, current + 1)
  }

  if (area.children) {
    for (let [key, value] of area.children) {
      const child = value
      if (!child) {
        continue
      }
      getStatsRecursively(child, result)
    }
  }
}

async function run(maxLevel = -1) {
  console.log("Loading all alerts")
  const mongoConnectString = process.env.MONGODB_CONNECT_STRING;

  if (!mongoConnectString) {
    throw new Error("MONGODB_CONNECT_STRING env variable is missing")
  }

  await mongoose.connect(mongoConnectString)

  const count = await OriginalAlert.count()
  console.log(`Total alerts: ${count}`)

  const maxPages = 10000;
  const pageSize = 100
  const pages = Math.min(Math.ceil(count / pageSize), maxPages)

  const allAreas = new Array<AreaTree>()
  const areaLines = new Map<string, number>()

  for (let i = 0; i < pages; i++) {
    const allAlerts = await OriginalAlert.find({}).skip(i * pageSize).limit(pageSize)
    console.log(`[${i + 1}/${pages}] Loaded ${allAlerts.length} alerts`)
    for (let originalAlert of allAlerts) {
      if (!originalAlert.disconnectionArea) continue
      const split = originalAlert.disconnectionArea.split(',');
      for (let j = split.length - 1; j >= 0; j--) {
        if (maxLevel > 0 && j >= maxLevel) {
          continue
        }
        const splitElement = split[j];
        const e = splitElement.trim()
        const current = areaLines.get(e) ?? 0
        areaLines.set(e, current + 1)
      }

      const tree = new AreaTree()
      tree.populate(split)

      allAreas.push(tree)
    }
  }

  for (let area of allAreas) {
    if (area.count() > 3) {
      break
    }
  }

  const stats =
    //areaLines
    getAreaStats(allAreas)
  const csv = new Array<string>()
  const length = stats.size
  let cnt = 0
  for (let [key, value] of stats) {
    console.log(++cnt, length, key, value)
    csv.push(`${key},${value}`)
  }
  fs.writeFileSync("./stats-deep.csv", csv.join("\n"), {encoding: "utf8"})
  console.log("Done")
  process.exit(0)
}

async function getAllRegions() {
  const mongoConnectString = process.env.MONGODB_CONNECT_STRING;

  if (!mongoConnectString) {
    throw new Error("MONGODB_CONNECT_STRING env variable is missing")
  }

  await mongoose.connect(mongoConnectString)

  // get only regionName from all alerts
  const regions = await OriginalAlert.find({}).select("regionName")
  console.log(regions)

  //count all unique regions
  const regionCount = new Map<string, number>()
  for (let region of regions) {
    const current = regionCount.get(region.regionName) ?? 0
    regionCount.set(region.regionName, current + 1)
  }

  console.log(regionCount)

  //const allAlerts = await OriginalAlert.find({}).limit(10000)
}

//run(1).then()
getAllRegions().then()
