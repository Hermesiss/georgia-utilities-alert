import dotenv from 'dotenv';
import {Markdown, MediaSource, RemoveKeyboard, UpdateType} from 'puregram'
import {BatumiElectricityParser} from "../batumiElectricity";
import {Alert, CityChannel} from "../batumiElectricity/types";
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
  drawMapFromAlert,
  drawMapFromStreets,
  getRealStreets,
  getStreetsFromInput,
  prepareGeoJson
} from "../map";

dotenv.config();

const envError = (envName: string) => {
  throw Error(`Missing ${envName} env value`);
}

const port = process.env.PORT || 8000;
const ownerId = process.env.TELEGRAM_OWNER_ID ?? envError("TELEGRAM_OWNER_ID")
const token = process.env.TELEGRAM_BOT_TOKEN ?? envError("TELEGRAM_BOT_TOKEN")

const telegramFramework = new TelegramFramework(token);
let batumi: BatumiElectricityParser;

const channels = new Array<CityChannel>()

channels.push(new CityChannel("Batumi", process.env.TELEGRAM_CHANNEL_BATUMI ?? envError("TELEGRAM_CHANNEL_BATUMI"), true)) //TODO change to true
channels.push(new CityChannel("Kutaisi", process.env.TELEGRAM_CHANNEL_KUTAISI ?? envError("TELEGRAM_CHANNEL_KUTAISI")))
channels.push(new CityChannel("Kobuleti", process.env.TELEGRAM_CHANNEL_KOBULETI ?? envError("TELEGRAM_CHANNEL_KOBULETI")))

// city name is null for area formatting - we are stripping another cities for posting in city-related channel
const channelMain = new CityChannel(null, process.env.TELEGRAM_CHANNEL_MAIN ?? "skip")

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
  if (process.env.TELEGRAM_DISABLE_CHANNELS == "true") return

  const channels = getChannelsForAlert(alert)

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
    console.log("==== SEND TO CHANNEL")
    const text = await alert.formatSingleAlert(channel.cityName)
    const postPhoto = channel.canPostPhotos
    try {
      let msg: TelegramMessage | null;
      const alertColor: AlertColor = alert.getAlertColor()
      const mapUrl = drawMapFromAlert(alert, alertColor, channel.cityName)
      if (postPhoto && mapUrl != null) {
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
          hasPhoto: (postPhoto && mapUrl != null)
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
}

async function postAlertsForDay(date: Dayjs, caption: string): Promise<void> {
  const alerts = await batumi.getOriginalAlertsFromDay(date)
  console.log(`Posting ${alerts.length} alerts for ${date.format('YYYY-MM-DD')}`)
  const orderedAlerts = alerts.sort((a, b) => dayjs(a.disconnectionDate).unix() - dayjs(b.disconnectionDate).unix())

  const channelsWithAlerts = new Map<string, string[]>()
  const channelsWithPhotoAlerts = new Map<string, Alert[]>()

  for (let alert of orderedAlerts) {
    if (alert.deletedDate) continue

    const disconnectionTime = dayjs(alert.disconnectionDate).format('HH:mm')
    const reconnectionTime = dayjs(alert.reconnectionDate).format('HH:mm')
    let alertName = (await Translator.getTranslation(alert.taskName))

    alertName = Markdown.escape(alertName.replace('[', '(').replace(']', ')'))
    if (alert.posts.length == 0) {
      console.log(`Alert ${alert.taskId} has no posts. ${alert.createdDate}`)
      continue
    }

    for (let post of alert.posts) {
      if (post.channel == channelMain.channelId) continue

      if (post.hasPhoto) {
        if (!channelsWithPhotoAlerts.has(post.channel)) {
          channelsWithPhotoAlerts.set(post.channel, new Array<Alert>())
        }
        const a = await Alert.fromOriginal(alert)
        channelsWithPhotoAlerts.get(post.channel)?.push(a)
      } else {
        if (!channelsWithAlerts.has(post.channel)) {
          channelsWithAlerts.set(post.channel, new Array<string>())
        }


        const link = getLinkFromPost(post)
        const markdownLink = `[${disconnectionTime}-${reconnectionTime} ${alertName}](${link})\n`

        channelsWithAlerts.get(post.channel)?.push(markdownLink)
      }
    }
  }

  if (channelsWithAlerts.size == 0 && channelsWithPhotoAlerts.size == 0) {
    await sendToOwner(`No alerts for ${date.format('YYYY-MM-DD')}`)
  }

  for (let channelsWithPhotoAlert of channelsWithPhotoAlerts) {
    // TODO merge all alert areas into one area with time ranges
    // TODO display list of streets with time ranges and links to alerts
    // TODO create one map image for all alerts
    // TODO send photo
  }

  for (let channelsWithAlert of channelsWithAlerts) {
    const post = `*${caption}*\n\n${channelsWithAlert[1].join('')}`
    console.log("==== SEND DAILY TO CHANNEL")
    await telegramFramework.sendMessage({chat_id: channelsWithAlert[0], text: post, parse_mode: 'Markdown'})
  }
}


async function fetchAndSendNewAlerts() {
  const changedAlerts = await batumi.fetchAlerts(true)
  if (changedAlerts.length == 0) {
    await sendToOwner("No new alerts " + dayjs().format('YYYY-MM-DD HH:mm'),)
  } else {
    for (let changedAlert of changedAlerts) {
      let text: string | null = null
      if (changedAlert.deletedAlert) {
        await updatePost(changedAlert.deletedAlert)
      } else if (changedAlert.oldAlert == null) {
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
}

const run = async () => {
  const mongoConnectString = process.env.MONGODB_CONNECT_STRING;

  if (!mongoConnectString) {
    throw new Error("MONGODB_CONNECT_STRING env variable is missing")
  }

  await mongoose.connect(mongoConnectString)

  await prepareGeoJson()

  const app: Express = express();

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
      }, "postAlertsForDayAfterTomorrow"
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
        await postAlertsForDay(dayjs(), "Today!")
      }, "postAlertsForToday"
    ).then()
    res.send("OK")
  })

  app.post('/api/actions/sendTomorrow', (req: Request, res: Response) => {
    callAsyncAndMeasureTime(
      async () => {
        await sendToOwner("Daily evening report " + dayjs().format('YYYY-MM-DD HH:mm'))
        await postAlertsForDay(dayjs().add(1, 'day'), "Tomorrow")
      }, "postAlertsForTomorrow"
    ).then()
    res.send("OK")
  })

  app.listen(port, () => {
  });

  batumi = new BatumiElectricityParser();

  await fetchAndSendNewAlerts();

  telegramFramework.startPollingUpdates().then(success => console.log(`@${telegramFramework.botUsername} launched: ${success}`))
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
    let msg = `Changing post ${getLinkFromPost(post)}`;

    if (photo) {
      const alertColor: AlertColor = alert.getAlertColor()
      const mapUrl = drawMapFromAlert(alert, alertColor, channel?.cityName ?? null)
      if (mapUrl) {
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
          msg += `\n\nError: ${e}`
        })
      }

      await telegramFramework.editMessageCaption({
        chat_id: post.channel,
        message_id: post.messageId,
        media: {
          type: 'photo', caption: text,
          parse_mode: 'Markdown',
        },
      }, e => {
        msg += `\n\nError: ${e}`
      })

    } else {
      await telegramFramework.editMessageText({
        chat_id: post.channel,
        message_id: post.messageId,
        text,
        parse_mode: "Markdown"
      }, e => {
        msg += `\n\nError: ${e}`
      })
    }
    await sendToOwner(msg)
  }
}

