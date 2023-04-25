import {Translation} from "../mongo/translation";

const {translate} = require('bing-translate-api');

export class Translator {
  private static translations = new Map<string, any | undefined>()

  static async getTranslation(phrase: string): Promise<string> {
    if (null == phrase || phrase.length == 0) return phrase

    // if phrase consists of only numbers and special symbols, return it
    if (phrase.match(/^[0-9a-zA-Z\-\s()":.!@#$%^&*_=+<>\[\]{},\/\\]+$/)) return phrase

    let result = this.translations.get(phrase)

    if (!result) {
      try {
        const translationFromBase = await Translation.findOne({keyGe: phrase})
        if (translationFromBase) {
          console.log(`Loading from base ${phrase} -> ${translationFromBase.valueEn}`)
          if (typeof translationFromBase.valueEn === "string" && translationFromBase.valueEn.length > 0) {
            this.translations.set(phrase, {translation: translationFromBase.valueEn})
            return translationFromBase.valueEn
          } else {
            // somehow the translation is empty, delete it
            await Translation.deleteOne({keyGe: phrase})
          }
        }

        result = await translate(phrase, "ka", "en", false)
        console.log(`Translating ${phrase} -> ${result.translation}`)
        await Translation.create({keyGe: phrase, valueEn: result.translation})
        //await new Promise(r => setTimeout(r, 50)) //wait to avoid ECONNRESET
        this.translations.set(phrase, result)
      } catch (e) {
        console.error(`Translation error while translating [${phrase}]`, e)
        return phrase
      }
    }

    return result?.translation || phrase
  }
}
