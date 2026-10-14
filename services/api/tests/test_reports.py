import pytest
from fastapi.testclient import TestClient

from app.main import create_app

VALID = {
    "reporterName": "Rights Holder",
    "reporterEmail": "Owner@Example.com",
    "workDescription": "My song called Example Song",
    "locationDescription": "A karaoke track named Example Song",
    "statementAccepted": True,
}


@pytest.fixture
def client():
    return TestClient(create_app())


def test_report_is_stored(client, sql):
    res = client.post("/v1/copyright-reports", json=VALID, headers={"X-Client-IP": "1.2.3.4"})
    assert res.status_code == 201
    row = sql("select * from public.copyright_reports")[0]
    assert row["reporter_email"] == "owner@example.com"
    assert row["status"] == "open" and row["statement_accepted"] is True
    assert (
        sql("select count(*) as n from public.audit_events where action = 'copyright.report'")[0][
            "n"
        ]
        == 1
    )


@pytest.mark.parametrize(
    "change",
    [
        {"reporterEmail": "not-an-email"},
        {"reporterName": "   "},
        {"workDescription": "short"},
        {"locationDescription": "x" * 2001},
        {"statementAccepted": False},
    ],
)
def test_invalid_reports_are_rejected(client, sql, change):
    res = client.post("/v1/copyright-reports", json={**VALID, **change})
    assert res.status_code == 422
    assert sql("select count(*) as n from public.copyright_reports")[0]["n"] == 0


def test_reports_are_rate_limited_per_address(client, sql):
    codes = [
        client.post(
            "/v1/copyright-reports", json=VALID, headers={"X-Client-IP": "9.9.9.9"}
        ).status_code
        for _ in range(6)
    ]
    assert codes == [201] * 5 + [429]
    other = client.post("/v1/copyright-reports", json=VALID, headers={"X-Client-IP": "8.8.8.8"})
    assert other.status_code == 201


def test_users_cannot_read_reports(make_user, client, as_role):
    import psycopg

    client.post("/v1/copyright-reports", json=VALID)
    user = make_user()
    with as_role("authenticated", user) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select * from public.copyright_reports")
