import {Markdown, MediaSource, RemoveKeyboard, UpdateType} from 'puregram'
import {EnergoProParser} from "../parsers/energoPro";
import {
		Alert,
		AreaTreeWithArray,
		CityChannel,
		PostWithTime
} from "../parsers/energoPro/types";
import {MessageContext} from "puregram/lib/contexts/message";
import * as Interfaces from "puregram/lib/generated/telegram-interfaces";
import {TelegramKeyboardButton, TelegramMessage} from "puregram/lib/generated/telegram-interfaces";
import * as mongoose from "mongoose";
import {HydratedDocument} from "mongoose";
import dayjs, {Dayjs} from "dayjs";
import {getLinkFromPost, IOriginalAlert, IPosts, OriginalAlert} from "../mongo/originalAlert";
import {Translator} from "../translator";
import {TelegramFramework} from "./framework";
import {AlertColor, drawCustom, drawSingleAlert} from "../imageGeneration";
import {
		drawMapFromAlert, drawMapFromStreetFinderResults,
		getRealStreets, getStreets,
		getStreetsFromInput,
} from "../map";
import {MapPlaceholderLink, StreetFinderResult} from "../map/types";
import {uploadImage} from "../imageGeneration/hosting";
import {envError} from "../common/utils";
import {SocarParser} from "../parsers/socar";
import {ISocarAlert} from "../mongo/socarAlert";

export class TelegramController {
		public get isFetching(): boolean {
				if (!this.energoProParser) return false
				return this.energoProParser.isFetching || this.socarParser.isFetching
		}

		private readonly token: string;

		private readonly ownerId: string;
		private telegramFramework: TelegramFramework;

		private energoProParser: EnergoProParser;
		private socarParser: SocarParser;
		private channels = new Array<CityChannel>()

		private channelMain: CityChannel;

		constructor(token: string, ownerId: string) {
				this.token = token;
				this.ownerId = ownerId;

				this.initTelegram();
		}

		private initTelegram() {
				this.telegramFramework = new TelegramFramework(this.token);
				this.telegramFramework.setUnknownErrorHandler((e, c) => this.sendToOwnerError(e, c))

				this.addChannel("Batumi", "ბათუმი", "TELEGRAM_CHANNEL_BATUMI")
				this.addChannel("Kutaisi", "ქუთაისი", "TELEGRAM_CHANNEL_KUTAISI")
				this.addChannel("Kobuleti District", "ქობულეთი", "TELEGRAM_CHANNEL_KOBULETI")

// city name is null for area formatting - we are stripping another cities for posting in city-related channel

				this.channelMain = new CityChannel(null, null, process.env.TELEGRAM_CHANNEL_MAIN ?? "skip");
		}

		private addChannel(cityName: string, cityNameGe: string | null, env: string) {
				const canPostPhotos = process.env[env + "_PHOTOS"] == "true"
				const channelId = process.env[env] ?? envError(env)
				if (channelId == "skip") return
				this.channels.push(new CityChannel(cityName, cityNameGe, channelId, canPostPhotos))
		}

		getChannelForCity(city: string): CityChannel | null {
				for (let channel of this.channels) {
						if (channel.cityName == city) {
								return channel
						}
				}
				return null
		}

		getChannelForId(channelId: string): CityChannel | null {
				for (let channel of this.channels) {
						if (channel.channelId == channelId) {
								return channel
						}
				}
				return null
		}

		getChannelsForAlert(alert: Alert): Set<CityChannel> {
				//main channel and local channels for alert
				const s = new Set<CityChannel>()
				if (this.channelMain.channelId != "skip") {
						s.add(this.channelMain)
				}
				for (let string of alert.citiesList) {
						const c = this.getChannelForCity(string)
						if (c != null)
								s.add(c)
				}
				return s;
		}

