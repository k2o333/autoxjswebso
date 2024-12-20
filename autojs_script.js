// /root/axj/autojs_script.js

// 请求权限
var permissions = [
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO"
];

runtime.requestPermissions(permissions);

// 检查是否已经获取了某项权限
if (runtime.checkSelfPermission("android.permission.CAMERA")) {
    // 已有相机权限
    toastLog("已获取相机权限");
} else {
    toastLog("未获取相机权限");
}

// ... 你的脚本代码 ...
