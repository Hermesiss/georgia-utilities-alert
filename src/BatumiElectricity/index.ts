import axios from "axios";
import {Alert, AlertsRoot, CitiesRoot, City} from "./types";

export class BatumiElectricityParser {
  public alertsUrl = "https://my.energo-pro.ge/owback/alerts"
  public citiesUrl = "https://my.energo-pro.ge/owback/get/cities"

  private cities = new Map<string, City>()
  private alerts = new Map<number, Alert>()
  private alertsLastFetch: Date | null = null

  private alertsFetchIntervalMs = 1000;

  public async getAlertFromId(id: number): Promise<Alert | undefined>{
    await this.fetchAlerts()
    return this.alerts.get(id)
  }

  public getEnCityName(geoName: string): string {
    const city = this.cities.get(geoName);
    if (city)
      return city.name
    else return geoName
  }

  constructor() {
    this.getCities().then()
  }

  private async getCities() {
    const json = await axios.get<CitiesRoot>(this.citiesUrl)
    const {status, data} = json.data
    for (let cityData of data) {
      const city = City.from(cityData);
      this.cities.set(city.nameGe, city)
    }
  }

  public async getAlertsFromDay(date: Date): Promise<Array<Alert>> {
    const todayAlerts = new Array<Alert>()

    await this.fetchAlerts();

    const targetDateString = date.toDateString();

    for (let [id, alert] of this.alerts) {
      if (alert.startDate.toDateString() === targetDateString) {
        todayAlerts.push(alert)
      }
    }
    return todayAlerts.sort((x, y) => x.startDate.getTime() - y.startDate.getTime() || x.endDate.getTime() - y.endDate.getTime())
  }

  private async fetchAlerts() {
    if (this.alertsLastFetch === null || Date.now() - this.alertsLastFetch.getTime() > this.alertsFetchIntervalMs) {
      this.alerts.clear()
      this.alertsLastFetch = new Date()

      const json = await axios.get<AlertsRoot>(this.alertsUrl)
      const {status, data} = json.data

      for (let alertData of data) {
        const alert = Alert.from(alertData);
        this.alerts.set(alert.taskId, alert)
      }
    }
  }
}
