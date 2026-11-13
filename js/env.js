/* Где запущен дашборд: основной сайт или тестовая копия (…/dashboard-test/).
   У тестовой копии всё отдельно: папка в облаке (users_test), данные в браузере, кэш —
   поэтому проверка новых функций никак не задевает настоящие данные. */
(function () {
  var test = /\/dashboard-test\//.test(location.pathname) || /[?&]env=test\b/.test(location.search);
  window.DASH_ENV = test ? 'test' : 'prod';
  window.DASH_ROOT = test ? 'users_test' : 'users';
  window.DASH_KEY = function (k) { return test ? k + ':test' : k; };
  // Адрес сервера (Apps Script). У тестовой копии свой, чтобы проверять новое, не трогая рабочий.
  window.DASH_SERVER = test ? 'https://script.google.com/macros/s/AKfycbznK_t5A1ECaBybefBmO5HAHg0pULv82I4AkaNdqra8RhW1c2fwWAN008wmoos82aUA/exec' : 'https://script.google.com/macros/s/AKfycbwPCWbdBlOf63cL3MAoebfuBTnhSRMpcS6aCHqiOR6bioLgbBoBQQ9AWnuPDlHYOOyC/exec';
  if (test) document.documentElement.classList.add('env-test');
})();
