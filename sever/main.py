import json
import os
import time
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Form
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from websockets.exceptions import ConnectionClosedOK

print(f"当前工作目录: {os.getcwd()}")  # 添加这行

app = FastAPI()

# Allow all origins for CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory
app.mount("/static", StaticFiles(directory="./static"), name="static")

# Store all connected clients
connected_clients = {}

# Store phone information
phone_info = {}

# Store scripts
scripts = {}

# Script directory
SCRIPT_DIR = "scripts"
os.makedirs(SCRIPT_DIR, exist_ok=True)

# Heartbeat interval (seconds)
HEARTBEAT_INTERVAL = 30

# Maximum log entries
MAX_LOG_ENTRIES = 100

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")

async def send_heartbeat(websocket: WebSocket, client_id: str):
    while True:
        try:
            # 检查连接状态
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_text(json.dumps({"type": "heartbeat"}))
            await asyncio.sleep(HEARTBEAT_INTERVAL)
        except (WebSocketDisconnect, ConnectionClosedOK):
            break
        except Exception as e:
            print(f"Error sending heartbeat to {client_id}: {e}")
            break

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    connected_clients[client_id] = websocket
    phone_info[client_id] = {
        "status": "online",
        "model": "unknown",
        "script": "None",
        "logs": [],
    }
    print(f"Client {client_id} connected")
    await broadcast_phone_list()
    asyncio.create_task(send_heartbeat(websocket, client_id))
    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from {client_id}: {data}")
            try:
                json_data = json.loads(data)
                if json_data.get("type") == "heartbeat_ack":
                    phone_info[client_id]["last_heartbeat"] = time.time()
                elif "log" in json_data:
                    log_entry = {
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "message": json_data["log"],
                    }
                    phone_info[client_id]["logs"].append(log_entry)
                    phone_info[client_id]["logs"] = phone_info[client_id]["logs"][
                        -MAX_LOG_ENTRIES:
                    ]
                    await broadcast_phone_list()
                elif "model" in json_data:
                    phone_info[client_id]["model"] = json_data["model"]
                    await broadcast_phone_list()
                elif "script_list" in json_data:
                    phone_info[client_id]["script_list"] = json_data["script_list"]
                    await broadcast_phone_list()
                elif (
                    "script_name" in json_data
                    and "content" in json_data
                    and "client_id" in json_data
                ):
                    if json_data["client_id"] == "server":
                        scripts[json_data["script_name"]] = json_data["content"]
                        print(
                            f"Received script content for {json_data['script_name']} from {client_id}"
                        )
                elif "get_script" in json_data and "client_id" in json_data:
                    req_client_id = json_data["client_id"]
                    req_script_name = json_data["get_script"]
                    if req_client_id in connected_clients:
                        # 向手机端请求脚本内容
                        await connected_clients[req_client_id].send_text(
                            json.dumps({"get_script": req_script_name})
                        )
                    else:
                        print(f"Client {req_client_id} not connected")
                elif "script_content" in json_data and "script_name" in json_data:
                    # 收到手机端发送的脚本内容
                    script_name = json_data["script_name"]
                    script_content = json_data["script_content"]
                    # 将脚本内容发送给请求的客户端（这里假设是 server）
                    if "server" in connected_clients:
                        await connected_clients["server"].send_text(
                            json.dumps(
                                {
                                    "script_name": script_name,
                                    "content": script_content,
                                }
                            )
                        )
                    else:
                        print("Server client not connected")
            except json.JSONDecodeError:
                print(f"Invalid JSON format: {data}")
    except WebSocketDisconnect:
        print(f"Client {client_id} disconnected")
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
            "script_list": info.get("script_list", []),
        }
        for client_id, info in phone_info.items()
    }
    for client in connected_clients.values():
        try:
            # 再次确认连接状态
            if client.client_state.name == "CONNECTED":
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
            await connected_clients[client_id].send_text(
                json.dumps({"script": script_content, "name": script_name})
            )
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

@app.get("/phone_info/{client_id}/scripts")
async def get_phone_scripts(client_id: str):
    if client_id in phone_info and "script_list" in phone_info[client_id]:
        return {"scripts": phone_info[client_id]["script_list"]}
    else:
        return {"error": "Client not found or script list not available"}

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(check_connections())

async def check_connections():
    while True:
        now = time.time()
        for client_id, info in phone_info.items():
            if info["status"] == "online":
                last_heartbeat = info.get("last_heartbeat")
                if last_heartbeat and now - last_heartbeat > HEARTBEAT_INTERVAL * 3:
                    print(f"Client {client_id} seems offline (no heartbeat)")
                    info["status"] = "offline"
                    await broadcast_phone_list()
        await asyncio.sleep(HEARTBEAT_INTERVAL)
