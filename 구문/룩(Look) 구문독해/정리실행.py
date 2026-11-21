# -*- coding: utf-8 -*-
"""룩(Look) 구문독해 강의 파일 정리 스크립트
- 이 파일이 있는 폴더(index.html 이 있는 폴더)를 기준으로 동작합니다.
- 강의 HTML + 음성 폴더 + 대본을  partNN/lecture/ 로 옮기고 배포 가능한(영문/숫자) 이름으로 바꿉니다.
- 먼저 '계획'만 보여 주고, Enter 를 눌러야 실제로 이동합니다. (이동 기록: 정리기록.txt)
"""
import os, re, sys, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
ROMAN = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10}

# index.html 에서 유닛번호 -> part 폴더 대응표 읽기
idx = open(os.path.join(BASE,'index.html'),encoding='utf-8').read()
unit2part = {int(u):p for p,u in re.findall(r'\./(part\d\d)/unit(\d\d)-a\.html', idx)}
if not unit2part:
    sys.exit('index.html 에서 유닛 목록을 찾지 못했습니다.')

plan = []   # (html_src, audio_src, script_src, dest_dir, new_base, old_audio_name)
problems = []
for name in sorted(os.listdir(BASE)):
    if not name.endswith('_AI강의.html'):
        continue
    stem = name[:-len('_AI강의.html')]
    side = 'b' if stem.endswith('_2') else 'a'
    core = stem[:-2] if side == 'b' else stem
    m = re.match(r'^(\d{2})\. ', core)
    c = re.match(r'^Chapter ([IVX]+) Read & Practice$', core)
    if m:
        u = int(m.group(1))
        if u not in unit2part:
            problems.append(f'index.html 에 없는 유닛: {name}'); continue
        part = unit2part[u]; new_base = f'unit{u:02d}-{side}'
    elif c:
        n = ROMAN.get(c.group(1))
        part = f'part{n:02d}' if n else None
        if not part or not os.path.isdir(os.path.join(BASE,part)):
            problems.append(f'대응하는 part 폴더 없음: {name}'); continue
        new_base = f'practice-{side}'
    else:
        problems.append(f'이름 규칙을 알 수 없음: {name}'); continue
    html = open(os.path.join(BASE,name),encoding='utf-8').read()
    am = re.search(r'"audioDir":"([^"]*)"', html)
    old_audio = am.group(1) if am else None
    audio_src = os.path.join(BASE, old_audio) if old_audio else None
    if not audio_src or not os.path.isdir(audio_src):
        problems.append(f'음성 폴더를 찾지 못함: {name} -> {old_audio}'); audio_src=None
    script = os.path.join(BASE, stem + '_녹음대본.txt')
    plan.append((os.path.join(BASE,name), audio_src, script if os.path.isfile(script) else None,
                 os.path.join(BASE,part,'lecture'), new_base, old_audio))

dests = [(p[3],p[4]) for p in plan]
if len(dests) != len(set(dests)):
    sys.exit('목적지 이름이 겹칩니다. 중단합니다.')

print('=== 이동 계획 ===')
for h,a,s,d,nb,oa in plan:
    print(f'{os.path.basename(h)}\n   -> {os.path.relpath(d,BASE)}/{nb}.html  (+ {nb}_audio/)')
for p in problems: print('[확인필요]', p)
print(f'\n총 {len(plan)}개 강의. 파일을 실제로 옮기려면 Enter, 취소하려면 창을 닫으세요.')
input()

log = []
scripts_dir = os.path.join(BASE,'_scripts'); os.makedirs(scripts_dir, exist_ok=True)
for h,a,s,d,nb,oa in plan:
    os.makedirs(d, exist_ok=True)
    html = open(h,encoding='utf-8').read()
    html = html.replace(f'"audioDir":"{oa}"', f'"audioDir":"{nb}_audio"')
    new_html = os.path.join(d, nb+'.html')
    open(new_html,'w',encoding='utf-8',newline='').write(html)
    log.append(f'{os.path.basename(h)} -> {os.path.relpath(new_html,BASE)}')
    os.remove(h)
    if a:
        shutil.move(a, os.path.join(d, nb+'_audio'))
        log.append(f'{oa}/ -> {os.path.relpath(d,BASE)}/{nb}_audio/')
    if s:
        t = os.path.join(scripts_dir, f'{os.path.basename(os.path.dirname(d))}-{nb}.txt')
        shutil.move(s, t); log.append(f'{os.path.basename(s)} -> {os.path.relpath(t,BASE)}')
open(os.path.join(BASE,'정리기록.txt'),'w',encoding='utf-8').write('\n'.join(log))
print('완료! 정리기록.txt 에 이전 이름 → 새 이름이 저장되었습니다.')
input()
