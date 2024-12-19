// 服务器地址
const serverUrl = "ws://k2o3.tpddns.cn:22101/ws/";
const phoneId = device.serial; // 获取设备唯一标识符

let ws = null;

function connect() {
    ws = new WebSocket(serverUrl + phoneId);

    ws.onopen = function() {
        toastLog("Connected to server");
        // 发送手机型号信息
        ws.send(JSON.stringify({model: device.model}));
        // 发送手机端脚本列表
        const scriptList = getLocalScriptList();
        ws.send(JSON.stringify({script_list: scriptList}));
    };

    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.script) {
            try {
                engines.execScript(data.name, data.script);
                log("Executing script: " + data.name);
                // 将脚本保存到本地
                saveScriptToLocal(data.name, data.script);
            } catch (e) {
                log("Error executing script: " + e);
            }
        } else if (data.get_script) {
            // 当收到获取脚本内容的请求时
            const scriptContent = getScriptContent(data.get_script);
            if (scriptContent) {
                ws.send(JSON.stringify({script_name: data.get_script, content: scriptContent, client_id: data.client_id}));
            }
        } else if (data.type === "heartbeat") {
            // 回应心跳
            ws.send(JSON.stringify({type: "heartbeat_ack"}));
        }
    };

    ws.onclose = function() {
        toastLog("Disconnected from server");
        // 尝试重连
        setTimeout(connect, 5000);
    };
}

function saveScriptToLocal(scriptName, scriptContent) {
    const scriptPath = files.join(files.getSdcardPath(), "Auto.js_Scripts", scriptName);
    files.ensureDir(scriptPath);
    files.write(scriptPath, scriptContent);
    toastLog("Script saved to: " + scriptPath);
}

function getLocalScriptList() {
    const scriptDir = files.join(files.getSdcardPath(), "Auto.js_Scripts");
    files.ensureDir(scriptDir);
    return files.listDir(scriptDir).filter(name => name.endsWith(".js"));
}

function getScriptContent(scriptName) {
    const scriptPath = files.join(files.getSdcardPath(), "Auto.js_Scripts", scriptName);
    if (files.exists(scriptPath)) {
        return files.read(scriptPath);
    }
    return null;
}

// 监听日志
events.observeLog();
events.onLog(function(logMsg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const timestamp = new Date().toLocaleString();
        ws.send(JSON.stringify({log: `[${timestamp}] ${logMsg}`}));
    }
});

// 启动连接
connect();
