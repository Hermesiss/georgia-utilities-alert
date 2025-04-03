const translations = {
    ka: {
        title: 'ელექტროენერგიის გათიშვების ჩემპიონატი',
        searchTitle: 'მოიძიეთ ქუჩა',
        citiesTitle: 'აირჩიეთ ქალაქი',
        selectedCity: 'არჩეული ქალაქი',
        statsTitle: 'სტატისტიკა',
        searchPlaceholder: 'ქუჩის სახელი...',
        search: 'ძებნა',
        noCities: 'ამ ქუჩისთვის ქალაქები ვერ მოიძებნა',
        totalDisconnections: 'სულ გათიშვები',
        lastDisconnection: 'ბოლო გათიშვა',
        recentAlerts: 'ბოლო განცხადებები',
        error: 'შეცდომა მონაცემების მიღებისას',
        maxDisconnections: 'მაქსიმალური გათიშვები დღეში',
        disconnections: 'გათიშვა',
        maxStreakWith: 'მაქსიმალური უწყვეტი გათიშვების დღეები',
        maxStreakWithout: 'მაქსიმალური უწყვეტი დღეები გათიშვების გარეშე',
        days: 'დღე',
        percentageWith: 'გათიშვებით წლის პროცენტი',
        totalAffectedCustomers: 'სულ დაზარალებული მომხმარებელი',
        customers: 'მომხმარებელი',
        share: 'გაზიარება',
        save: 'შენახვა',
        totalPoints: 'სულ ქულა',
        points: 'ქულა',
        breakdown: 'დეტალები',
        total: 'სულ'
    },
    en: {
        title: 'Power Outage Championship',
        searchTitle: 'Search by Street',
        citiesTitle: 'Select City',
        selectedCity: 'Selected City',
        statsTitle: 'Statistics',
        searchPlaceholder: 'Enter street name...',
        search: 'Search',
        noCities: 'No cities found for this street. Please try georgian street name for better results.',
        totalDisconnections: 'Total Disconnections',
        lastDisconnection: 'Last Disconnection',
        recentAlerts: 'Recent Alerts',
        error: 'Error fetching data',
        maxDisconnections: 'Max Disconnections in a Day',
        disconnections: 'disconnections',
        maxStreakWith: 'Max Days in a Row with Disconnections',
        maxStreakWithout: 'Max Days in a Row without Disconnections',
        days: 'days',
        percentageWith: 'Percentage of Year with Disconnections',
        totalAffectedCustomers: 'Total Affected Customers',
        customers: 'customers',
        share: 'Share',
        save: 'Save',
        totalPoints: 'Total Points',
        points: 'points',
        breakdown: 'Breakdown',
        total: 'Total'
    },
    ru: {
        title: 'Чемпионат по отключениям электроэнергии',
        searchTitle: 'Поиск по улице',
        citiesTitle: 'Выберите город',
        statsTitle: 'Статистика',
        selectedCity: 'Выбранный город',
        searchPlaceholder: 'Введите название улицы...',
        search: 'Поиск',
        noCities: 'Города не найдены для этой улицы. Пожалуйста, попробуйте грузинский вариант названия улицы для лучшего результата.',
        totalDisconnections: 'Всего отключений',
        lastDisconnection: 'Последнее отключение',
        recentAlerts: 'Последние объявления',
        error: 'Ошибка при получении данных',
        maxDisconnections: 'Максимум отключений за день',
        disconnections: 'отключений',
        maxStreakWith: 'Максимум дней подряд с отключениями',
        maxStreakWithout: 'Максимум дней подряд без отключений',
        days: 'дней',
        percentageWith: 'Процент дней в году с отключениями',
        totalAffectedCustomers: 'Всего пострадавших потребителей',
        customers: 'потребителей',
        share: 'Поделиться',
        save: 'Сохранить',
        totalPoints: 'Всего очков',
        points: 'очков',
        breakdown: 'Разбивка',
        total: 'Всего'
    }
};

function getTranslation(key, lang) {
    return translations[lang][key];
}

function includesTranslation(text, key) {
    return text.includes(translations['en'][key]) ||
        text.includes(translations['ka'][key]) ||
        text.includes(translations['ru'][key]);
}

function getLanguageButtonText(lang) {
    return lang === 'ka' ? 'ქართული' : lang === 'ru' ? 'Русский' : 'English';
}

function getTitleText(street, city, lang) {
    const titleTexts = {
        ka: `${street} ქუჩა, ${city}`,
        en: `${street} Street, ${city}`,
        ru: `Улица ${street}, ${city}`
    };
    return titleTexts[lang];
}

function getShareText(street, city, lang) {
    const shareTexts = {
        ka: `შეამოწმეთ კომუნალური მომსახურების გათიშვების სტატისტიკა ${street} ქუჩაზე ${city} ქალაქში!`,
        en: `Check out the utility disconnection statistics for ${street} street in ${city}!`,
        ru: `Посмотрите статистику отключений коммунальных услуг для улицы ${street} в городе ${city}!`
    };
    return shareTexts[lang];
}