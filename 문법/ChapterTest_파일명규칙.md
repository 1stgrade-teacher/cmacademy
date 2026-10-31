# Chapter Test 파일명 규칙 (천일문 그래머 시리즈)

Chapter Test는 보통 15~25문제라서, 강의 1개당 8문제 안팎으로 2~3파트로 나눠 제작합니다.

## 파일명

챕터 폴더 안에 `testN` 형식으로 둡니다. N은 1부터 시작하는 파트 번호입니다. 문제 수가 아니라 파트 순서입니다.

| 파트 | 강의 | 대본 | 오디오 폴더 |
|---|---|---|---|
| 1 | `test1.html` | `test1-script.txt` | `test1_audio/` |
| 2 | `test2.html` | `test2-script.txt` | `test2_audio/` |
| 3 | `test3.html` | `test3-script.txt` | `test3_audio/` |

- 위치: `chapterNN/` 안 (예: `chunilmun-grammar-lv3/chapter04/test1.html`)
- 파트가 1개뿐이어도 `test1.html` 그대로 씁니다. 문제를 나눈 뒤에도 기존 이름이 바뀌지 않습니다.
- 공백, 한글, 대문자는 쓰지 않습니다. 오디오 파일은 기존 강의처럼 `1.mp3`, `2.mp3` ... 입니다.
- 기준 사례: `chunilmun-grammar-lv2/chapter03/test1.html`, `test2.html`

## index.html 행 형식

파트마다 한 줄씩 넣습니다. 문제 번호 범위는 제작할 때 실제 번호로 적습니다.

```html
<a class="unit-row" href="./chapter04/test1.html"><span class="tag">Chapter Test</span><span class="txt">부정사 Chapter Test 1~8번</span><span class="pill">준비중</span></a>
<a class="unit-row" href="./chapter04/test2.html"><span class="tag">Chapter Test</span><span class="txt">부정사 Chapter Test 9~16번</span><span class="pill">준비중</span></a>
<a class="unit-row" href="./chapter04/test3.html"><span class="tag">Chapter Test</span><span class="txt">부정사 Chapter Test 17~23번</span><span class="pill">준비중</span></a>
```

- 지금은 모든 챕터에 `test1.html` 한 줄만 들어 있습니다. 문제를 나눌 때 위 형식으로 줄을 늘리고, 첫 줄의 문구에 번호 범위를 붙입니다.
- 파일을 올리면 `auto-status.js`가 "준비중"을 "GO"로 바꿔 줍니다.
