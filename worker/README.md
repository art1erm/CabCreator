# Обратная связь в Telegram

Кнопка «Сообщить об ошибке» в CabCreator отправляет сообщение на небольшой сервер-посредник (Cloudflare Worker), а он пересылает его в ваш Telegram через бота. Токен бота хранится только в посреднике и не попадает в код страницы.

## 1. Создайте бота

1. В Telegram откройте @BotFather, отправьте `/newbot`, задайте имя и username (например, `cabcreator_feedback_bot`).
2. Сохраните токен вида `123456789:AA...`.
3. Напишите своему боту любое сообщение (например, `/start`).
4. Откройте в браузере `https://api.telegram.org/bot<ТОКЕН>/getUpdates` и найдите `"chat":{"id":...}` — это ваш `CHAT_ID`. Для группы добавьте бота в группу и возьмите id группы (он начинается с `-`).

## 2. Разверните посредника

### Вариант А — через сайт Cloudflare, без программ

1. Войдите на dash.cloudflare.com → слева **Workers & Pages** → **Create** → **Create Worker** (шаблон Hello World).
2. Задайте имя, например `cabcreator-feedback`, и нажмите **Deploy**. Появится адрес вида `https://cabcreator-feedback.<имя>.workers.dev`.
3. Нажмите **Edit code**, удалите весь код в редакторе и вставьте содержимое файла `worker/feedback-worker.js`. Нажмите **Deploy**.
4. Вернитесь к воркеру → **Settings** → **Variables and Secrets** → **Add**:
   - Type **Secret**, Variable name `BOT_TOKEN`, Value — токен бота;
   - **Add variable** → Type **Secret**, Variable name `CHAT_ID`, Value — id чата.
   Нажмите **Deploy**.
5. Проверка: откройте адрес воркера в браузере — должно показать `{"ok":false,"error":"method"}`. Это нормально: воркер жив и ждёт сообщений от приложения.

### Вариант Б — из командной строки

Нужен Node.js.

```bash
cd worker
npx wrangler login
npx wrangler secret put BOT_TOKEN   # вставьте токен
npx wrangler secret put CHAT_ID     # вставьте id чата
npx wrangler deploy
```

После `deploy` wrangler покажет адрес вида `https://cabcreator-feedback.<имя>.workers.dev`.

Чтобы принимать сообщения только с вашего сайта, укажите его в `ALLOW_ORIGIN` в `wrangler.toml` (например, `https://av0cad01.github.io`) и снова выполните `npx wrangler deploy`.

## 3. Подключите адрес в приложении

В `index.html` найдите строку

```js
const FEEDBACK={endpoint:"",bot:""};
```

и впишите адрес посредника и username бота без `@`:

```js
const FEEDBACK={endpoint:"https://cabcreator-feedback.<имя>.workers.dev",bot:"cabcreator_feedback_bot"};
```

## Что приходит в Telegram

- Тип: 🐞 Ошибка или 💡 Предложение, версия приложения.
- Текст сообщения и контакт, если его оставили.
- Контекст: размеры шкафа, число секций, браузер, размер экрана.
- Файл `project.json`, если стояла галочка «Приложить текущий проект» — его можно открыть в CabCreator кнопкой «Открыть».

## Ограничения

- Внутри Claude страница не может обращаться к внешним адресам, поэтому там форма копирует текст и предлагает открыть чат с ботом (`bot` в `FEEDBACK`), чтобы вставить сообщение вручную. Напрямую отправка работает из `index.html`, открытого в браузере, или с GitHub Pages.
- Посредник ограничивает частоту: не больше 5 сообщений в минуту с одного адреса. Скрытое поле-ловушка отсекает простых спам-ботов.
