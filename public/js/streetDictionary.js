const streetDictionaryGeToVariants = {
    'რუსთაველ': ['Руставели', 'Rustaveli'],
    'გორგილაძ': ['Горгиладзе', 'Gorgiladze'],
    'ჩავჩავაძ': ['Чавчавадзе', 'Chavchavadze'],
    'გამსახურდია': ['Гамсахурдия', 'Gamsakhurdia'],
    'ვაჟა-ფშაველა': ['Важа-Пшавела', 'Vaja-Pshavela'],
    'ახმეტელ': ['Ахметели', 'Akhmeteli'],
    'მელაშვილ': ['Мелашвили', 'Melashvili'],
    'ბაქო': ['Баку', 'Baku'],
    'ნინოშვილ': ['Ниношвили', 'Ninoshvili'],
    'ლერმონტოვ': ['Лермонтова', 'Lermontov'],
    'პუშკინ': ['Пушкина', 'Pushkin'],
    'გოგოლ': ['Гоголя', 'Gogol'],
    'მაიაკოვსკ': ['Маяковского', 'Mayakovsky'],
    'ბარათაშვილ': ['Бараташвили', 'Baratashvili'],
    'ჩონკაძ': ['Чонкадзе', 'Chonkadze'],
    'გრიბოედოვ': ['Грибоедова', 'Griboedov'],
    'ფიროსმან': ['Пиросмани', 'Pirosmani'],
    'ტაბრიზ': ['Тавриз', 'Tavriz'],
    'ლაკობა': ['Лакоба', 'Lakoba'],
    'ჯაფარიძ': ['Джапаридзе', 'Japaridze'],
    'ტაბიძე': ['Табидзе', 'Tabidze'],
    'გამრეკელიძ': ['Гамкрелидзе', 'Gamkrelidze'],
    'წაქარელ': ['Цагарели', 'Tsagareli'],
    'ნადარბაზევ': ['Надарбазеви', 'Nadarbazev'],
    'კახაბერიძ': ['Кахаберидзе', 'Kakhaberidze'],
    'კიროვ': ['Кирова', 'Kirov'],
    'ერისთავ': ['Эристави', 'Eristavi'],
    'მესხ': ['Месхи', 'Meskhi'],
    'ჩოჩიშვილ': ['Чочишвили', 'Chochishvili'],
    'გოგებაშვილ': ['Гогебашвили', 'Gogebashvili'],
    'ტბელ-აბუსერიძ': ['Тбел-Абусеридзе', 'Tbel-Abuseridze'],
    'დუმბაძ': ['Думбадзе', 'Dumbadze'],
    'სვერდლოვ': ['Свердлова', 'Sverdlov'],
    'კოსტავა': ['Костава', 'Kostava'],
    'გორბაჩოვ': ['Горбачева', 'Gorbachev'],
    'მელიქიშვილ': ['Меликишвили', 'Melikishvili'],
    'ჯავახიშვილ': ['Джавахишвили', 'Javakhishvili'],
    'ბაგრატიონ': ['Багратиони', 'Bagrationi'],
    'ჭავჭავაძ': ['Чавчавадзе', 'Chavchavadze'],
    'მესხეთ': ['Месхети', 'Meskheti'],
    'სამეგრელო': ['Самегрело', 'Samegrelo'],
    'გურიელ': ['Гуриели', 'Gurieli'],
    'კახეთ': ['Кахети', 'Kakheti'],
    'იმერეთ': ['Имерети', 'Imereti'],
    'რაჭ': ['Рача', 'Racha'],
    'აჭარ': ['Аджара', 'Adjara'],
    'მტკვრ': ['Мтквари', 'Mtkvari'],
    'გალაკტიონ': ['Галактион', 'Galaktion'],
    'ჩახავა': ['Чахава', 'Chakhava'],
    'ჩხეიძ': ['Чхеидзе', 'Chkheidze'],
    'აღმაშენებლ': ['Агмашенебели', 'Agmashenebeli'],
    'თამარ მეფე': ['Тамар Мепе', 'Tamar Mepe'],
    'ხიმშიაშვილ': ['Химшиашвили', 'Khimshiashvili'],
    'ანგის': ['Ангиса', 'Angisa'],
    'ინასარიძ': ['Инасаридзе', 'Inasaridze'],
    'თაყაიშვილ': ['Такаишвили', 'Takaishvili'],
    'დავით აღმაშენებლ': ['Давит Агмашенебели', 'Davit Aghmashenebeli'],
    'ცერეტელ': ['Церетели', 'Tsereteli'],
    'აბაშიძ': ['Абашидзе', 'Abashidze'],
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