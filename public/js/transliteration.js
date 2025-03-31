// Transliteration functions for Georgian language
function transliterateToGeorgian(text) {
    console.log(`Transliterating to Georgian: ${text}`);
    // First try to find in street dictionary
    if (window.streetDictionaryVariantToGe && window.streetDictionaryVariantToGe[text]) {
        console.log(`Found in street dictionary: ${window.streetDictionaryVariantToGe[text]}`);
        return window.streetDictionaryVariantToGe[text];
    }
    console.log(`Not found in street dictionary`);

    // Detect input language
    const hasCyrillic = /[\u0400-\u04FF]/.test(text);
    const hasGeorgian = /[\u10A0-\u10FF]/.test(text);

    if (hasGeorgian) return text;

    const mapping = hasCyrillic ? {
        // Two-character combinations first
        'дз': 'ძ',
        'дж': 'ჯ',
        'шч': 'შჩ',
        'ия': 'ია',
        'иу': 'იუ',
        'т\'': 'ტ',
        'кх': 'ყ',
        'к\'': 'კ',
        'гх': 'ღ',
        'цх': 'ც',
        // Single characters
        'а': 'ა',
        'б': 'ბ',
        'в': 'ვ',
        'г': 'გ',
        'д': 'დ',
        'е': 'ე',
        'ё': 'იო',
        'ж': 'ჟ',
        'з': 'ზ',
        'и': 'ი',
        'й': 'ი',
        'к': 'ქ',
        'л': 'ლ',
        'м': 'მ',
        'н': 'ნ',
        'о': 'ო',
        'п': 'პ',
        'р': 'რ',
        'с': 'ს',
        'т': 'თ',
        'у': 'უ',
        'ф': 'ფ',
        'х': 'ხ',
        'ц': 'წ',
        'ч': 'ჩ',
        'ш': 'შ',
        'щ': 'შჩ',
        'ъ': '',
        'ы': 'ი',
        'ь': '',
        'э': 'ე',
        'ю': 'იუ',
        'я': 'ია',
        'хв': 'ყ'
    } : {
        // Two-character combinations first
        'zh': 'ჟ',
        'sh': 'შ',
        'ch': 'ჩ',
        'ts': 'წ',
        'dz': 'ძ',
        'kh': 'ხ',
        'gh': 'ღ',
        'dj': 'ჯ',
        't\'': 'ტ',
        'k\'': 'კ',
        'q': 'ყ',
        // Single characters
        'a': 'ა',
        'b': 'ბ',
        'g': 'გ',
        'd': 'დ',
        'e': 'ე',
        'v': 'ვ',
        'z': 'ზ',
        't': 'თ',
        'i': 'ი',
        'l': 'ლ',
        'm': 'მ',
        'n': 'ნ',
        'o': 'ო',
        'p': 'პ',
        'r': 'რ',
        's': 'ს',
        'j': 'ჯ',
        'h': 'ჰ',
        'u': 'უ',
        'k': 'ქ'
    };

    let result = text.toLowerCase();

    // First handle two-character combinations
    for (const [key, value] of Object.entries(mapping)) {
        if (key.length > 1) {
            result = result.replace(new RegExp(key, 'g'), value);
        }
    }

    // Then handle single characters
    return result.split('').map(char => mapping[char] || char).join('');
}

function transliterateFromGeorgian(text, lang = 'en') {
    // First try to find in street dictionary
    if (window.streetDictionaryGeToVariants && window.streetDictionaryGeToVariants[text]) {
        return window.streetDictionaryGeToVariants[text][lang === 'ru' ? 0 : 1];
    }

    const mapping = lang === 'ru' ? {
        'ძ': 'дз',
        'ჯ': 'дж',
        'ა': 'а',
        'ბ': 'б',
        'გ': 'г',
        'დ': 'д',
        'ე': 'е',
        'ვ': 'в',
        'ზ': 'з',
        'ტ': 'т\'',
        'ი': 'и',
        'კ': 'к\'',
        'ლ': 'л',
        'მ': 'м',
        'ნ': 'н',
        'ო': 'о',
        'პ': 'п',
        'ჟ': 'ж',
        'რ': 'р',
        'ს': 'с',
        'შ': 'ш',
        'ჩ': 'ч',
        'ც': 'ц',
        'ხ': 'х',
        'ჰ': 'х',
        'თ': 'т',
        'უ': 'у',
        'ქ': 'к',
        'წ': 'ц',
        'ფ': 'ф',
        'ყ': 'к',
    } : {
        'ა': 'a',
        'ბ': 'b',
        'გ': 'g',
        'დ': 'd',
        'ე': 'e',
        'ვ': 'v',
        'ზ': 'z',
        'ტ': 't\'',
        'ი': 'i',
        'კ': 'k\'',
        'ლ': 'l',
        'მ': 'm',
        'ნ': 'n',
        'ო': 'o',
        'პ': 'p',
        'ჟ': 'zh',
        'რ': 'r',
        'ს': 's',
        'შ': 'sh',
        'ჩ': 'ch',
        'ც': 'ts',
        'ძ': 'dz',
        'ხ': 'kh',
        'ჯ': 'j',
        'ჰ': 'h',
        'თ': 't',
        'უ': 'u',
        'ქ': 'k',
        'წ': 'ts',
        'ფ': 'f',
        'ყ': 'q'
    };

    return text.split('').map(char => mapping[char] || char).join('');
}