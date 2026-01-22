// content.js

let isExtracting = false;
let observer = null;
let observerTimer = null; // 轮询检测定时器
let chatContainer = null;
const processedNodes = new WeakSet(); // 防止重复处理
let commentitem=null;

console.log('抖音评论提取插件已加载');

// // 配置选择器（如果抖音更新了页面结构，主要修改这里）
// // 策略：寻找包含 'webcast-chatroom' 的元素作为容器
// const CONFIG = {
//     // 聊天列表容器的选择器
//     // 更新：用户反馈容器在 pace-island 里面，且 id 类似 island_xxxxx
//     // 我们尝试匹配 id 以 island_ 开头的 pace-island 元素，或者直接匹配带有 data-index 的元素的父级容器（动态查找）
//     containerSelector: "pace-island[id^='island_'] ",
    
//     // 单条评论元素的选择器（相对于容器）
//     // 更新：每条评价都有 data-index 属性
//     itemSelector: '[data-index]', 
    
//     // 昵称选择器（相对于单条评论）
//     // 更新：昵称没有明显 class，但在内容前面
//     nicknameSelector: '', 
    
//     // 内容选择器
//     // 更新：用户指定 class
//     contentSelector: '.webcast-chatroom___content-with-emoji-text' 
// };

// 获取直播间标题
function getRoomTitle() {
    let title = document.title || "未知直播间";
    
    // 获取 ID: 通常在 URL 的最后
    // https://live.douyin.com/80017709309
    let roomId = "";
    const pathSegments = window.location.pathname.split('/').filter(p => p);
    if (pathSegments.length > 0) {
        roomId = pathSegments[pathSegments.length - 1];
    }
    
    return `${title} [${roomId}]`;
}

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

    chatContainer = null;

    // // 1. 获取所有符合特征的 pace-island，因为可能存在多个，且第一个可能不是评论区
    // const islands = document.querySelectorAll("pace-island[id^='island_']");
    
    // // 遍历所有 island，寻找确实包含评论项的那一个
    // for (const island of islands) {
    //     const item = island.querySelector(CONFIG.itemSelector);
    //     if (item) {
    //          // 找到了！说明这个 island 才是真正的评论区
    //          // 按照用户指示，评论在 data-index 元素的父级
    //          if (item.parentElement) {
    //              chatContainer = item.parentElement;
    //              console.log(`在 island (${island.id}) 中找到评论容器:`, chatContainer);
    //              var c =  chatContainer.closest(".webcast-chatroom");
    //              if(c){
    //                     console.log("找到最近的 webcast-chatroom 容器:", c);
    //                     chatContainer = c;
    //              }
    //          }

    //          break;
    //     }
    // }

    // // 2. Fallback: 如果遍历没找到（可能是还没加载评论），尝试全局找 data-index 的父级
    // if (!chatContainer) {
    //     const item = document.querySelector(CONFIG.itemSelector);
    //     if (item && item.parentElement) {
    //         chatContainer = item.parentElement;
    //         console.log('全局找到评论容器 (Fallback):', chatContainer);
    //     }
    // }

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

    if (!chatContainer) {
        console.log('未找到包含评论的容器，3秒后重试...');
        setTimeout(findAndObserveContainer, 3000);
        return;
    }

    setupObserver(chatContainer);
}

