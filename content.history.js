// content.js

let isExtracting = false;
let observer = null;
let chatContainer = null;
const processedNodes = new WeakSet(); // 防止重复处理

console.log('抖音评论提取插件已加载');

// 配置选择器（如果抖音更新了页面结构，主要修改这里）
// 策略：寻找包含 'webcast-chatroom' 的元素作为容器
const CONFIG = {
    // 聊天列表容器的选择器，通常是一个包含很多 li 或 div 的列表
    // 这是一个模糊匹配，试图找到类名中包含 'webcast-chatroom' 且呈现为列表的元素
    containerSelector: 'div[class*="webcast-chatroom"] div div',
    
    // 单条评论元素的选择器（相对于容器）
    itemSelector: 'div[class*="webcast-chatroom___item"]',
    
    // 昵称选择器（相对于单条评论）
    // 抖音通常把昵称和内容放在不同的 span 里，或者混合在一起
    // 这只是一个简单的启发式规则
    nicknameSelector: 'span[class*="u8Mx_"], .nickname',
    
    // 内容选择器
    contentSelector: 'span[class*="content"], .content' 
};

// 启动提取
function startExtraction() {
    if (isExtracting) return;
    console.log('开始提取评论...');
    isExtracting = true;
    findAndObserveContainer();
}

// 停止提取
function stopExtraction() {
    if (!isExtracting) return;
    console.log('停止提取评论...');
    isExtracting = false;
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

// 寻找聊天容器
function findAndObserveContainer() {
    if (!isExtracting) return;

    // 尝试查找容器
    // 1. 优先尝试配置的选择器
    chatContainer = document.querySelector(CONFIG.containerSelector);

    const selectors = [
      '.webcast-chatroom',
      '.chatroom___message-list',
      '[data-e2e="live-comment-list"]',
      '.CommentList'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
          chatContainer = element;
          break;
      }
    }

    // 2. 如果没找到，尝试使用 xpath 或者是更宽泛的查找
    if (!chatContainer) {
        // 备用策略：查找高度较高且不断变化的 div，这里为了简单先只重试
        console.log('未找到评论容器，3秒后重试...');
        setTimeout(findAndObserveContainer, 3000);
        return;
    }

    console.log('找到评论容器:', chatContainer);
    setupObserver(chatContainer);
}

// 设置 MutationObserver
function setupObserver(targetNode) {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutationsList) => {
        if (!isExtracting) return;

        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        processCommentNode(node);
                    }
                });
            }
        }
    });

    observer.observe(targetNode, { childList: true, subtree: true });
}

// 处理单条评论节点
function processCommentNode(node) {
    if (processedNodes.has(node)) return;
    processedNodes.add(node);

    // 简单的文本内容提取
    // 抖音的结构很复杂，包含图标、勋章等。
    // 最简单的方法是获取 innerText，然后尝试解析。
    // 通常格式为： "等级 昵称： 评论内容" 或 "昵称： 评论内容"
    
    // 尝试稍微智能一点的解析
    // 很多时候整个条目的 innerText 就包含了我们需要的信息
    const fullText = node.innerText || "";
    if (!fullText.trim()) return;

    // 这里做一个简单的假设：最后一部分是内容，前面是昵称
    // 但这样不准确。
    // 备选方案：直接保存整个文本，让用户后续清洗，或者尝试更激进的清洗。
    
    // 更好的方式：尝试找到昵称节点和内容节点
    // 抖音直播通常会给昵称和内容不同的颜色或类名
    // 但类名是混淆的。
    
    // 通用方案：将包含“：”或换行符的文本分开
    // 或者，通常评论内容是在最后一个 <span> 里
    
    let nickname = "Unknown";
    let content = fullText;

    // 尝试分离 (这就很 trick，依赖于观察)
    // 假设结构是： [勋章] [等级] 昵称： 内容
    
    // 如果想要更精确，需要用户根据实际 DOM 调整。
    // 这里我们直接保存 fullText 作为 content，如果能分离出 nickname 最好。
    
    // 发送给 background
    chrome.runtime.sendMessage({
        action: 'SAVE_COMMENT',
        data: {
            raw: fullText, // 保存原始文本以防解析错误
            content: content,
            url: window.location.href
        }
    });
}

// 监听控制消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START') {
        startExtraction();
        sendResponse({status: 'started'});
    } else if (request.action === 'STOP') {
        stopExtraction();
        sendResponse({status: 'stopped'});
    } else if (request.action === 'GET_STATUS') {
        sendResponse({isExtracting: isExtracting});
    }
});

// 默认自动开始 (或者等待 popup 点击)
// 这里我们等待 popup 点击 Start，或者如果你想自动开始，就取消注释下面一行
// startExtraction();
