"""Загрузка расписания группы с сайта Алтайского филиала РАНХиГС → data/schedule.json.

Запуск:  python tools/fetch_schedule.py            (группа и недели — по умолчанию ниже)
         python tools/fetch_schedule.py 3231В 6     (группа, сколько недель вперёд)

Сайт не разрешает другим сайтам читать свои страницы из браузера,
поэтому расписание забирает эта программа (вручную или по расписанию на GitHub),
а дашборд читает готовый файл data/schedule.json.
Только стандартная библиотека Python, без установки пакетов.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://alt.ranepa.ru"
FORM = "fo1"  # бакалавриат, очная форма
GROUP = sys.argv[1] if len(sys.argv) > 1 else "3231В"
WEEKS_AHEAD = int(sys.argv[2]) if len(sys.argv) > 2 else 12   # с запасом: видно сессию заранее
WEEKS_BACK = 1
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "schedule.json")
UA = "Mozilla/5.0 (personal study dashboard; schedule fetch once a day)"


def week_url(monday):
    group = urllib.parse.quote("group" + GROUP)
    return f"{BASE}/shedule/{FORM}/{group}/{monday.isoformat()}/"


def fetch(url, tries=4):
    # Сайт иногда не отвечает с первого раза — пробуем несколько раз с паузой.
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def text(fragment):
    s = re.sub(r"<span>#</span>", "", fragment)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


ROW_RE = re.compile(
    r'<div class="b-schedule__table-row b-schedule__table-row--(?!header)[^"]*">(.*?)'
    r'<div class="b-schedule__table-dropdown"[^>]*data-pair="(\d+)"[^>]*data-date="(\d{4}-\d{2}-\d{2})"',
    re.S,
)
ITEM_RE = re.compile(r'<div class="b-schedule__table-item">(.*?)</div>', re.S)


def parse_week(page):
    lessons = []
    for row_html, pair, date in ROW_RE.findall(page):
        items = [text(x) for x in ITEM_RE.findall(row_html)]
        if len(items) < 4:
            continue
        num, times, kind, subject = items[0], items[1], items[2], items[3]
        room = items[4] if len(items) > 4 else ""
        teacher = items[5] if len(items) > 5 else ""
        m = re.search(r"(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})", times)
        lessons.append({
            "date": date,
            "num": int(pair or re.sub(r"\D", "", num) or 0),
            "start": m.group(1) if m else "",
            "end": m.group(2) if m else "",
            "type": kind,
            "subject": subject,
            "room": room,
            "teacher": teacher,
        })
    return lessons


def main():
    today = dt.date.today()
    monday = today - dt.timedelta(days=today.weekday())
    # Прежний файл: если какую-то неделю скачать не удалось, оставляем её старую версию.
    old = {}
    try:
        with open(OUT, encoding="utf-8") as f:
            old = {w["start"]: w for w in json.load(f).get("weeks", [])}
    except (OSError, ValueError):
        pass
    weeks = []
    for i in range(-WEEKS_BACK, WEEKS_AHEAD):
        start = monday + dt.timedelta(weeks=i)
        try:
            page = fetch(week_url(start))
        except Exception as e:  # сайт недоступен — берём прежнюю версию недели, если она есть
            print(f"неделя {start}: ошибка {e}")
            if start.isoformat() in old:
                weeks.append(old[start.isoformat()])
            continue
        lessons = parse_week(page)
        weeks.append({"start": start.isoformat(), "lessons": lessons})
        print(f"неделя {start}: {len(lessons)} пар")
        time.sleep(1)  # не нагружаем сайт

    if not any(w for w in weeks):
        print("Не удалось загрузить ни одной недели — старый файл не трогаю.")
        sys.exit(1)

    # Если пары не изменились — файл не трогаем (чтобы не делать пустых обновлений сайта).
    try:
        with open(OUT, encoding="utf-8") as f:
            if json.load(f).get("weeks") == weeks:
                print("Расписание не изменилось.")
                return
    except (OSError, ValueError):
        pass

    data = {
        "group": GROUP,
        "source": f"{BASE}/shedule/{FORM}/group{GROUP}/",
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "weeks": weeks,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("сохранено:", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
