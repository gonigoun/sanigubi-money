# '정산 중 / 완료' 표시 검사 (시험 모드)
import re, sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:8765/'; OUT=sys.argv[1] if len(sys.argv)>1 else '/tmp'
money=lambda s:int(re.sub(r'[^\d-]','',s))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.route(re.compile(r'fonts\.'),lambda r:r.abort())
    pg.goto(BASE+'?mock#admin'); pg.evaluate('localStorage.clear()'); pg.reload()
    pg.click('#login'); pg.click('#seed'); pg.wait_for_selector('.mlist li >> text=10월', timeout=20000)
    print('목록 첫 줄:', pg.locator('.mlist li').first.inner_text().replace('\n',' ')[:40])
    pg.goto(BASE+'?mock'); pg.wait_for_selector('.chip')
    chips=[c.inner_text() for c in pg.locator('.chip').all()][:3]; print('칩:', chips)
    assert chips[0].startswith('11월') and '정산 중' in chips[0]
    print('처음 선택:', pg.locator('.chip[aria-pressed=true]').inner_text())
    pg.screenshot(path=f'{OUT}/s1-public.png')
    pg.locator('.chip').first.click(); pg.wait_for_selector('.pending'); print('11월 화면:', pg.inner_text('.pending')[:30])
    pg.screenshot(path=f'{OUT}/s2-placeholder.png', full_page=True)
    # 11월 입력 → 정산 중
    pg.goto(BASE+'?mock#admin/new'); pg.wait_for_selector('#fMt'); pg.fill('#fMt','소요산'); pg.fill('#fDate','2026.11.18')
    pg.locator('.irow input.amt').nth(0).fill('2000000'); pg.locator('.irow input.amt').nth(1).fill('900000')
    pg.click('#saveBtn'); pg.wait_for_selector('#statusBtn >> text=정산 완료'); 
    pg.screenshot(path=f'{OUT}/s3-editor-progress.png', full_page=True)
    pg.goto(BASE+'?mock'); pg.wait_for_selector('.chip')
    print('입력 후 칩:', pg.locator('.chip').first.inner_text(), '| 잔액:', pg.inner_text('.balance .amt'))
    assert money(pg.inner_text('.balance .amt'))==5516245
    pg.locator('.chip').first.click(); pg.wait_for_selector('.pending'); print('11월(정산 중) 잔액칸:', pg.inner_text('.sum .end .v'))
    pg.screenshot(path=f'{OUT}/s4-progress-month.png')
    # 완료
    pg.goto(BASE+'?mock#admin/2026-11'); pg.wait_for_selector('#statusBtn'); pg.click('#statusBtn'); pg.wait_for_selector('#statusBtn >> text=되돌리기')
    pg.goto(BASE+'?mock'); pg.wait_for_selector('.chip')
    print('완료 후 칩:', pg.locator('.chip').first.inner_text(), '| 잔액:', pg.inner_text('.balance .amt'), '| 정산중 칩 수:', pg.locator('.chip.progress').count())
    assert money(pg.inner_text('.balance .amt'))==5516245+1100000
    pg.screenshot(path=f'{OUT}/s5-done.png')
    print('오류:', errs); b.close()
