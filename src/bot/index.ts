import dotenv from 'dotenv';
import {Markdown, MediaSource, RemoveKeyboard, UpdateType} from 'puregram'
import {BatumiElectricityParser} from "../batumiElectricity";
import {
  Alert,
  AreaTree,
  AreaTreeWithArray,
  AreaTreeWithData,
  CityChannel,
  PostWithTime
} from "../batumiElectricity/types";
import express, {Express, Request, Response} from 'express';
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
import http from "http";

dotenv.config();

const envError = (envName: string) => {
  throw Error(`Missing ${envName} env value`);
}

const port = process.env.PORT || 8000;
const ownerId = process.env.TELEGRAM_OWNER_ID ?? envError("TELEGRAM_OWNER_ID")
const token = process.env.TELEGRAM_BOT_TOKEN ?? envError("TELEGRAM_BOT_TOKEN")

const telegramFramework = new TelegramFramework(token);
telegramFramework.setUnknownErrorHandler((e, c) => sendToOwnerError(e, c))
let batumi: BatumiElectricityParser;

const channels = new Array<CityChannel>()

let app: Express;
let server: http.Server;

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Shutting down.');

  if (server) {
    server.close(() => {
      console.log('Express server closed');
    });
  } else {
    console.log("No server to close")
  }

  console.log("Stopping telegram")
  telegramFramework.stopPollingUpdates()

  while (batumi.isFetching) {
    console.log("Waiting for fetch to finish")
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("Exiting")
  process.exit(0);
});

function addChannel(cityName: string, cityNameGe: string | null, env: string) {
  const canPostPhotos = process.env[env + "_PHOTOS"] == "true"
  const channelId = process.env[env] ?? envError(env)
  if (channelId == "skip") return
  channels.push(new CityChannel(cityName, cityNameGe, channelId, canPostPhotos))
}

addChannel("Batumi", "ბათუმი", "TELEGRAM_CHANNEL_BATUMI")
addChannel("Kutaisi", "ქუთაისი", "TELEGRAM_CHANNEL_KUTAISI")
addChannel("Kobuleti", "ქობულეთი", "TELEGRAM_CHANNEL_KOBULETI")

// city name is null for area formatting - we are stripping another cities for posting in city-related channel
const channelMain = new CityChannel(null, null, process.env.TELEGRAM_CHANNEL_MAIN ?? "skip")

function getChannelForCity(city: string): CityChannel | null {
  for (let channel of channels) {
    if (channel.cityName == city) {
      return channel
    }
  }
  return null
}

function getChannelForId(channelId: string): CityChannel | null {
  for (let channel of channels) {
    if (channel.channelId == channelId) {
      return channel
    }
  }
  return null
}

function getChannelsForAlert(alert: Alert): Set<CityChannel> {
  //main channel and local channels for alert
  const s = new Set<CityChannel>()
  if (channelMain.channelId != "skip") {
    s.add(channelMain)
  }
  for (let string of alert.citiesList) {
    const c = getChannelForCity(string)
    if (c != null)
      s.add(c)
  }
  return s;
}

