# Ridge Hall lunch line

## Mess queue wait times

Students wait more than 20 minutes at peak lunch. Build a way to predict or shorten that wait.

### Focus

Focus on one dining hall. Do not require a new student app login.

Public wait board for one dining hall. It predicts the lunch line and shows the next time the wait drops under 10 minutes. Students do not create an account.

The forecast uses Ridge Hall’s usual weekday rush. The door already swipes meal cards; those swipes correct the line count. Students who can wait tap once, with no name, to arrive at the quieter time. Each tap shortens the line for people still coming.

## Run

```bash
python3 server.py
```

Open http://127.0.0.1:8765

The demo clock starts at 12:10 PM, when the wait is over 20 minutes. Drag it to see the rest of lunch, from 11:00 AM to 2:00 PM.
