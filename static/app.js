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
const shortenBtn = document.querySelector("#shorten");
const shortenNote = document.querySelector("#shorten-note");
const syncEl = document.querySelector("#sync");
const moveUp = document.querySelector("#move-up");
const moveDown = document.querySelector("#move-down");

let board = null;
let shared = false;
let nowOffset = 70;
let requestId = 0;

function formatTime(offset) {
  const total = 11 * 60 + offset;
  const h24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  let hour = h24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
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
    later == null ? "" : `<circle cx="${x(later)}" cy="${y(points[later].wait)}" r="5" fill="#1c6b43" />`;

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

function render(view) {
  board = view;
  const plan = view.shorten;
  const shown = view.predictedMinutes;
  const level = shown >= 20 ? "long" : shown >= 10 ? "mid" : "ok";
  waitWrap.className = `wait ${level}`;
  waitEl.textContent = String(shown);
  lineEl.textContent = String(view.inLine);
  movedEl.textContent = String(view.studentsWhoSwitched);
  whenEl.textContent = `Predicted wait at ${view.timeLabel}`;
  clockReadout.textContent = view.timeLabel;
  statusEl.textContent = view.status;
  adviceEl.textContent = plan.advice;

  const dest = plan.show ? plan.to : null;
  const count = plan.switchingNow || 0;
  pairCountEl.textContent = String(count);
  const people = count === 1 ? "student" : "students";
  pairLabel.textContent = plan.show
    ? `${people} coming at ${plan.timeLabel} instead of ${view.timeLabel}`
    : "No later switch is useful right now";
  moveUp.disabled = !plan.show || count >= view.inLine;
  moveDown.disabled = !plan.show || count <= 0;
  moveUp.dataset.from = plan.show ? String(plan.from) : "";
  moveUp.dataset.to = plan.show ? String(plan.to) : "";

  const canShorten = plan.show && plan.studentsToBringUnder20 > 0;
  shortenBtn.disabled = !canShorten;
  if (canShorten) {
    shortenBtn.textContent = "Shorten the peak";
    shortenNote.textContent = `Moves ${plan.studentsToBringUnder20} students to ${plan.timeLabel}. No login. The predicted wait drops below 20 minutes.`;
  } else if (!plan.show && shown >= 20) {
    shortenBtn.textContent = "No shorter time";
    shortenNote.textContent = "No later time brings this wait under 20 minutes.";
  } else {
    shortenBtn.textContent = "Peak is already shorter";
    shortenNote.textContent = "The predicted wait is already under 20 minutes.";
  }

  if (!plan.show) {
    moveNote.textContent = "Switching times will not shorten this wait.";
  } else if (view.studentsWhoSwitched !== count) {
    moveNote.textContent = `${view.studentsWhoSwitched} students already left this peak. This control counts only the ones heading to ${plan.timeLabel}.`;
  } else {
    moveNote.textContent = "A tap is anonymous. It records that one student will arrive at the quieter time.";
  }

  const sign = view.lineDelta > 0 ? "+" : "";
  counterNote.textContent = `Correction from the card reader: ${sign}${view.lineDelta}. Swipes in: ${view.joined}. Trays served: ${view.served}.`;
  paintChart(view.points, view.at, dest);
}

async function loadBoard() {
  const at = nowOffset;
  const id = ++requestId;
  const response = await fetch(`/api/board?at=${at}`, { cache: "no-store" });
  if (!response.ok) throw new Error("board failed");
  const view = await response.json();
  if (id !== requestId || at !== nowOffset) return;
  shared = true;
  syncEl.textContent = "Shared board for Ridge Hall. No student login.";
  render(view);
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) throw new Error("update failed");
  await loadBoard();
}

clock.addEventListener("input", () => {
  nowOffset = Number(clock.value);
  clockNote.textContent = "";
  loadBoard().catch(() => {
    syncEl.textContent = "Could not refresh the prediction.";
  });
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
  loadBoard().catch(() => {
    syncEl.textContent = "Could not refresh the prediction.";
  });
});

shortenBtn.addEventListener("click", () => {
  if (!board || !board.shorten.show) return;
  post("/api/shorten", { from: board.shorten.from, to: board.shorten.to }).catch(() => {
    syncEl.textContent = "Could not shorten the peak.";
  });
});

moveUp.addEventListener("click", () => {
  if (moveUp.dataset.from === "" || moveUp.dataset.to === "") return;
  post("/api/move", { from: Number(moveUp.dataset.from), to: Number(moveUp.dataset.to), delta: 1 }).catch(() => {
    syncEl.textContent = "Could not save that switch.";
  });
});

moveDown.addEventListener("click", () => {
  if (moveUp.dataset.from === "" || moveUp.dataset.to === "") return;
  post("/api/move", { from: Number(moveUp.dataset.from), to: Number(moveUp.dataset.to), delta: -1 }).catch(() => {
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

loadBoard().catch(() => {
  syncEl.textContent = "The board server is not running. Start it with python3 server.py.";
});

setInterval(() => {
  if (!shared) return;
  loadBoard().catch(() => {
    shared = false;
    syncEl.textContent = "Lost the shared board.";
  });
}, 2000);
