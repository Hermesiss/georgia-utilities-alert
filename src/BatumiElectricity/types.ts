import {Translator} from "../Translator";

export class AlertsRoot {
  status: number;
  data: Array<Alert>;
}

export enum PlanType {
  Planned = 1,
  Unplanned = 2 | 3
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

  public getPlanText(){
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
    const disconnectionArea = await Translator.getTranslation(this.disconnectionArea)
    const planText = this.planType != PlanType.Planned ? ` _${this.getPlanText()}_ ` : ""

    return `${this.getPlanEmoji()}${planText} *[${taskCaption}]* ${taskName}\n\n` +
      `*Start:* ${this.disconnectionDate}\n\n` +
      `*End:* ${this.reconnectionDate}\n\n` +
      `*Region:* ${regionName}\n\n` +
      `*Area:* ${disconnectionArea}\n\n` + //TODO date
      taskNote
  }

  private init(): void {
    this.startDate = new Date(this.disconnectionDate)
    this.endDate = new Date(this.reconnectionDate)

    this.planType = this.taskType == "1" ? PlanType.Planned : PlanType.Unplanned
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

