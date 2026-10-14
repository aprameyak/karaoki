import httpx
import respx

from app.storage import SupabaseStorage

BASE = "http://supabase.test"


def storage():
    return SupabaseStorage(BASE, "service-key")


def test_signed_url_adds_the_storage_prefix():
    with respx.mock() as router:
        route = router.post(f"{BASE}/storage/v1/object/sign/originals/u/s/original.mp3").mock(
            return_value=httpx.Response(
                200, json={"signedURL": "/object/sign/originals/u/s/original.mp3?token=abc"}
            )
        )
        url = storage().signed_url("originals", "u/s/original.mp3", 3600)
    assert url == f"{BASE}/storage/v1/object/sign/originals/u/s/original.mp3?token=abc"
    assert route.calls[0].request.headers["authorization"] == "Bearer service-key"
    assert b"3600" in route.calls[0].request.content


def test_signed_url_keeps_a_complete_prefix():
    with respx.mock() as router:
        router.post(f"{BASE}/storage/v1/object/sign/stems/a.mp3").mock(
            return_value=httpx.Response(
                200, json={"signedURL": "/storage/v1/object/sign/stems/a.mp3?token=t"}
            )
        )
        assert (
            storage().signed_url("stems", "a.mp3", 60)
            == f"{BASE}/storage/v1/object/sign/stems/a.mp3?token=t"
        )


def test_object_size_uses_head_and_content_length():
    with respx.mock() as router:
        router.head(f"{BASE}/storage/v1/object/originals/a.mp3").mock(
            return_value=httpx.Response(200, headers={"content-length": "1234"})
        )
        assert storage().object_size("originals", "a.mp3") == 1234


def test_missing_object_has_no_size():
    with respx.mock() as router:
        router.head(f"{BASE}/storage/v1/object/originals/a.mp3").mock(
            return_value=httpx.Response(400)
        )
        assert storage().object_size("originals", "a.mp3") is None
    with respx.mock() as router:
        router.head(f"{BASE}/storage/v1/object/originals/a.mp3").mock(
            return_value=httpx.Response(404)
        )
        assert storage().object_size("originals", "a.mp3") is None


def test_download_streams_to_disk(tmp_path):
    with respx.mock() as router:
        router.get(f"{BASE}/storage/v1/object/originals/a.mp3").mock(
            return_value=httpx.Response(200, content=b"x" * 3_000_000)
        )
        dest = tmp_path / "a.mp3"
        storage().download("originals", "a.mp3", dest)
    assert dest.stat().st_size == 3_000_000


def test_upload_sets_content_type_and_upsert(tmp_path):
    src = tmp_path / "v.mp3"
    src.write_bytes(b"abc")
    with respx.mock() as router:
        route = router.post(f"{BASE}/storage/v1/object/stems/u/s/v.mp3").mock(
            return_value=httpx.Response(200, json={"Key": "stems/u/s/v.mp3"})
        )
        size = storage().upload("stems", "u/s/v.mp3", src, "audio/mpeg")
    sent = route.calls[0].request
    assert size == 3
    assert sent.headers["content-type"] == "audio/mpeg"
    assert sent.headers["x-upsert"] == "true"
    assert sent.content == b"abc"


def test_remove_batches_paths():
    paths = [f"u/{i}.mp3" for i in range(250)]
    with respx.mock() as router:
        route = router.delete(f"{BASE}/storage/v1/object/stems").mock(
            return_value=httpx.Response(200, json=[])
        )
        storage().remove("stems", paths)
    assert route.call_count == 3


def test_remove_with_nothing_makes_no_request():
    with respx.mock(assert_all_called=False) as router:
        route = router.delete(f"{BASE}/storage/v1/object/stems").mock(
            return_value=httpx.Response(200)
        )
        storage().remove("stems", [])
    assert route.call_count == 0


def test_list_prefix_walks_folders():
    def answer(request):
        prefix = __import__("json").loads(request.content)["prefix"]
        data = {
            "user": [{"name": "song1", "id": None}, {"name": "song2", "id": None}],
            "user/song1": [{"name": "original.mp3", "id": "1"}],
            "user/song2": [{"name": "a.mp3", "id": "2"}, {"name": "b.mp3", "id": "3"}],
        }[prefix]
        return httpx.Response(200, json=data)

    with respx.mock() as router:
        router.post(f"{BASE}/storage/v1/object/list/originals").mock(side_effect=answer)
        found = storage().list_prefix("originals", "user")
    assert sorted(found) == ["user/song1/original.mp3", "user/song2/a.mp3", "user/song2/b.mp3"]
