const streetDictionaryGeToVariants = {
    'რუსთაველი': ['Руставели', 'Rustaveli'],
    'გორგილაძი': ['Горгиладзе', 'Gorgiladze'],
    'ჩავჩავაძი': ['Чавчавадзе', 'Chavchavadze'],
    'გამსახურდიას': ['Гамсахурдия', 'Gamsakhurdia'],
    'ვაჟა-ფშაველა': ['Важа-Пшавела', 'Vaja-Pshavela'],
    'ახმეტელი': ['Ахметели', 'Akhmeteli'],
    'მელაშვილი': ['Мелашвили', 'Melashvili'],
    'ბაქოს': ['Баку', 'Baku'],
    'ნინოშვილი': ['Ниношвили', 'Ninoshvili'],
    'ლერმონტოვი': ['Лермонтова', 'Lermontov'],
    'პუშკინი': ['Пушкина', 'Pushkin'],
    'გოგოლი': ['Гоголя', 'Gogol'],
    'მაიაკოვსკი': ['Маяковского', 'Mayakovsky'],
    'ბარათაშვილი': ['Бараташвили', 'Baratashvili'],
    'დავით აღმაშენებლი': ['Давит Агмашенебели', 'Davit Aghmashenebeli'],
    'ცერეტელი': ['Церетели', 'Tsereteli'],
    'ჩონკაძი': ['Чонкадзе', 'Chonkadze'],
    'აბაშიძი': ['Абашидзе', 'Abashidze'],
    'გრიბოედოვი': ['Грибоедова', 'Griboedov'],
    'ფიროსმანი': ['Пиросмани', 'Pirosmani'],
    'ტაბრიზი': ['Тавриз', 'Tavriz'],
    'ლაკობას': ['Лакоба', 'Lakoba'],
    'ჯაფარიძი': ['Джапаридзе', 'Japaridze'],
    'ტაბიძი': ['Табидзе', 'Tabidze'],
    'გამრეკელიძი': ['Гамкрелидзе', 'Gamkrelidze'],
    'წაქარელი': ['Цагарели', 'Tsagareli'],
    'ნადარბაზევი': ['Надарбазеви', 'Nadarbazev'],
    'კახაბერიძი': ['Кахаберидзе', 'Kakhaberidze'],
    'კიროვი': ['Кирова', 'Kirov'],
    'ერისთავი': ['Эристави', 'Eristavi'],
    'მესხი': ['Месхи', 'Meskhi'],
    'ჩოჩიშვილი': ['Чочишвили', 'Chochishvili'],
    'გოგებაშვილი': ['Гогебашвили', 'Gogebashvili'],
    'ტბელ-აბუსერიძი': ['Тбел-Абусеридзе', 'Tbel-Abuseridze'],
    'დუმბაძი': ['Думбадзе', 'Dumbadze'],
    'სვერდლოვი': ['Свердлова', 'Sverdlov'],
    'კოსტავას': ['Костава', 'Kostava'],
    'გორბაჩოვი': ['Горбачева', 'Gorbachev'],
    'მელიქიშვილი': ['Меликишвили', 'Melikishvili'],
    'ჯავახიშვილი': ['Джавахишвили', 'Javakhishvili'],
    'ბაგრატიონი': ['Багратиони', 'Bagrationi'],
    'ჭავჭავაძი': ['Чавчавадзе', 'Chavchavadze'],
    'მესხეთი': ['Месхети', 'Meskheti'],
    'სამეგრელოს': ['Самегрело', 'Samegrelo'],
    'გურიელი': ['Гуриели', 'Gurieli'],
    'კახეთი': ['Кахети', 'Kakheti'],
    'იმერეთი': ['Имерети', 'Imereti'],
    'რაჭი': ['Рача', 'Racha'],
    'აჭარი': ['Аджара', 'Adjara'],
    'მტკვრი': ['Мтквари', 'Mtkvari'],
    'გალაქტიონი': ['Галактион', 'Galaktion'],
    'ჩახავას': ['Чахава', 'Chakhava'],
    'ჩხეიძი': ['Чхеидзе', 'Chkheidze'],
    'აღმაშენებლი': ['Агмашенебели', 'Agmashenebeli'],
    'თამარ მეფე': ['Тамар Мепе', 'Tamar Mepe'],
    'ხიმშიაშვილი': ['Химшиашвили', 'Khimshiashvili'],
    'ანგისი': ['Ангиса', 'Angisa'],
    'ინასარიძი': ['Инасаридзе', 'Inasaridze'],
    'თაყაიშვილი': ['Такаишвили', 'Takaishvili'],
    'დავით აღმაშენებლი': ['Давит Агмашенебели', 'Davit Aghmashenebeli'],
    'ცერეტელი': ['Церетели', 'Tsereteli'],
    'ჩონკაძი': ['Чонкадзе', 'Chonkadze'],
    'აბაშიძი': ['Абашидзе', 'Abashidze'],
    'ლეონიძე': ['Леонидзе', 'Leonidze'],
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