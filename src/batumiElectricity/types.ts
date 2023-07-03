import {Translator} from "../translator";
import cities from "./cities.json";
import districts from "./districts.json";
import {getLinkFromPost, IOriginalAlert, IPosts} from "../mongo/originalAlert";
import {HydratedDocument} from "mongoose";
import dayjs, {Dayjs} from "dayjs";
import {Markdown} from "puregram";
import {AlertColor} from "../imageGeneration";

const citiesMap = new Map(Object.entries(cities))
const districtsMap = new Map(Object.entries(districts))

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
  nameGe: string;
  nameEn: string | null = null;
  children = new Map<string, AreaTree>()

  /**
   * Recursively prepares the translation for the current node and all its descendants.
   */
  public async prepareTranslation(): Promise<void> {
    await this.getTranslated()
    for (let [key, value] of this.children) {
      await value.prepareTranslation()
    }
  }

  /**
   * Returns the translated name of the current node.
   */
  public async getTranslated(): Promise<string> {
    if (this.nameEn) return this.nameEn
    let translated = citiesMap.get(this.nameGe)
    if (!translated) {
      translated = districtsMap.get(this.nameGe)
    }

    if (!translated) {
      translated = await Translator.getTranslation(this.nameGe);
    }

    if (!translated) translated = this.nameGe
    this.nameEn = translated
    return translated
  }

  /**
   * Populates the AreaTree with the given areas. Each area string should contain
   * a hierarchical structure of street names or other entities separated by slashes.
   * The method creates the tree structure based on the provided areas.
   *
   * @param {string[]} areas - An array of strings, where each string represents a hierarchical
   *                            structure of street names or other entities separated by slashes.
   *                            Example: "street name / another street name / another thing".
   *                            There can be an unlimited number of entities separated by slashes.
   */
  public populate(areas: string[]): void {
    for (let area of areas) {
      const sub = area.split("/")
      let tree: AreaTree = this
      for (let i = 0; i < sub.length; i++) {
        let item = sub[i].trim()
        // remove all quotation marks
        item = item.replace(/[“”"‘’'«»_`„]+/g, '')

        const existingTree = tree.get(item)
        if (!existingTree) {
          const childTree = new AreaTree(item)
          tree.add(item, childTree)
          tree = childTree
        } else {
          tree = existingTree
        }
      }
    }
  }

  /**
   * Returns the number of children of the current node and all its descendants.
   */
  public count(): number {
    let result = 0
    result += this.children.size
    this.children.forEach(child => {
      result += child.count()
    })
    return result
  }

  public get(name: string) {
    return this.children.get(name)
  }

  public add(name: string, area: AreaTree) {
    this.children.set(name, area)
    // sort children by key
    this.children = new Map([...this.children.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  }

  public merge(area: AreaTree) {
    if (area.children.size > 0) {
      area.children.forEach((child, key) => {
        if (this.has(key)) {
          this.get(key)?.merge(child)
        } else {
          this.add(key, child)
        }
      })
    }
  }

  constructor(name: string = "") {
    this.nameGe = name;
  }

  public has(name: string) {
    return this.children.has(name)
  }

  public getAdditionalData(): string {
    return ""
  }
}

export class AreaTreeWithData<T> extends AreaTree {
  data: T | null = null

  public merge(area: AreaTreeWithData<T>) {
    if (area.data) {
      this.data = area.data
    }
    super.merge(area)
  }

  public static fromAreaTree<T>(area: AreaTree, data: T | null = null): AreaTreeWithData<T> {
    const result = new AreaTreeWithData<T>(area.nameGe)
    result.data = data
    for (let child of area.children) {
      result.add(child[0], AreaTreeWithData.fromAreaTree(child[1], data))
    }

    return result
  }

  getAdditionalData(): string {
    return this.data ? this.data.toString() : ""
  }
}

export class AreaTreeWithArray<T> extends AreaTree {
  data: T[] = []

  public merge(area: AreaTreeWithArray<T>) {
    if (area.data.length > 0) {
      for (let datum of area.data) {
        if (!this.data.includes(datum))
          this.data.push(datum)
      }
    }

    super.merge(area)
  }

  public static fromAreaTree<T>(area: AreaTree, data: T | null = null): AreaTreeWithArray<T> {
    const result = new AreaTreeWithArray<T>(area.nameGe)
    if (data && !result.data.includes(data)) {
      result.data.push(data)
    }

    for (let child of area.children) {
      result.add(child[0], AreaTreeWithArray.fromAreaTree(child[1], data))
    }

    return result
  }

  getAdditionalData(): string {
    return this.data.length > 0 ? this.data
      .join(", ") : ""
  }
}

export class PostWithTime {
  start: Dayjs
  end: Dayjs
  post?: IPosts

  toString(): string {
    const time = `${this.start.format("HH:mm")}-${this.end.format("HH:mm")}`
    if (this.post) {
      const link = getLinkFromPost(this.post)
      return `[${time}](${link})`
    } else
      return time
  }

  constructor(start: dayjs.Dayjs, end: dayjs.Dayjs, post?: IPosts) {
    this.start = start;
    this.end = end;
    this.post = post;
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
    /*if (newDistrictsMap.size > 0)
      console.log("==== NEW TRANSLATED DISTRICTS\n", JSON.stringify(Object.fromEntries(newDistrictsMap)))*/

    /*if (newCitiesMap.size > 0)
      console.log("==== NEW TRANSLATED CITIES\n", JSON.stringify(Object.fromEntries(newCitiesMap)))*/
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
    if (this.deletedDate) text += "✖✖✖ "
    switch (this.planType) {
      case PlanType.Planned:
        text += "⚙️"
        break
      case PlanType.Unplanned:
        text += "⚠️"
        break
    }

    if (!this.deletedDate) {
      if (this.startDate.isSame(dayjs(), "day")) {
        text += " 🔥 Today 🔥 "
      } else if (this.startDate.isSame(dayjs().add(1, 'day'), "day")) {
        text += " 🌅 Tomorrow 🌅 "
      } else if (this.startDate.isBefore(dayjs(), 'day')) {
        text += " 👽 Back to the Future! 👽 "
      } else if (this.startDate.isSame(dayjs(), "week")) {
        text += " 🗓 This week 🗓 "
      }
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
    return ""
  }

  public formatStartTime() {
    return this.startDate.format("HH:mm")
  }

  public formatEndTime() {
    return this.endDate.format("HH:mm")
  }

  public formatTimeSpan() {
    if (this.startDate.isSame(this.endDate, "day")) {
      return `${this.startDate.format("YYYY-MM-DD")} ${this.formatStartTime()} - ${this.formatEndTime()}`
    }
    return `${this.startDate.format("YYYY-MM-DD HH:mm")} - ${this.endDate.format("YYYY-MM-DD HH:mm")}`
  }

  public async formatSingleAlert(cityName: string | null): Promise<string> {
    const taskName = Markdown.escape(await Translator.getTranslation(this.taskName))
    const regionName = Markdown.escape(await Translator.getTranslation(this.regionName))
    const cities = Array.from(this.citiesList).join(", ");
    const planText = this.planType != PlanType.Planned ? ` ${Markdown.italic(this.getPlanText(), true)} ` : ""
    const areas = await Alert.formatAreas(this.areaTree, cityName);
    const taskNote = this.taskNote ? Markdown.escape(await Translator.getTranslation(this.taskNote)) : ""
    const created = this.createdDate ? Markdown.bold("Created: ") + dayjs(this.createdDate).format("YYYY-MM-DD HH:mm") + "\n\n" : ""
    const deleted = this.deletedDate ? Markdown.bold("Deleted: ") + dayjs(this.deletedDate).format("YYYY-MM-DD HH:mm") + "\n\n" : ""

    //TODO replace ** with Markdown.bold

    return `${this.getPlanEmoji()}${planText} *[${this.scName}]* ${taskName}\n\n` +
      `*Date:* ${this.formatTimeSpan()}\n\n` +
      `*Region:* ${regionName}\n\n` +
      `*Cities:* ${cities}\n\n` +
      `*Area:*\n${areas}\n` +
      `${this.taskId} ` + taskNote + "\n\n" +
      created + deleted
  }

  public static async formatAreas(areaTree: AreaTree, cityName: string | null, compact = true, level = 0): Promise<string> {
    await areaTree.prepareTranslation()
    let text = ""
    if (level > 5) return text

    if (level == 1) {
      if (cityName != null && cityName !== areaTree.nameEn) {
        return ""
      }
    }

    if (level != 0) {
      let translatedName = areaTree.nameEn ?? await areaTree.getTranslated()

      text += Markdown.escape(translatedName);

      const additionalData = areaTree.getAdditionalData()
      if (additionalData) {
        text += " (" + additionalData + ")"
      }

      if (areaTree.children.size != 1 || !compact) {
        text += "\n"
      } else {
        text += "  /  "
      }
    }
    for (let [name, area] of areaTree.children) {
      if (areaTree.children.size != 1 || !compact) {
        text += "    ".repeat(level)
      }

      const childText = await this.formatAreas(area, cityName, compact, level + 1);
      text += childText
    }

    return text
  }


  async init(): Promise<void> {
    this.startDate = dayjs(this.disconnectionDate, 'YYYY-MMMM-DD HH:mm')
    this.endDate = dayjs(this.reconnectionDate, 'YYYY-MMMM-DD HH:mm')

    this.planType = this.taskType == "1" ? PlanType.Planned : PlanType.Unplanned

    if (!this.disconnectionArea) this.disconnectionArea = ""
    if (!this.scName) this.scName = this.taskName || ""

    const areas = this.disconnectionArea.split(',')

    //const citiesArr = Array.from(citiesMap)

    for (let area of areas) {
      const item = area.split("/")[0].trim()
      let nTranslate = citiesMap.get(item)
      if (!nTranslate) {
        nTranslate = await Translator.getTranslation(item)
      }
      this.citiesList.add(nTranslate)
    }

    this.areaTree.populate(areas)

    if (areas.some(x => x.includes("მახინჯაური"))) {
      this.citiesList.add("Makhinjauri")
    }

    if (areas.some(x => x.includes("გონიო"))) {
      this.citiesList.add("Gonio")
    }

    const scNames = this.scName.split("/")

    //Merged alerts have several cities in format "City A / City B / City C"
    for (let n of scNames) {
      const nTrimmed = n.trim();
      let nTranslate = citiesMap.get(nTrimmed)
      if (!nTranslate) {
        nTranslate = await Translator.getTranslation(nTrimmed)
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

  static colorEmergency = new AlertColor('#b0392e', `#ff0000`, "Emergency outage")
  static colorPlanned = new AlertColor('#4b68b1', `#0000ff`, "Planned outage")
  static colorDone = new AlertColor('#616161', `#606060`, "Work completed")

  static colorRandom = new AlertColor('#e59927', null, "Debug")

  static colorDaily = new AlertColor('#d36226', `#ff5800`, "Daily report")

  getAlertColor(): AlertColor {
    if (this.deletedDate) {
      return Alert.colorDone
    }
    if (this.planType === PlanType.Planned) {
      return Alert.colorPlanned
    }
    return Alert.colorEmergency
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

export class CityChannel {
  cityName: string | null;
  cityNameGe: string | null;
  channelId: string;

  canPostPhotos: boolean = false;

  //constructor
  constructor(cityName: string | null, cityNameGe: string | null, channelId: string, canPostPhotos: boolean = false) {
    console.log(`Creating CityChannel ${cityName}, channelId: ${channelId}, canPostPhotos: ${canPostPhotos}`)
    this.cityName = cityName;
    this.cityNameGe = cityNameGe;
    this.channelId = channelId;
    this.canPostPhotos = canPostPhotos;
  }

  toString(): string {
    return this.cityName + " " + this.channelId + " " + this.canPostPhotos;
  }
}

