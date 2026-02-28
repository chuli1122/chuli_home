#!/usr/bin/env python3
"""
阿澄的终端 — chuli_home CLI 聊天入口
用法: python tools/cli_chat.py
"""

import base64
import io
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request

# Windows 终端 UTF-8 支持
if os.name == "nt":
    os.system("")  # enable ANSI/VT
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

API_URL = os.environ.get("CHULI_API_URL", "https://chat.chuli.win")
ASSISTANT_ID = 2  # 阿澄


def api(method: str, path: str, body: dict | None = None, token: str | None = None,
        stream: bool = False) -> dict | urllib.request.http.client.HTTPResponse:
    url = f"{API_URL}/api{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    resp = urllib.request.urlopen(req, timeout=300)
    if stream:
        return resp
    return json.loads(resp.read().decode())


def login() -> str:
    password = os.environ.get("WHISPER_PASSWORD")
    if not password:
        password = input("密码: ").strip()
        if not password:
            print("需要密码才能登录")
            sys.exit(1)
    try:
        result = api("POST", "/auth/verify", {"password": password})
    except urllib.error.HTTPError as e:
        print(f"登录失败: {e.code}")
        sys.exit(1)
    return result["token"]


def list_sessions(token: str) -> list[dict]:
    result = api("GET", f"/sessions?assistant_id={ASSISTANT_ID}", token=token)
    return result.get("sessions", [])


def create_session(token: str, title: str = "") -> dict:
    return api("POST", "/sessions", {
        "assistant_id": ASSISTANT_ID,
        "title": title or "终端聊天",
    }, token=token)


def pick_session(token: str) -> int:
    sessions = list_sessions(token)
    if sessions:
        print("\n已有会话:")
        for i, s in enumerate(sessions[:10]):
            tag = " (最近)" if i == 0 else ""
            print(f"  [{i}] #{s['id']} {s.get('title', '')}{tag}")
        print(f"  [n] 新建会话")
        choice = input("\n选择 (直接回车选最近): ").strip().lower()
        if choice == "n":
            s = create_session(token)
            print(f"  新建会话 #{s['id']}")
            return s["id"]
        if choice == "":
            return sessions[0]["id"]
        try:
            idx = int(choice)
            return sessions[idx]["id"]
        except (ValueError, IndexError):
            return sessions[0]["id"]
    else:
        s = create_session(token)
        print(f"  新建会话 #{s['id']}")
        return s["id"]


def stream_chat(token: str, session_id: int, message: str | list) -> None:
    body = {"session_id": session_id, "message": message, "stream": True, "source": "terminal"}
    try:
        resp = api("POST", "/chat/completions", body, token=token, stream=True)
    except urllib.error.HTTPError as e:
        print(f"\n  [错误] {e.code}: {e.read().decode()[:200]}")
        return

    sys.stdout.write("\n阿澄: ")
    sys.stdout.flush()
    buffer = ""
    for raw_line in resp:
        line = raw_line.decode("utf-8", errors="replace").strip()
        if not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload == "[DONE]":
            break
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if "content" in data:
            sys.stdout.write(data["content"])
            sys.stdout.flush()
            buffer += data["content"]
        if "error" in data:
            sys.stdout.write(f"\n  [错误] {data['error']}")
    sys.stdout.write("\n\n")
    sys.stdout.flush()


def build_image_message(text: str, image_path: str) -> list[dict]:
    image_path = image_path.strip().strip('"').strip("'")
    if not os.path.isfile(image_path):
        print(f"  文件不存在: {image_path}")
        return []
    mime, _ = mimetypes.guess_type(image_path)
    if not mime or not mime.startswith("image/"):
        mime = "image/png"
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    parts = []
    if text:
        parts.append({"type": "text", "text": text})
    parts.append({
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{b64}"},
    })
    return parts


def main():
    print("🌙 阿澄的终端")
    print("━" * 30)

    token = login()
    print("  已登录 ✓")

    session_id = pick_session(token)
    print(f"\n已连接 {API_URL} | 助手: 阿澄 | 会话: #{session_id}")
    print("输入消息回车发送 | /img <路径> 发图片 | /quit 退出\n")

    while True:
        try:
            user_input = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见 ✨")
            break

        if not user_input:
            continue
        if user_input.lower() == "/quit":
            print("再见 ✨")
            break

        # /img 命令
        if user_input.lower().startswith("/img "):
            rest = user_input[5:].strip()
            # 可选附带文字: /img 路径 说明文字
            parts_split = rest.split(" ", 1)
            image_path = parts_split[0]
            caption = parts_split[1] if len(parts_split) > 1 else ""
            message = build_image_message(caption, image_path)
            if not message:
                continue
            stream_chat(token, session_id, message)
            continue

        # 普通文字消息
        stream_chat(token, session_id, user_input)


if __name__ == "__main__":
    main()
