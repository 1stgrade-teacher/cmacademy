# -*- coding: utf-8 -*-
"""
add-chatbot.py
------------------------------------------------------------
모든 강의 HTML 파일의 </body> 바로 위에
    <script src="/chat-widget.js" defer></script>
한 줄을 넣어서, 강의 화면에 'AI 조교에게 질문하기' 버튼이 생기게 합니다.

- index.html(목차 페이지), '게임' 폴더, '아직 준비 중' 페이지는 건너뜁니다.
- 이미 들어간 파일은 다시 넣지 않습니다. 새 강의를 올린 뒤 다시 실행해도 됩니다.
- 챗봇을 모두 빼고 싶으면:  python add-chatbot.py --remove

사용법 (이 파일이 있는 cmacademy 폴더에서):
    python add-chatbot.py
------------------------------------------------------------
"""
import os
import re
import sys

TAG = '<script src="/chat-widget.js" defer></script>'
SKIP_DIRS = {".git", "api", "게임", "node_modules"}
ROOT = os.path.dirname(os.path.abspath(__file__))


def lecture_files():
    for r, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.lower().endswith(".html") and f.lower() != "index.html":
                yield os.path.join(r, f)


def main():
    remove = "--remove" in sys.argv
    done = skipped = nobody = placeholder = 0
    for p in lecture_files():
        with open(p, "r", encoding="utf-8", errors="surrogateescape", newline="") as fh:
            s = fh.read()
        if remove:
            if TAG not in s:
                continue
            s = s.replace("\n" + TAG, "").replace(TAG, "")
        else:
            if "chat-widget.js" in s:
                skipped += 1
                continue
            if "data-placeholder" in s or "아직 준비 중입니다" in s:
                placeholder += 1  # 준비 중(빈 껍데기) 페이지는 건너뜀
                continue
            m = None
            for m in re.finditer(r"</body>", s, re.I):
                pass  # 마지막 </body> 위치 (강의 안의 예시 코드에 있는 것과 헷갈리지 않게)
            if not m:
                nobody += 1
                continue
            s = s[: m.start()] + TAG + "\n" + s[m.start():]
        with open(p, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
            fh.write(s)
        done += 1
    if remove:
        print("챗봇을 뺀 파일: %d개" % done)
    else:
        print("챗봇을 넣은 파일: %d개 / 이미 있던 파일: %d개 / 준비 중 페이지: %d개 / </body>가 없어 건너뛴 파일: %d개" % (done, skipped, placeholder, nobody))


if __name__ == "__main__":
    main()
