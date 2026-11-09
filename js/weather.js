/* ============================================================
   Погода для шапки Сводки — бесплатный сервис Open-Meteo (без ключей и регистрации).
   Город выбирается в настройках и хранится в данных ('weather.city'), а не в коде.
   Ответ кэшируется на 30 минут, без интернета показывается последний известный.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'dash:weather-cache';
  var TTL = 30 * 60 * 1000;
  var loading = false;

  var CODES = [
    [[0], '☀️', 'ясно'], [[1], '🌤️', 'малооблачно'], [[2], '⛅', 'переменная облачность'], [[3], '☁️', 'пасмурно'],
    [[45, 48], '🌫️', 'туман'], [[51, 53, 55, 56, 57], '🌦️', 'морось'], [[61, 63, 65, 66, 67], '🌧️', 'дождь'],
    [[71, 73, 75, 77], '🌨️', 'снег'], [[80, 81, 82], '🌧️', 'ливень'], [[85, 86], '❄️', 'снегопад'], [[95, 96, 99], '⛈️', 'гроза']
  ];
  function describe(code) {
    var hit = CODES.find(function (c) { return c[0].indexOf(code) !== -1; });
    return hit ? { emoji: hit[1], text: hit[2] } : { emoji: '🌡️', text: '' };
  }

  function city() { return Store.getSetting('weather.city', null); }
  function cityName() { var c = city(); return c ? c.name : ''; }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  function setCity(name) {
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (!name) { Store.setSetting('weather.city', null); return Promise.resolve(''); }
    return fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=' + encodeURIComponent(name))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var r = d.results && d.results[0];
        if (!r) throw new Error('Город не найден — попробуй написать иначе.');
        Store.setSetting('weather.city', { name: r.name, lat: r.latitude, lon: r.longitude });
        return r.name + (r.admin1 ? ', ' + r.admin1 : '');
      });
  }

  // Текущая погода (из кэша); если устарела — тихо обновляем и перерисовываем Сводку.
  function current() {
    var c = city();
    if (!c) return null;
    var cache = readCache();
    var fresh = cache && cache.city === c.name && Date.now() - cache.at < TTL;
    if (!fresh && !loading) {
      loading = true;
      fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon +
        '&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var w = {
            temp: Math.round(d.current.temperature_2m),
            feels: Math.round(d.current.apparent_temperature),
            code: d.current.weather_code,
            max: Math.round(d.daily.temperature_2m_max[0]),
            min: Math.round(d.daily.temperature_2m_min[0])
          };
          try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), city: c.name, data: w })); } catch (e) {}
          loading = false;
          if (location.hash === '' || location.hash === '#summary') window.App && App.softRefresh();
        })
        .catch(function () { loading = false; });
    }
    if (!cache || cache.city !== c.name) return null;
    var w = cache.data;
    var dsc = describe(w.code);
    return { city: c.name, temp: w.temp, feels: w.feels, min: w.min, max: w.max, emoji: dsc.emoji, text: dsc.text };
  }

  function fmtTemp(t) { return (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t) + '°'; }

  window.Weather = { current: current, setCity: setCity, cityName: cityName, fmtTemp: fmtTemp };
})();
