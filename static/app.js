const HALL = {
  servicePerMinute: 18,
  // [start, end) minutes after 11:00, arrivals each minute
  arrivals: [
    [0, 25, 10],
    [25, 40, 18],
    [40, 70, 34],
    [70, 90, 16],
    [90, 130, 8],
    [130, 180, 6],
  ],
};

const QUIET = 10;
const SHORT = 8;

const waitEl = document.querySelector("#wait-value");
const waitWrap = document.querySelector(".wait");
const statusEl = document.querySelector("#wait-status");
const whenEl = document.querySelector("#when-label");
const lineEl = document.querySelector("#line-count");
const movedEl = document.querySelector("#moved-count");
const adviceEl = document.querySelector("#advice");
const chart = document.querySelector("#chart");
const clock = document.querySelector("#clock");
const clockReadout = document.querySelector("#clock-readout");
const clockNote = document.querySelector("#clock-note");
const pairCountEl = document.querySelector("#pair-count");
const pairLabel = document.querySelector("#pair-label");
const moveNote = document.querySelector("#move-note");
const counterNote = document.querySelector("#counter-note");
const syncEl = document.querySelector("#sync");
const moveUp = document.querySelector("#move-up");
const moveDown = document.querySelector("#move-down");

let state = { lineDelta: 0, moves: {}, joined: 0, served: 0 };
let shared = false;
let nowOffset = 70;

function formatTime(offset) {
  const total = 11 * 60 + offset;
  const h24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  let hour = h24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function arrivalRate(offset) {
  for (const [start, end, rate] of HALL.arrivals) {
    if (offset >= start && offset < end) return rate;
  }
  return 0;
}

function moveEffects(moves) {
  const out = {};
  const into = {};
  for (const [key, count] of Object.entries(moves || {})) {
    const [from, to] = key.split(":").map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to) || count <= 0) continue;
    out[from] = (out[from] || 0) + count;
    into[to] = (into[to] || 0) + count;
  }
  return { out, into };
}

function buildSeries(offset, lineDelta, moves) {
  const { out, into } = moveEffects(moves);
  const points = [];
  let queue = 0;
  for (let minute = 0; minute <= 180; minute += 1) {
    const arrivals = arrivalRate(minute) + (into[minute] || 0);
    queue = Math.max(0, queue + arrivals - HALL.servicePerMinute - (out[minute] || 0));
    if (minute === offset) queue = Math.max(0, queue + lineDelta);
    points.push({
      m: minute,
      queue,
      wait: queue / HALL.servicePerMinute,
    });
  }
  return points;
}

function movedTotal(moves) {
  return Object.values(moves || {}).reduce((sum, count) => sum + Math.max(0, count), 0);
}

function pairCount(moves, from, to) {
  if (to == null) return 0;
  return moves[`${from}:${to}`] || 0;
}

function paintChart(points, offset, later) {
  const width = 720;
  const height = 220;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxWait = Math.max(30, ...points.map((point) => point.wait));
  const x = (minute) => pad.l + (minute / 180) * innerW;
  const y = (wait) => pad.t + innerH - (wait / maxWait) * innerH;

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.m).toFixed(1)},${y(point.wait).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(180).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const ticks = [0, 60, 120, 180];
  const labels = ticks
    .map((minute) => {
      const label = formatTime(minute).replace(":00 ", " ");
      return `<text x="${x(minute)}" y="${height - 8}" text-anchor="${minute === 0 ? "start" : minute === 180 ? "end" : "middle"}" class="axis">${label}</text>`;
    })
    .join("");

  const laterMark =
    later == null
      ? ""
      : `<circle cx="${x(later)}" cy="${y(points[later].wait)}" r="5" fill="#1c6b43" />`;

  chart.innerHTML = `
    <line x1="${pad.l}" y1="${y(20)}" x2="${width - pad.r}" y2="${y(20)}" stroke="#c9b6a2" stroke-dasharray="4 4" />
    <text x="${width - pad.r}" y="${y(20) - 6}" text-anchor="end" class="axis">20 min</text>
    <path d="${area}" fill="#f3d2c2" />
    <path d="${line}" fill="none" stroke="#9d3412" stroke-width="2.5" />
    <line x1="${x(offset)}" y1="${pad.t}" x2="${x(offset)}" y2="${pad.t + innerH}" stroke="#241c16" stroke-width="1.5" />
    <circle cx="${x(offset)}" cy="${y(points[offset].wait)}" r="5" fill="#241c16" />
    ${laterMark}
    ${labels}
  `;
}

