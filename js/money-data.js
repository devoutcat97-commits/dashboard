/* ============================================================
   Справочник для вкладки «Деньги»:
   - категории (группа → подкатегории) по умолчанию;
   - словарь слов для автоматического выбора категории;
   - разбор быстрой строки («такси 450»);
   - разбор CSV-выписки Т-Банка.
   ============================================================ */
(function () {
  'use strict';

  // ---------- Категории по умолчанию ----------
  function g(id, name, subs, extra) {
    return Object.assign({
      id: id,
      name: name,
      subs: (subs || []).map(function (s) { return { id: id + '.' + s[0], name: s[1] }; })
    }, extra || {});
  }

  var CATS = {
    expense: [
      g('food', 'Еда', [['groceries', 'Продукты'], ['restaurants', 'Кафе и рестораны'], ['delivery', 'Доставка'], ['coffee', 'Кофе и перекусы']]),
      g('home', 'Жильё', [['rent', 'Аренда'], ['utilities', 'Коммунальные услуги'], ['internet', 'Интернет'], ['repair', 'Ремонт и мебель']]),
      g('transport', 'Транспорт', [['public', 'Метро и автобус'], ['taxi', 'Такси'], ['sharing', 'Каршеринг и самокаты']]),
      g('connect', 'Связь и подписки', [['mobile', 'Мобильная связь'], ['subs', 'Подписки'], ['apps', 'Приложения']]),
      g('study', 'Учёба', [['courses', 'Курсы и обучение'], ['books', 'Книги и кодексы'], ['stationery', 'Канцелярия'], ['print', 'Печать и копии'], ['exams', 'Экзамены и пошлины']]),
      g('health', 'Здоровье', [['pharmacy', 'Аптека'], ['doctors', 'Врачи и анализы'], ['sport', 'Спорт'], ['insurance', 'Страховка']]),
      g('beauty', 'Красота и уход', [['cosmetics', 'Косметика и гигиена'], ['salon', 'Стрижка и салон']]),
      g('clothes', 'Одежда и обувь'),
      g('household', 'Дом и быт', [['chemicals', 'Бытовая химия'], ['goods', 'Хозтовары'], ['tech', 'Техника']]),
      g('fun', 'Развлечения и хобби', [['events', 'Кино и концерты'], ['hobby', 'Хобби'], ['games', 'Игры']]),
      g('travel', 'Путешествия', [['tickets', 'Билеты'], ['lodging', 'Жильё'], ['excursions', 'Экскурсии']]),
      g('gifts', 'Подарки и праздники'),
      g('worktax', 'Работа и налоги', [['workexp', 'Расходы на работу'], ['tax', 'Налог самозанятого']]),
      g('finance', 'Финансы', [['fees', 'Комиссии банка'], ['interest', 'Проценты по кредиту'], ['fines', 'Штрафы']]),
      g('family', 'Близкие и питомцы', [['relatives', 'Помощь родным'], ['pets', 'Питомцы']]),
      g('people', 'Переводы людям', [['friends', 'Друзьям'], ['services', 'За услуги']]),
      g('charity', 'Благотворительность'),
      g('other-exp', 'Другое')
    ],
    income: [
      g('work-office', 'Работа (очная)', [['salary', 'Зарплата'], ['advance', 'Аванс'], ['bonus', 'Премия']], { locked: true }),
      g('work-remote', 'Работа (дистанционная)', [['orders', 'Зарплата и процент']], { locked: true }),
      g('stipend', 'Стипендия', [['academic', 'Академическая'], ['social', 'Социальная'], ['increased', 'Повышенная']]),
      g('family-help', 'Помощь семьи'),
      g('sidejob', 'Подработки и разовые'),
      g('gifts-inc', 'Подарки'),
      g('cashback', 'Кэшбэк и проценты', [['cb', 'Кэшбэк'], ['interest', 'Проценты по вкладам']]),
      g('refunds', 'Возвраты', [['taxded', 'Налоговый вычет'], ['returns', 'Возврат покупок']]),
      g('sales', 'Продажа вещей'),
      g('other-inc', 'Другое')
    ]
  };

  var ACCOUNTS = [
    { id: 'card', name: 'Т-Банк', start: 0 },
    { id: 'cash', name: 'Наличные', start: 0 },
    { id: 'piggy-travel', name: 'Путешествие', kind: 'piggy', target: 0, start: 0 }
  ];

  // ---------- Словарь: слово → категория ----------
  // Ключ — id подкатегории («food.groceries») или группы («clothes»).
  // Пишем без «ё» (при сравнении «ё» заменяется на «е»).
  // Если подошло несколько слов, побеждает самое длинное совпадение.
  var KEYWORDS = {
    expense: {
      'food.groceries': ['продукт', 'пятерочк', 'перекресток', 'магнит', 'ашан', 'лента', 'вкусвилл', 'дикси', 'азбука вкуса', 'окей', 'глобус', 'spar', 'спар', 'верный', 'светофор', 'супермаркет', 'гипермаркет', 'billa', 'fasol', 'бристоль', 'красное и белое'],
      'food.restaurants': ['кафе', 'ресторан', 'бар ', 'шоколадниц', 'теремок', 'вкусно и точка', 'kfc', 'бургер', 'burger', 'суши', 'пицц', 'столовая', 'обед', 'ужин', 'додо', 'rostic', 'ростикс', 'макдоналдс'],
      'food.delivery': ['доставк', 'яндекс еда', 'яндекс лавка', 'лавка', 'delivery', 'самокат', 'купер', 'kuper', 'сбермаркет', 'samokat'],
      'food.coffee': ['кофе', 'coffee', 'перекус', 'шаурм', 'cofix', 'кофейн', 'капучино', 'латте', 'булочк', 'шоколадк', 'снек'],
      'home.rent': ['аренд', 'квартплат', 'за квартиру'],
      'home.utilities': ['коммунал', 'жкх', 'электроэнерг', 'мосэнерго', 'водоканал', 'квитанц'],
      'home.internet': ['интернет', 'ростелеком', 'дом.ру', 'wi-fi', 'вайфай'],
      'home.repair': ['ремонт', 'мебел', 'стройматериал'],
      'transport.public': ['метро', 'автобус', 'трамва', 'троллейбус', 'проезд', 'тройк', 'подорожник', 'электричк', 'мцд', 'транспортная карта'],
      'transport.taxi': ['такси', 'taxi', 'uber', 'яндекс go', 'ситимобил'],
      'transport.sharing': ['каршеринг', 'делимобиль', 'белкакар', 'ситидрайв', 'кикшеринг', 'whoosh', 'вуш', 'юрент', 'urent', 'самокаты'],
      'connect.mobile': ['мобильн', 'связь', 'мтс', 'билайн', 'мегафон', 'теле2', 'tele2', 'yota', 'йота'],
      'connect.subs': ['подписк', 'яндекс плюс', 'кинопоиск', 'okko', 'окко', 'ivi', 'иви', 'spotify', 'облако', 'youtube premium', 'вк музык', 'vk музык', 'звук', 'литрес'],
      'connect.apps': ['app store', 'google play', 'rustore', 'приложени'],
      'study.courses': ['курс', 'обучени', 'репетитор', 'skillbox', 'нетологи', 'яндекс практикум', 'вебинар'],
      'study.books': ['книг', 'кодекс', 'учебник', 'читай-город', 'читай город', 'буквоед', 'лабиринт', 'консультант'],
      'study.stationery': ['канцеляр', 'тетрад', 'ручк', 'блокнот', 'папк'],
      'study.print': ['печат', 'распечат', 'ксерокс', 'копировани', 'переплет'],
      'study.exams': ['экзамен', 'пошлин', 'госуслуг'],
      'health.pharmacy': ['аптек', 'лекарств', 'таблетк', 'ригла', 'горздрав', 'асна', 'еаптека', 'витамин'],
      'health.doctors': ['врач', 'анализ', 'клиник', 'стоматолог', 'инвитро', 'гемотест', 'медцентр', 'поликлиник', 'прием у'],
      'health.sport': ['спортзал', 'фитнес', 'тренажер', 'бассейн', 'йога', 'абонемент в зал', 'тренировк'],
      'health.insurance': ['страхов', 'полис'],
      'beauty.cosmetics': ['косметик', 'золотое яблоко', 'летуаль', 'рив гош', 'шампун', 'гигиен', 'подружк', 'крем', 'уход'],
      'beauty.salon': ['стрижк', 'салон', 'маникюр', 'барбер', 'парикмахер', 'брови', 'ресниц'],
      'clothes': ['одежд', 'обув', 'zara', 'uniqlo', 'lamoda', 'ламода', 'gloria jeans', 'глория', 'befree', 'спортмастер', 'кроссовк', 'куртк', 'джинс', 'платье', 'футболк'],
      'household.chemicals': ['бытовая хим', 'порошок', 'моющ', 'чистящ', 'губк'],
      'household.goods': ['хозтовар', 'fix price', 'фикс прайс', 'икеа', 'ikea', 'леруа', 'посуд', 'хоз '],
      'household.tech': ['техник', 'dns', 'днс', 'м.видео', 'мвидео', 'эльдорадо', 'ситилинк', 'наушник', 'зарядк', 'ноутбук'],
      'fun.events': ['кино', 'концерт', 'театр', 'музей', 'выставк', 'кинотеатр', 'вечеринк', 'квиз', 'боулинг'],
      'fun.hobby': ['хобби', 'рукодел', 'краски', 'холст'],
      'fun.games': ['игра', 'игры', 'steam', 'playstation', 'xbox', 'nintendo'],
      'travel.tickets': ['авиабилет', 'самолет', 'ржд', 'поезд', 'аэрофлот', 'победа', 's7', 'туту', 'tutu', 'aviasales', 'авиасейлс'],
      'travel.lodging': ['отель', 'гостиниц', 'хостел', 'booking', 'airbnb', 'суточн', 'островок', 'ostrovok'],
      'travel.excursions': ['экскурси', 'тур '],
      'gifts': ['подар', 'цветы', 'букет', 'праздник', 'день рождени', 'открытк'],
      'worktax.workexp': ['для работы', 'по работе'],
      'worktax.tax': ['налог', 'нпд', 'мой налог'],
      'finance.fees': ['комисси', 'обслуживание карты', 'обслуживание счета'],
      'finance.interest': ['проценты по кредит', 'кредит', 'рассрочк'],
      'finance.fines': ['штраф'],
      'family.relatives': ['маме', 'папе', 'бабушке', 'дедушке', 'сестре', 'брату', 'родителям'],
      'family.pets': ['корм', 'ветеринар', 'ветклиник', 'зоомагазин', 'четыре лапы', 'питом', 'лоток'],
      'charity': ['благотвор', 'пожертв', 'донат', 'фонд']
    },
    income: {
      'work-office.salary': ['зарплат', 'зп ', ' оклад'],
      'work-office.advance': ['аванс'],
      'work-office.bonus': ['преми'],
      'work-remote.orders': ['заказ', 'фриланс', 'от клиента', 'гонорар'],
      'stipend.academic': ['стипенди'],
      'stipend.social': ['социальная стипенди', 'соцстипенди'],
      'stipend.increased': ['повышенная стипенди', 'пгас'],
      'family-help': ['от мамы', 'от папы', 'от родителей', 'от бабушки', 'помощь семьи', 'родители'],
      'sidejob': ['подработ', 'разовая работа', 'халтур'],
      'gifts-inc': ['подарок', 'подарили'],
      'cashback.cb': ['кэшбэк', 'кешбэк', 'кэшбек', 'кешбек', 'cashback', 'бонус'],
      'cashback.interest': ['проценты по вклад', 'проценты на остаток', 'процент на остаток', 'вклад'],
      'refunds.taxded': ['вычет'],
      'refunds.returns': ['возврат'],
      'sales': ['продаж', 'продала', 'продал', 'авито', 'avito', 'юла']
    }
  };

  // Названия латиницей — так магазины записаны в PDF-выписке банка.
  var KEYWORDS_LATIN = {
    expense: {
      'food.groceries': ['yarche', 'ярче', 'magnit', 'krasnoe&beloe', 'krasnoe & beloe', 'auchan', 'lenta', 'pyaterochka', 'perekrestok', 'dixy', 'vkusvill', 'spar ', 'maria-ra', 'мария-ра', 'monetka', 'монетка', 'bristol', 'holiday', 'metro cash'],
      'food.restaurants': ['rostics', 'burger king', 'vkusnoitochka', 'kfc', 'piccer', 'pizz', 'sushi', ' bar ', 'cafe', 'kafe', 'restoran', 'stolovaya', 'shaurm', 'shawarma', 'dodo', 'teremok', 'shokoladnic', 'skovorodovna'],
      'food.delivery': ['yobidoyobi', 'samokat', 'kuper', 'sbermarket', 'delivery'],
      'food.coffee': ['coffee', 'kofe', 'cofix'],
      'home.internet': ['rostelecom'],
      'transport.taxi': ['yandex*4121', 'taxi', 'uber', 'citymobil'],
      'transport': ['gazprom', 'lukoil', 'rosneft', 'azs ', 'азс'],
      'connect.mobile': ['beeline', 'megafon', 'tele2', 'yota', 'mts '],
      'connect.subs': ['yandex*5815', 'kinopoisk', 'spotify', 'okko', 'ivi.ru'],
      'fun.games': ['games', 'funpay', 'ggsel', 'steam', 'playstation'],
      'fun.events': ['kinoteatr', 'cinema'],
      'fun.hobby': ['tkani', 'ткани', 'пряжа'],
      'health.pharmacy': ['apteka', 'aptechnyj', 'apteki', 'аптечный'],
      'gifts': ['detskiy mir', 'детский мир', 'absolyut shar', 'flowers', 'cvety'],
      'household.goods': ['fixprice', 'fix price', 'leroy', 'ikea', 'hoff'],
      'household.tech': ['dns-shop', 'mvideo', 'eldorado', 'citilink'],
      'travel.tickets': ['aeroflot', 'pobeda', 'rzd', 'tutu.ru', 'aviasales'],
      'travel.lodging': ['ostrovok', 'hotel', 'hostel'],
      'clothes': ['zara', 'gloria', 'befree', 'sportmaster', 'ostin', 'lamoda', 'uniqlo', 'kari '],
      'beauty.cosmetics': ['zolotoe yabloko', 'letual', 'podruzhka'],
      'beauty.salon': ['barber']
    },
    income: {}
  };
  ['expense', 'income'].forEach(function (t) {
    Object.keys(KEYWORDS_LATIN[t]).forEach(function (k) {
      KEYWORDS[t][k] = (KEYWORDS[t][k] || []).concat(KEYWORDS_LATIN[t][k]);
    });
  });

  // Код типа магазина (MCC) → категория. Есть в CSV и иногда в названии («YANDEX*4121*GO»).
  var MCC_MAP = {
    'transport.public': ['4111', '4131'],
    'transport.taxi': ['4121'],
    'transport.sharing': ['7512'],
    'transport': ['5541', '5542', '5983'],
    'travel.tickets': ['4112', '4511', '3000'],
    'travel': ['4722'],
    'travel.lodging': ['7011'],
    'food.groceries': ['5411', '5422', '5441', '5451', '5462', '5499'],
    'food.restaurants': ['5812', '5813', '5814'],
    'health.pharmacy': ['5912', '5122'],
    'health.doctors': ['8011', '8021', '8062', '8071', '8099'],
    'health.sport': ['7997', '7941', '5655', '5941'],
    'beauty.cosmetics': ['5977'],
    'beauty.salon': ['7230', '7298'],
    'clothes': ['5611', '5621', '5641', '5651', '5661', '5691', '5699'],
    'household.goods': ['5200', '5211', '5251', '5311', '5331', '5712', '5719'],
    'household.tech': ['5045', '5722', '5732'],
    'connect.mobile': ['4814'],
    'connect.subs': ['4899', '5815', '5817', '5818'],
    'fun.games': ['5816'],
    'home.utilities': ['4900'],
    'fun.events': ['7832', '7922', '7929', '7991', '7996'],
    'study.books': ['5942', '5192'],
    'study.stationery': ['5943'],
    'study.courses': ['8211', '8220', '8241', '8244', '8249', '8299'],
    'study.print': ['7333', '7338'],
    'gifts': ['5947', '5992'],
    'family.pets': ['0742', '5995'],
    'charity': ['8398'],
    'worktax.tax': ['9311'],
    'finance.fines': ['9222']
  };
  var MCC_INDEX = {};
  Object.keys(MCC_MAP).forEach(function (k) { MCC_MAP[k].forEach(function (code) { MCC_INDEX[code] = k; }); });

  function fromMcc(mcc) {
    var key = MCC_INDEX[String(mcc || '').trim()];
    return key ? Object.assign({ type: 'expense' }, splitKey(key)) : null;
  }

  // «Оплата в MAGNIT MM BUSHIDO Barnaul RUS» → «MAGNIT MM BUSHIDO»
  function cleanDescription(desc) {
    var s = String(desc || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^Оплата (в|услуг)\s+/i, '');
    if (/\s(RUS|RU)$/.test(s)) {
      s = s.replace(/\s(RUS|RU)$/, '');
      var parts = s.split(' ');
      if (parts.length > 1 && /^[A-Za-z][A-Za-z\-]+$/.test(parts[parts.length - 1])) parts.pop();
      if (parts.length > 1 && /^g\.$/i.test(parts[parts.length - 1])) parts.pop();
      s = parts.join(' ');
    }
    return s;
  }

  // Номер договора в «Внутренний перевод на договор 8177…» / «Перевод с договора 8177…»
  function contractOf(desc) {
    var m = norm(desc).match(/договор[а-я]*\s*№?\s*(\d{6,})/);
    return m ? m[1] : '';
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  function splitKey(key) {
    var dot = key.indexOf('.');
    return dot === -1 ? { category: key, sub: '' } : { category: key.slice(0, dot), sub: key };
  }

  // Ищем самое длинное совпадение из словаря в тексте.
  function matchKeywords(text, type) {
    var t = ' ' + norm(text) + ' ';
    var dict = KEYWORDS[type];
    var best = null, bestLen = 0;
    Object.keys(dict).forEach(function (key) {
      dict[key].forEach(function (w) {
        if (w.length > bestLen && t.indexOf(w) !== -1) {
          best = key;
          bestLen = w.length;
        }
      });
    });
    return best ? Object.assign({ type: type }, splitKey(best)) : null;
  }

  // ---------- Быстрая строка ----------
  // Примеры: «такси 450», «стипендия +3200», «вчера кофе 250 нал», «5.11 продукты 1 240,50»
  // ctx: { accounts: [...], learned: { 'фраза': {type, category, sub} } }
  function parseQuick(str, ctx) {
    var raw = String(str || '').trim();
    if (!raw) return null;
    var tokens = raw.split(/\s+/);

    // Склеиваем «1 250» в одно число.
    var merged = [];
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      var prev = merged[merged.length - 1];
      if (prev && /^[+\-−]?\d{1,3}$/.test(prev) && /^\d{3}([.,]\d{1,2})?(р|₽|руб)?$/i.test(tk)) {
        merged[merged.length - 1] = prev + tk;
      } else {
        merged.push(tk);
      }
    }

    var res = { type: 'expense', amount: NaN, date: '', account: '', note: '', category: '', sub: '', matched: false, explicitIncome: false };
    var words = [];
    var today = new Date();

    merged.forEach(function (tk) {
      var low = norm(tk);
      var dm = low.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/);
      if (dm && +dm[1] >= 1 && +dm[1] <= 31 && +dm[2] >= 1 && +dm[2] <= 12) {
        var y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : today.getFullYear();
        res.date = y + '-' + UI.pad(+dm[2]) + '-' + UI.pad(+dm[1]);
        return;
      }
      var nm = low.match(/^([+\-−]?)(\d+(?:[.,]\d{1,2})?)(к|k|т|тыс)?(р|₽|руб)?\.?$/);
      if (nm) {
        var v = parseFloat(nm[2].replace(',', '.'));
        if (nm[3]) v *= 1000;
        res.amount = UI.round2(v);
        if (nm[1] === '+') res.explicitIncome = true;
        return;
      }
      if (low === 'вчера' || low === 'позавчера' || low === 'сегодня') {
        var d = new Date();
        d.setDate(d.getDate() - (low === 'вчера' ? 1 : low === 'позавчера' ? 2 : 0));
        res.date = UI.iso(d);
        return;
      }
      if (low === 'доход') { res.explicitIncome = true; return; }
      if (/^(нал|налом|наличн[а-я]*|кэш|кеш|cash)$/.test(low)) { res.account = findAccount(ctx.accounts, 'нал', 'cash'); return; }
      if (/^карт[а-я]*$/.test(low)) { res.account = findAccount(ctx.accounts, null, 'card'); return; }
      var acc = (ctx.accounts || []).find(function (a) { return a.kind !== 'piggy' && norm(a.name) === low; });
      if (acc) { res.account = acc.id; return; }
      words.push(tk);
    });

    res.note = words.join(' ');
    var key = norm(res.note);
    var learned = ctx.learned || {};
    var hit = null;

    function usable(l) { return l && l.kind !== 't' && l.type; }
    if (key && usable(learned[key])) hit = learned[key];
    if (!hit && key) {
      words.some(function (w) { var l = learned[norm(w)]; if (usable(l)) hit = l; return !!hit; });
    }
    if (!hit && key) {
      if (res.explicitIncome) hit = matchKeywords(key, 'income');
      else hit = matchKeywords(key, 'expense') || matchKeywords(key, 'income');
    }
    if (hit) {
      res.type = hit.type;
      res.category = hit.category;
      res.sub = hit.sub || '';
      res.matched = true;
    }
    if (res.explicitIncome) res.type = 'income';
    if (res.matched && res.explicitIncome && hit.type !== 'income') {
      // «+500 кафе» — сумма с плюсом, но слово из расходов: категорию не угадываем.
      res.category = ''; res.sub = ''; res.matched = false;
    }
    return res;
  }

  function findAccount(accounts, nameHas, fallbackId) {
    var list = (accounts || []).filter(function (a) { return a.kind !== 'piggy'; });
    var byName = nameHas && list.find(function (a) { return norm(a.name).indexOf(nameHas) !== -1; });
    if (byName) return byName.id;
    var byId = list.find(function (a) { return a.id === fallbackId; });
    return byId ? byId.id : (list[0] ? list[0].id : '');
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var firstLine = text.split(/\r?\n/).find(function (l) { return l.trim(); }) || '';
    var delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function csvNumber(s) {
    var v = parseFloat(String(s || '').replace(/[\s "]/g, '').replace(',', '.'));
    return isNaN(v) ? NaN : UI.round2(v);
  }

  // ---------- Выписка Т-Банка (CSV) ----------
  // Ожидаемые столбцы: «Дата операции», «Статус», «Сумма платежа» (или «Сумма операции»),
  // «Категория», «MCC», «Описание». Ищем их по названию, порядок не важен.
  function parseTBank(text) {
    var rows = parseCSV(text);
    var hi = rows.findIndex(function (r) { return r.some(function (c) { return norm(c) === 'дата операции'; }); });
    if (hi === -1) throw new Error('не нашёл столбец «Дата операции». Это точно выписка Т-Банка в формате CSV?');
    var H = rows[hi].map(norm);
    function col(name) { return H.indexOf(name); }
    var iDate = col('дата операции');
    var iStatus = col('статус');
    var iAmount = col('сумма платежа') !== -1 ? col('сумма платежа') : col('сумма операции');
    var iCat = col('категория');
    var iMcc = col('mcc');
    var iDesc = col('описание');
    if (iAmount === -1) throw new Error('не нашёл столбец с суммой («Сумма платежа» или «Сумма операции»).');

    var ops = [];
    rows.slice(hi + 1).forEach(function (r) {
      if (!r[iDate] || !r[iDate].trim()) return;
      if (iStatus !== -1 && r[iStatus] && norm(r[iStatus]) !== 'ok') return; // отклонённые операции пропускаем
      var dm = r[iDate].trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
      if (!dm) return;
      var amount = csvNumber(r[iAmount]);
      if (isNaN(amount) || amount === 0) return;
      var desc = iDesc !== -1 ? (r[iDesc] || '').trim() : '';
      ops.push({
        date: dm[3] + '-' + dm[2] + '-' + dm[1],
        time: dm[4] || '',
        amount: amount,
        bankCategory: iCat !== -1 ? (r[iCat] || '').trim() : '',
        mcc: iMcc !== -1 ? (r[iMcc] || '').trim() : '',
        description: desc
      });
    });
    return finalizeOps(ops, 'tb');
  }

  // Ключ для отсева повторов. Одинаковые операции в один день различаем порядковым номером.
  function finalizeOps(ops, prefix) {
    var seen = {};
    ops.forEach(function (op) {
      var base = prefix + '|' + op.date + '|' + op.time + '|' + op.amount + '|' + norm(op.description);
      seen[base] = (seen[base] || 0) + 1;
      op.importKey = base + '#' + seen[base];
      if (!op.mcc) {
        var m = op.description.match(/\*(\d{4})\*/);
        if (m) op.mcc = m[1];
      }
      op.note = cleanDescription(op.description);
    });
    return ops;
  }

  // ---------- Выписка Т-Банка (PDF) ----------
  // pages: [{ width, items: [{ x, y, s }] }] — текст страниц с координатами (y считается снизу).
  // Колонки таблицы: дата и время · дата обработки · описание · сумма операции · сумма в валюте счёта.
  // Берём «сумму в валюте счёта» (всегда в рублях). Поступления помечены «+», расходы — без знака.
  function parseTBankPdf(pages) {
    var cols = null;
    pages.some(function (p) {
      var desc = p.items.find(function (it) { return norm(it.s) === 'описание'; });
      var sums = p.items.filter(function (it) { return /^сумма/.test(norm(it.s)); }).sort(function (a, b) { return a.x - b.x; });
      if (desc && sums.length >= 2) {
        cols = { desc: desc.x - 5, op: sums[0].x - 30, acc: sums[sums.length - 1].x - 30 };
        return true;
      }
      return false;
    });
    var ops = [];
    var cur = null;
    var DATE = /(\d{2})\.(\d{2})\.(\d{2})(?!\d)/g;

    pages.forEach(function (p) {
      var c = cols || { desc: p.width * 0.353, op: p.width * 0.677, acc: p.width * 0.812 };
      // Собираем слова в строки по высоте.
      var items = p.items.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      var rows = [];
      items.forEach(function (it) {
        var last = rows[rows.length - 1];
        if (last && Math.abs(last.y - it.y) <= 3) last.items.push(it);
        else rows.push({ y: it.y, items: [it] });
      });
      var prevY = null;
      rows.forEach(function (row, idx) {
        row.items.sort(function (a, b) { return a.x - b.x; });
        function zone(from, to) {
          return row.items.filter(function (it) { return it.x >= from && it.x < to; }).map(function (it) { return it.s.trim(); }).join(' ').trim();
        }
        var zDate = zone(-1, c.desc), zDesc = zone(c.desc, c.op), zAcc = zone(c.acc, 1e9);
        var dates = zDate.match(DATE) || [];
        if (dates.length >= 2 && /\d/.test(zAcc)) {
          var t = zDate.match(/\b(\d{2}:\d{2})\b/);
          var amtTxt = zAcc.replace(/[₽\s ]/g, '').replace(',', '.');
          var amount = UI.round2(parseFloat(amtTxt.replace(/^[+\-−]/, '')));
          if (isNaN(amount)) return;
          if (!/^\+/.test(amtTxt)) amount = -amount;
          var d = dates[0].split('.');
          cur = { date: '20' + d[2] + '-' + d[1] + '-' + d[0], time: t ? t[1] : '', amount: amount, bankCategory: '', mcc: '', description: zDesc };
          ops.push(cur);
        } else if (cur && zDesc && !zDate && !zAcc && (idx === 0 || prevY === null || prevY - row.y <= 16)) {
          // Продолжение описания (перенос строки или начало следующей страницы).
          cur.description += ' ' + zDesc;
        }
        prevY = row.y;
      });
    });
    return finalizeOps(ops, 'tbpdf');
  }

  // Категории Т-Банка → наши (сравнение по началу/вхождению слова).
  var TBANK_MAP = [
    ['супермаркет', 'food.groceries'], ['продукт', 'food.groceries'],
    ['фастфуд', 'food.restaurants'], ['ресторан', 'food.restaurants'], ['кафе', 'food.restaurants'],
    ['такси', 'transport.taxi'], ['каршеринг', 'transport.sharing'], ['аренда авто', 'transport.sharing'],
    ['местный транспорт', 'transport.public'], ['транспорт', 'transport.public'], ['топливо', 'transport'],
    ['аптек', 'health.pharmacy'], ['медицин', 'health.doctors'], ['спорт', 'health.sport'],
    ['красот', 'beauty.salon'], ['косметик', 'beauty.cosmetics'],
    ['одежда', 'clothes'], ['обувь', 'clothes'],
    ['дом и ремонт', 'household.goods'], ['электроника', 'household.tech'], ['бытовая техника', 'household.tech'],
    ['мобильная связь', 'connect.mobile'], ['связь', 'connect.mobile'], ['цифровые товары', 'connect.subs'], ['музыка', 'connect.subs'],
    ['жкх', 'home.utilities'], ['коммунал', 'home.utilities'],
    ['кино', 'fun.events'], ['развлечен', 'fun'], ['искусство', 'fun.events'],
    ['образован', 'study.courses'], ['книги', 'study.books'], ['канц', 'study.stationery'],
    ['ж/д', 'travel.tickets'], ['авиабилет', 'travel.tickets'], ['отел', 'travel.lodging'], ['турагент', 'travel'], ['путешеств', 'travel'],
    ['животн', 'family.pets'], ['цвет', 'gifts'], ['сувенир', 'gifts'],
    ['финансовые услуги', 'finance.fees'], ['штраф', 'finance.fines'], ['налог', 'worktax.tax'],
    ['благотвор', 'charity']
  ];

  function fromTBankCategory(bc) {
    var n = norm(bc);
    if (!n) return null;
    for (var i = 0; i < TBANK_MAP.length; i++) {
      if (n.indexOf(TBANK_MAP[i][0]) !== -1) return Object.assign({ type: 'expense' }, splitKey(TBANK_MAP[i][1]));
    }
    return null;
  }

  // Предлагаем, как записать операцию из выписки.
  // Возвращает { kind: 'c', type, category, sub, review } или { kind: 't', to, review }.
  // Ключи, по которым дашборд запоминает выбор для операций из выписки.
  function learnKeys(op) {
    var keys = [];
    var contract = contractOf(op.description);
    if (contract) keys.push('договор:' + contract);
    keys.push(norm(op.description));
    return keys;
  }

  function suggestForBankOp(op, ctx) {
    var learned = ctx.learned || {};
    var d = norm(op.description);
    var bc = norm(op.bankCategory);
    var contract = contractOf(op.description);

    var l = null;
    learnKeys(op).some(function (k) { l = learned[k]; return !!l; });
    if (l && l.kind === 't') return { kind: 't', to: l.to, review: false };
    if (l && l.type === (op.amount < 0 ? 'expense' : 'income')) return { kind: 'c', type: l.type, category: l.category, sub: l.sub || '', review: false };

    function cat(hit, review) { return { kind: 'c', type: hit.type, category: hit.category, sub: hit.sub || '', review: !!review }; }

    if (op.amount < 0) {
      if (bc.indexOf('наличн') !== -1 || d.indexOf('снятие налич') !== -1 || d.indexOf('банкомат') !== -1) {
        var cash = findAccount(ctx.accounts, 'нал', 'cash');
        if (cash && cash !== ctx.account) return { kind: 't', to: cash, review: false };
      }
      // Переводы на другой договор или людям — по умолчанию «Переводы людям», но пусть пользователь проверит.
      if (contract || /перевод/.test(d)) return cat({ type: 'expense', category: 'people', sub: '' }, true);
      var byDesc = matchKeywords(d, 'expense');
      if (byDesc) return cat(byDesc);
      var byMcc = fromMcc(op.mcc);
      if (byMcc) return cat(byMcc);
      var byBank = fromTBankCategory(bc);
      if (byBank) return cat(byBank);
      return cat({ type: 'expense', category: 'other-exp', sub: '' }, true);
    }
    if (contract || /перевод себе|между (своими )?счетами/.test(d)) return cat({ type: 'income', category: 'other-inc', sub: '' }, true);

    // Поступления
    if (bc.indexOf('кэшбэк') !== -1 || bc.indexOf('кешбэк') !== -1 || bc.indexOf('бонус') !== -1) return cat({ type: 'income', category: 'cashback', sub: 'cashback.cb' });
    if (bc.indexOf('процент') !== -1 || d.indexOf('проценты') !== -1) return cat({ type: 'income', category: 'cashback', sub: 'cashback.interest' });
    var inc = matchKeywords(d, 'income');
    if (inc) return cat(inc);
    if (fromTBankCategory(bc)) return cat({ type: 'income', category: 'refunds', sub: 'refunds.returns' }, true);
    return cat({ type: 'income', category: 'other-inc', sub: '' }, true);
  }

  window.MoneyData = {
    CATS: CATS,
    ACCOUNTS: ACCOUNTS,
    norm: norm,
    matchKeywords: matchKeywords,
    parseQuick: parseQuick,
    parseTBank: parseTBank,
    parseTBankPdf: parseTBankPdf,
    suggestForBankOp: suggestForBankOp,
    learnKeys: learnKeys,
    contractOf: contractOf,
    cleanDescription: cleanDescription
  };
})();