		async sendAlertToChannels(alert: Alert): Promise<void> {
				const channels = this.getChannelsForAlert(alert)
				console.log(`==== SEND ALERT TO CHANNELS (${alert.taskId}), channels count: ${channels.size}`)

				// notify if alert is today or tomorrow
				const today = dayjs(alert.disconnectionDate).isSame(dayjs(), 'day')
				const tomorrow = dayjs(alert.disconnectionDate).isSame(dayjs().add(1, 'day'), 'day')
				const notify = today || tomorrow

				const originalAlert = await OriginalAlert.findOne({taskId: alert.taskId})

				if (!originalAlert) {
						throw Error(`ALERT ${alert.taskId} SHOULD BE IN DB AT THIS MOMENT`)
				}

				if (!originalAlert.posts) {
						originalAlert.posts = new Array<IPosts>()
				}

				for (let channel of channels) {
						console.log(`==== SEND TO CHANNEL ${channel.channelId} (${channel.cityName})`)
						const text = await alert.formatSingleAlert(channel.cityName)
						const postPhoto = channel.canPostPhotos
						try {
								let msg: TelegramMessage | null;
								if (postPhoto) {
										const alertColor: AlertColor = alert.getAlertColor()
										const mapUrl = await drawMapFromAlert(alert, alertColor, channel.cityNameGe)
											?? MapPlaceholderLink
										const image = await drawSingleAlert(alert, alertColor, mapUrl, channel.channelId)
										msg = await this.telegramFramework.sendPhoto({
												chat_id: channel.channelId,
												photo: MediaSource.path(image),
												caption: text,
												parse_mode: 'Markdown',
												disable_notification: !notify
										})
								} else {
										msg = await this.telegramFramework.sendMessage({
												chat_id: channel.channelId,
												text,
												parse_mode: 'Markdown',
												disable_notification: !notify
										});
								}
								if (msg)
										originalAlert.posts.push({
												channel: channel.channelId,
												messageId: msg.message_id,
												hasPhoto: (postPhoto)
										})
						} catch (e) {
								console.log(`Error sending to ${channel.channelId}\nText:\n`, text, "Error:\n", e)
						}
				}

				await originalAlert.save()
		}

		/*
		Edit all non-deleted posted alerts in channels
		@param onListCreated - callback to get list of links before actually editing
		@returns void
	 */
		async editAllPostedAlerts(onListCreated?: (links: string) => void | null): Promise<void> {
				try {
						const alerts = await OriginalAlert.find({
								deletedDate: {$exists: false},
								disconnectionDate: {$gte: dayjs().format("YYYY-MM-DD")}
						})

						if (onListCreated) {
								let response = ""

								// get list of links
								for (let alert of alerts) {
										if (!alert.posts) continue

										for (let post of alert.posts) {
												const link = getLinkFromPost(post)
												response += `<a>${link}</a>\n`
										}
								}

								onListCreated(response)
						}

						for (let alert of alerts) {
								if (!alert.posts) continue

								await this.updatePost(alert)

								/*const a = await Alert.fromOriginal(alert)

								for (let post of alert.posts) {
									const channel = getChannelForId(post.channel)
									const text = await a.formatSingleAlert(channel?.cityName ?? null)
									if (!post.hasPhoto) {
										await telegramFramework.editMessageText({
											chat_id: post.channel,
											message_id: post.messageId,
											text,
											parse_mode: 'Markdown'
										}, e => {
											console.log(`Error editing ${post.channel} ${post.messageId}\nText:\n`, text, "Error:\n", e)
										})
									} else {

										const channel = getChannelForId(post.channel)
										const mapUrl = drawMapFromAlert(a, a.getAlertColor(), channel?.cityName ?? null)
									}
								}*/
						}
				} catch (e) {
						await this.sendToOwnerError(e, "editAllPostedAlerts")
				}
		}