async function sendAlertToChannels(alert: Alert): Promise<void> {
  const channels = getChannelsForAlert(alert)
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
        msg = await telegramFramework.sendPhoto({
          chat_id: channel.channelId,
          photo: MediaSource.path(image),
          caption: text,
          parse_mode: 'Markdown',
          disable_notification: !notify
        })
      } else {
        msg = await telegramFramework.sendMessage({
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
async function editAllPostedAlerts(onListCreated?: (links: string) => void | null): Promise<void> {
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

      await updatePost(alert)

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
    await sendToOwnerError(e, "editAllPostedAlerts")
  }
}

async function postAlertsForDay(date: Dayjs, caption: string): Promise<void> {
  try {
    const originalAlerts = await batumi.getOriginalAlertsFromDay(date)
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
        if (post.channel == channelMain.channelId) continue
        const channel = getChannelForId(post.channel)
        console.log(`Post ${post.messageId} in ${post.channel} (${channel?.cityName})`)
        const photo = channel?.canPostPhotos ?? false;

        if (!channelsWithAlerts.has(post.channel)) {
          channelsWithAlerts.set(post.channel, {photo: photo, alerts: new Array<HydratedDocument<IOriginalAlert>>})
        }

        channelsWithAlerts.get(post.channel)?.alerts.push(alert)
      }
    }

    if (channelsWithAlerts.size == 0) {
      await sendToOwner(`No alerts for ${date.format('YYYY-MM-DD')}`)
    }

    for (let channelsWithAlert of channelsWithAlerts) {
      const areaTree = new AreaTreeWithArray<PostWithTime>("Root")
      const channelAlerts = channelsWithAlert[1]
      const channelId = channelsWithAlert[0];
      const channel = getChannelForId(channelId)

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
            await telegramFramework.sendMessage(
              {
                chat_id: channelId,
                text: imgText + post,
                parse_mode: 'Markdown',
              }
            )

          } else
            await telegramFramework.sendPhoto(
              {
                chat_id: channelId,
                photo: MediaSource.path(image),
                caption: post,
                parse_mode: 'Markdown',
              }
            )
        }
      } else
        await telegramFramework.sendMessage({chat_id: channelId, text: post, parse_mode: 'Markdown'})
    }
  } catch (e) {
    await sendToOwnerError(e, {name: "postAlertsForDay", date: date.format('YYYY-MM-DD'), caption: caption})
  }
}


async function fetchAndSendNewAlerts() {
  let errors = []
  try {
    const changedAlerts = await batumi.fetchAlerts(true)
    if (changedAlerts.length == 0) {
      await sendToOwner("No new alerts " + dayjs().format('YYYY-MM-DD HH:mm'),)
    } else {
      for (let changedAlert of changedAlerts) {
        let text: string | null = null
        if (changedAlert.error !== null) {
          errors.push(changedAlert.error)
        } else if (changedAlert.deletedAlert) {
          await updatePost(changedAlert.deletedAlert)
        } else if (changedAlert.oldAlert == null) {
          if (changedAlert.translatedAlert.taskNote?.toLowerCase().includes("from call center")) {
            //skip call center alerts
            continue
          }
          await sendAlertToChannels(changedAlert.translatedAlert)
        } else if (changedAlert.diffs.length > 0) {
          const diffPrint = JSON.stringify(changedAlert.diffs)
          text = `Changed alert ${changedAlert.translatedAlert.scName} /alert_${changedAlert.translatedAlert.taskId}\n${diffPrint}`
        } else {
          //something is wrong
          text = `¯\\_(ツ)_/¯ /alert_${changedAlert.translatedAlert.taskId}`;
        }

        if (text) {
          await sendToOwner(text)
        }
      }
    }
  } catch (e) {
    await sendToOwnerError(e, "fetchAndSendNewAlerts")
  }
  if (errors.length > 0)
    await sendToOwnerError(errors, "fetchAndSendNewAlerts")
  await sendToOwner("Done sending new alerts")
}

