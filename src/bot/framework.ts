import {APIError, Markdown, RemoveKeyboard, Telegram, UpdateType} from 'puregram'
import {EditMessageTextParams, SendMessageParams, SetMyCommandsParams} from "puregram/lib/generated/methods";
import * as Interfaces from "puregram/lib/generated/telegram-interfaces";
import {Known, MaybeArray} from "puregram/lib/types/types";
import {ContextsMapping} from "puregram/lib/types/mappings";
import {Middleware} from "middleware-io";
import {Updates} from "puregram/lib/updates";

export class TelegramFramework {
  private telegram: Telegram;

  get botUsername() {
    return this.telegram.bot.username
  }

  constructor(token: string) {
    this.telegram = Telegram.fromToken(token)
  }

  async setMyCommands(params: SetMyCommandsParams): Promise<true> {
    return await this.telegram.api.setMyCommands(params)
  }

  onUpdates<K extends keyof Known<ContextsMapping>, T = {}>(events: MaybeArray<K>, handler: MaybeArray<Middleware<ContextsMapping[K] & T>>): Updates {
    return this.telegram.updates.on(events, handler)
  }

  async startPollingUpdates(): Promise<boolean> {
    return await this.telegram.updates.startPolling()
  }

  async sendMessage(params: SendMessageParams, onError?: (e: any) => any): Promise<Interfaces.TelegramMessage | null> {
    let tries = 3
    let result: Interfaces.TelegramMessage | null = null
    while (tries > 0) {
      try {
        //console.log("==== SEND MESSAGE")
        result = await this.telegram.api.sendMessage(params)
        break
      } catch (e: any) {
        if (onError) {
          onError(e)
        }
        if ('code' in e) {
          // Too Many Requests
          if (e.code == 429) {
            const apiError = <APIError>e
            const retry = apiError.parameters?.retry_after
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

  async editMessageText(params: EditMessageTextParams, onError?: (e: any) => any): Promise<Interfaces.TelegramMessage | null | true> {
    let tries = 3
    let result: Interfaces.TelegramMessage | null | true = null
    while (tries > 0) {
      try {
        console.log("==== EDIT POST")
        result = await this.telegram.api.editMessageText(params)
        break
      } catch (e: any) {
        if (onError) {
          onError(e)
        }
        if ('code' in e) {
          const apiError = <APIError>e
          // Bad Request: message is not modified
          if (e.code == 400) {
            // TODO handle markdown parse error
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
}
