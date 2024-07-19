import axios from "axios";
import {SocarAlertsDTO} from "./types";
import {ISocarAlert, SocarAlert} from "../../mongo/socarAlert";
import {CityChannel} from "../energoPro/types";
import dayjs from "dayjs";
import {HydratedDocument} from "mongoose";

export class SocarParser {
		public url = 'https://utilixwebapi.azurewebsites.net/api/Outage/GetOutagesWithPaging'
		public origin = 'https://mygas.ge'

		private alertsLastFetch: Date | null = null
		private alertsFetching = false

		public get isFetching(): boolean {
				return this.alertsFetching;
		}

		private alertsById = new Map<number, HydratedDocument<ISocarAlert>>()
		/**
		 * Key is date in format 'YYYY-MM-DD'
		 * @private
		 */
		private alertsByDate = new Map<string, Array<HydratedDocument<ISocarAlert>>>()
		/**
		 * Key is city name in Georgian
		 * @private
		 */
		private alertsByCity = new Map<string, Array<HydratedDocument<ISocarAlert>>>()

		private alertsFetchIntervalMs = 15 * 60 * 1000;

		private includedCities: Array<CityChannel>;

		constructor(includedCities: Array<CityChannel>) {
				this.includedCities = includedCities;
		}

		public async getAlertsByCity(city: string): Promise<Array<HydratedDocument<ISocarAlert>>> {
				return this.alertsByCity.get(city) || []
		}

		public async getOutages(pageNumber: number, pageSize: number, search: string): Promise<ISocarAlert[]> {
				const url = this.getUrl(pageNumber, pageSize, search)
				const headers = {
						'Origin': this.origin,
						'Referer': this.origin,
				}
				const response = await axios.get<SocarAlertsDTO>(url, {headers})
				return response.data.items
		}

		public getUrl(pageNumber: number, pageSize: number, search: string) {
				return `${this.url}?PageIndex=${pageNumber}&PageSize=${pageSize}&searchText=${search}`
		}

		public async fetchAlerts(force: boolean = false): Promise<void> {
				if (this.alertsFetching) {
						console.log('Already fetching socar alerts')
						while (this.alertsFetching) {
								await new Promise(r => setTimeout(r, 300))
						}
						return
				}

				if (force || this.alertsLastFetch === null || Date.now() - this.alertsLastFetch.getTime() > this.alertsFetchIntervalMs) {
						console.log('Fetching socar alerts')
						this.alertsFetching = true
						this.alertsById.clear()
						this.alertsByDate.clear()
						this.alertsByCity.clear()
						this.alertsLastFetch = new Date()

						let dataDict = new Set<ISocarAlert>()
						for (let city of this.includedCities) {
								if (city.cityNameGe == null) continue
								console.log(`Fetching socar alerts for ${city.cityName}`)
							try {
								const alerts = await this.getOutages(1, 100, city.cityNameGe)
								for (const alert of alerts) {
										if (!dataDict.has(alert)) {
												dataDict.add(alert)
										}
								}}
								catch (e) {
									this.alertsFetching = false
									throw e
								}
						}

						const data = Array.from(dataDict.values())

						for (const alert of data) {
								let mongoAlert = await SocarAlert.findOne({
										objectId: alert.objectId
								})

								if (mongoAlert) {
										continue
								}

								mongoAlert = new SocarAlert({...alert})
								await mongoAlert.save()

								this.alertsById.set(alert.objectId, mongoAlert)

								const date = dayjs(alert.start).format('YYYY-MM-DD')
								if (!this.alertsByDate.has(date)) {
										this.alertsByDate.set(date, new Array<HydratedDocument<ISocarAlert>>())
								}
								this.alertsByDate.get(date)?.push(mongoAlert)

								for (let city of this.includedCities) {
										if (city.cityNameGe == null) continue
										if (mongoAlert.isCity(city.cityNameGe)) {
												if (!this.alertsByCity.has(city.cityNameGe)) {
														this.alertsByCity.set(city.cityNameGe, new Array<HydratedDocument<ISocarAlert>>())
												}
												this.alertsByCity.get(city.cityNameGe)?.push(mongoAlert)
										}
								}
						}
				}

				this.alertsFetching = false
				return
		}
}
