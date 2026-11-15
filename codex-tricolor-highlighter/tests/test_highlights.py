"""Exercise the production highlighting code on a disposable offline fixture."""
import subprocess
import tempfile
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    if not chrome.exists():
        raise SystemExit("运行本地测试需要 Google Chrome。")

    script = (root / "src/pen.js").read_text()
    # The fixture uses a file URL and needs access to the palette buttons.
    script = script.replace("location.protocol !== 'app:' || location.hostname !== '-' || ", "")
    script = script.replace("mode:'closed'", "mode:'open'")
    checks = (root / "tests/highlight-checks.js").read_text()
    html = """<!doctype html><meta charset="utf-8">
    <div data-turn-key="uuid-1"><article data-content-search-unit-key="message-a"><span>第一行</span><b>第二行</b><i>第三行</i></article></div>
    <output id="report">pending</output>
    """
    html += f"<script>{script}</script><script>window.addEventListener('load',()=>{{{checks}}})</script>"

    with tempfile.TemporaryDirectory(prefix="tricolor-test-") as folder:
        fixture = Path(folder) / "fixture.html"
        fixture.write_text(html)
        result = subprocess.run([
            str(chrome), f"--user-data-dir={folder}/profile", "--headless",
            "--no-first-run", "--disable-background-networking", "--disable-sync",
            "--disable-extensions", "--disable-gpu", "--virtual-time-budget=4000",
            "--dump-dom", fixture.as_uri(),
        ], capture_output=True, text=True, timeout=45)
        if result.returncode:
            raise SystemExit(result.stderr)
        if '<output id="report">ALL_PASS</output>' not in result.stdout:
            raise SystemExit("测试失败：" + result.stdout.split('<output id="report">', 1)[-1].split('</output>', 1)[0][:180])
    print("通过：三色、跨格式选区、改色、擦除、刷新恢复、聊天隔离。")


if __name__ == "__main__":
    main()
