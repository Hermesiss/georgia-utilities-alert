import {createCanvas, loadImage} from "canvas";
import fs from "fs";
import {Alert, PlanType} from "../batumiElectricity/types";

export class AlertColor {
  bg: string
  line: string | null
  caption: string

  get lineMapFormatted(): string {
    return this.line ? `0x${this.line.replace('#', '')}FF` : "0x000000FF"
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
  return drawImage(mapUrl, date, time,imgFilename, alertColor.bg, alertColor.caption, channel)
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
  const data = await loadImage(url)

  context.fillStyle = bgColor
  context.fillRect(0, 0, 640, 872)
  context.drawImage(data, 0, 182, 640, 640)

  context.font = '36pt Helvetica'
  context.textBaseline = 'top'
  context.textAlign = 'center'
  context.fillStyle = '#fff'

  const textX = 320
  context.fillText(date, textX, 18)
  //context.font = '30pt Helvetica'
  //context.strokeText(date, textX, 24)
  context.fillText(time, textX, 102)

  if (bottomRight) {
    context.font = '18pt Helvetica'
    context.textAlign = 'right'
    context.fillStyle = '#FFFFFF'
    context.fillText(bottomRight, 640 - 12, 832)
  }

  if (bottomLeft) {
    context.font = '18pt Helvetica'
    context.textAlign = 'left'
    context.fillStyle = '#FFFFFF'
    context.fillText(bottomLeft, 12, 832)
  }

  const imgBuffer = canvas.toBuffer('image/png')
  const imgPath = `./dist/${imgFilename}.png`
  fs.writeFileSync(imgPath, imgBuffer)
  return imgPath
}
