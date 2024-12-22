let OkHttpClient = Packages.okhttp3.OkHttpClient;
let Request = Packages.okhttp3.Request;
let WebSocketListener = Packages.okhttp3.WebSocketListener;
let MediaType = Packages.okhttp3.MediaType;
let RequestBody = Packages.okhttp3.RequestBody;

let ws; // Ensure ws is defined in a broader scope

function connectToServer() {
    // 服务器地址
    const serverUrl = 'ws://k2o3.tpddns.cn:20501/ws/' + device.buildId;

    // 创建OkHttpClient实例
    let client = new OkHttpClient();

    // 创建请求
    let request = new Request.Builder().url(serverUrl).build();

    // 创建WebSocket监听器
    let listener = new WebSocketListener({
        onOpen: function(webSocket, response) {
            console.log('Connected to server');
            ws = webSocket; // Assign the WebSocket instance to the global ws variable
            console.log('Device model:', device.model); // 添加这行
            webSocket.send(JSON.stringify({model: device.model}));
            // 发送脚本列表
            sendScriptList(webSocket);
            // 发送心跳
            setInterval(sendHeartbeat, 30000);
        },

        onMessage: function(webSocket, text) {
            console.log('Received message: ' + text);
            const data = JSON.parse(text);
            if (data.script) {
                // 执行接收到的脚本
                try {
                    engines.execScript("remote_script", data.script);
                } catch (e) {
                    console.error("Error executing script: " + e);
                    sendError(webSocket, "Error executing script: " + e); // 发送错误信息
                }
            } else if (data.type === "heartbeat") {
                webSocket.send(JSON.stringify({type: "heartbeat_ack"}));
            } else if (data.get_script) {
                const scriptName = data.get_script;
                const scriptPath = files.join("/sdcard/脚本/", scriptName); // 假设脚本都存放在 /sdcard/脚本/ 目录下
                if (files.exists(scriptPath)) {
                    const content = files.read(scriptPath);
                    webSocket.send(JSON.stringify({script_name: scriptName, script_content: content}));
                } else {
                    sendError(webSocket, "Script not found: " + scriptName);
                }
            }
        },

        onClosed: function(webSocket, code, reason) {
            console.log('Disconnected from server');
            ws = null; // Clear the WebSocket instance
            // 尝试重新连接
            setTimeout(connectToServer, 5000);
        },

        onFailure: function(webSocket, t, response) {
            console.error('WebSocket error: ' + t);
            sendError(webSocket, 'WebSocket error: ' + t);
            ws = null; // Clear the WebSocket instance
        }
    });

    // 创建WebSocket连接
    ws = client.newWebSocket(request, listener); // Assign the WebSocket instance to the global ws variable
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
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: "heartbeat"}));
    } else {
        console.log("WebSocket is not open, cannot send heartbeat.");
    }
}

// 发送错误信息
function sendError(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({log: "ERROR: " + message}));
    }
}

// 重定向 console.log 和 console.error
console.log = function(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({log: message}));
    }
    // 可以在这里添加本地日志记录
};

console.error = function(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({log: "ERROR: " + message}));
    }
    // 可以在这里添加本地日志记录
};

// 启动连接
connectToServer();

// 保持脚本运行
setInterval(() => {}, 1000);
