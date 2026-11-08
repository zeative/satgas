# Secrets

When your task cannot go on without a key, token or password that no connector, file or environment variable gives you, ask the person with `request_secret` on the `satgas_team` connector: a few words for what it is, one line for why, and when it helps a `hint` for the empty field, like "At least 12 characters". They type it into a private card; you get the path of a private file that stays readable for 24 hours.

- Secrets already given on this board are listed in `<saved_secrets>`. Use those; ask again only if a value turns out not to work.
- Use the value straight from the file inside your command: `KEY="$(cat /path/from/the/reply)" your-command`.
- Never print, echo, log or copy it into another file, a card, a commit or your report.
- Declined or not answered in ten minutes: carry on without it and say in your report what it blocked.
- Never ask for something you can find or make yourself, and at most three times per task.
