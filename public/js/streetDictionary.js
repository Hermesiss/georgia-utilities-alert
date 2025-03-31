const streetDictionaryGeToVariants = {
    'რუსთაველის': ['Руставели', 'Rustaveli'],
    'გორგილაძის': ['Горгиладзе', 'Gorgiladze'],
    'ჩავჩავაძის': ['Чавчавадзе', 'Chavchavadze'],
    'გამსახურდიას': ['Гамсахурдия', 'Gamsakhurdia'],
    'ვაჟა-ფშაველა': ['Важа-Пшавела', 'Vaja-Pshavela'],
    'ახმეტელის': ['Ахметели', 'Akhmeteli'],
    'მელაშვილი': ['Мелашвили', 'Melashvili'],
    'ბაქოს': ['Баку', 'Baku'],
    'ნინოშვილის': ['Ниношвили', 'Ninoshvili'],
    'ლერმონტოვის': ['Лермонтова', 'Lermontov'],
    'პუშკინის': ['Пушкина', 'Pushkin'],
    'გოგოლის': ['Гоголя', 'Gogol'],
    'მაიაკოვსკის': ['Маяковского', 'Mayakovsky'],
    'ბარათაშვილის': ['Бараташвили', 'Baratashvili'],
    'დავით აღმაშენებლის': ['Давит Агмашенебели', 'Davit Aghmashenebeli'],
    'ცერეტელის': ['Церетели', 'Tsereteli'],
    'ჩონკაძის': ['Чонкадзе', 'Chonkadze'],
    'აბაშიძის': ['Абашидзе', 'Abashidze'],
    'გრიბოედოვის': ['Грибоедова', 'Griboedov'],
    'ფიროსმანის': ['Пиросмани', 'Pirosmani'],
    'ტაბრიზის': ['Тавриз', 'Tavriz'],
    'ლაკობას': ['Лакоба', 'Lakoba'],
    'ჯაფარიძის': ['Джапаридзе', 'Japaridze'],
    'ტაბიძის': ['Табидзе', 'Tabidze'],
    'გამრეკელიძის': ['Гамкрелидзе', 'Gamkrelidze'],
    'წაქარელის': ['Цагарели', 'Tsagareli'],
    'ნადარბაზევის': ['Надарбазеви', 'Nadarbazev'],
    'კახაბერიძის': ['Кахаберидзе', 'Kakhaberidze'],
    'კიროვის': ['Кирова', 'Kirov'],
    'ერისთავის': ['Эристави', 'Eristavi'],
    'მესხის': ['Месхи', 'Meskhi'],
    'ჩოჩიშვილის': ['Чочишвили', 'Chochishvili'],
    'გოგებაშვილის': ['Гогебашвили', 'Gogebashvili'],
    'ტბელ-აბუსერიძის': ['Тбел-Абусеридзе', 'Tbel-Abuseridze'],
    'დუმბაძის': ['Думбадзе', 'Dumbadze'],
    'სვერდლოვის': ['Свердлова', 'Sverdlov'],
    'კოსტავას': ['Костава', 'Kostava'],
    'გორბაჩოვის': ['Горбачева', 'Gorbachev'],
    'მელიქიშვილის': ['Меликишвили', 'Melikishvili'],
    'ჯავახიშვილის': ['Джавахишвили', 'Javakhishvili'],
    'ბაგრატიონის': ['Багратиони', 'Bagrationi'],
    'ჭავჭავაძის': ['Чавчавадзе', 'Chavchavadze'],
    'მესხეთის': ['Месхети', 'Meskheti'],
    'სამეგრელოს': ['Самегрело', 'Samegrelo'],
    'გურიელის': ['Гуриели', 'Gurieli'],
    'კახეთის': ['Кахети', 'Kakheti'],
    'იმერეთის': ['Имерети', 'Imereti'],
    'რაჭის': ['Рача', 'Racha'],
    'აჭარის': ['Аджара', 'Adjara'],
    'მტკვრის': ['Мтквари', 'Mtkvari'],
    'გალაქტიონის': ['Галактион', 'Galaktion'],
    'ჩახავას': ['Чахава', 'Chakhava'],
    'ჩხეიძის': ['Чхеидзе', 'Chkheidze'],
    'აღმაშენებლის': ['Агмашенебели', 'Agmashenebeli'],
    'თამარ მეფე': ['Тамар Мепе', 'Tamar Mepe'],
    'ხიმშიაშვილის': ['Химшиашвили', 'Khimshiashvili'],
    'ანგისის': ['Ангиса', 'Angisa'],
    'ინასარიძის': ['Инасаридзе', 'Inasaridze'],
    'თაკაიშვილის': ['Такаишвили', 'Takaishvili'],
    'დავით აღმაშენებლის': ['Давит Агмашенебели', 'Davit Aghmashenebeli'],
    'ცერეტელის': ['Церетели', 'Tsereteli'],
    'ჩონკაძის': ['Чонкадзе', 'Chonkadze'],
    'აბაშიძის': ['Абашидзе', 'Abashidze']
};

const streetDictionaryVariantToGe = {};
for (const [georgian, variants] of Object.entries(streetDictionaryGeToVariants)) {
    for (const variant of variants) {
        streetDictionaryVariantToGe[variant] = georgian;
    }
}

// Make dictionaries and autocomplete available globally
window.streetDictionaryGeToVariants = streetDictionaryGeToVariants;
window.streetDictionaryVariantToGe = streetDictionaryVariantToGe;

window.autocomplete = (input) => {
    const results = new Set();
    const inputLower = input.toLowerCase();

    // Search in Georgian to variants
    for (const [georgian, variants] of Object.entries(streetDictionaryGeToVariants)) {
        if (georgian.toLowerCase().includes(inputLower)) {
            results.add(georgian);
        }
        // Also check variants
        variants.forEach(variant => {
            if (variant.toLowerCase().includes(inputLower)) {
                results.add(variant);
            }
        });
    }

    // Search in variants to Georgian
    for (const [variant, georgian] of Object.entries(streetDictionaryVariantToGe)) {
        if (variant.toLowerCase().includes(inputLower)) {
            results.add(variant);
        }
    }

    return Array.from(results)
        .sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(inputLower);
            const bStarts = b.toLowerCase().startsWith(inputLower);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.localeCompare(b);
        })
        .join(', ');
}