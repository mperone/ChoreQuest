from datetime import date, timedelta


def monday_week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def monday_week_starts_to_generate(today: date, end_date: date) -> list[date]:
    """Return Monday week starts from the current week through end_date."""
    current = monday_week_start(today)
    last = monday_week_start(max(today, end_date))

    weeks = []
    while current <= last:
        weeks.append(current)
        current += timedelta(days=7)
    return weeks
