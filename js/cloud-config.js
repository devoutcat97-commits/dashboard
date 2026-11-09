/* Настройки облака Firebase.
   Это не пароль: эти строки только говорят сайту, к какому проекту подключаться.
   Чужие данные они не открывают — доступ защищён входом через Google и правилами базы
   (каждый видит только свою папку users/<его id>).
   Проект Firebase: dashboard-2948a. */
window.CLOUD_CONFIG = {
  apiKey: 'AIzaSyBpboHWJ6WXQi9bu1RHphYv5lpcmJmFHVo',
  authDomain: 'dashboard-2948a.firebaseapp.com',
  projectId: 'dashboard-2948a',
  storageBucket: 'dashboard-2948a.firebasestorage.app',
  messagingSenderId: '701577605393',
  appId: '1:701577605393:web:fa15de857a342431ec1cb0',
  // Публичный ключ для push-уведомлений (не секрет).
  vapidKey: 'BLIF92wikGZHETlZr4ehtRd0x_6QKAFo-qZPUAYrnibkTNGAJ0sws8HdGr1fzOY3-JiKgXRbHt8rR7BW-rIJc2Q'
};
