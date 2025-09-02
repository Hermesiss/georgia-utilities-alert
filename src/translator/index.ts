import {Translation} from "../mongo/translation";
import {translate} from 'bing-translate-api';
import {TranslationCache} from './cache';

export class Translator {
  private static translations = new Map<string, any | undefined>()
  private static cache = new TranslationCache();

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

    // Check in-memory cache first
    let result = this.translations.get(phrase)

    if (!result) {
      // Check DuckDB disk cache
      try {
        const cachedTranslation = await this.cache.get(phrase)
        if (cachedTranslation) {
          this.translations.set(phrase, {translation: cachedTranslation})
          return this.transliterate(cachedTranslation)
        }
      } catch (e) {
        console.error(`Cache error for [${phrase}]`, e)
      }

      // If not in cache, check cloud database
      try {
        const translationFromBase = await Translation.findOne({keyGe: phrase})
        if (translationFromBase) {
          console.log(`Loading from cloud DB ${phrase} -> ${translationFromBase.valueEn}`)
          if (typeof translationFromBase.valueEn === "string" && translationFromBase.valueEn.length > 0 && translationFromBase.valueEn !== phrase) {
            this.translations.set(phrase, {translation: translationFromBase.valueEn})
            // Store in disk cache for future use
            try {
              await this.cache.set(phrase, translationFromBase.valueEn)
            } catch (e) {
              console.error(`Failed to cache translation for [${phrase}]:`, e)
              // Continue execution even if caching fails
            }
            return this.transliterate(translationFromBase.valueEn)
          } else {
            // the translation is empty or not translated, delete it
            await Translation.deleteOne({keyGe: phrase})
          }
        }

        // If not found anywhere, translate and store
        result = await translate(phrase, "ka", "en", false)
        if (result.translation === phrase) {
          console.log(`Phrase ${phrase} is untranslated`)
          return this.transliterate(phrase)
        }
        console.log(`Translating ${phrase} -> ${result.translation}`)
        
        // Store in cloud database
        await Translation.create({keyGe: phrase, valueEn: result.translation})
        
        // Store in disk cache
        try {
          await this.cache.set(phrase, result.translation)
        } catch (e) {
          console.error(`Failed to cache translation for [${phrase}]:`, e)
          // Continue execution even if caching fails
        }
        
        // Store in memory cache
        this.translations.set(phrase, result)
      } catch (e) {
        console.error(`Translation error while translating [${phrase}]`, e)
        return this.transliterate(phrase)
      }
    }

    return this.transliterate(result?.translation || phrase)
  }

  // Method to get cache statistics
  static async getCacheStats() {
    try {
      return await this.cache.getStats()
    } catch (e) {
      console.error('Error getting cache stats:', e)
      return null
    }
  }

  // Method to clear cache
  static async clearCache() {
    try {
      await this.cache.clear()
      this.translations.clear()
      console.log('Cache cleared successfully')
    } catch (e) {
      console.error('Error clearing cache:', e)
    }
  }

  // Method to close cache connections (call this when shutting down)
  static closeCache() {
    try {
      this.cache.close()
    } catch (e) {
      console.error('Error closing cache:', e)
    }
  }
}