function describe(points, offset) {
  const current = points[offset];
  const shown = Math.round(current.wait);
  const laterPoint = points.find((point) => point.m > offset && point.wait <= SHORT);
  const saved = laterPoint ? Math.round(current.wait - laterPoint.wait) : 0;
  const suggestLater = Boolean(laterPoint) && saved >= 10;
  const level = shown >= 20 ? "long" : shown >= QUIET ? "mid" : "ok";
  waitWrap.className = `wait ${level}`;
  waitEl.textContent = String(shown);
  lineEl.textContent = String(Math.round(current.queue));
  whenEl.textContent = `Today at ${formatTime(offset)}`;
  clockReadout.textContent = formatTime(offset);

  if (shown >= 20) {
    statusEl.textContent = "Over 20 minutes. This is the peak.";
  } else if (shown >= QUIET) {
    statusEl.textContent = "Busy, and still shorter than a 20-minute wait.";
  } else {
    statusEl.textContent = "Short line. Going now is the fast option.";
  }

  const switched = movedTotal(state.moves);
  movedEl.textContent = String(switched);

  let advice;
  let dest = null;
  if (!suggestLater) {
    advice =
      shown >= 20 && !laterPoint
        ? "The wait stays long until Ridge Hall closes at 2:00 PM."
        : `The wait is ${shown} min. Going now is the better choice.`;
  } else {
    dest = laterPoint.m;
    const delay = laterPoint.m - offset;
    advice = `Come at ${formatTime(dest)} instead. The wait falls to ${Math.round(laterPoint.wait)} min, about ${saved} min less in line. Lunch starts ${delay} min later.`;
  }

  adviceEl.textContent = advice;
  const count = pairCount(state.moves, offset, dest);
  pairCountEl.textContent = String(count);
  const people = count === 1 ? "student" : "students";
  pairLabel.textContent =
    dest == null
      ? "No later switch is useful right now"
      : `${people} coming at ${formatTime(dest)} instead of ${formatTime(offset)}`;
  moveUp.disabled = dest == null || count >= Math.max(0, Math.floor(current.queue));
  moveDown.disabled = dest == null || count <= 0;
  moveUp.dataset.from = dest == null ? "" : String(offset);
  moveUp.dataset.to = dest == null ? "" : String(dest);
  if (dest == null) {
    moveNote.textContent = "Switching times will not shorten this wait.";
  } else if (switched !== count) {
    moveNote.textContent = `${switched} students already left this peak. This control counts only the ones heading to ${formatTime(dest)}.`;
  } else {
    moveNote.textContent =
      "A tap is anonymous. It records that one student will arrive at the quieter time, and the line in between gets shorter.";
  }

  const delta = state.lineDelta || 0;
  const sign = delta > 0 ? "+" : "";
  counterNote.textContent = `Correction from the card reader: ${sign}${delta}. Swipes in: ${state.joined || 0}. Trays served: ${state.served || 0}.`;
  paintChart(points, offset, dest);
  return dest;
}

async function refresh() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error("state failed");
  state = await response.json();
  shared = true;
  syncEl.textContent = "Shared board on this computer. Anyone with the page sees the same line.";
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) throw new Error("update failed");
  state = await response.json();
  shared = true;
  render();
}

function render() {
  const points = buildSeries(nowOffset, state.lineDelta || 0, state.moves || {});
  describe(points, nowOffset);
}

clock.addEventListener("input", () => {
  nowOffset = Number(clock.value);
  clockNote.textContent = "";
  render();
});

document.querySelector("#use-real").addEventListener("click", () => {
  const date = new Date();
  const minutes = date.getHours() * 60 + date.getMinutes();
  const offset = minutes - 11 * 60;
  if (offset < 0 || offset > 180) {
    clockNote.textContent = "Lunch service is 11:00 AM to 2:00 PM. Showing 12:10 PM, the usual peak.";
    nowOffset = 70;
  } else {
    nowOffset = offset;
    clockNote.textContent = "";
  }
  clock.value = String(nowOffset);
  render();
});

moveUp.addEventListener("click", () => {
  if (moveUp.dataset.from === "" || moveUp.dataset.to === "") return;
  const from = Number(moveUp.dataset.from);
  const to = Number(moveUp.dataset.to);
  post("/api/move", { from, to, delta: 1 }).catch(() => {
    syncEl.textContent = "Could not save that switch.";
  });
});

moveDown.addEventListener("click", () => {
  if (moveUp.dataset.from === "" || moveUp.dataset.to === "") return;
  const from = Number(moveUp.dataset.from);
  const to = Number(moveUp.dataset.to);
  post("/api/move", { from, to, delta: -1 }).catch(() => {
    syncEl.textContent = "Could not save that switch.";
  });
});

document.querySelector("#join").addEventListener("click", () => {
  post("/api/join").catch(() => {
    syncEl.textContent = "Could not record the swipe.";
  });
});

document.querySelector("#served").addEventListener("click", () => {
  post("/api/served").catch(() => {
    syncEl.textContent = "Could not record the tray.";
  });
});

document.querySelector("#reset").addEventListener("click", () => {
  post("/api/reset").catch(() => {
    syncEl.textContent = "Could not reset.";
  });
});

refresh()
  .then(render)
  .catch(() => {
    syncEl.textContent = "The board server is not running. Start it with python3 server.py.";
    render();
  });

setInterval(() => {
  if (!shared) return;
  refresh().then(render).catch(() => {
    shared = false;
    syncEl.textContent = "Lost the shared board.";
  });
}, 2000);
