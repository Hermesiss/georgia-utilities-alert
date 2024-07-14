import {createCanvas, Image, loadImage} from "canvas";
import fs from "fs";
import {Alert} from "../parsers/energoPro/types";
import {MapPlaceholderLink} from "../map/types";

export class AlertColor {
  bg: string
  line: string | null
  caption: string

  get lineMapFormatted(): string | null {
    return this.line ? `0x${this.line.replace('#', '')}FF` : null
  }

  constructor(bg: string, line: string | null, caption: string) {
    this.bg = bg
    this.line = line
    this.caption = caption
  }
}

/**
 * @param alert
 * @param alertColor
 * @param mapUrl - url to map image
 * @param channel - channel name for watermark
 * @returns path to generated image
 */
export async function drawSingleAlert(alert: Alert, alertColor: AlertColor, mapUrl: string, channel: string): Promise<string> {
  const date = alert.startDate.format("DD MMMM YYYY");
  const time = `${alert.startDate.format("HH:mm")} - ${alert.endDate.format("HH:mm")}`
  return drawImage(mapUrl, date, time, alert.taskId.toString(), alertColor.bg, alertColor.caption, channel)
}

export async function drawCustom(alertColor: AlertColor, mapUrl: string, channel: string, date: string, time: string, imgFilename: string): Promise<string> {
  return drawImage(mapUrl, date, time, imgFilename, alertColor.bg, alertColor.caption, channel)
}

export async function drawSocar(channel: string, date: string, time: string, imgFilename: string): Promise<string> {
  return drawImage(MapPlaceholderLink, date, time, imgFilename, '#ffff00', channel)
}

/**
 *
 * @param url
 * @param date
 * @param time
 * @param imgFilename
 * @param bgColor
 * @param bottomLeft
 * @param bottomRight
 * @returns path to generated image
 */
async function drawImage(url: string, date: string, time: string, imgFilename: string, bgColor: string, bottomLeft?: string, bottomRight?: string): Promise<string> {
  const canvas = createCanvas(640, 872)
  const context = canvas.getContext('2d')
  let data: Image;

  try {
    data = await loadImage(url);
  } catch (e) {
    console.error("Error loading image", e)
    data = await loadImage(MapPlaceholderLink)
  }

  const scale = await loadImage('./src/imageGeneration/img/map-scale.png')
  //const scale = await loadImage('/img/map-scale.png')

  context.fillStyle = bgColor
  context.fillRect(0, 0, 640, 872)
  context.drawImage(data, 0, 182, 640, 640)

  context.font = '36pt Sans'
  context.textBaseline = 'top'
  context.textAlign = 'center'
  context.fillStyle = '#fff'

  const textX = 320
  context.fillText(date, textX, 18)
  //context.font = '30pt Sans'
  //context.strokeText(date, textX, 24)
  context.fillText(time, textX, 102)

  if (bottomRight) {
    context.font = '18pt Sans'
    context.textAlign = 'right'
    context.fillStyle = '#FFFFFF'
    context.fillText(bottomRight, 640 - 12, 832)
  }

  if (bottomLeft) {
    context.font = '18pt Sans'
    context.textAlign = 'left'
    context.fillStyle = '#FFFFFF'
    context.fillText(bottomLeft, 12, 832)
  }

  context.drawImage(scale, 354, 184, 284, 29)

  const imgBuffer = canvas.toBuffer('image/png')
  const imgPath = `./dist/${imgFilename}.png`
  fs.writeFileSync(imgPath, imgBuffer)
  return imgPath
}
