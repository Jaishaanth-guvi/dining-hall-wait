# Ridge Hall lunch line

## Problem statement

Mess queue wait times

Students wait more than 20 minutes at peak lunch. Build a way to predict or shorten that wait.

### Focus

Focus on one dining hall. Do not require a new student app login.

## How this repository meets it

| Requirement | Where it is |
| --- | --- |
| Peak lunch wait is over 20 minutes | Open the board. At 12:10 PM the predicted wait is 27 minutes, and the page says students are waiting more than 20 minutes. |
| Predict that wait | `forecast.py` builds the lunch line. The page shows the predicted minutes and the chart from 11:00 AM to 2:00 PM. |
| Shorten that wait | **Shorten the peak** moves 128 students to 12:59 PM, when the wait is 8 minutes. The 12:10 PM prediction then drops to 19 minutes. The tap does not ask for a name. |
| One dining hall | The only hall is Ridge Hall. There is no hall picker. |
| No new student app login | The page has no sign-in. The meal-card counter uses the swipe the hall already takes at the door. |

## Run

```bash
python3 server.py
```

Open http://127.0.0.1:8765

The demo clock starts at 12:10 PM. Drag it to see the rest of lunch, from 11:00 AM to 2:00 PM.

Check the forecast:

```bash
python3 -m unittest tests.test_forecast
```
