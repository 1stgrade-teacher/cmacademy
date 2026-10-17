#!/usr/bin/env python3
"""
rename-lectures.py
------------------------------------------------------------
AI 스튜디오에서 내려받은 강의 파일 이름이 제각각이어도, 폴더의 index.html 이
기대하는 이름(point01.html ...)으로 자동 변경해 주는 스크립트.

동작 방식
  1) 폴더의 index.html 에서 ./pointNN.html 링크와 제목(예: "대동사")을 읽는다.
  2) 폴더 안의 나머지 .html 파일의 <title> / 첫 제목을 index 제목과 비교해
     어느 포인트인지 판별한다. (파일 이름은 보지 않는다. --by-name 을 주면
     파일 이름 속 숫자도 힌트로 쓴다.)
  3) pointNN.html 로 이름을 바꾸고, 강의가 부르는 오디오 폴더(xxx_audio)도
     pointNN_audio 로 바꾸고 html 안의 경로도 같이 고친다.

사용법 (저장소 최상위에서)
  python rename-lectures.py 문법/solid-advanced            # 미리보기만
  python rename-lectures.py 문법/solid-advanced --apply    # 실제 변경
  python rename-lectures.py 문법/solid-advanced --apply --map "내파일.html=7"
     (자동 판별이 안 된 파일을 직접 지정: 여러 번 사용 가능)
------------------------------------------------------------
"""
import argparse
import difflib
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def norm(s):
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"—\s*AI\s*강의|AI\s*강의", "", s)
    return re.sub(r"[^0-9a-z가-힣]", "", s.lower())


def read(p):
    return p.read_text(encoding="utf-8-sig", errors="replace")


def lecture_title(html):
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    if m and m.group(1).strip():
        return m.group(1).strip()
    m = re.search(r'class="gl-head"[^>]*>(.*?)</', html, re.S)
    return m.group(1).strip() if m else ""


def parse_index(folder):
    html = read(folder / "index.html")
    rows = {}
    for m in re.finditer(
        r'href="\./(point(\d+))\.html"[^>]*>.*?<span class="txt">(.*?)</span>', html, re.S
    ):
        rows[int(m.group(2))] = (m.group(1), m.group(3).strip(), len(m.group(2)))
    return rows


def score(title_n, row_n):
    if not title_n or not row_n:
        return 0.0
    if row_n in title_n:
        return 1.0 + len(row_n) / 100  # 긴 제목이 포함될수록 우선
    return difflib.SequenceMatcher(None, title_n, row_n).ratio()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--map", action="append", default=[], help='"파일.html=번호"')
    ap.add_argument("--by-name", action="store_true", help="파일 이름 속 숫자도 힌트로 사용")
    a = ap.parse_args()

    folder = Path(a.folder)
    rows = parse_index(folder)
    if not rows:
        sys.exit("index.html 에서 pointNN.html 링크를 찾지 못했습니다.")
    width = {len(str(n)) if w == 0 else w for n, (_, _, w) in rows.items()}
    manual = {}
    for item in a.map:
        k, v = item.rsplit("=", 1)
        manual[k.strip()] = int(v)

    taken = {n for n, (stem, _, _) in rows.items() if (folder / f"{stem}.html").exists()}
    cands = [
        p for p in sorted(folder.glob("*.html"))
        if p.name != "index.html" and not re.fullmatch(r"point\d+\.html", p.name)
    ]
    if not cands:
        print("이름을 바꿀 파일이 없습니다. (이미 pointNN.html 이거나 비어 있음)")
        return

    plan, problems = [], []
    for p in cands:
        html = read(p)
        if p.name in manual:
            n = manual[p.name]
            how = "수동 지정"
        else:
            tn = norm(lecture_title(html))
            scored = sorted(((score(tn, norm(t)), n) for n, (_, t, _) in rows.items()), reverse=True)
            best, second = scored[0], scored[1] if len(scored) > 1 else (0, 0)
            n, how = None, ""
            if best[0] >= 0.75 and best[0] - second[0] >= 0.05:
                n, how = best[1], f"제목 일치 {best[0]:.2f}"
            elif a.by_name:
                nums = re.findall(r"\d+", p.stem)
                if nums and int(nums[-1]) in rows:
                    n, how = int(nums[-1]), "파일명 숫자"
            if n is None:
                problems.append(
                    f"  {p.name}  제목='{lecture_title(html)[:40]}'  후보={[(f'{s:.2f}', k) for s, k in scored[:2]]}"
                )
                continue
        plan.append((p, n, how, html))

    seen = {}
    for p, n, how, _ in plan:
        seen.setdefault(n, []).append(p.name)
    for n, names in seen.items():
        if len(names) > 1 or n in taken:
            problems.append(f"  P{n} 중복: {names}" + (" (이미 point 파일 존재)" if n in taken else ""))
    dup = {n for n, names in seen.items() if len(names) > 1 or n in taken}

    for p, n, how, html in plan:
        if n in dup or n not in rows:
            continue
        stem = rows[n][0]
        new = folder / f"{stem}.html"
        audio_dirs = set(re.findall(r"\./([^/\"']+_audio)/", html)) | set(
            re.findall(r'"audioDir":"([^"]+)"', html)
        )
        print(f"{p.name}  ->  {new.name}   [P{n} {rows[n][1]} · {how}]")
        for ad in audio_dirs:
            print(f"    오디오 폴더 {ad}  ->  {stem}_audio")
        if not a.apply:
            continue
        for ad in audio_dirs:
            src, dst = folder / ad, folder / f"{stem}_audio"
            if src.is_dir() and not dst.exists() and src != dst:
                src.rename(dst)
            html = html.replace(f"./{ad}/", f"./{stem}_audio/")
        html = re.sub(r'"audioDir":"[^"]*"', f'"audioDir":"{stem}_audio"', html)
        p.write_text(html, encoding="utf-8")
        p.rename(new)

    if problems:
        print("\n자동 판별 실패 / 충돌 (--map \"파일.html=번호\" 로 직접 지정):")
        print("\n".join(problems))
    if not a.apply:
        print("\n미리보기입니다. 실제로 바꾸려면 --apply 를 붙이세요.")


if __name__ == "__main__":
    main()
