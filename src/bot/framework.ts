import {APIError, Markdown, RemoveKeyboard, Telegram, UpdateType} from 'puregram'
import {
  EditMessageCaptionParams, EditMessageMediaParams,
  EditMessageTextParams,
  SendMessageParams,
  SendPhotoParams,
  SetMyCommandsParams
} from "puregram/lib/generated/methods";
import * as Interfaces from "puregram/lib/generated/telegram-interfaces";
import {Known, MaybeArray} from "puregram/lib/types/types";
import {ContextsMapping} from "puregram/lib/types/mappings";
import {Middleware} from "middleware-io";
import {Updates} from "puregram/lib/updates";

export class TelegramFramework {
  public telegram: Telegram;
  private errorHandler: ((error: any, context: any) => any) | null;

  get botUsername() {
    return this.telegram.bot.username
  }

  constructor(token: string) {
    this.telegram = Telegram.fromToken(token)
  }

  async setMyCommands(params: SetMyCommandsParams): Promise<true> {
    return await this.telegram.api.setMyCommands(params)
  }

  setErrorHandler(handler: ((error: any, context: any) => any) | null) {
    this.errorHandler = handler
  }

  onUpdates<K extends keyof Known<ContextsMapping>, T = {}>(events: MaybeArray<K>, handler: MaybeArray<Middleware<ContextsMapping[K] & T>>): Updates {
    return this.telegram.updates.on(events, handler)
  }

  async startPollingUpdates(): Promise<boolean> {
    return await this.telegram.updates.startPolling()
  }

  /**
   * A hack to post image with longer caption
   * Normally, telegram api doesn't allow to post image with caption longer than 1024 symbols
   * But we can post a normal message with link to image so that it will be shown as preview
   * @param imageUrl
   */
  static formatImageMarkdown(imageUrl: string | null): string {
    if (imageUrl == null) return ""
    return `\n[​​​​​​​​​​​](${imageUrl})`
  }


  async sendPhoto(params: SendPhotoParams, onError?: (e: any) => any): Promise<Interfaces.TelegramMessage | null> {
    console.log("==== SEND PHOTO")
    return await this.tgActionWithRetry(() => this.telegram.api.sendPhoto(params), onError)
  }

  async sendMessage(params: SendMessageParams, onError?: (e: any) => any): Promise<Interfaces.TelegramMessage | null> {
    console.log(`==== SEND MESSAGE to ${params.chat_id}`)
    return await this.tgActionWithRetry(() => this.telegram.api.sendMessage(params), onError)
  }

  private async tgActionWithRetry<T>(tgAction: () => Promise<Interfaces.TelegramMessage | T>, onError?: (e: any) => any) {
    let tries = 3
    let result: Interfaces.TelegramMessage | T = null as any
    while (tries > 0) {
      try {
        result = await tgAction()
        break
      } catch (e: any) {
        if (this.errorHandler) {
          this.errorHandler(e, tgAction)
        }
        if (onError) {
          onError(e)
        }
        if ('code' in e) {
          const apiError = <APIError>e
          // Bad Request: message is not modified
          if (e.code == 400) {
            // TODO handle markdown parse error
            console.log("==== BAD REQUEST", e)
            console.log("Already edited")
            break
          }
          // Too Many Requests
          if (e.code == 429) {
            const retry = apiError?.parameters?.retry_after
            tries--
            if (retry) {
              console.log(`WAIT FOR ${retry} AND RETRY, ${tries}`)
              await new Promise(r => setTimeout(r, 1000 * (retry + 1)))
            } else {
              console.log(`RETRY, ${tries}`)
            }
          }
        } else {
          console.log("==== UNKNOWN ERROR", e)
          break
        }
      }
    }

    return result
  }

  async editMessageMedia(params: EditMessageMediaParams, onError?: (e: any) => any): Promise<Interfaces.TelegramMessage | null | true> {
    console.log("==== EDIT MEDIA")
    return await this.tgActionWithRetry(() => this.telegram.api.editMessageMedia(params), onError)
  }

  async editMessageCaption(params: EditMessageCaptionParams, onError?: (e: any) => any): Promise<Interfaces.TelegramMessage | null | true> {
    console.log("==== EDIT CAPTION")
    return await this.tgActionWithRetry(() => this.telegram.api.editMessageCaption(params), onError)
  }

  async editMessageText(params: EditMessageTextParams, onError?: (e: any) => any): Promise<Interfaces.TelegramMessage | null | true> {
    console.log("==== EDIT TEXT")
    return await this.tgActionWithRetry(() => this.telegram.api.editMessageText(params), onError)
  }
}
