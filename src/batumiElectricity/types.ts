import {Translator} from "../translator";
import cities from "./cities.json";
import districts from "./districts.json";
import {IOriginalAlert} from "../mongo/originalAlert";
import {HydratedDocument} from "mongoose";
import dayjs, {Dayjs} from "dayjs";

const citiesMap = new Map(Object.entries(cities))
const newCitiesMap = new Map()
const districtsMap = new Map(Object.entries(districts))
const newDistrictsMap = new Map()

export class AlertDiff {
  oldAlert: Alert | null;
  newAlert: Alert;
  translatedAlert: Alert
  diffs = new Array<DiffElement>()
  deletedAlert?: HydratedDocument<IOriginalAlert>
}

export class DiffElement {
  property: string
  from: string
  to: string
}

export class AlertsRoot {
  status: number;
  data: Array<Alert>;
}

export enum PlanType {
  Planned = 1,
  Unplanned = 2 | 3
}

export class AreaTree {
  name: string;
  children = new Map<string, AreaTree>()

  public get(name: string) {
    return this.children.get(name)
  }

  public set(name: string, area: AreaTree) {
    this.children.set(name, area)
    // sort children by key
    this.children = new Map([...this.children.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  }

  constructor(name: string = "") {
    this.name = name;
  }

  has(name: string) {
    return this.children.has(name)
  }
}

export class Alert {
  taskId: number;
  taskName: string;
  taskNote?: string;
  scEffectedCustomers?: string;
  disconnectionArea: string;
  regionName: string;
  scName: string;
  disconnectionDate: string;
  reconnectionDate: string;
  dif?: string;
  taskType: string;

  createdDate?: Date
  deletedDate?: Date

  startDate: Dayjs;
  endDate: Dayjs;
  planType: PlanType

  areaTree: AreaTree = new AreaTree("Root")
  citiesList = new Set<string>()

  static printTranslations() {
    if (newDistrictsMap.size > 0)
      console.log("=== NEW TRANSLATED DISTRICTS\n", JSON.stringify(Object.fromEntries(newDistrictsMap)))

    if (newCitiesMap.size > 0)
      console.log("=== NEW TRANSLATED CITIES\n", JSON.stringify(Object.fromEntries(newCitiesMap)))
  }

  static async from(from: Alert): Promise<Alert> {
    const result = Object.assign(new Alert(), {...from})
    await result.init()
    return result
  }

  static async fromOriginal(original: HydratedDocument<IOriginalAlert>, init = true): Promise<Alert> {
    let res = new Alert();

    res.taskId = original.taskId
    res.taskName = original.taskName
    res.taskNote = original.taskNote
    res.scEffectedCustomers = original.scEffectedCustomers
    res.disconnectionArea = original.disconnectionArea
    res.regionName = original.regionName
    res.scName = original.scName
    res.disconnectionDate = original.disconnectionDate
    res.reconnectionDate = original.reconnectionDate
    res.dif = original.dif
    res.taskType = original.taskType
    res.createdDate = original.createdDate
    res.deletedDate = original.deletedDate

    if (init)
      await res.init()

    return res
  }

  public getPlanEmoji() {
    let text = ""
    if (this.deletedDate) text += "????????? "
    switch (this.planType) {
      case PlanType.Planned:
        text += "??????"
        break
      case PlanType.Unplanned:
        text += "??????"
        break
    }
    return text
  }

  public getPlanText() {
    switch (this.planType) {
      case PlanType.Planned:
        return "Planned"
      case PlanType.Unplanned:
        return "Emergency"
    }
  }

  public formatStartTime() {
    return this.startDate.format("HH:mm")
  }

  public formatEndTime() {
    return this.endDate.format("HH:mm")
  }

  public async formatSingleAlert(): Promise<string> {
    const taskName = await Translator.getTranslation(this.taskName)
    const regionName = await Translator.getTranslation(this.regionName)
    const cities = Array.from(this.citiesList).join(", ");
    const planText = this.planType != PlanType.Planned ? ` _${this.getPlanText()}_ ` : ""
    const areas = await this.formatAreas(this.areaTree);
    const taskNote = this.taskNote ? await Translator.getTranslation(this.taskNote) : ""
    const created = this.createdDate ? "*Created:* " + dayjs(this.createdDate).format("YYYY-MM-DD HH:mm") + "\n\n" : ""
    const deleted = this.deletedDate ? "*Deleted:* " + dayjs(this.deletedDate).format("YYYY-MM-DD HH:mm") + "\n\n" : ""

    return `${this.getPlanEmoji()}${planText} *[${this.scName}]* ${taskName}\n\n` +
      `*Start:* ${this.disconnectionDate}\n\n` +
      `*End:* ${this.reconnectionDate}\n\n` +
      `*Region:* ${regionName}\n\n` +
      `*Cities:* ${cities}\n\n` +
      `*Area:*\n${areas}\n` +
      `${this.taskId} ` + taskNote + "\n\n" +
      created + deleted
  }

  public async formatAreas(areaTree: AreaTree, level = 0): Promise<string> {
    let text = ""
    if (level > 5) return text

    if (level != 0) {
      const translatedName = areaTree.name
      text += `${"    ".repeat(level - 1)}${translatedName}\n`;
    }
    for (let [name, area] of areaTree.children) {
      const text1 = await this.formatAreas(area, level + 1);
      text += text1
    }

    return text
  }

  async init(): Promise<void> {
    this.startDate = dayjs(this.disconnectionDate, 'YYYY-MMMM-DD HH:mm')
    this.endDate = dayjs(this.reconnectionDate, 'YYYY-MMMM-DD HH:mm')

    this.planType = this.taskType == "1" ? PlanType.Planned : PlanType.Unplanned

    const areas = this.disconnectionArea.split(',')

    //const citiesArr = Array.from(citiesMap)

    for (let area of areas) {
      const sub = area.split("/")
      let tree = this.areaTree
      for (let i = 0; i < sub.length; i++) {
        let item = sub[i].trim()

        // remove all quotation marks
        item = item.replace(/[??????"??????'????`???]+/g, '')

        let translated = citiesMap.get(item)
        if (translated) {
          if (i == 0
            // don't remember why I added this
            // && citiesArr.some(x => item.includes(x[0]))
          ) {
            this.citiesList.add(translated)
          }
        } else {
          translated = districtsMap.get(item)
        }

        if (!translated) {
          translated = await Translator.getTranslation(item);
          newDistrictsMap.set(item, translated)
        }

        item = translated
        const existingTree = tree.get(item)
        if (!existingTree) {
          const childTree = new AreaTree(item)
          tree.set(item, childTree)
          tree = childTree
        } else {
          tree = existingTree
        }
      }
    }

    const scNames = this.scName.split("/")

    //Merged alerts have several cities in format "City A / City B / City C"
    for (let n of scNames) {
      const nTrimmed = n.trim();
      let nTranslate = citiesMap.get(nTrimmed)
      if (!nTranslate) {
        nTranslate = await Translator.getTranslation(nTrimmed)
        newCitiesMap.set(nTrimmed, nTranslate)
      }
      //scNamesTranslated.push(nTranslate)
      this.citiesList.add(nTranslate)
    }

    this.scName = Array.from(this.citiesList).join(" / ")
  }

  /**
   * Get difference between two alerts
   * @param oldAlert
   * @param newAlert
   */
  static getDiff(oldAlert: Alert, newAlert: Alert): Array<DiffElement> {
    const diff = new Array<DiffElement>()

    type ObjectKey = keyof Alert;

    const getLine = (propName: ObjectKey): void => {
      if (oldAlert[propName] !== newAlert[propName]) {
        diff.push({property: propName, from: `${oldAlert[propName]}`, to: `${newAlert[propName]}`})
      }
    }

    getLine("scName");
    getLine("disconnectionArea");
    getLine("disconnectionDate");
    getLine("reconnectionDate");
    getLine("taskNote");
    getLine("taskType");
    getLine("regionName");

    //dif and scEffectedCustomers are constantly changing and are useless for now
    //(getLine("dif"));
    //(getLine("scEffectedCustomers"));


    return diff;
  }
}

export class CitiesRoot {
  status: number;
  data: Array<City>;
}

export class City {
  id?: any;
  name: string;
  nameGe: string;
  key: string;
  diId: string;
  disabled: boolean;

  static from(from: City): City {
    const result = Object.assign(new City(), from)
    result.init()
    return result
  }

  private init(): void {

  }
}