async function sendToOwner(text: string, parse_mode: Interfaces.PossibleParseMode | undefined = undefined) {
  if (!ownerId) return
  console.log("==== SEND TO OWNER")
  await telegramFramework.sendMessage({chat_id: ownerId, text: text, parse_mode})
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
        const alertFromId = await batumi.getAlertFromId(taskId);
        if (!alertFromId) {
          context.send(`Cannot find alert with id ${taskId}`)
          return
        }
        const formatSingleAlert = await alertFromId.formatSingleAlert(city);
        const alertColor: AlertColor = alertFromId.getAlertColor()
        const mapUrl = drawMapFromAlert(alertFromId, alertColor, "Batumi")
        if (mapUrl) {
          const image = await drawSingleAlert(alertFromId, alertColor, mapUrl, "@bot")
          context.sendPhoto(MediaSource.path(image), {caption: formatSingleAlert, parse_mode: 'Markdown'})
        } else {
          context.send(formatSingleAlert || "", {parse_mode: 'Markdown'})
        }
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
        const realStreets = getRealStreets(streets)
        const returnText = `Real streets:\n${Array.from(realStreets).join("\n")}`
        const mapUrl = drawMapFromStreets(realStreets, Alert.colorPlanned)
        if (mapUrl) {
          const image = await drawCustom(Alert.colorPlanned, mapUrl, "@alerts_batumi", "Kek", "Shrek", "MyFile")
          context.sendPhoto(MediaSource.path(image), {caption: returnText, parse_mode: 'Markdown'})
        } else {
          context.send(returnText, {parse_mode: 'Markdown'})
        }
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
