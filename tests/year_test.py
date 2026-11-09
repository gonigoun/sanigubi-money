# 연도 바뀜 검사: ?now=2027-01 로 2027년 1월인 척하고 확인 (시험 모드)
import re, sys, json
from playwright.sync_api import sync_playwright
BASE='http://localhost:8765/'; OUT=sys.argv[1] if len(sys.argv)>1 else '/tmp'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.route(re.compile(r'fonts\.'),lambda r:r.abort())
    pg.goto(BASE+'?mock#admin'); pg.evaluate('localStorage.clear()'); pg.reload()
    pg.click('#login'); pg.click('#seed'); pg.wait_for_selector('.mlist li >> text=10월', timeout=20000)
    # 11·12월(완료) 추가
    pg.evaluate("""()=>{const k='sanigubi-mock-v1';const s=JSON.parse(localStorage.getItem(k));
      s.months['2026-11']={year:2026,month:11,mountain:'소요산',date:'2026.11.18',start:5516245,items:[{type:'in',name:'산행회비',amount:2000000},{type:'out',name:'차량비',amount:900000}],status:'done'};
      s.months['2026-12']={year:2026,month:12,mountain:'소백산',date:'2026.12.16',start:6616245,items:[{type:'in',name:'산행회비',amount:2000000},{type:'out',name:'차량비',amount:1000000}],status:'done'};
      localStorage.setItem(k,JSON.stringify(s));}""")
    def show(url,name):
        pg.goto(BASE+url); pg.wait_for_selector('.chip'); pg.wait_for_timeout(200)
        chips=[c.inner_text() for c in pg.locator('.chip').all()]
        print(f'[{name}] 제목:', pg.inner_text('#pageTitle'), '| 잔액칸:', pg.inner_text('.balance .lbl') if pg.locator('.balance').count() else '-')
        print('   칩:', chips[:4], '...', chips[-2:], '| 선택:', pg.locator('.chip[aria-pressed=true]').inner_text() if pg.locator('.chip[aria-pressed=true]').count() else '-')
        pg.screenshot(path=f'{OUT}/{name}.png')
        return chips
    c=show('?mock&now=2027-01','y1-2027-jan')
    assert c[0]=='1월 정산 중' and c[-1]=='2026년 재정 모아보기' and len(c)==2
    pg.locator('.chip.yearchip').click(); pg.wait_for_timeout(300)
    print('[2026 보기] 제목:', pg.inner_text('#pageTitle'), '| 선택:', pg.locator('.chip[aria-pressed=true]').inner_text(), '| 첫칩:', pg.locator('.chip').first.inner_text(), '| 칩수:', pg.locator('.chip').count())
    pg.screenshot(path=f'{OUT}/y2-2026-view.png')
    assert pg.inner_text('#pageTitle')=='2026년 재정 공개' and pg.locator('.chip').first.inner_text()=='← 2027년'
    pg.locator('.chip').first.click(); pg.wait_for_timeout(300); print('[돌아가기] 제목:', pg.inner_text('#pageTitle'))
    show('?mock&now=2026-11','y3-2026-nov')
    print('오류:', errs); b.close()
