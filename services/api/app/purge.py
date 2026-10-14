from app.storage import Storage

BUCKETS = ("originals", "stems", "recordings")


def purge_song_files(storage: Storage, user_id: str, song_id: str) -> None:
    for bucket in BUCKETS:
        paths = storage.list_prefix(bucket, f"{user_id}/{song_id}")
        storage.remove(bucket, paths)