		async postAlertsForDay(date: Dayjs, caption: string): Promise<void> {
				try {
						const originalAlerts = await this.energoProParser.getOriginalAlertsFromDay(date)
						console.log(`Posting ${originalAlerts.length} alerts for ${date.format('YYYY-MM-DD')}`)
						const orderedAlerts = originalAlerts.sort((a, b) => dayjs(a.disconnectionDate).unix() - dayjs(b.disconnectionDate).unix())

						const channelsWithAlerts = new Map<string, { photo: boolean, alerts: HydratedDocument<IOriginalAlert>[] }>()

						const alerts = new Map<number, Alert>()

						for (let alert of originalAlerts) {
								const a = await Alert.fromOriginal(alert)
								alerts.set(alert.taskId, a)
						}

						for (let alert of orderedAlerts) {
								if (alert.deletedDate) continue

								let alertName = (await Translator.getTranslation(alert.taskName))

								alertName = Markdown.escape(alertName.replace('[', '(').replace(']', ')'))
								if (alert.posts.length == 0) {
										console.log(`Alert ${alert.taskId} has no posts. ${alert.createdDate}`)
										continue
								}

								for (let post of alert.posts) {
										if (post.channel == this.channelMain.channelId) continue
										const channel = this.getChannelForId(post.channel)
										console.log(`Post ${post.messageId} in ${post.channel} (${channel?.cityName})`)
										const photo = channel?.canPostPhotos ?? false;

										if (!channelsWithAlerts.has(post.channel)) {
												channelsWithAlerts.set(post.channel, {
														photo: photo,
														alerts: new Array<HydratedDocument<IOriginalAlert>>
												})
										}

										channelsWithAlerts.get(post.channel)?.alerts.push(alert)
								}
						}

						if (channelsWithAlerts.size == 0) {
								await this.sendToOwner(`No alerts for ${date.format('YYYY-MM-DD')}`)
						}

						for (let channelsWithAlert of channelsWithAlerts) {
								const areaTree = new AreaTreeWithArray<PostWithTime>("Root")
								const channelAlerts = channelsWithAlert[1]
								const channelId = channelsWithAlert[0];
								const channel = this.getChannelForId(channelId)

								let date: Dayjs | null = null

								const cities = new Set<string>()

								for (let alert of channelAlerts.alerts) {
										const a = alerts.get(alert.taskId) ?? await Alert.fromOriginal(alert)

										for (let city of a.citiesList) {
												cities.add(city)
										}
										const post = alert.posts.find(p => p.channel == channelId)
										if (!date) date = a.startDate
										if (post)
												post.hasPhoto = channelAlerts.photo
										const areaWithTime = AreaTreeWithArray.fromAreaTree(a.areaTree, new PostWithTime(a.startDate, a.endDate, post))
										areaTree.merge(areaWithTime)
								}

								const formattedTree = await Alert.formatAreas(areaTree, channel?.cityName ?? null, false)
								const post = `*${caption}*\n\n${formattedTree}`
								//const post = `*${caption}*\n\n${formattedTree}`
								console.log(`==== SEND DAILY TO CHANNEL ${channelId} : ${channel?.cityName}, photo ${channel?.canPostPhotos} ====`)
								console.log(post)
								if (channelAlerts.photo) {
										const streets = await getStreets(areaTree, channel?.cityNameGe ?? null)
										const result = new Array<StreetFinderResult>()
										const realStreets = getRealStreets(streets, Array.from(cities), result)
										const color = Alert.colorDaily

										const mapUrl = drawMapFromStreetFinderResults(result, color)
										if (mapUrl) {
												const image = await drawCustom(color, mapUrl, channelId, "Alerts for", date?.format("DD MMMM YYYY") ?? "", "MyFile")
												if (post.length > 1024) {
														const url = await uploadImage(image)
														const imgText = TelegramFramework.formatImageMarkdown(url)
														await this.telegramFramework.sendMessage(
															{
																	chat_id: channelId,
																	text: imgText + post,
																	parse_mode: 'Markdown',
															}
														)

												} else
														await this.telegramFramework.sendPhoto(
															{
																	chat_id: channelId,
																	photo: MediaSource.path(image),
																	caption: post,
																	parse_mode: 'Markdown',
															}
														)
										}
								} else {
										await this.telegramFramework.sendMessage({chat_id: channelId, text: post, parse_mode: 'Markdown'})
								}
						}
				} catch (e) {
						await this.sendToOwnerError(e, {
								name: "postAlertsForDay",
								date: date.format('YYYY-MM-DD'),
								caption: caption
						})
				}
		}

