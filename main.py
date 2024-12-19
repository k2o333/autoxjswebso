from typing import Dict, List
import json
import os
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from websockets.exceptions import ConnectionClosedOK

app = FastAPI()

# 允许所有源进行跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录
app.mount("/static", StaticFiles(directory="static"), name="static")

# 存储所有连接的客户端
connected_clients: Dict[str, WebSocket] = {}

# 存储手机信息
phone_info: Dict[str, dict] = {}

# 存储脚本
scripts: Dict[str, str] = {}

# 脚本目录
SCRIPT_DIR = "scripts"
os.makedirs(SCRIPT_DIR, exist_ok=True)

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    connected_clients[client_id] = websocket
    phone_info[client_id] = {"status": "online", "model": "unknown", "script": "None", "logs": []}
    print(f"Client {client_id} connected")
    await broadcast_phone_list()
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from {client_id}: {data}")
            try:
                json_data = json.loads(data)
                if "log" in json_
                    log_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "message": json_data["log"]}
                    phone_info[client_id]["logs"].append(log_entry)
                    await broadcast_phone_list()
                elif "model" in json_
                    phone_info[client_id]["model"] = json_data["model"]
                    await broadcast_phone_list()
                elif "script_list" in json_
                    phone_info[client_id]["script_list"] = json_data["script_list"]
                    await broadcast_phone_list()
            except json.JSONDecodeError:
                print(f"Invalid JSON format: {data}")
    except WebSocketDisconnect:
        print(f"Client {client_id} disconnected")
    except ConnectionClosedOK:
        print(f"Client {client_id} closed connection gracefully")
    finally:
        del connected_clients[client_id]
        phone_info[client_id]["status"] = "offline"
        await broadcast_phone_list()

async def broadcast_phone_list():
    simplified_phone_info = {
        client_id: {
            "status": info["status"],
            "model": info["model"],
            "script": info["script"],
            "latest_log": info["logs"][-1]["message"] if info["logs"] else "No logs yet",
            "script_list": info.get("script_list", [])
        }
        for client_id, info in phone_info.items()
    }
    for client in connected_clients.values():
        try:
            await client.send_text(json.dumps({"phone_list": simplified_phone_info}))
        except Exception as e:
            print(f"Error broadcasting to a client: {e}")

@app.post("/upload_script/")
async def upload_script(script_file: UploadFile = File(...), script_name: str = Form(...)):
    contents = await script_file.read()
    scripts[script_name] = contents.decode()
    with open(os.path.join(SCRIPT_DIR, script_name), "w") as f:
        f.write(contents.decode())
    return {"message": f"Script {script_name} uploaded successfully"}

@app.post("/send_script/")
async def send_script(client_id: str = Form(...), script_name: str = Form(...)):
    if client_id == "all":
        for client in connected_clients:
            await send_script_to_client(client, script_name)
    else:
        await send_script_to_client(client_id, script_name)
    return {"message": f"Script {script_name} sent to {client_id}"}

async def send_script_to_client(client_id: str, script_name: str):
    if client_id in connected_clients:
        script_content = scripts.get(script_name)
        if script_content:
            await connected_clients[client_id].send_text(json.dumps({"script": script_content, "name": script_name}))
            phone_info[client_id]["script"] = script_name
            await broadcast_phone_list()
        else:
            print(f"Script {script_name} not found")
    else:
        print(f"Client {client_id} not connected")

@app.get("/scripts/")
async def get_scripts():
    return {"scripts": list(scripts.keys())}

@app.get("/scripts/{script_name}")
async def get_script(script_name: str):
    script_content = scripts.get(script_name)
    if script_content:
        return {"script_name": script_name, "content": script_content}
    else:
        return {"error": "Script not found"}

@app.get("/phone_info/{client_id}/logs")
async def get_phone_logs(client_id: str):
    if client_id in phone_info:
        return {"logs": phone_info[client_id]["logs"]}
    else:
        return {"error": "Client not found"}
