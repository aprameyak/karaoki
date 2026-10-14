import logging

import httpx

from app.config import get_settings

log = logging.getLogger("karaoki.mailer")

RESEND_URL = "https://api.resend.com/emails"


def enabled() -> bool:
    settings = get_settings()
    return bool(settings.resend_api_key and settings.email_from)


def send(to: str, subject: str, text: str) -> bool:
    settings = get_settings()
    if not enabled():
        return False
    try:
        res = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "text": text},
            timeout=10.0,
        )
    except httpx.HTTPError:
        log.exception("email request failed")
        return False
    if res.status_code not in (200, 201):
        log.warning("email rejected", extra={"fields": {"status": res.status_code}})
        return False
    return True
