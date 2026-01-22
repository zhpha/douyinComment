// background.js

const DB_NAME = 'DouyinCommentsDB';
const DB_VERSION = 2;
const STORE_NAME = 'comments';

// 打开数据库辅助函数
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            let objectStore;
            
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                objectStore.createIndex("timestamp", "timestamp", { unique: false });
                objectStore.createIndex("nickname", "nickname", { unique: false });
            } else {
                objectStore = event.target.transaction.objectStore(STORE_NAME);
            }

            // 新增索引 (DB_VERSION 2)
            if (!objectStore.indexNames.contains("type")) {
                objectStore.createIndex("type", "type", { unique: false });
            }
            if (!objectStore.indexNames.contains("level")) {
                objectStore.createIndex("level", "level", { unique: false });
            }
            if (!objectStore.indexNames.contains("roomTitle")) {
                objectStore.createIndex("roomTitle", "roomTitle", { unique: false });
            }
        };
    });
}

// 保存评论到 IndexedDB
async function saveComment(commentData) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        const record = {
            ...commentData,
            timestamp: new Date().getTime()
        };

        store.add(record);
        return true;
    } catch (error) {
        console.error("Failed to save comment:", error);
        return false;
    }
}

// 获取所有评论
async function getAllComments() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

// 清空评论
async function clearComments() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

// 监听来自 content script 和 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SAVE_COMMENT') {
        saveComment(request.data).then(() => {
            // Optional: send acknowledgement?
        });
        // 异步操作不需要 return true 除非我们需要 sendResponse 回调结果给发送者
        // 这里只是 fire-and-forget
    } else if (request.action === 'GET_ALL_COMMENTS') {
        getAllComments().then(comments => sendResponse({ comments }));
        return true; // 保持消息通道打开以进行异步响应
    } else if (request.action === 'CLEAR_COMMENTS') {
        clearComments().then(success => sendResponse({ success }));
        return true;
    } else if (request.action === 'DELETE_COMMENTS_BY_ROOM') {
        deleteCommentsByRoom(request.roomTitle).then(success => sendResponse({ success }));
        return true;
    }
});

// 根据直播间标题删除数据
async function deleteCommentsByRoom(roomTitle) {
    let db;
    try {
        db = await openDB();
    } catch (e) {
        console.error("Failed to open DB", e);
        return { success: false, error: e.message };
    }

    return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // 检查索引是否存在
        if (!store.indexNames.contains('roomTitle')) {
            console.error("Index 'roomTitle' not found.");
            resolve({ success: false, error: "Index roomTitle missing" });
            return;
        }

        const index = store.index('roomTitle');
        const request = index.openCursor(IDBKeyRange.only(roomTitle));
        
        let deleteCount = 0;
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                deleteCount++;
                cursor.continue();
            } else {
                // 完成
                console.log(`Deleted ${deleteCount} comments for room: ${roomTitle}`);
            }
        };
        
        transaction.oncomplete = () => {
            resolve({ success: true, count: deleteCount });
        };
        
        transaction.onerror = (event) => {
            console.error('Delete transaction error', event.target.error);
            resolve({ success: false, error: event.target.error.message });
        };
    });
}
