# marblered 파일명 규칙

각 유닛 폴더(`chapterNN/unitNN/`)는 모두 같은 구조를 쓴다.

| 파일/폴더 | 역할 |
|---|---|
| `index.html` | 관문 페이지 (Preview, 강의로 가는 링크 목록). 강의 본체를 여기에 덮어쓰지 않는다 |
| `preview.html` / `preview_audio/` | 미리보기(플립러닝) 강의와 음성 |
| `lesson-01.html` / `lesson-01_audio/` | 통합 강의와 음성 (여러 개면 `lesson-02` ...) |

- 음성 폴더는 `<html 파일명>_audio/`, 파일은 `1.mp3`, `2.mp3` ... 로 둔다. 플레이어가 파일명에서 폴더를 자동으로 찾는다.
- 강의 코드의 `audioDir`도 같은 폴더명으로 맞춘다.
- 새 강의를 추가하면 `index.html`에 `unit-row` 링크를 한 줄 추가한다.
