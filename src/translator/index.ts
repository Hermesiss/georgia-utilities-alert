import {Translation} from "../mongo/translation";
import {translate} from 'bing-translate-api';

export class Translator {
  private static translations = new Map<string, any | undefined>()

  public static readonly georgianAlphabet = "აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ"

  private static readonly georgianToLatin = new Map<string, string>([
    ["ა", "a"], ["ბ", "b"], ["გ", "g"], ["დ", "d"], ["ე", "e"], ["ვ", "v"], ["ზ", "z"], ["თ", "t"], ["ი", "i"], ["კ", "k"],
    ["ლ", "l"], ["მ", "m"], ["ნ", "n"], ["ო", "o"], ["პ", "p"], ["ჟ", "zh"], ["რ", "r"], ["ს", "s"], ["ტ", "t"], ["უ", "u"],
    ["ფ", "f"], ["ქ", "k"], ["ღ", "gh"], ["ყ", "q"], ["შ", "sh"], ["ჩ", "ch"], ["ც", "c"], ["ძ", "dz"], ["წ", "ts"], ["ჭ", "ch"],
    ["ხ", "kh"], ["ჯ", "j"], ["ჰ", "h"]
  ])

  static hasGeoLetters(phrase: string): boolean {
    for (let i = 0; i < phrase.length; i++) {
      if (this.georgianAlphabet.includes(phrase[i])) {
        return true
      }
    }
    return false
  }

  static transliterate(georgian: string): string {
    if (!this.hasGeoLetters(georgian)) {
      return georgian
    }
    if (georgian.length == 0) {
      return georgian
    }
    let result = ""
    for (let i = 0; i < georgian.length; i++) {
      const char = georgian[i]
      if (this.georgianToLatin.has(char)) {
        result += this.georgianToLatin.get(char)
      } else {
        result += char
      }
    }
    return result
  }


  static async getTranslation(phrase: string | null): Promise<string> {
    if (null == phrase || phrase.length == 0) return ""

    // if phrase consists of only numbers and special symbols, return it
    if (phrase.match(/^[0-9a-zA-Z\-\s()":.!@#$%^&*_=+<>\[\]{},\/\\]+$/)) return phrase

    let result = this.translations.get(phrase)

    if (!result) {
      try {
        const translationFromBase = await Translation.findOne({keyGe: phrase})
        if (translationFromBase) {
          console.log(`Loading from base ${phrase} -> ${translationFromBase.valueEn}`)
          if (typeof translationFromBase.valueEn === "string" && translationFromBase.valueEn.length > 0 && translationFromBase.valueEn !== phrase) {
            this.translations.set(phrase, {translation: translationFromBase.valueEn})
            return this.transliterate(translationFromBase.valueEn)
          } else {
            // the translation is empty or not translated, delete it
            await Translation.deleteOne({keyGe: phrase})
          }
        }

        result = await translate(phrase, "ka", "en", false)
        if (result.translation === phrase) {
          console.log(`Phrase ${phrase} is untranslated`)
          return this.transliterate(phrase)
        }
        console.log(`Translating ${phrase} -> ${result.translation}`)
        await Translation.create({keyGe: phrase, valueEn: result.translation})
        //await new Promise(r => setTimeout(r, 50)) //wait to avoid ECONNRESET
        this.translations.set(phrase, result)
      } catch (e) {
        console.error(`Translation error while translating [${phrase}]`, e)
        return this.transliterate(phrase)
      }
    }

    return this.transliterate(result?.translation || phrase)
  }
}
