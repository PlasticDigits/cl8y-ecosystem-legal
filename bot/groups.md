# Allowed Telegram groups

Configured for **@cl8ytermsbot** via `bot/.env` (`ALLOWED_CHAT_USERNAMES`, `ALLOWED_CHAT_IDS`, `CHAT_LABELS`).

| Label | Public link | Config |
|-------|-------------|--------|
| ceramicliberty | https://t.me/ceramicliberty | `ALLOWED_CHAT_USERNAMES` |
| yieldomega | https://t.me/yieldomega | `ALLOWED_CHAT_USERNAMES` |
| cl8y strategy group | https://t.me/+5Fo7XSQc2ChkNzll | `-1002917877606` |
| CZodiacofficial | https://t.me/CZodiacofficial | `ALLOWED_CHAT_USERNAMES` |
| dogegod_token | https://t.me/dogegod_token | `ALLOWED_CHAT_USERNAMES` |
| GreenMinerr | https://t.me/GreenMinerr | `ALLOWED_CHAT_USERNAMES` |
| wojakprison | https://t.me/wojakprison | `ALLOWED_CHAT_USERNAMES` |

## Private invite group

1. Add **@cl8ytermsbot** as an **admin** (ban users).
2. The bot posts the chat id when it joins (then leaves). Or send `/chatid@cl8ytermsbot` (privacy mode requires the `@bot` suffix in groups).
3. Copy the numeric id into `ALLOWED_CHAT_IDS` in `bot/.env` (comma-separated if multiple).
4. Optional: add `CHAT_LABELS=-1001234567890:My Private Group` for the DM sign button label.
5. Restart the bot.

## Production `bot/.env` snippet

```env
ALLOWED_CHAT_USERNAMES=ceramicliberty,yieldomega,CZodiacofficial,dogegod_token,GreenMinerr,wojakprison
ALLOWED_CHAT_IDS=
CHAT_LABELS=ceramicliberty:ceramicliberty,yieldomega:yieldomega,CZodiacofficial:CZodiacofficial,dogegod_token:dogegod_token,GreenMinerr:GreenMinerr,wojakprison:wojakprison
```

After the private group id is known:

```env
ALLOWED_CHAT_IDS=-100xxxxxxxxxx
CHAT_LABELS=..., -100xxxxxxxxxx:private-group
```
