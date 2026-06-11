# Trae Preflight

This folder is prepared for `wangxt-937-1`.

Use `.env` for stable local ports and compose project identity:

- APP_PORT: 18237
- API_PORT: 19237
- WEB_PORT: 20237
- DB_PORT: 21237
- REDIS_PORT: 22237

Smoke entry:

```bash
bash scripts/smoke.sh
```

The preflight files are environment scaffolding only. The generated business
project can replace or extend them when needed.
