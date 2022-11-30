import axios from "axios";
import {Alert, AlertsRoot, CitiesRoot, City} from "./types";
import {TwoWayMap} from "../common/twoWayMap";

export class BatumiElectricityParser {
  public alertsUrl = "https://my.energo-pro.ge/owback/alerts"

  private alertsById = new Map<number, Alert>()
  private alertsByDate = new Map<string, Array<Alert>>()
  private alertsLastFetch: Date | null = null
  private alertsFetching = false

  private alertsFetchIntervalMs = 1000;

  private geoEngCities = new TwoWayMap<string, string>()

  public async getAlertFromId(id: number): Promise<Alert | undefined> {
    await this.fetchAlerts()
    return this.alertsById.get(id)
  }

  constructor() {

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

  public async fetchAlerts() {
    if (this.alertsFetching) {
      while (this.alertsFetching) {
        await new Promise(r => setTimeout(r, 300))
      }

      return
    }
    if (this.alertsLastFetch === null || Date.now() - this.alertsLastFetch.getTime() > this.alertsFetchIntervalMs) {
      this.alertsFetching = true
      this.alertsById.clear()
      this.alertsByDate.clear()
      this.alertsLastFetch = new Date()

      const json = await axios.get<AlertsRoot>(this.alertsUrl)
      const {status, data} = json.data

      for (let i = 0; i < data.length; i++) {
        const alertData = data[i]

        const alert = await Alert.from(alertData);

        this.alertsById.set(alert.taskId, alert)
        const day = alert.startDate.toDateString()
        if (!this.alertsByDate.has(day)) {
          this.alertsByDate.set(day, new Array<Alert>())
        }
        this.alertsByDate.get(day)?.push(alert)
      }

      this.alertsFetching = false

      Alert.printTranslations()
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
      //const eng = await Translator.getTranslation(city)
      //this.geoEngCities.add(city, eng)
      this.geoEngCities.add(city, city)
    }

    return this.geoEngCities
  }
}
