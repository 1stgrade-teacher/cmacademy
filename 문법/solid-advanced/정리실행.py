# -*- coding: utf-8 -*-
"""solid-advanced 챕터4~6 강의 정리 스크립트
강의 HTML + 음성 폴더 + 녹음대본을 chapterN/pointNN/ 폴더로 옮기고 배포 가능한(영문/숫자) 이름으로 바꿉니다.
  문법 -> grammar.html / 구문 연습 -> syntax.html / 확인 문제 -> check.html
먼저 '계획'만 보여 주고 Enter 를 눌러야 실제로 이동합니다. (이동 기록: 정리기록.txt)
"""
import os, re, sys, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
KIND = {'문법':'grammar', '구문 연습':'syntax', '확인 문제':'check'}
pat = re.compile(r'^Chapter (\d+) 포인트(\d+) (.+) - (문법|구문 연습|확인 문제)_AI강의\.html$')

plan, problems = [], []
for name in sorted(os.listdir(BASE)):
    if not name.endswith('_AI강의.html'):
        continue
    m = pat.match(name)
    if not m:
        problems.append(f'이름 규칙을 알 수 없음: {name}'); continue
    ch, pt, kind = int(m.group(1)), int(m.group(2)), KIND[m.group(4)]
    stem = name[:-len('_AI강의.html')]
    html = open(os.path.join(BASE,name),encoding='utf-8').read()
    am = re.search(r'"audioDir":"([^"]*)"', html)
    old_audio = am.group(1) if am else None
    audio_src = os.path.join(BASE, old_audio) if old_audio else None
    if not audio_src or not os.path.isdir(audio_src):
        problems.append(f'음성 폴더를 찾지 못함: {name} -> {old_audio}'); audio_src = None
    script = os.path.join(BASE, stem + '_녹음대본.txt')
    plan.append(dict(html=os.path.join(BASE,name), audio=audio_src, script=script if os.path.isfile(script) else None,
                     dest=os.path.join(BASE, f'chapter{ch}', f'point{pt:02d}'), kind=kind,
                     old_audio=old_audio, tag=f'ch{ch}-p{pt:02d}-{kind}'))

keys = [(p['dest'],p['kind']) for p in plan]
if len(keys) != len(set(keys)):
    sys.exit('목적지 이름이 겹칩니다. 중단합니다.')

print('=== 이동 계획 ===')
for p in plan:
    print(f"{os.path.basename(p['html'])}\n   -> {os.path.relpath(p['dest'],BASE)}\\{p['kind']}.html  (+ {p['kind']}_audio/)")
for x in problems: print('[확인필요]', x)
print(f'\n총 {len(plan)}개 강의. 실제로 옮기려면 Enter, 취소하려면 창을 닫으세요.')
input()

log = []
sdir = os.path.join(BASE,'_scripts'); os.makedirs(sdir, exist_ok=True)
for p in plan:
    os.makedirs(p['dest'], exist_ok=True)
    html = open(p['html'],encoding='utf-8').read()
    if p['old_audio']:
        html = html.replace(f'"audioDir":"{p["old_audio"]}"', f'"audioDir":"{p["kind"]}_audio"')
    nh = os.path.join(p['dest'], p['kind']+'.html')
    open(nh,'w',encoding='utf-8',newline='').write(html)
    os.remove(p['html'])
    log.append(f"{os.path.basename(p['html'])} -> {os.path.relpath(nh,BASE)}")
    if p['audio']:
        shutil.move(p['audio'], os.path.join(p['dest'], p['kind']+'_audio'))
        log.append(f"{p['old_audio']}/ -> {os.path.relpath(p['dest'],BASE)}\\{p['kind']}_audio\\")
    if p['script']:
        t = os.path.join(sdir, p['tag']+'.txt')
        shutil.move(p['script'], t); log.append(f"{os.path.basename(p['script'])} -> {os.path.relpath(t,BASE)}")
open(os.path.join(BASE,'정리기록.txt'),'w',encoding='utf-8').write('\n'.join(log))
print('완료! 정리기록.txt 에 이전 이름 -> 새 이름이 저장되었습니다.')
input()