// 设置 MutationObserver
function setupObserver(targetNode) {
    if (observer) {
        observer.disconnect();
    }
    if (observerTimer) {
        clearInterval(observerTimer);
        observerTimer = null;
    }

    commentitem = targetNode;
    console.log('成功获取并监听聊天容器:', targetNode, '类名:', targetNode.className);

    observer = new MutationObserver((mutationsList) => {
        if (!isExtracting) return;

        for (const mutation of mutationsList) {
            // 情况1: 新增节点 (标准的插入行为)
        
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { 
                        processCommentNode(node);
                    }
                });
            }
            // 情况2: 节点属性变化 (针对虚拟列表复用节点的情况)
            // 很多高性能直播间会复用 DOM 元素，只修改 data-index 和文本，不进行 remove/add 操作
            else if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
                // 只有当变动的是由于 data-index 引起的，或者在复用时引发了 class 变更
                processCommentNode(mutation.target);
            }
        }
    });

    // 开启 attributes: true 以监听节点复用
    // subtree: true 意味着监听当前元素下的【所有子孙节点】（不管嵌套多深）
    observer.observe(targetNode, { 
        childList: true, 
        subtree: true, 
        attributes: true, 
        // attributeFilter: ['data-index'] // 注释掉过滤：监听所有属性变化，宁可多检测也不要漏掉
    });

    // 启动轮询检测：
    // 1. 检查 container 是否还在文档中
    // 2. 主动扫描一次当前容器内的所有评论（兜底，防止 Observer 漏掉）
    observerTimer = setInterval(() => {
        if (!isExtracting) {
            clearInterval(observerTimer);
            return;
        }

        // 兜底策略：不管 Observer 触没触发，每 1.5 秒主动扫一遍所有可见评论
        // 你的 processCommentNode 里有 Set 去重，所以重复调用是安全的
        if (targetNode.isConnected) {
             const items = targetNode.querySelectorAll('[data-index]');
             items.forEach(processCommentNode);
        }

        if (!targetNode.isConnected) {
            console.warn('当前监听的容器已失效（被页面移除），尝试重新搜索新容器...');
            clearInterval(observerTimer);
            observerTimer = null;
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            findAndObserveContainer(); // 重新寻找
        }
    }, 2000); // 2秒检测一次

    /// 立即扫描现有评论
    const existingItems = targetNode.querySelectorAll('[data-index]');
    existingItems.forEach(processCommentNode);
}

// 处理单条评论节点
function processCommentNode(node) {
    // if (processedNodes.has(node)) return;
    // processedNodes.add(node);
    var index = node.getAttribute("data-index");
    var type = null;
    if (processedNodes.has(node))
         return;
        processedNodes.add(node);
    if(index){
        
        if(node.querySelectorAll(".webcast-chatroom__room-message").length>0){
            type="notify-comment";//系统通知类评论
        }else{
            type="normal-comment";//普通评论
        }
    }
    else{
        type="room-bottom-message";//直播间底部动态
    }
    

    const fullText = node.innerText || "";
    if (!fullText.trim()) return;
    
    let nickname = "";
    let content = "";
    let level = "";
    let imgs = "";
    let contimes="";
    
    if(type==="normal-comment" || type==="room-bottom-message"){
        // 正常评论处理逻辑
        try{
            var spanElements = node.querySelector('span').parentElement.childNodes;
        if(spanElements.length>=2){
            imgs = spanElements[0].outerHTML;
            var img = spanElements[0].querySelector('img');
            if(img){

                // 有等级图标，说明第一个 span 是等级
                var src = img.getAttribute('src') || "";
                var match = src.match(/level_(v\d+_\d+)\.png/);
                if(match){
                    level = match[1];
                }
            }
            nickname = spanElements[1].innerText || "Unknown";
            nickname = nickname.replace(/[:：]$/,"").trim(); // 去掉末尾冒号
            content = Array.from(spanElements).slice(2).map(span => span.innerText).join('').trim();
            contimes = Array.from(spanElements[2].querySelectorAll('img')).map(img=>img.outerHTML).join('\n');
        }
        }catch(e){
            content = fullText.trim();
            var m=content.split(/：|:/); // 中文或英文冒号
            if (m.length >= 2) {
                   nickname = m.shift().trim();
                   content = m.join("").trim(); // 剩下的拼回去
            }
                
        
        
        }
    }else if(type==="notify-comment"){
        // 系统通知类评论处理逻辑
        content = fullText.trim();
        nickname = "系统通知";
    }


    

    // 发送给 background
    chrome.runtime.sendMessage({
        action: 'SAVE_COMMENT',
        data: {
            nickname: nickname,
            level: level,
            type: type,
            imgs: imgs,
            content: content,
            contimes: contimes,
            html: node.outerHTML,
            roomTitle: getRoomTitle(),
            raw: fullText,
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