		async fetchAndSendNewAlerts() {
				let errors = []
				let callCenterAlerts = 0
				try {
						await this.socarParser.fetchAlerts(true)
						for (let channel of this.channels) {
								if (channel.cityNameGe == null) continue
								const channelAlerts = await this.socarParser.getAlertsByCity(channel.cityNameGe)
								await this.sendSocarAlerts(channelAlerts, channel)
						}
				} catch (e) {
						await this.sendToOwnerError(e, "fetchAndSendNewAlerts socar")
				}
				try {
						const changedAlerts = await this.energoProParser.fetchAlerts(true)
						if (changedAlerts.length == 0) {
								await this.sendToOwner("No new alerts " + dayjs().format('YYYY-MM-DD HH:mm'),)
						} else {
							console.log(`==== CHANGED ALERTS ${changedAlerts.length}`)
								for (let changedAlert of changedAlerts) {
										let text: string | null = null
										console.log(`==== CHANGED ALERT ${changedAlert.translatedAlert.scName} city ${changedAlert.translatedAlert.citiesList}`)
										if (changedAlert.error !== null) {
												//don't post anything if error
												errors.push(changedAlert.error)
										} else if (changedAlert.deletedAlert) {
												//update posted alert as finished
												await this.updatePost(changedAlert.deletedAlert)
										} else if (changedAlert.oldAlert == null) {
												//new alert - post it
												if (changedAlert.translatedAlert.taskNote?.toLowerCase().includes("from call center")) {
														//skip call center alerts
														callCenterAlerts++
														console.log(`Skipping call center alert: ${changedAlert.translatedAlert.scName} /alert_${changedAlert.translatedAlert.taskId}`)
														continue
												}
												await this.sendAlertToChannels(changedAlert.translatedAlert)
										} else if (changedAlert.diffs.length > 0) {
												//changed alert - update posts
												const diffPrint = JSON.stringify(changedAlert.diffs)
												text = `Changed alert ${changedAlert.translatedAlert.scName} /alert_${changedAlert.translatedAlert.taskId}\n${diffPrint}`
										} else {
												//something is wrong
												text = `¯\\_(ツ)_/¯ /alert_${changedAlert.translatedAlert.taskId}`;
										}

										if (text) {
												await this.sendToOwner(text)
										}
								}
						}
				} catch (e) {
						await this.sendToOwnerError(e, "fetchAndSendNewAlerts energo pro")
				}
				if (errors.length > 0) {
						await this.sendToOwnerError(errors, "fetchAndSendNewAlerts")
				}
				if (callCenterAlerts > 0) {
						await this.sendToOwner(`Skipping ${callCenterAlerts} call center alerts`)
				}
				await this.sendToOwner("Done sending new alerts")
		}

		async getAlertsByDay(): Promise<Map<string, HydratedDocument<IOriginalAlert>[]>> {
				const alerts = await OriginalAlert.find()
				const map = new Map<string, HydratedDocument<IOriginalAlert>[]>()
				for (let alert of alerts) {
						const date = dayjs(alert.disconnectionDate).format('YYYY-MM-DD')
						if (!map.has(date)) {
								map.set(date, new Array<HydratedDocument<IOriginalAlert>>())
						}
						map.get(date)?.push(alert)
				}
				return map
		}


		async getAlertSummaryForDate(date: Dayjs, caption: string, cityName: string | null = null): Promise<string> {
				const alerts = await this.energoProParser.getAlertsFromDay(date)
				let regions = new Map<string, Array<Alert>>()
				for (let alert of alerts) {
						//Show only selected city if specified
						if (cityName && !alert.citiesList.has(cityName)) continue

						for (let region of alert.citiesList) {
								//Add for only selected city if specified
								if (cityName && region != cityName) continue
								if (!regions.has(region)) {
										regions.set(region, new Array<Alert>())
								}

								const regionArr = regions.get(region)
								regionArr?.push(alert)
						}
				}

				regions = new Map([...regions].sort((a, b) => a[0].localeCompare(b[0])))

				let text = `${caption}\n`

				if (regions.size == 0) {
						text += "No alerts"
				} else {
						for (let [region, alerts] of regions) {
								if (!cityName) //Don't show city name if it was specified
										text += `${region}\n`
								for (let alert of alerts) {
										text += `${alert.getPlanEmoji()} ${alert.formatStartTime()} - ${alert.formatEndTime()} /alert_${alert.taskId}\n`
								}
								text += "\n"
						}
				}

				return text
		}

		async sendUpcoming(context: MessageContext, cityCommand: string) {
				await context.sendChatAction("typing")
				const cities = await this.energoProParser.getCitiesList();
				const city = cities.revGet(cityCommand)
				if (!city) {
						await context.send(`No alerts for ${cityCommand}`)
						return
				}
				const upcomingDays: Array<Dayjs> = await this.energoProParser.getUpcomingDays(city)
				if (upcomingDays.length == 0) {
						await context.send(`No upcoming alerts for ${cityCommand}`)
						return
				}

				for (let date of upcomingDays) {
						const caption = `Alerts for ${date.toString()}`
						const s = await this.getAlertSummaryForDate(date, caption, city);
						await context.send(s)
				}
		}

