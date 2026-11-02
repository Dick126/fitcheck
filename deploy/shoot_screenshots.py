"""用无头 Edge 给线上 FitCheck 拍截图（手机尺寸），用于 README。"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "screenshots")
BASE = os.environ.get("SHOT_BASE", "http://82.156.164.242")
TOKEN = os.environ.get("SHOT_TOKEN", "")
PORT = 9222
W, H, DSF = 430, 932, 2


def http_json(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return json.loads(r.read().decode())


def wait_debugger():
    for _ in range(50):
        try:
            return http_json(f"http://127.0.0.1:{PORT}/json")
        except Exception:
            time.sleep(0.3)
    raise SystemExit("Edge 调试端口未就绪")


class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, timeout=30)
        self.seq = 0

    def call(self, method, **params):
        self.seq += 1
        self.ws.send(json.dumps({"id": self.seq, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.seq:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})

    def eval_js(self, expr):
        return self.call("Runtime.evaluate", expression=expr, returnByValue=True)

    def goto(self, url, wait=2.2):
        self.call("Page.navigate", url=url)
        time.sleep(wait)

    def shot(self, name):
        data = self.call("Page.captureScreenshot", format="png", fromSurface=True)
        path = os.path.join(OUT, name)
        with open(path, "wb") as f:
            f.write(base64.b64decode(data["data"]))
        print("saved", path, os.path.getsize(path), "bytes")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(OUT, exist_ok=True)
    profile = tempfile.mkdtemp(prefix="fitcheck-shot-")
    proc = subprocess.Popen(
        [EDGE, "--headless=new", f"--remote-debugging-port={PORT}",
         f"--user-data-dir={profile}", "--no-first-run", "--disable-gpu",
         "--hide-scrollbars", "--window-size=430,932", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        targets = wait_debugger()
        page = next(t for t in targets if t.get("type") == "page")
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=W, height=H,
                 deviceScaleFactor=DSF, mobile=True)

        # 1. 登录页（无 token）
        cdp.goto(BASE + "/")
        time.sleep(1.5)
        cdp.shot("01-login.png")

        # 注入登录态
        cdp.eval_js("localStorage.setItem('fitcheck_token', %s)" % json.dumps(TOKEN))
        cdp.call("Page.reload")
        time.sleep(2.5)

        for name, hash_ in [
            ("02-home.png", "#/home"),
            ("03-plan.png", "#/plan"),
            ("04-circle.png", "#/circle"),
            ("05-body.png", "#/body"),
            ("06-calendar.png", "#/calendar"),
        ]:
            cdp.goto(BASE + "/" + hash_)
            time.sleep(2.0)
            cdp.shot(name)
        print("done")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
