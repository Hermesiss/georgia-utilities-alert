const {translate} = require('bing-translate-api');

export class Translator {
  private static translations = new Map<string, any | undefined>()

  static async getTranslation(phrase: string): Promise<string> {
    let result = this.translations.get(phrase)

    if (!result) {
      result = await translate(phrase, "ka", "en", false)
      this.translations.set(phrase, result)
    }

    return result.translation || phrase
  }
}
