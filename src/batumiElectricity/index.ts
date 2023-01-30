import axios from "axios";
import {Alert, AlertDiff, AlertsRoot} from "./types";
import {TwoWayMap} from "../common/twoWayMap";
import {IOriginalAlert, OriginalAlert} from "../mongo/originalAlert";
import {HydratedDocument} from "mongoose";
import * as readline from 'readline'
import dayjs, {Dayjs} from 'dayjs'

import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'

dayjs.extend(isSameOrAfter)

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

  public async getAlertsFromDay(date: Dayjs): Promise<Array<Alert>> {
    const todayAlerts = new Array<Alert>()

    await this.fetchAlerts();

    for (let [id, alert] of this.alertsById) {
      if (alert.startDate.isSame(date, 'day')) {
        todayAlerts.push(alert)
      }
    }
    return todayAlerts.sort((x, y) => x.startDate.valueOf() - y.startDate.valueOf() || x.endDate.valueOf() - y.endDate.valueOf())
  }

  public async getOriginalAlertsFromDay(date: Dayjs): Promise<Array<HydratedDocument<IOriginalAlert>>> {
    const today = date.format("YYYY-MM-DD")
    const future = date.add(1, 'day').format("YYYY-MM-DD")

    return await OriginalAlert.find({
      disconnectionDate: {
        $gt: today,
        $lt: future
      }
    }).exec()
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
    const changedAlerts = new Array<AlertDiff>()
    if (this.alertsFetching) {
      while (this.alertsFetching) {
        await new Promise(r => setTimeout(r, 300))
      }
      return changedAlerts
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
          alertData.createdDate = new Date()
          original = new OriginalAlert({...alertData})
          await original.save()
        } else if (original.posts.length == 0) {
          //alert without posts somehow
          diff.newAlert = alertData
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
        const day = alert.startDate.format('YYYY-MM-DD')
        if (!this.alertsByDate.has(day)) {
          this.alertsByDate.set(day, new Array<Alert>())
        }
        this.alertsByDate.get(day)?.push(alert)

        //push to newAlerts
        if (!diff.oldAlert || diff.diffs.length > 0) {
          diff.translatedAlert = alert
          changedAlerts.push(diff)
        }
      }
      process.stdout.write("\n");
      this.alertsFetching = false

      const today = dayjs().format("YYYY-MM-DD")
      const future = dayjs().add(60, 'day').format("YYYY-MM-DD")

      const dbData: HydratedDocument<IOriginalAlert>[] = await OriginalAlert.find({
        disconnectionDate: {
          $gt: today,
          $lt: future
        }
      }).exec()

      for (let futureAlert of dbData) {
        if (futureAlert.deletedDate) continue

        futureAlert.deletedDate = new Date()

        if (!this.alertsById.has(futureAlert.taskId)) {
          console.log(`${futureAlert.taskId} was deleted`)
          if (futureAlert.posts) {
            if (futureAlert.posts.length == 0) {
              console.log("Old post, has no link")
            } else {
              for (let post of futureAlert.posts) {
                console.log(`==== NEED TO CHANGE POST ${post.messageId} IN CHANNEL ${post.channel}`)
                const diff = new AlertDiff()
                diff.deletedAlert = futureAlert
                changedAlerts.push(diff)
              }
            }
          }

          await futureAlert.save()
        }
      }

      Alert.printTranslations()
      console.timeEnd("fetchAlert")
    }

    return changedAlerts
  }

  async getUpcomingDays(cityName: string | null = null): Promise<Array<Dayjs>> {
    await this.fetchAlerts()
    console.log("Search alerts for city", cityName)
    const today: dayjs.Dayjs = dayjs()
    const dates = new Array<Dayjs>()
    for (let [dateString, alerts] of this.alertsByDate) {
      const date = dayjs(dateString, 'YYYY-MMMM-DD HH:mm')

      if (cityName !== null) {
        //Show only alerts for selected city
        alerts = alerts.filter(x => x.citiesList.has(cityName))
      }

      if (alerts.length == 0) continue
      if (date.isSameOrAfter(today)) {
        dates.push(date)
      }
    }
    return dates.sort((x, y) => (x.valueOf() - y.valueOf()))
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
