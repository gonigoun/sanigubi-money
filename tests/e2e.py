# 시험 모드(?mock)로 공개 화면·관리 화면을 실제로 눌러 보는 검사
import sys, re
from playwright.sync_api import sync_playwright
BASE='http://localhost:8765/'
OUT=sys.argv[1] if len(sys.argv)>1 else '/tmp'
XLSX=sys.argv[2] if len(sys.argv)>2 else None
def money(s): return int(re.sub(r'[^\d-]','',s))
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.route(re.compile(r'fonts\.(googleapis|gstatic)'),lambda r:r.abort())
    pg.goto(BASE+'?mock#admin'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
    pg.click('#login'); pg.wait_for_selector('#seed'); pg.click('#seed')
    pg.wait_for_selector('.mlist li >> text=10월 내장산', timeout=20000)
    print('목록:', pg.locator('.mlist li').count(), '개')
    pg.screenshot(path=f'{OUT}/1-admin-list.png', full_page=True)
    # 공개 화면
    pg.goto(BASE+'?mock'); pg.wait_for_selector('.thumb', timeout=10000)
    print('현재 잔액:', pg.inner_text('.balance .amt'), '| 사진:', pg.locator('.thumb').count())
    assert money(pg.inner_text('.balance .amt'))==5516245
    pg.screenshot(path=f'{OUT}/2-public.png', full_page=True)
    pg.click('.chip[data-id="2026-03"]'); pg.wait_for_timeout(400)
    print('3월 잔액:', pg.inner_text('.sum .end .v'))
    assert money(pg.inner_text('.sum .end .v'))==7908400
    # 편집: 10월에 사진 2장 추가 + 금액 수정 확인
    pg.goto(BASE+'?mock#admin/2026-10'); pg.wait_for_selector('#pfile', state='attached')
    pg.set_input_files('#pfile',['/home/claude/sm/seed/receipts/2026-10/r1-gimbap.jpg','/home/claude/sm/seed/receipts/2026-10/r3-coupang.jpg'])
    pg.wait_for_selector('#prog >> text=2장 올렸어요', timeout=15000)
    print('편집 화면 사진:', pg.locator('.pitem').count())
    pg.locator('.pitem input').last.fill('시험 사진'); pg.locator('.pitem input').last.dispatch_event('change'); pg.wait_for_timeout(300)
    pg.locator('.pitem [data-del]').last.click(); pg.wait_for_timeout(400)
    print('삭제 후 사진:', pg.locator('.pitem').count())
    pg.locator('.irow input.amt').first.fill('2,300,000'); pg.wait_for_timeout(200)
    print('수입 합계(수정 후):', pg.inner_text('[data-sum="in"]'))
    pg.screenshot(path=f'{OUT}/3-editor.png', full_page=True)
    pg.locator('.irow input.amt').first.fill('2200000')
    pg.click('#saveBtn'); pg.wait_for_timeout(500)
    # 새 달
    pg.goto(BASE+'?mock#admin/new'); pg.wait_for_selector('#fMt')
    print('새 달 기본:', pg.input_value('#fYear'), pg.input_value('#fMonth'), '이월', pg.input_value('#fStart'))
    pg.fill('#fMt','시험산'); pg.fill('#fDate','2026.11.10')
    amts=pg.locator('.irow input.amt'); amts.nth(0).fill('1000000'); amts.nth(1).fill('300000')
    pg.click('[data-add="gift"]'); pg.wait_for_timeout(200)
    g=pg.locator('.igroup.gift .irow').last; g.locator('[data-k=name]').fill('누구님 찬조'); g.locator('[data-k=gift]').fill('귤 한 박스')
    pg.click('#saveBtn'); pg.wait_for_selector('#pfile', state='attached', timeout=5000)
    print('새 달 저장 후 주소:', pg.url.split('#')[1])
    pg.goto(BASE+'?mock#2026-11'); pg.wait_for_selector('.sum .end .v')
    print('11월 잔액:', pg.inner_text('.sum .end .v'), '| 현물:', pg.inner_text('.gifttag'))
    assert money(pg.inner_text('.sum .end .v'))==5516245+1000000-300000
    # 지우기
    pg.goto(BASE+'?mock#admin/2026-11'); pg.wait_for_selector('#delBtn'); pg.click('#delBtn'); pg.wait_for_timeout(600)
    print('삭제 후 목록:', pg.locator('.mlist li').count())
    # 엑셀
    if XLSX:
        pg.set_input_files('#xlsx', XLSX); pg.wait_for_selector('#importBtn', timeout=10000)
        labels=pg.locator('.sheetlist li'); print('엑셀 시트 찾음:', labels.count(), '| 체크됨:', pg.locator('.sheetlist input:checked').count())
        print('  예:', labels.nth(0).inner_text().replace('\n',' '))
        pg.screenshot(path=f'{OUT}/4-excel.png', full_page=True)
        pg.locator('.sheetlist label', has_text='2026년 9월').locator('input').check()
        pg.click('#importBtn'); pg.wait_for_timeout(800)
        pg.goto(BASE+'?mock#2026-09'); pg.wait_for_selector('.sum .end .v')
        print('엑셀로 덮어쓴 9월 잔액:', pg.inner_text('.sum .end .v'))
        assert money(pg.inner_text('.sum .end .v'))==5624528
    # 로그아웃 → 관리 화면 막힘
    pg.goto(BASE+'?mock#admin'); pg.wait_for_selector('#logout'); pg.click('#logout'); pg.wait_for_selector('#login')
    print('로그아웃 후 로그인 버튼 보임')
    print('오류:', errs)
    b.close()
