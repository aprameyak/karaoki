from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import httpx

from app.config import get_settings


class Storage(Protocol):
    def signed_url(self, bucket: str, path: str, ttl: int, download: str | None = None) -> str: ...

    def object_size(self, bucket: str, path: str) -> int | None: ...

    def download(self, bucket: str, path: str, dest: Path) -> None: ...

    def upload(self, bucket: str, path: str, src: Path, content_type: str) -> int: ...

    def remove(self, bucket: str, paths: list[str]) -> None: ...

    def list_prefix(self, bucket: str, prefix: str) -> list[str]: ...


class SupabaseStorage:
    def __init__(self, base_url: str, service_key: str, client: httpx.Client | None = None):
        self.base = f"{base_url.rstrip('/')}/storage/v1"
        self.root = base_url.rstrip("/")
        self.headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self.client = client or httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0))

    def signed_url(self, bucket: str, path: str, ttl: int, download: str | None = None) -> str:
        res = self.client.post(
            f"{self.base}/object/sign/{bucket}/{path}",
            headers=self.headers,
            json={"expiresIn": ttl},
        )
        res.raise_for_status()
        signed = res.json()["signedURL"]
        if not signed.startswith("http"):
            if not signed.startswith("/storage/v1"):
                signed = f"/storage/v1{signed}"
            signed = f"{self.root}{signed}"
        if download:
            signed = f"{signed}&download={quote(download)}"
        return signed

    def object_size(self, bucket: str, path: str) -> int | None:
        res = self.client.head(f"{self.base}/object/{bucket}/{path}", headers=self.headers)
        if res.status_code in (400, 404):
            return None
        res.raise_for_status()
        length = res.headers.get("content-length")
        return int(length) if length is not None else None

    def download(self, bucket: str, path: str, dest: Path) -> None:
        with self.client.stream(
            "GET", f"{self.base}/object/{bucket}/{path}", headers=self.headers
        ) as res:
            res.raise_for_status()
            with open(dest, "wb") as out:
                for chunk in res.iter_bytes(1024 * 1024):
                    out.write(chunk)

    def upload(self, bucket: str, path: str, src: Path, content_type: str) -> int:
        size = src.stat().st_size
        with open(src, "rb") as fh:
            res = self.client.post(
                f"{self.base}/object/{bucket}/{path}",
                headers={**self.headers, "Content-Type": content_type, "x-upsert": "true"},
                content=fh,
                timeout=httpx.Timeout(600.0, connect=10.0),
            )
        res.raise_for_status()
        return size

    def remove(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        for start in range(0, len(paths), 100):
            res = self.client.request(
                "DELETE",
                f"{self.base}/object/{bucket}",
                headers=self.headers,
                json={"prefixes": paths[start : start + 100]},
            )
            res.raise_for_status()

    def list_prefix(self, bucket: str, prefix: str) -> list[str]:
        found: list[str] = []
        stack = [prefix.rstrip("/")]
        while stack:
            current = stack.pop()
            offset = 0
            while True:
                res = self.client.post(
                    f"{self.base}/object/list/{bucket}",
                    headers=self.headers,
                    json={"prefix": current, "limit": 100, "offset": offset},
                )
                res.raise_for_status()
                items = res.json()
                for item in items:
                    full = f"{current}/{item['name']}"
                    if item.get("id") is None:
                        stack.append(full)
                    else:
                        found.append(full)
                if len(items) < 100:
                    break
                offset += 100
        return found


def build_storage() -> SupabaseStorage:
    settings = get_settings()
    return SupabaseStorage(settings.supabase_url, settings.supabase_service_role_key)
