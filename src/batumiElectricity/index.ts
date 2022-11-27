import axios from "axios";
import {Alert, AlertsRoot, CitiesRoot, City} from "./types";
import {Translator} from "../translator";
import {TwoWayMap} from "../common/TwoWayMap";

export class BatumiElectricityParser {
  public alertsUrl = "https://my.energo-pro.ge/owback/alerts"
  public citiesUrl = "https://my.energo-pro.ge/owback/get/cities"

  private cities = new Map<string, City>()
  private alertsById = new Map<number, Alert>()
  private alertsByDate = new Map<string, Array<Alert>>()
  private alertsLastFetch: Date | null = null

  private alertsFetchIntervalMs = 1000;

  private geoEngCities = new TwoWayMap<string, string>()

  public async getAlertFromId(id: number): Promise<Alert | undefined> {
    await this.fetchAlerts()
    return this.alertsById.get(id)
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

    for (let [id, alert] of this.alertsById) {
      if (alert.startDate.toDateString() === targetDateString) {
        todayAlerts.push(alert)
      }
    }
    return todayAlerts.sort((x, y) => x.startDate.getTime() - y.startDate.getTime() || x.endDate.getTime() - y.endDate.getTime())
  }

  private async fetchAlerts() {
    if (this.alertsLastFetch === null || Date.now() - this.alertsLastFetch.getTime() > this.alertsFetchIntervalMs) {
      this.alertsById.clear()
      this.alertsByDate.clear()
      this.alertsLastFetch = new Date()

      const json = await axios.get<AlertsRoot>(this.alertsUrl)
      const {status, data} = json.data

      for (let alertData of data) {
        const alert = Alert.from(alertData);
        this.alertsById.set(alert.taskId, alert)
        const day = alert.startDate.toDateString()
        if (!this.alertsByDate.has(day)) {
          this.alertsByDate.set(day, new Array<Alert>())
        }
        this.alertsByDate.get(day)?.push(alert)
      }
    }
  }

  async getUpcomingDays(cityGe: string | null = null): Promise<Array<Date>> {
    await this.fetchAlerts()
    const today = new Date(new Date().toDateString())
    const dates = new Array<Date>()
    for (let [dateString, alerts] of this.alertsByDate) {
      const date = new Date(dateString)
      if (cityGe !== null) {
        alerts = alerts.filter(x => x.scName === cityGe)
      }

      if (alerts.length == 0) continue
      if (date.getTime() >= today.getTime()) {
        dates.push(date)
      }
    }
    return dates.sort((x, y) => x.getTime() - y.getTime())
  }

  /*
  @return Two way map, key - geo city, value - eng city
   */
  async getCitiesList(): Promise<TwoWayMap<string, string>> {
    await this.fetchAlerts()
    this.geoEngCities.clear()
    const today = new Date(new Date().toDateString())
    const cities = new Set<string>()
    for (let [dateString, alerts] of this.alertsByDate) {
      const date = new Date(dateString)

      if (date.getTime() >= today.getTime()) {
        for (let alert of alerts) {
          if (!cities.has(alert.scName)) {
            cities.add(alert.scName)
          }
        }
      }
    }

    for (let city of cities) {
      const eng = await Translator.getTranslation(city)
      this.geoEngCities.add(city, eng)
    }

    return this.geoEngCities
  }
}