const run = async () => {
  const mongoConnectString = process.env.MONGODB_CONNECT_STRING;

  if (!mongoConnectString) {
    throw new Error("MONGODB_CONNECT_STRING env variable is missing")
  }

  await mongoose.connect(mongoConnectString)

  //await prepareGeoJson()

  app = express();

  app.use(express.static('public'))

  app.get('/', (req: Request, res: Response) => {
    res.send('Georgia Utilities Alert');
  });

  app.post('/api/actions/updatePostedAlerts', (req: Request, res: Response) => {
    callAsyncAndMeasureTime(
      async () => {
        await sendToOwner("Daily midnight renaming " + dayjs().format('YYYY-MM-DD HH:mm'))
        await editAllPostedAlerts(links => {
          res.send(links);
        })
        await sendToOwner("Daily midnight renaming ended " + dayjs().format('YYYY-MM-DD HH:mm'))
      }, "updatePostedAlerts"
    )
  })

  app.post('/api/actions/checkAlerts', (req: Request, res: Response) => {
    fetchAndSendNewAlerts().then()
    res.send("OK")
  })

  app.post('/api/actions/sendToday', (req: Request, res: Response) => {
    callAsyncAndMeasureTime(
      async () => {
        await sendToOwner("Daily morning report " + dayjs().format('YYYY-MM-DD HH:mm'))
        const date = dayjs().format('YYYY-MM-DD')
        await postAlertsForDay(dayjs(), `Today! ${date}`)
      }, "postAlertsForToday"
    ).then()
    res.send("OK")
  })

  app.post('/api/actions/sendTomorrow', (req: Request, res: Response) => {
    callAsyncAndMeasureTime(
      async () => {
        await sendToOwner("Daily evening report " + dayjs().format('YYYY-MM-DD HH:mm'))
        const tomorrowDate = dayjs().add(1, 'day').format('YYYY-MM-DD')
        await postAlertsForDay(dayjs().add(1, 'day'), `Tomorrow, ${tomorrowDate}`)
      }, "postAlertsForTomorrow"
    ).then()
    res.send("OK")
  })

  app.post('/api/actions/sendDate/:date', (req: Request, res: Response) => {
    const date = req.params.date
    callAsyncAndMeasureTime(
      async () => {
        await sendToOwner(`Report for day ${date} at ${dayjs().format('YYYY-MM-DD HH:mm')}`)
        const dateObj = dayjs(date);
        await postAlertsForDay(dateObj, dateObj.format("DD MMMM YYYY"))
      }, "postAlertsForDay"
    ).then()
    res.send("OK")
  })

  server = app.listen(port, () => {
  });

  batumi = new BatumiElectricityParser(channels);

  if (process.env.NODE_ENV !== 'development') {
    await fetchAndSendNewAlerts();
  }

  telegramFramework.startPollingUpdates().then(success => {
    console.log(`@${telegramFramework.botUsername} launched: ${success}`);
    sendToOwner("Bot launched")
  })
}


async function callAsyncAndMeasureTime(func: () => Promise<void>, fnName: string) {
  const start = Date.now()
  await func()
  const end = Date.now()
  console.log(`${fnName} Finished in ${end - start} ms`)
}

