from app import db, mailer
from app.config import get_settings


def notify_job_finished(job_id: str) -> bool:
    if not mailer.enabled():
        return False
    target = db.notification_target(job_id)
    if not target or not target["email"] or not target["email_notifications"]:
        return False

    link = f"{get_settings().site_url.rstrip('/')}/dashboard/songs/{target['song_id']}"
    name = target["display_name"] or "there"
    if target["status"] == "completed":
        subject = f"Your karaoke track is ready: {target['title']}"
        text = (
            f"Hi {name},\n\n{target['title']} has been processed. "
            f"Open it to sing along:\n{link}\n\nYou can turn these emails off in Settings."
        )
    elif target["status"] == "failed":
        reason = target["error"] or "Something went wrong."
        subject = f"Processing failed: {target['title']}"
        text = (
            f"Hi {name},\n\nWe could not process {target['title']}. {reason}\n"
            f"You can try again here:\n{link}\n\nThis did not use any of your monthly songs."
        )
    else:
        return False
    return mailer.send(target["email"], subject, text)
