const georgianToLatin: Record<string, string> = {
    'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z', 'თ': 't',
    'ი': 'i', 'კ': 'k', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p', 'ჟ': 'zh',
    'რ': 'r', 'ს': 's', 'ტ': 't', 'უ': 'u', 'ფ': 'f', 'ქ': 'k', 'ღ': 'gh', 'ყ': 'q',
    'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts', 'ძ': 'dz', 'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh',
    'ჯ': 'j', 'ჰ': 'h'
};

const latinToGeorgian: Record<string, string> = Object.entries(georgianToLatin)
    .reduce((acc, [key, value]) => ({ ...acc, [value]: key }), {});

const russianToGeorgian: Record<string, string> = {
    'а': 'ა', 'б': 'ბ', 'в': 'ვ', 'г': 'გ', 'д': 'დ', 'е': 'ე', 'ё': 'ო', 'ж': 'ჟ',
    'з': 'ზ', 'и': 'ი', 'й': 'ი', 'к': 'კ', 'л': 'ლ', 'м': 'მ', 'н': 'ნ', 'о': 'ო',
    'п': 'პ', 'р': 'რ', 'с': 'ს', 'т': 'ტ', 'у': 'უ', 'ф': 'ფ', 'х': 'ხ', 'ц': 'ც',
    'ч': 'ჩ', 'ш': 'შ', 'щ': 'შჩ', 'ъ': '', 'ы': 'ი', 'ь': '', 'э': 'ე', 'ю': 'იუ',
    'я': 'ია'
};

const georgianToRussian: Record<string, string> = Object.entries(russianToGeorgian)
    .reduce((acc, [key, value]) => ({ ...acc, [value]: key }), {});

export type Language = 'ka' | 'en' | 'ru';

export function transliterateToGeorgian(text: string, fromLang: Language): string {
    if (fromLang === 'ka') return text;
    
    const mapping = fromLang === 'en' ? latinToGeorgian : russianToGeorgian;
    return text.toLowerCase().split('').map(char => mapping[char] || char).join('');
}

export function transliterateFromGeorgian(text: string, toLang: Language): string {
    if (toLang === 'ka') return text;
    
    const mapping = toLang === 'en' ? georgianToLatin : georgianToRussian;
    return text.split('').map(char => mapping[char] || char).join('');
}

export function detectLanguage(text: string): Language {
    // Simple detection based on character sets
    const hasGeorgian = /[\u10A0-\u10FF]/.test(text);
    const hasCyrillic = /[\u0400-\u04FF]/.test(text);
    
    if (hasGeorgian) return 'ka';
    if (hasCyrillic) return 'ru';
    return 'en';
} 