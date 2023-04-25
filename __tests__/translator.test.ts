import {Translator} from "../src/translator";
import {Translation} from "../src/mongo/translation";

jest.mock('bing-translate-api');

describe('Translator', () => {
  beforeEach(() => {
    // Reset the translations map before each test
    (Translator as any).translations.clear();
  });

  it('should return the original phrase if its null or empty string', async () => {
    let result = await Translator.getTranslation(null);
    expect(result).toBe("");
    result = await Translator.getTranslation("");
    expect(result).toBe("");
  })

  it('should return the input if it contains only numbers and special symbols', async () => {
    const input = '1234!@#$%^&*()';
    const result = await Translator.getTranslation(input);
    expect(result).toBe(input);
  });

  it('should return translation from the cache if available', async () => {
    const input = 'გამარჯობა';
    const translation = 'Hello';

    (Translator as any).translations.set(input, {translation});

    const result = await Translator.getTranslation(input);
    expect(result).toBe(translation);
  });

  it('should return translation from the database if available', async () => {
    const input = 'გამარჯობა';
    const translation = 'Hello';

    const findOneMock = jest.spyOn(Translation, 'findOne').mockResolvedValue({valueEn: translation});
    const result = await Translator.getTranslation(input);

    expect(findOneMock).toHaveBeenCalledWith({keyGe: input});
    expect(result).toBe(translation);

    findOneMock.mockRestore();
  });

  it('should call bing-translate-api if no translation is found in the cache or database', async () => {
    const input = 'გამარჯობა';
    const translation = 'Hello';

    const translateMock = jest.fn().mockResolvedValue({translation});
    require('bing-translate-api').translate.mockImplementation(translateMock);

    const findOneMock = jest.spyOn(Translation, 'findOne').mockResolvedValue(null);
    const createMock = jest.spyOn(Translation, 'create').mockImplementation(() => Promise.resolve());

    const result = await Translator.getTranslation(input);

    expect(findOneMock).toHaveBeenCalledWith({keyGe: input});
    expect(translateMock).toHaveBeenCalledWith(input, 'ka', 'en', false);
    expect(createMock).toHaveBeenCalledWith({keyGe: input, valueEn: translation});
    expect(result).toBe(translation);

    findOneMock.mockRestore();
    createMock.mockRestore();
    translateMock.mockRestore();
  });

  it('should return the original phrase if an error occurs during translation', async () => {
    const input = 'გამარჯობა';

    const findOneMock = jest.spyOn(Translation, 'findOne').mockResolvedValue(null);
    const translateMock = jest.fn().mockRejectedValue(new Error('Translation error'));
    require('bing-translate-api').translate.mockImplementation(translateMock);

    const result = await Translator.getTranslation(input);

    expect(findOneMock).toHaveBeenCalledWith({keyGe: input});
    expect(translateMock).toHaveBeenCalledWith(input, 'ka', 'en', false);
    expect(result).toBe(input);

    findOneMock.mockRestore();
    translateMock.mockRestore();
  });
});
