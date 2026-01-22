// popup.js

const toggleBtn = document.getElementById('toggle-btn');
const openRoomBtn = document.getElementById('open-room-btn');
const statusText = document.getElementById('status-text');
const countText = document.getElementById('count-text');
const openViewerBtn = document.getElementById('open-viewer');

let currentIsExtracting = false;

// 初始化
document.addEventListener('DOMContentLoaded', updateUI);

async function getActiveTab() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    return tabs[0];
}

async function updateUI() {
    try {
        // 1. 获取评论数量
        chrome.runtime.sendMessage({action: 'GET_ALL_COMMENTS'}, (response) => {
            if (response && response.comments) {
                countText.textContent = `已保存: ${response.comments.length} 条`;
            }
        });

        // 2. 获取当前 Content Script 状态
        const tab = await getActiveTab();
        
        // 辅助显示逻辑
        const showExtractControls = (show) => {
            if (show) {
                toggleBtn.style.display = 'block';
                openRoomBtn.style.display = 'none';
            } else {
                toggleBtn.style.display = 'none';
                openRoomBtn.style.display = 'block';
            }
        };

        if (!tab.url.includes('douyin.com')) {
            statusText.textContent = "不在抖音页面";
            showExtractControls(false);
            return;
        }

        chrome.tabs.sendMessage(tab.id, {action: 'GET_STATUS'}, (response) => {
            if (chrome.runtime.lastError) {
                // 通常是因为 content script 还没加载（比如刚安装插件未刷新页面，或者非注入页面）
                statusText.textContent = "未检测到直播";
                // 提供打开直播间的选项
                showExtractControls(false);
                return;
            }

            if (response) {
                // Content script 响应了，说明在目标页面
                showExtractControls(true);
                currentIsExtracting = response.isExtracting;
                updateStatusDisplay();
            }
        });
    } catch (e) {
        console.error(e);
    }
}

function updateStatusDisplay() {
    if (currentIsExtracting) {
        statusText.textContent = "正在提取";
        statusText.style.color = "#00b86b";
        toggleBtn.textContent = "停止提取";
        toggleBtn.classList.add('active');
    } else {
        statusText.textContent = "未运行";
        statusText.style.color = "#fe2c55";
        toggleBtn.textContent = "开始提取";
        toggleBtn.classList.remove('active');
    }
}

// 切换提取状态
toggleBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    const action = currentIsExtracting ? 'STOP' : 'START';
    
    chrome.tabs.sendMessage(tab.id, {action: action}, (response) => {
        if (response) {
            currentIsExtracting = !currentIsExtracting; // update 
            updateStatusDisplay();
        }
    });
});

// 打开直播间
openRoomBtn.addEventListener('click', () => {
    const roomId = prompt("请输入抖音直播间 ID (例如: 80017709309):");
    if (roomId && roomId.trim()) {
        const url = `https://live.douyin.com/${roomId.trim()}`;
        chrome.tabs.create({ url: url });
    }
});

// 打开数据查看页面
openViewerBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'viewer.html' });
});
