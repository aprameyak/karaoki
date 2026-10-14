import re

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field, field_validator
from redis import Redis

from app import db, rate_limit
from app.deps import get_redis

router = APIRouter(prefix="/v1")

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class CopyrightReport(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    reporter_name: str = Field(alias="reporterName", min_length=1, max_length=200)
    reporter_email: str = Field(alias="reporterEmail", max_length=254)
    work_description: str = Field(alias="workDescription", min_length=10, max_length=2000)
    location_description: str = Field(alias="locationDescription", min_length=10, max_length=2000)
    statement_accepted: bool = Field(alias="statementAccepted")

    @field_validator("reporter_email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if not EMAIL.match(value):
            raise ValueError("Enter a valid email address")
        return value.lower()

    @field_validator("statement_accepted")
    @classmethod
    def must_accept(cls, value: bool) -> bool:
        if not value:
            raise ValueError("The statement must be accepted")
        return value


@router.post("/copyright-reports", status_code=201)
def create_report(
    report: CopyrightReport,
    x_client_ip: str | None = Header(default=None),
    redis: Redis = Depends(get_redis),
):
    source = (x_client_ip or "unknown")[:64]
    rate_limit.hit(redis, f"copyright:{source}", 5, window=3600)
    rate_limit.hit(redis, "copyright:all", 200, window=3600)
    report_id = db.insert_copyright_report(
        report.reporter_name,
        report.reporter_email,
        report.work_description,
        report.location_description,
    )
    db.record_audit(None, "copyright.report", "copyright_report", report_id)
    return {"received": True}