//aggregate alerts by day in disconnectionDate. TODO TEST THIS
async function getAlertsByDay(): Promise<Map<string, HydratedDocument<IOriginalAlert>[]>> {
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


async function getAlertSummaryForDate(date: Dayjs, caption: string, cityName: string | null = null): Promise<string> {
  const alerts = await batumi.getAlertsFromDay(date)
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

async function sendUpcoming(context: MessageContext, cityCommand: string) {
  await context.sendChatAction("typing")
  const cities = await batumi.getCitiesList();
  const city = cities.revGet(cityCommand)
  if (!city) {
    await context.send(`No alerts for ${cityCommand}`)
    return
  }
  const upcomingDays: Array<Dayjs> = await batumi.getUpcomingDays(city)
  if (upcomingDays.length == 0) {
    await context.send(`No upcoming alerts for ${cityCommand}`)
    return
  }

  for (let date of upcomingDays) {
    const caption = `Alerts for ${date.toString()}`
    const s = await getAlertSummaryForDate(date, caption, city);
    await context.send(s)
  }
}

async function updatePost(originalAlert: HydratedDocument<IOriginalAlert>) {
  if (!originalAlert.posts) {
    console.error("Cannot update posts about deleted alert: no posts in DB")
    return
  }

  const alert = await Alert.fromOriginal(originalAlert)

  for (let post of originalAlert.posts) {
    const channel = getChannelForId(post.channel)
    const text = await alert.formatSingleAlert(channel?.cityName ?? null)
    const photo = post.hasPhoto
    let msg: string | null = `Changing post ${getLinkFromPost(post)}`;
    if (photo) {
      const alertColor: AlertColor = alert.getAlertColor()
      const mapUrl = await drawMapFromAlert(alert, alertColor, channel?.cityNameGe ?? null)
        ?? MapPlaceholderLink

      const image = await drawSingleAlert(alert, alertColor, mapUrl, post.channel)

      await telegramFramework.editMessageMedia({
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
      await telegramFramework.editMessageText({
        chat_id: post.channel,
        message_id: post.messageId,
        text,
        parse_mode: "Markdown"
      }, e => {
        msg = null
      })
    }

    if (msg != null)
      await sendToOwner(msg)
  }
}

async function sendToOwner(text: string, parse_mode: Interfaces.PossibleParseMode | undefined = undefined): Promise<Interfaces.TelegramMessage | null> {
  if (!ownerId) return null
  console.log("==== SEND TO OWNER")
  return await telegramFramework.sendMessage({chat_id: ownerId, text: text, parse_mode})
}

async function sendToOwnerError(error: any, context: any) {
  let errorBody;
  if (Array.isArray(error)) {
    errorBody = error.map(x => JSON.stringify(x)).join("\n")
  } else {
    errorBody = JSON.stringify(error)
  }
  const errorText = `🌋🌋🌋 Unhandled error:\n\n${errorBody}\n\nContext: ${JSON.stringify(context)}`;
  console.error(error, context)
  console.error(errorText)
  const message = await sendToOwner(errorText).catch(e => {
    console.error("Error sending to owner", e)
    return null
  })
  if (!message) return
  await telegramFramework.telegram.api.pinChatMessage({
    chat_id: ownerId,
    message_id: message.message_id,
    disable_notification: false
  })
}

telegramFramework.onUpdates(UpdateType.Message, async context => {
  const text = context.text;

  console.log(`Message from ${context.from?.id} ${context.from?.username}`)

  if (text) {
    if (context.text?.startsWith('/')) {
      console.log(`Command ${context.text}`)
      switch (text) {
        case "/start":
          context.send(`Let's start!\nMy commands:\n/today\n/tomorrow\n/upcoming\n/cities\n`,
            {reply_markup: new RemoveKeyboard(),})
          return
        case "/today": {
          context.sendChatAction("typing")
          const date = dayjs();
          const caption = "Today's alerts:"
          const s = await getAlertSummaryForDate(date, caption);
          context.send(s)
          return
        }
        case "/tomorrow": {
          context.sendChatAction("typing")
          let tomorrow = dayjs().add(1, "day")
          const caption = "Tomorrow's alerts:"
          const s = await getAlertSummaryForDate(tomorrow, caption);
          context.send(s)
          return
        }
        case "/upcoming": {
          context.sendChatAction("typing")
          const upcomingDays: Array<Dayjs> = await batumi.getUpcomingDays()

          if (upcomingDays.length == 0) {
            await context.send("No upcoming alerts")
            return
          }

          for (let date of upcomingDays) {
            const caption = `Alerts for ${date.format('YYYY-MM-DD')}`
            const s = await getAlertSummaryForDate(date, caption);
            await context.send(s)
            await new Promise(r => setTimeout(r, 300))
          }
          return
        }
        case "/cities": {
          context.sendChatAction("typing")
          const cities = await batumi.getCitiesList()
          let text = "Cities with upcoming alerts:\n"
          const citiesSorted = Array.from(cities.values()).sort();
          for (let city of citiesSorted) {
            const cityName = cities.revGet(city);
            if (!cityName) continue
            text += `${cityName}:  ${batumi.getAlertCount(cityName)}    /upcoming_${city} \n`
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
        context.sendChatAction("typing")
        const taskId = Number.parseInt(text.replace("/alert_", ""));
        const city = text.split(" ")[1] ?? null
        let alertFromId = await batumi.getAlertFromId(taskId);
        if (!alertFromId) {
          const originalAlert = await OriginalAlert.findOne({taskId})
          if (!originalAlert) {
            context.send(`Cannot find alert with id ${taskId}`)
            return
          }
          alertFromId = await Alert.fromOriginal(originalAlert)
        }
        const formatSingleAlert = await alertFromId.formatSingleAlert(city);
        const alertColor: AlertColor = alertFromId.getAlertColor()
        const mapUrl = await drawMapFromAlert(alertFromId, alertColor, "ბათუმი") //batumi
          ?? MapPlaceholderLink

        const image = await drawSingleAlert(alertFromId, alertColor, mapUrl, "@bot")
        context.sendPhoto(MediaSource.path(image), {caption: formatSingleAlert, parse_mode: 'Markdown'})

        return
      }

      if (text.startsWith("/upcoming_")) {
        const cityCommand = text.replace("/upcoming_", "")
        await sendUpcoming(context, cityCommand);
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
        context.send(returnText, {parse_mode: 'Markdown'})
      }

      if (text.startsWith("/update")) {
        const id = Number.parseInt(text.replace("/update", ""))
        const alert = await batumi.getOriginalAlertFromId(id)
        if (alert)
          await updatePost(alert)
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

telegramFramework.setMyCommands({commands}).then(value => console.log("Set my commands", value, commands))

run().then()
