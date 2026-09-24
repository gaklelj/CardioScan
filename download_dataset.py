from pathlib import Path
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://physionet.org/files/challenge-2021/1.0.3/training/"
OUTPUT = Path("data/raw")
ALLOWED_EXTENSIONS = {".hea", ".mat"}

session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 CardioScan dataset downloader"
session.mount(
    "https://",
    HTTPAdapter(
        max_retries=Retry(
            total=5,
            connect=5,
            read=5,
            status=5,
            backoff_factor=2,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET"}),
            respect_retry_after_header=True,
        )
    ),
)

visited = set()


def download_file(url: str, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)

    # Пропускаем уже загруженные непустые файлы
    if destination.exists() and destination.stat().st_size > 0:
        return

    temporary = destination.with_suffix(destination.suffix + ".part")

    with session.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()

        with temporary.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)

    temporary.replace(destination)


def scan_directory(url: str):
    if url in visited:
        return []

    visited.add(url)

    response = session.get(url, timeout=60)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    files = []

    for link in soup.find_all("a", href=True):
        href = link["href"]

        if href in {"../", "./"} or href.startswith("?"):
            continue

        target_url = urljoin(url, href)

        if not target_url.startswith(BASE_URL):
            continue

        relative = target_url.removeprefix(BASE_URL)

        if not relative:
            continue

        if target_url.endswith("/"):
            files.extend(scan_directory(target_url))
            continue

        destination = OUTPUT / relative
        if destination.suffix.lower() in ALLOWED_EXTENSIONS:
            files.append((target_url, destination))

    return files


def print_progress(current: int, total: int):
    width = 40
    filled = int(width * current / total) if total else width
    if current >= total:
        bar = "=" * width
    else:
        bar = "=" * filled + ">" + " " * (width - filled - 1)
    sys.stdout.write(f"\rЗагрузка: [{bar}] {current}/{total}")
    sys.stdout.flush()


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    files = scan_directory(BASE_URL)
    total = len(files)

    if total == 0:
        raise RuntimeError(
            "PhysioNet не вернул ни одного файла. "
            "Проверьте интернет, VPN, антивирус или доступ к physionet.org."
        )

    for current, (url, destination) in enumerate(files, start=1):
        download_file(url, destination)
        print_progress(current, total)

    print(f"\nГотово. Обработано файлов: {total}")
    print(f"Папка: {OUTPUT.resolve()}")