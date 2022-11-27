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

  public getPlanEmoji() {
    switch (this.planType) {
      case PlanType.Planned:
        return "⚙️"
      case PlanType.Unplanned:
        return "⚠️"
    }
  }

  public formatStartTime() {
    return this.startDate.toLocaleTimeString("en-US", Alert.timeFormatOptions)
  }

  public formatEndTime() {
    return this.endDate.toLocaleTimeString("en-US", Alert.timeFormatOptions)
  }

  public formatSingleAlert(): string {
    return `${this.taskName}\n` +
      `Region: ${this.regionName}\n` +
      `Area: ${this.disconnectionArea}` //TODO date
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

