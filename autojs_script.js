let WebSocket = Java.use('org.java_websocket.client.WebSocketClient');
let URI = Java.use('java.net.URI');

function connectToServer() {
    // 服务器地址
    const serverUrl = 'ws://k2o3.tpddns.cn:20501/ws/' + device.buildId;

    // 创建WebSocket连接
    let uri = URI.create(serverUrl);
    let wsClient = new WebSocket(uri);

    wsClient.onOpen = function(event) {
        console.log('Connected to server');
        // 发送设备型号
        wsClient.send(JSON.stringify({model: device.model}));
        // 发送脚本列表
        sendScriptList();
        // 发送心跳
        setInterval(sendHeartbeat, 30000);
    };

    wsClient.onMessage = function(event) {
        console.log('Received message: ' + event.data);
        const data = JSON.parse(event.data);
        if (data.script) {
            // 执行接收到的脚本
            try {
                engines.execScript("remote_script", data.script);
            } catch (e) {
                console.error("Error executing script: " + e);
                sendError("Error executing script: " + e); // 发送错误信息
            }
        } else if (data.type === "heartbeat") {
            wsClient.send(JSON.stringify({type: "heartbeat_ack"}));
        } else if (data.get_script) {
            const scriptName = data.get_script;
            const scriptPath = files.join("/sdcard/脚本/", scriptName); // 假设脚本都存放在 /sdcard/脚本/ 目录下
            if (files.exists(scriptPath)) {
                const content = files.read(scriptPath);
                wsClient.send(JSON.stringify({script_name: scriptName, script_content: content}));
            } else {
                sendError("Script not found: " + scriptName);
            }
        }
    };

    wsClient.onClose = function(event) {
        console.log('Disconnected from server');
        // 尝试重新连接
        setTimeout(connectToServer, 5000);
    };

    wsClient.onError = function(event) {
        console.error('WebSocket error: ' + event);
        sendError('WebSocket error: ' + event);
    };

    wsClient.connect();
}

// 发送脚本列表
function sendScriptList() {
    const scriptDir = "/sdcard/脚本/"; // 建议改为可配置的路径
    if (files.exists(scriptDir)) {
        const scriptList = files.listDir(scriptDir);
        wsClient.send(JSON.stringify({script_list: scriptList}));
    } else {
        sendError("Script directory not found: " + scriptDir);
    }
}

// 发送心跳
function sendHeartbeat() {
    if (wsClient && wsClient.connected) {
        wsClient.send(JSON.stringify({type: "heartbeat"}));
    }
}

// 发送错误信息
function sendError(message) {
    if (wsClient && wsClient.connected) {
        wsClient.send(JSON.stringify({log: "ERROR: " + message}));
    }
}

// 重定向 console.log 和 console.error
console.log = function(message) {
    if (wsClient && wsClient.connected) {
        wsClient.send(JSON.stringify({log: message}));
    }
    // 可以在这里添加本地日志记录
};

console.error = function(message) {
    if (wsClient && wsClient.connected) {
        wsClient.send(JSON.stringify({log: "ERROR: " + message}));
    }
    // 可以在这里添加本地日志记录
};

// 启动连接
connectToServer();

// 保持脚本运行
setInterval(() => {}, 1000);
