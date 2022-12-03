import axios from "axios";
import {Alert, AlertDiff, AlertsRoot} from "./types";
import {TwoWayMap} from "../common/twoWayMap";
import {IOriginalAlert, OriginalAlert} from "../mongo/originalAlert";
import {HydratedDocument} from "mongoose";
import * as readline from 'readline'

export class BatumiElectricityParser {
  public alertsUrl = "https://my.energo-pro.ge/owback/alerts"

  private alertsById = new Map<number, Alert>()
  private alertsByDate = new Map<string, Array<Alert>>()
  private alertsByCity = new Map<string, Array<Alert>>()
  private alertsLastFetch: Date | null = null
  private alertsFetching = false

  private alertsFetchIntervalMs = 15 * 60 * 1000;

  /**
   * Key - normal ENG city name, value - modified for commands
   * @private
   */
  private citiesTwoWayMap = new TwoWayMap<string, string>()

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

  /**
   * Get list of duplicated taskId's
   * @param arr
   */
  private static getDuplicates(arr: Array<Alert>): Array<number> {
    const set = new Set<number>();
    const result = new Set<number>();
    for (let alert of arr) {
      let size = set.size
      set.add(alert.taskId)
      if (size == set.size) {
        result.add(alert.taskId)
      }
    }
    return Array.from(result)
  }

  /**
   * Get list of unique values
   * @param arr
   */
  private static getUnique<T>(arr: Array<T>): Array<T> {
    const s = new Set<T>()
    arr.forEach(x => s.add(x))
    return Array.from(s)
  }

  /**
   * Get list of unique values of specific property
   * @param arr
   * @param prop
   */
  private static getUniqueProp<T, P>(arr: Array<T>, prop: keyof T): Array<P> {
    return this.getUnique(arr.filter(x => typeof x !== 'undefined').map(x => x[prop] as P))
  }

  /**
   * Merge several Alerts
   * @param alerts
   */
  private static mergeObjects(alerts: Array<Alert>): Alert {
    const result = new Alert()

    result.taskId = alerts[0].taskId
    result.taskType = alerts[0].taskType
    result.scName = this.getUniqueProp<Alert, string>(alerts, "scName").join(" / ")
    result.regionName = this.getUniqueProp<Alert, string>(alerts, "regionName").join(", ")
    result.taskNote = this.getUniqueProp<Alert, string>(alerts, "taskNote").join("\n")
    result.disconnectionDate = alerts[0].disconnectionDate
    result.reconnectionDate = alerts[0].reconnectionDate
    result.disconnectionArea = this.getUniqueProp<Alert, string>(alerts, "disconnectionArea").join(",")
    result.taskName = this.getUniqueProp<Alert, string>(alerts, "taskName").join(". ")

    return result
  }

  public async fetchAlerts(force: boolean = false): Promise<Array<AlertDiff>> {
    const newAlerts = new Array<AlertDiff>()
    if (this.alertsFetching) {
      while (this.alertsFetching) {
        await new Promise(r => setTimeout(r, 300))
      }
      return newAlerts
    }
    if (force || this.alertsLastFetch === null || Date.now() - this.alertsLastFetch.getTime() > this.alertsFetchIntervalMs) {
      console.time("fetchAlert")
      this.alertsFetching = true
      this.alertsById.clear()
      this.alertsByDate.clear()
      this.alertsByCity.clear()
      this.alertsLastFetch = new Date()

      const json = await axios.get<AlertsRoot>(this.alertsUrl)
      const {status, data} = json.data

      // Get duplicated taskId's
      const duplicateElements = BatumiElectricityParser.getDuplicates(data);

      // Get all non-duplicated tasks
      const filteredData = data.filter(x => !duplicateElements.includes(x.taskId))

      //Merge all duplicated tasks and add to filtered list
      for (let duplicateTaskId of duplicateElements) {
        const elements = data.filter(x => x.taskId == duplicateTaskId)
        const merged = BatumiElectricityParser.mergeObjects(elements)
        filteredData.push(merged)
      }
      const fetchAlertsText = "Fetch alerts: ";
      process.stdout.write(fetchAlertsText + "_".repeat(filteredData.length));
      readline.cursorTo(process.stdout, fetchAlertsText.length);
      for (let i = 0; i < filteredData.length; i++) {
        let diff = new AlertDiff();
        const alertData = filteredData[i]

        process.stdout.write("*");

        let original: HydratedDocument<IOriginalAlert> | null
          = await OriginalAlert.findOne({taskId: alertData.taskId}).exec()
        if (!original) {
          //this is new alert
          diff.newAlert = alertData
          original = new OriginalAlert({...alertData})
          await original.save()
        } else {
          //alert already exists...
          diff.oldAlert = await Alert.fromOriginal(original, false)
          diff.diffs = Alert.getDiff(diff.oldAlert, alertData)
          if (diff.diffs.length > 0) {
            //...and there are some changes
            diff.newAlert = alertData
            await original.update({...alertData})
          }

          await diff.oldAlert.init()
        }

        const alert = await Alert.from(alertData);

        this.alertsById.set(alert.taskId, alert)

        //add to alertsByDate
        const day = alert.startDate.toDateString()
        if (!this.alertsByDate.has(day)) {
          this.alertsByDate.set(day, new Array<Alert>())
        }
        this.alertsByDate.get(day)?.push(alert)

        //push to newAlerts
        if (!diff.oldAlert || diff.diffs.length > 0) {
          diff.translatedAlert = alert
          newAlerts.push(diff)
        }
      }
      process.stdout.write("\n");
      this.alertsFetching = false

      Alert.printTranslations()
      console.timeEnd("fetchAlert")
    }

    return newAlerts
  }

  async getUpcomingDays(cityName: string | null = null): Promise<Array<Date>> {
    await this.fetchAlerts()
    console.log("Search alerts for city", cityName)
    const today = new Date(new Date().toDateString())
    const dates = new Array<Date>()
    for (let [dateString, alerts] of this.alertsByDate) {
      const date = new Date(dateString)

      if (cityName !== null) {
        //Show only alerts for selected city
        alerts = alerts.filter(x => x.citiesList.has(cityName))
      }

      if (alerts.length == 0) continue
      if (date.getTime() >= today.getTime()) {
        dates.push(date)
      }
    }
    return dates.sort((x, y) => x.getTime() - y.getTime())
  }

  /**
   * @return Two Way Map. Key - normal ENG city name, value - modified for commands
   */
  async getCitiesList(): Promise<TwoWayMap<string, string>> {
    await this.fetchAlerts()
    this.citiesTwoWayMap.clear()
    const today = new Date(new Date().toDateString())
    const cities = new Set<string>()
    for (let [dateString, alerts] of this.alertsByDate) {
      const date = new Date(dateString)

      if (date.getTime() >= today.getTime()) {
        for (let alert of alerts) {
          alert.citiesList.forEach(value => {
            cities.add(value);

            let arr = this.alertsByCity.get(value)
            if (!arr) {
              arr = new Array<Alert>()
              this.alertsByCity.set(value, arr)
            }

            arr.push(alert)
          })
        }
      }
    }

    for (let city of cities) {
      const commandCity = city.replace(/[- /]/g, '_');
      this.citiesTwoWayMap.add(city, commandCity)
    }

    return this.citiesTwoWayMap
  }

  getAlertCount(cityName: string): number | undefined {
    return this.alertsByCity.get(cityName)?.length
  }
}