		async updatePost(originalAlert: HydratedDocument<IOriginalAlert>) {
				if (!originalAlert.posts) {
						console.error("Cannot update posts about deleted alert: no posts in DB")
						return
				}

				const alert = await Alert.fromOriginal(originalAlert)

				for (let post of originalAlert.posts) {
						const channel = this.getChannelForId(post.channel)
						const text = await alert.formatSingleAlert(channel?.cityName ?? null)
						const photo = post.hasPhoto
						let msg: string | null = `Changing post ${getLinkFromPost(post)}`;
						if (photo) {
								const alertColor: AlertColor = alert.getAlertColor()
								const mapUrl = await drawMapFromAlert(alert, alertColor, channel?.cityNameGe ?? null)
									?? MapPlaceholderLink

								const image = await drawSingleAlert(alert, alertColor, mapUrl, post.channel)

								await this.telegramFramework.editMessageMedia({
										chat_id: post.channel,
										message_id: post.messageId,
										media: {
												type: 'photo',
												media: MediaSource.path(image),
												caption: text,
												parse_mode: 'Markdown',
										},
								}, e => {
										msg = null
								})

						} else {
								await this.telegramFramework.editMessageText({
										chat_id: post.channel,
										message_id: post.messageId,
										text,
										parse_mode: "Markdown"
								}, e => {
										msg = null
								})
						}

						if (msg != null)
								await this.sendToOwner(msg)
				}
		}

		async sendToOwner(text: string, parse_mode: Interfaces.PossibleParseMode | undefined = undefined): Promise<Interfaces.TelegramMessage | null> {
				if (!this.ownerId) return null
				console.log("==== SEND TO OWNER")
				const result = await this.telegramFramework.sendMessage({chat_id: this.ownerId, text: text, parse_mode})
				await new Promise(r => setTimeout(r, 100))
				return result
		}

		async sendToOwnerError(error: any, context: any): Promise<void> {
				let errorBody;
				if (Array.isArray(error)) {
						errorBody = error.map(x => JSON.stringify(x)).join("\n")
				} else {
						errorBody = JSON.stringify(error)
				}
				const errorText = `🌋🌋🌋 Unhandled error:\n\n${errorBody}\n\nContext: ${JSON.stringify(context)}`;
				console.error(error, context)
				console.error(errorText)
				const message = await this.sendToOwner(errorText).catch(e => {
						console.error("Error sending to owner", e)
						return null
				})
				if (!message) return
				await this.telegramFramework.telegram.api.pinChatMessage({
						chat_id: this.ownerId,
						message_id: message.message_id,
						disable_notification: false
				})
		}


