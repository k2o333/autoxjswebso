let Java = require('java');
let OkHttpClient = Java.use('okhttp3.OkHttpClient');
let Request = Java.use('okhttp3.Request');
let WebSocketListener = Java.use('okhttp3.WebSocketListener');
let MediaType = Java.use('okhttp3.MediaType');
let RequestBody = Java.use('okhttp3.RequestBody');

function connectToServer() {
    // 服务器地址
    const serverUrl = 'ws://k2o3.tpddns.cn:20501/ws/' + device.buildId;

    // 创建OkHttpClient实例
    let client = OkHttpClient.$new();

    // 创建请求
    let request = Request.$new(serverUrl);

    // 创建WebSocket监听器
    let listener = WebSocketListener.$new();

    // 创建WebSocket连接
    let ws = client.newWebSocket(request, listener);

    listener.onOpen = function(webSocket, response) {
        console.log('Connected to server');
        // 发送设备型号
        ws.send(JSON.stringify({model: device.model}));
        // 发送脚本列表
        sendScriptList(ws);
        // 发送心跳
        setInterval(sendHeartbeat, 30000);
    };

    listener.onMessage = function(webSocket, text) {
        console.log('Received message: ' + text);
        const data = JSON.parse(text);
        if (data.script) {
            // 执行接收到的脚本
            try {
                engines.execScript("remote_script", data.script);
            } catch (e) {
                console.error("Error executing script: " + e);
                sendError(ws, "Error executing script: " + e); // 发送错误信息
            }
        } else if (data.type === "heartbeat") {
            ws.send(JSON.stringify({type: "heartbeat_ack"}));
        } else if (data.get_script) {
            const scriptName = data.get_script;
            const scriptPath = files.join("/sdcard/脚本/", scriptName); // 假设脚本都存放在 /sdcard/脚本/ 目录下
            if (files.exists(scriptPath)) {
                const content = files.read(scriptPath);
                ws.send(JSON.stringify({script_name: scriptName, script_content: content}));
            } else {
                sendError(ws, "Script not found: " + scriptName);
            }
        }
    };

    listener.onClosed = function(webSocket, code, reason) {
        console.log('Disconnected from server');
        // 尝试重新连接
        setTimeout(connectToServer, 5000);
    };

    listener.onFailure = function(webSocket, t, response) {
        console.error('WebSocket error: ' + t);
        sendError(ws, 'WebSocket error: ' + t);
    };
}

// 发送脚本列表
function sendScriptList(ws) {
    const scriptDir = "/sdcard/脚本/"; // 建议改为可配置的路径
    if (files.exists(scriptDir)) {
        const scriptList = files.listDir(scriptDir);
        ws.send(JSON.stringify({script_list: scriptList}));
    } else {
        sendError(ws, "Script directory not found: " + scriptDir);
    }
}

// 发送心跳
function sendHeartbeat() {
    if (ws && ws.connected) {
        ws.send(JSON.stringify({type: "heartbeat"}));
    }
}

// 发送错误信息
function sendError(ws, message) {
    if (ws && ws.connected) {
        ws.send(JSON.stringify({log: "ERROR: " + message}));
    }
}

// 重定向 console.log 和 console.error
console.log = function(message) {
    if (ws && ws.connected) {
        ws.send(JSON.stringify({log: message}));
    }
    // 可以在这里添加本地日志记录
};

console.error = function(message) {
    if (ws && ws.connected) {
        ws.send(JSON.stringify({log: "ERROR: " + message}));
    }
    // 可以在这里添加本地日志记录
};

// 启动连接
connectToServer();

// 保持脚本运行
setInterval(() => {}, 1000);
