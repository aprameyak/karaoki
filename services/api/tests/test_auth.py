import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.auth import clear_cache, verify_token
from app.errors import ApiError
from app.main import create_app

USER_URL = "http://supabase.test/auth/v1/user"


def test_valid_token_returns_user_and_sends_both_keys():
    with respx.mock() as router:
        route = router.get(USER_URL).mock(
            return_value=httpx.Response(
                200, json={"id": "11111111-1111-1111-1111-111111111111", "email": "a@b.co"}
            )
        )
        user = verify_token("tok")
    assert user == {"id": "11111111-1111-1111-1111-111111111111", "email": "a@b.co"}
    sent = route.calls[0].request.headers
    assert sent["apikey"] == "anon-key" and sent["authorization"] == "Bearer tok"


def test_verified_tokens_are_cached_briefly():
    with respx.mock() as router:
        route = router.get(USER_URL).mock(
            return_value=httpx.Response(200, json={"id": "11111111-1111-1111-1111-111111111111"})
        )
        verify_token("tok")
        verify_token("tok")
        assert route.call_count == 1
        clear_cache()
        verify_token("tok")
        assert route.call_count == 2


def test_rejected_token_is_unauthorized():
    with respx.mock() as router:
        router.get(USER_URL).mock(return_value=httpx.Response(401, json={"msg": "bad"}))
        with pytest.raises(ApiError) as err:
            verify_token("nope")
    assert err.value.status == 401


def test_rejected_tokens_are_not_cached():
    with respx.mock() as router:
        route = router.get(USER_URL).mock(return_value=httpx.Response(401))
        for _ in range(2):
            with pytest.raises(ApiError):
                verify_token("nope")
        assert route.call_count == 2


def test_auth_outage_is_a_503():
    with respx.mock() as router:
        router.get(USER_URL).mock(side_effect=httpx.ConnectError("down"))
        with pytest.raises(ApiError) as err:
            verify_token("tok")
    assert err.value.status == 503


@pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer ", "Basic abc", "token abc"])
def test_malformed_authorization_headers(header):
    client = TestClient(create_app())
    headers = {} if header is None else {"Authorization": header}
    res = client.get("/v1/jobs/00000000-0000-0000-0000-000000000000", headers=headers)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_end_to_end_token_check_through_the_app(make_user):
    user = make_user()
    client = TestClient(create_app())
    with respx.mock() as router:
        router.get(USER_URL).mock(return_value=httpx.Response(200, json={"id": user}))
        res = client.get(
            "/v1/jobs/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": "Bearer good-token"},
        )
    assert res.status_code == 404
