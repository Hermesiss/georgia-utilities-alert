import {Translator} from "../translator";

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
  taskNote: string;
  scEffectedCustomers: string;
  disconnectionArea: string;
  regionName: string;
  scName: string;
  disconnectionDate: string;
  reconnectionDate: string;
  dif: string;
  taskType: string;

  startDate: Date;
  endDate: Date;
  planType: PlanType

  areaTree: AreaTree = new AreaTree("Root")

  static from(from: Alert): Alert {
    const result = Object.assign(new Alert(), from)
    result.init()
    return result
  }

  private static timeFormatOptions: Intl.DateTimeFormatOptions = {hour: "numeric", minute: "2-digit", hour12: false};
  private static dayFormatOptions: Intl.DateTimeFormatOptions = {hour: "numeric", minute: "2-digit", hour12: false};

  public getPlanEmoji() {
    switch (this.planType) {
      case PlanType.Planned:
        return "⚙️"
      case PlanType.Unplanned:
        return "⚠️"
    }
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
    return this.startDate.toLocaleTimeString("en-US", Alert.timeFormatOptions)
  }

  public formatEndTime() {
    return this.endDate.toLocaleTimeString("en-US", Alert.timeFormatOptions)
  }

  public async formatSingleAlert(): Promise<string> {
    const taskNote = await Translator.getTranslation(this.taskNote)
    const taskName = await Translator.getTranslation(this.taskName)
    const taskCaption = await Translator.getTranslation(this.scName)
    const regionName = await Translator.getTranslation(this.regionName)
    const planText = this.planType != PlanType.Planned ? ` _${this.getPlanText()}_ ` : ""
    const areas = await this.formatAreas(this.areaTree);

    return `${this.getPlanEmoji()}${planText} *[${taskCaption}]* ${taskName}\n\n` +
      `*Start:* ${this.disconnectionDate}\n\n` +
      `*End:* ${this.reconnectionDate}\n\n` +
      `*Region:* ${regionName}\n\n` +
      `*Area:*\n${areas}\n\n` + //TODO date
      taskNote
  }

  public async formatAreas(areaTree: AreaTree, level = 0): Promise<string> {
    let text = ""
    if (level > 5) return text

    if (level != 0) {
      const translatedName = await Translator.getTranslation(areaTree.name)
      text += `${"    ".repeat(level - 1)}${translatedName}\n`;
    }
    for (let [name, area] of areaTree.children) {
      const text1 = await this.formatAreas(area, level + 1);
      text += text1
    }

    return text
  }

  private init(): void {
    this.startDate = new Date(this.disconnectionDate)
    this.endDate = new Date(this.reconnectionDate)

    this.planType = this.taskType == "1" ? PlanType.Planned : PlanType.Unplanned

    const areas = this.disconnectionArea.split(',')

    for (let area of areas) {
      const sub = area.split("/")
      let tree = this.areaTree
      for (let i = 0; i < sub.length; i++) {
        const item = sub[i].trim()
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

