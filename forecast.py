"""Ridge Hall lunch forecast. One hall, no student login."""

HALL = "Ridge Hall"
PROBLEM = "Mess queue wait times"
SERVICE_PER_MINUTE = 18
PEAK_MINUTES = 20
QUIET_MINUTES = 10
SHORT_WAIT = 8
ARRIVALS = (
    (0, 25, 10),
    (25, 40, 18),
    (40, 70, 34),
    (70, 90, 16),
    (90, 130, 8),
    (130, 180, 6),
)


def empty_state():
    return {"lineDelta": 0, "moves": {}, "joined": 0, "served": 0}


def format_time(offset):
    total = 11 * 60 + offset
    hour24 = total // 60
    minute = total % 60
    suffix = "PM" if hour24 >= 12 else "AM"
    hour = hour24 % 12 or 12
    return f"{hour}:{minute:02d} {suffix}"


def arrival_rate(offset):
    for start, end, rate in ARRIVALS:
        if start <= offset < end:
            return rate
    return 0


def _move_effects(moves):
    leaving = {}
    arriving = {}
    for key, count in (moves or {}).items():
        if count <= 0 or ":" not in key:
            continue
        start_text, dest_text = key.split(":", 1)
        start, dest = int(start_text), int(dest_text)
        leaving[start] = leaving.get(start, 0) + count
        arriving[dest] = arriving.get(dest, 0) + count
    return leaving, arriving


def build_series(offset, line_delta, moves):
    leaving, arriving = _move_effects(moves)
    points = []
    queue = 0
    for minute in range(181):
        arrivals = arrival_rate(minute) + arriving.get(minute, 0)
        queue = max(0, queue + arrivals - SERVICE_PER_MINUTE - leaving.get(minute, 0))
        if minute == offset:
            queue = max(0, queue + line_delta)
        points.append({"m": minute, "queue": queue, "wait": queue / SERVICE_PER_MINUTE})
    return points


def _quiet_window(points, offset):
    current = points[offset]["wait"]
    later = next((point for point in points if point["m"] > offset and point["wait"] <= SHORT_WAIT), None)
    if later is None:
        return None
    saved = round(current - later["wait"])
    if saved < 10:
        return None
    return later, saved


def _students_to_bring_under_20(offset, dest, line_delta, moves):
    key = f"{offset}:{dest}"
    already = int((moves or {}).get(key, 0))

    def wait_after(extra):
        trial = dict(moves or {})
        trial[key] = already + extra
        return build_series(offset, line_delta, trial)[offset]["wait"]

    if wait_after(0) < 19.5:
        return 0
    lo, hi = 1, 400
    needed = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if wait_after(mid) < 19.5:
            needed = mid
            hi = mid - 1
        else:
            lo = mid + 1
    return needed or 0


def board_for(offset, state):
    offset = min(180, max(0, int(offset)))
    line_delta = int(state.get("lineDelta") or 0)
    moves = state.get("moves") or {}
    points = build_series(offset, line_delta, moves)
    current = points[offset]
    shown = round(current["wait"])
    window = _quiet_window(points, offset)
    switched = sum(max(0, count) for count in moves.values())

    if shown >= PEAK_MINUTES:
        status = "Students are waiting more than 20 minutes at peak lunch."
    elif shown >= QUIET_MINUTES:
        status = "Busy, and still shorter than a 20-minute wait."
    else:
        status = "Short line. Going now is the fast option."

    shorten = {
        "show": False,
        "from": offset,
        "to": None,
        "timeLabel": "",
        "waitMinutes": None,
        "minutesSaved": 0,
        "lunchStartsLater": 0,
        "switchingNow": 0,
        "studentsToBringUnder20": 0,
        "advice": f"The predicted wait is {shown} min. Going now is the better choice.",
    }
    if window:
        later, saved = window
        switching = int(moves.get(f"{offset}:{later['m']}", 0))
        needed = _students_to_bring_under_20(offset, later["m"], line_delta, moves) if shown >= PEAK_MINUTES else 0
        delay = later["m"] - offset
        shorten = {
            "show": True,
            "from": offset,
            "to": later["m"],
            "timeLabel": format_time(later["m"]),
            "waitMinutes": round(later["wait"]),
            "minutesSaved": saved,
            "lunchStartsLater": delay,
            "switchingNow": switching,
            "studentsToBringUnder20": needed,
            "advice": (
                f"Come at {format_time(later['m'])} instead. The predicted wait is "
                f"{round(later['wait'])} min, about {saved} min less in line. "
                f"Lunch starts {delay} min later."
            ),
        }
    elif shown >= PEAK_MINUTES:
        shorten["advice"] = "The predicted wait stays long until Ridge Hall closes at 2:00 PM."

    return {
        "problem": PROBLEM,
        "hall": HALL,
        "oneDiningHall": True,
        "studentLoginRequired": False,
        "at": offset,
        "timeLabel": format_time(offset),
        "predictedMinutes": shown,
        "inLine": round(current["queue"]),
        "servicePerMinute": SERVICE_PER_MINUTE,
        "overTwentyMinutes": shown >= PEAK_MINUTES,
        "status": status,
        "lineDelta": line_delta,
        "joined": int(state.get("joined") or 0),
        "served": int(state.get("served") or 0),
        "studentsWhoSwitched": switched,
        "points": points,
        "shorten": shorten,
    }


def apply_shorten(state, start, dest):
    view = board_for(start, state)
    plan = view["shorten"]
    needed = plan["studentsToBringUnder20"]
    if not plan["show"] or plan["to"] != dest or plan["from"] != start or needed <= 0:
        return None
    key = f"{start}:{dest}"
    moves = state.setdefault("moves", {})
    moves[key] = int(moves.get(key, 0)) + needed
    return state
