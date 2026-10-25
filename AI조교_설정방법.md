# AI 조교(강의 질문 챗봇) 설정 방법

강의 화면 오른쪽 아래의 **질문하기** 버튼을 누르면, 학생이 지금 보는 슬라이드 내용을 바탕으로 AI(DeepSeek)가 답합니다.

## 파일 구성
| 파일 | 하는 일 |
|---|---|
| `chat-widget.js` | 강의 화면의 질문하기 버튼과 대화창 |
| `api/chat.js` | Vercel 서버에서 DeepSeek에 질문을 전달 (API 키는 여기서만 사용) |
| `add-chatbot.py` | 강의 HTML에 챗봇 한 줄을 넣어 주는 도구 |

## 1. DeepSeek 키 넣기 (처음 한 번)
1. platform.deepseek.com 에서 금액을 충전하고 API 키를 만듭니다. (충전한 금액까지만 쓰이므로 요금이 갑자기 많이 나올 걱정이 없습니다)
2. Vercel → cmacademy 프로젝트 → **Settings → Environment Variables**
3. 아래 값을 넣고 저장합니다. 환경(Environments)은 Production, Preview 모두 체크합니다.

| 이름 | 값 | |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek 키 | 필수 |
| `CHAT_CODE` | 예: `cm2026` | 선택. 넣으면 이 코드를 아는 학생만 질문 가능 |
| `CHAT_DAILY_LIMIT` | 예: `40` | 선택. 기기당 하루 질문 수 (기본 40) |
| `CHAT_OFF` | `1` | 선택. 챗봇을 잠시 끄고 싶을 때 |

4. 값을 바꾼 뒤에는 Vercel → Deployments → 맨 위 배포의 `⋯` → **Redeploy** 를 눌러야 적용됩니다.

## 2. 새 강의를 올릴 때
새 강의 HTML에는 챗봇 줄이 아직 없습니다. GitHub에 올리기 전에 cmacademy 폴더에서 한 번 실행해 주세요.

```
python add-chatbot.py
```

- 이미 들어간 파일은 건너뛰니 여러 번 실행해도 괜찮습니다.
- index.html(목차), 게임, '아직 준비 중' 페이지는 건너뜁니다.
- 모두 빼고 싶으면 `python add-chatbot.py --remove`

## 3. 참고
- API 키는 강의 HTML이나 GitHub에 절대 적지 마세요. Vercel 환경 변수에만 넣습니다.
- 그림으로만 된 슬라이드(교재 사진)는 그림을 함께 보내서 AI가 읽고 답합니다.
- 질문 1개 비용은 대략 1~3원 수준입니다. (DeepSeek 요금표 기준 추정, 그림 슬라이드는 조금 더)
- 사용 금액은 DeepSeek 사이트의 Usage 메뉴에서 확인할 수 있습니다.