		async run() {
				const controller = this;
				this.telegramFramework.onUpdates(UpdateType.Message, async context => {
						const text = context.text;

						console.log(`Message from ${context.from?.id} ${context.from?.username}`)

						if (text) {
								if (context.text?.startsWith('/')) {
										console.log(`Command ${context.text}`)
										switch (text) {
												case "/start":
														await context.send(`Let's start!\nMy commands:\n/today\n/tomorrow\n/upcoming\n/cities\n`,
															{reply_markup: new RemoveKeyboard(),})
														return
												case "/today": {
														await context.sendChatAction("typing")
														const date = dayjs();
														const caption = "Today's alerts:"
														const s = await controller.getAlertSummaryForDate(date, caption);
														await context.send(s)
														return
												}
												case "/tomorrow": {
														await context.sendChatAction("typing")
														let tomorrow = dayjs().add(1, "day")
														const caption = "Tomorrow's alerts:"
														const s = await controller.getAlertSummaryForDate(tomorrow, caption);
														await context.send(s)
														return
												}
												case "/upcoming": {
														await context.sendChatAction("typing")
														const upcomingDays: Array<Dayjs> = await controller.energoProParser.getUpcomingDays()

														if (upcomingDays.length == 0) {
																await context.send("No upcoming alerts")
																return
														}

														for (let date of upcomingDays) {
																const caption = `Alerts for ${date.format('YYYY-MM-DD')}`
																const s = await controller.getAlertSummaryForDate(date, caption);
																await context.send(s)
																await new Promise(r => setTimeout(r, 300))
														}
														return
												}
												case "/cities": {
														await context.sendChatAction("typing")
														const cities = await controller.energoProParser.getCitiesList()
														let text = "Cities with upcoming alerts:\n"
														const citiesSorted = Array.from(cities.values()).sort();
														for (let city of citiesSorted) {
																const cityName = cities.revGet(city);
																if (!cityName) continue
																text += `${cityName}:  ${controller.energoProParser.getAlertCount(cityName)}    /upcoming_${city} \n`
														}

														let kb: TelegramKeyboardButton[][] = []

														for (let i = 0; i < citiesSorted.length; i++) {
																const colCount = 3
																const row = Math.floor(i / colCount)
																const column = i % colCount
																if (!kb[row]) {
																		kb[row] = []
																}
																kb[row][column] = {text: `/upcoming_${citiesSorted[i]}`,}
														}

														await context.send(text,
															//{reply_markup: {keyboard: kb, one_time_keyboard: true, resize_keyboard: true}}
														)
														return
												}
										}

										if (text.startsWith("/alert_")) {
												await context.sendChatAction("typing")
												const taskId = Number.parseInt(text.replace("/alert_", ""));
												const city = text.split(" ")[1] ?? null
												let alertFromId = await controller.energoProParser.getAlertFromId(taskId);
												if (!alertFromId) {
														const originalAlert = await OriginalAlert.findOne({taskId})
														if (!originalAlert) {
																await context.send(`Cannot find alert with id ${taskId}`)
																return
														}
														alertFromId = await Alert.fromOriginal(originalAlert)
												}
												const formatSingleAlert = await alertFromId.formatSingleAlert(city);
												const alertColor: AlertColor = alertFromId.getAlertColor()
												const mapUrl = await drawMapFromAlert(alertFromId, alertColor, "ბათუმი") //energoProParser
													?? MapPlaceholderLink

												const image = await drawSingleAlert(alertFromId, alertColor, mapUrl, "@bot")
												await context.sendPhoto(MediaSource.path(image), {
														caption: formatSingleAlert,
														parse_mode: 'Markdown'
												})

												return
										}

										if (text.startsWith("/upcoming_")) {
												const cityCommand = text.replace("/upcoming_", "")
												await controller.sendUpcoming(context, cityCommand);
												return
										}

										if (text.startsWith("/draw")) {
												const cities = text.replace("/draw", "")
												const streets = getStreetsFromInput(cities)
												const results = new Array<StreetFinderResult>()
												const realStreets = getRealStreets(streets, null, results)
												const resultFormatted = results.map(x => `${x.input} -> ${x.match}    ${(x.rating * 100).toLocaleString('en-US', {
														minimumIntegerDigits: 2,
														useGrouping: false
												})}%`).join("\n")
												const returnText = `Real streets:\n${resultFormatted}`
												const mapUrl = drawMapFromStreetFinderResults(results, Alert.colorRandom)
												if (mapUrl) {
														const image = await drawCustom(Alert.colorRandom, mapUrl, "@alerts_batumi", "Debug", "Debug", "MyFile")
														await context.sendPhoto(MediaSource.path(image),)
												}
												await context.send(returnText, {parse_mode: 'Markdown'})
										}

										if (text.startsWith("/update")) {
												const id = Number.parseInt(text.replace("/update", ""))
												const alert = await controller.energoProParser.getOriginalAlertFromId(id)
												if (alert)
														await controller.updatePost(alert)
										}
								} else {
										console.log(`Simple text ${context.text}`)
								}
						} else {
								console.log("Not a text")
						}
				})

// Set commands
				const commands = [
						{command: "today", description: "All today warnings"},
						{command: "tomorrow", description: "All tomorrow warnings"},
						{command: "upcoming", description: "All upcoming alerts grouped by day"},
						{command: "cities", description: "All cities with upcoming alerts"},
				];

				this.telegramFramework.setMyCommands({commands}).then(value => console.log("Set my commands", value, commands))

				const mongoConnectString = process.env.MONGODB_CONNECT_STRING;

				if (!mongoConnectString) {
						throw new Error("MONGODB_CONNECT_STRING env variable is missing")
				}

				await mongoose.connect(mongoConnectString)

				this.energoProParser = new EnergoProParser(this.channels);
				this.socarParser = new SocarParser(this.channels);

				if (process.env.NODE_ENV !== 'development') {
						await this.fetchAndSendNewAlerts();
				}

				const tgFmw = this.telegramFramework;

				this.telegramFramework.startPollingUpdates().then(success => {
						console.log(`@${tgFmw.botUsername} launched: ${success}`);
						this.sendToOwner("Bot launched")
				})
		}

		stopPollingUpdates() {
				this.telegramFramework.stopPollingUpdates()
		}

		private async sendSocarAlerts(channelAlerts: Array<HydratedDocument<ISocarAlert>>, channel: CityChannel) {
				for (let alert of channelAlerts) {
						if (!alert.isActual()) continue
						const text = await alert.format()

						await this.telegramFramework.sendMessage({
								chat_id: channel.channelId,
								text,
								parse_mode: 'Markdown',
						});
				}
		}
}
