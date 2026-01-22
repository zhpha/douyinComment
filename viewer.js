// viewer.js

const roomSelect = document.getElementById('room-select');
// const typeSelect = document.getElementById('type-select');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const searchInput = document.getElementById('search-input');
const tableBody = document.querySelector('#comments-table tbody');
const emptyTip = document.getElementById('empty-tip');
const statsDisplay = document.getElementById('stats-display');
const refreshBtn = document.getElementById('refresh-btn');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const exportJsonBtn = document.getElementById('export-json');
const exportCsvBtn = document.getElementById('export-csv');
const clearBtn = document.getElementById('clear-btn');
const deleteRoomBtn = document.getElementById('delete-room-btn');

let allComments = [];
let filteredComments = [];
let currentPage = 1;
const pageSize = 1000;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setupMultiselect();
    setupMoreActions();
    loadData();
});

function setupMoreActions() {
    const btn = document.getElementById('more-btn-toggle');
    const dropdown = document.getElementById('more-dropdown-list');
    
    // 点击按钮切换
    btn.addEventListener('click', (e) => {
        dropdown.classList.toggle('visible');
        e.stopPropagation();
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    });

    // 点击菜单项后也关闭
    dropdown.addEventListener('click', () => {
        dropdown.classList.remove('visible');
    });
}

function setupMultiselect() {
    const list = document.getElementById('type-multiselect');
    const anchor = document.getElementById('type-anchor');
    const items = document.getElementById('type-items');
    const checkboxes = items.querySelectorAll('input[type="checkbox"]');

    // 1. 点击显示/隐藏
    anchor.addEventListener('click', (e) => {
        list.classList.toggle('visible');
        e.stopPropagation(); // 阻止冒泡，防止被 window click 捕获
    });

    // 2. 点击外部隐藏
    document.addEventListener('click', (e) => {
        if (!list.contains(e.target)) {
            list.classList.remove('visible');
        }
    });

    // 3. 更新显示的文本 & 触发筛选
    const updateText = () => {
        const checked = Array.from(checkboxes).filter(cb => cb.checked);
        if (checked.length === checkboxes.length) {
            anchor.textContent = '全选';
        } else if (checked.length === 0) {
            anchor.textContent = '未选';
        } else {
            anchor.textContent = `已选 ${checked.length} 项`;
        }
    };

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            updateText();
            applyFilters();
        });
    });

    // 初始化文本
    updateText();
}
refreshBtn.addEventListener('click', () => {
    // 点击查询/刷新时，重置数据并应用筛选
    loadData(); 
});

// 分页控制
prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

nextPageBtn.addEventListener('click', () => {
    const maxPage = Math.ceil(filteredComments.length / pageSize);
    if (currentPage < maxPage) {
        currentPage++;
        renderTable();
    }
});

// 导出 JSON
exportJsonBtn.addEventListener('click', () => {
    if (filteredComments.length > 0) {
        const blob = new Blob([JSON.stringify(filteredComments, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `douyin_comments_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    } else {
        alert('当前没有数据可导出');
    }
});

// 导出 CSV
exportCsvBtn.addEventListener('click', () => {
    if (filteredComments.length > 0) {
        // UTF-8 BOM add to fix excel encoding display
        let csvContent = "\uFEFFTimestamp,RoomTitle,Type,Level,Nickname,Content,RawContent,URL\n";
        
        filteredComments.forEach(c => {
            const time = new Date(c.timestamp).toLocaleString();
            const roomTitle = `"${(c.roomTitle || "").replace(/"/g, '""')}"`;
            const type = `"${(c.type || "").replace(/"/g, '""')}"`;
            const level = `"${(c.level || "").replace(/"/g, '""')}"`;
            const nickname = `"${(c.nickname || "").replace(/"/g, '""')}"`;
            const content = `"${(c.content || "").replace(/"/g, '""')}"`;
            const raw = `"${(c.raw || "").replace(/"/g, '""')}"`;
            const url = `"${c.url}"`;
            
            csvContent += `${time},${roomTitle},${type},${level},${nickname},${content},${raw},${url}\n`;
        });

        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `douyin_comments_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    } else {
        alert('当前没有数据可导出');
    }
});

// 清空数据
clearBtn.addEventListener('click', () => {
    if (confirm('警告：确定要清空数据库中的所有评论吗？此操作不可恢复。')) {
        chrome.runtime.sendMessage({action: 'CLEAR_COMMENTS'}, (response) => {
            if (response && response.success) {
                alert('数据库已清空');
                loadData(); // 重新加载（应该变空）
            } else {
                alert('清空失败');
            }
        });
    }
});

// 删除选中的直播间数据
deleteRoomBtn.addEventListener('click', () => {
    const selectedRoom = roomSelect.value;
    if (selectedRoom === 'ALL') {
        alert('请先在上方下拉框中选择一个具体的直播间，然后再点击此按钮删除该直播间的所有数据。');
        return;
    }

    if (confirm(`警告：确定要删除直播间 "${selectedRoom}" 的所有评论数据吗？此操作不可恢复。`)) {
        chrome.runtime.sendMessage({
            action: 'DELETE_COMMENTS_BY_ROOM', 
            roomTitle: selectedRoom
        }, (response) => {
            if (response && response.success) {
                alert(`直播间 "${selectedRoom}" 的数据已删除`);
                // 删除后由于数据变了，需要重新加载，并且重置选择到 'ALL'
                // 或者我们可以尝试保留在 'ALL'，但不管怎样，当前选中的房间已经没数据了
                loadData(); 
            } else {
                alert('删除失败: ' + (response.error || '未知错误'));
            }
        });
    }
});

function loadData() {
    statsDisplay.textContent = '加载数据中...';
    // 向 background 请求数据
    chrome.runtime.sendMessage({action: 'GET_ALL_COMMENTS'}, (response) => {
        if (response && response.comments) {
            allComments = response.comments;
            // 按时间倒序
            allComments.sort((a, b) => b.timestamp - a.timestamp);
            
            updateRoomOptions();
            applyFilters(); // 加载完自动筛选
        } else {
            allComments = [];
            filteredComments = [];
            renderTable();
        }
    });
}

function updateRoomOptions() {
    // 保存当前选中的值，以便刷新后保持
    const currentVal = roomSelect.value;
    
    // 提取唯一的直播间标题
    const rooms = new Set();
    allComments.forEach(c => {
        const title = c.roomTitle && c.roomTitle.trim() ? c.roomTitle.trim() : '未知直播间';
        rooms.add(title);
    });

    // 清空现有选项（除了"全部"）
    while (roomSelect.options.length > 1) {
        roomSelect.remove(1);
    }

    // 添加新选项
    rooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room;
        option.textContent = room;
        roomSelect.appendChild(option);
    });

    // 尝试恢复选中
    if ([...rooms].includes(currentVal)) {
        roomSelect.value = currentVal;
    }
}

function applyFilters() {
    const filterRoom = roomSelect.value;
    // const filterType = typeSelect.value;
    const checkedTypes = Array.from(document.querySelectorAll('input[name="type-filter"]:checked')).map(cb => cb.value);

    const startTimeStr = startTimeInput.value;
    const endTimeStr = endTimeInput.value;
    const searchText = searchInput.value.trim().toLowerCase();
    
    const startTime = startTimeStr ? new Date(startTimeStr).getTime() : 0;
    const endTime = endTimeStr ? new Date(endTimeStr).getTime() : Infinity;

    filteredComments = allComments.filter(c => {
        // 1. 房间筛选
        const title = c.roomTitle && c.roomTitle.trim() ? c.roomTitle.trim() : '未知直播间';
        if (filterRoom !== 'ALL' && title !== filterRoom) {
            return false;
        }
        
        // 2. 类型筛选
        // if (filterType !== 'ALL' && c.type !== filterType) {
        //     return false;
        // }
        // 必须在选中的类型中
        if (!checkedTypes.includes(c.type)) {
            return false;
        }

        // 3. 时间筛选
        if (c.timestamp < startTime || c.timestamp > endTime) {
            return false;
        }

        // 3. 关键词搜索 (匹配昵称或内容)
        if (searchText) {
            const content = (c.content || "").toLowerCase();
            const nickname = (c.nickname || "").toLowerCase();
            const raw = (c.raw || "").toLowerCase();
            if (!content.includes(searchText) && !nickname.includes(searchText) && !raw.includes(searchText)) {
                return false;
            }
        }

        return true;
    });

    // 重置到第一页
    currentPage = 1;
    renderTable();
}

function renderTable() {
    // 更新统计
    statsDisplay.textContent = `共 ${filteredComments.length} 条记录 (总库: ${allComments.length})`;

    // 清空表格
    tableBody.innerHTML = '';
    
    if (filteredComments.length === 0) {
        emptyTip.style.display = 'block';
        updatePaginationControls();
        return;
    }
    emptyTip.style.display = 'none';

    // 计算分页
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, filteredComments.length);
    const pageData = filteredComments.slice(startIdx, endIdx);

    const fragment = document.createDocumentFragment();

    pageData.forEach(c => {
        const tr = document.createElement('tr');
        
        const tdTime = document.createElement('td');
        tdTime.textContent = new Date(c.timestamp).toLocaleString();
        
        const tdRoom = document.createElement('td');
        tdRoom.textContent = c.roomTitle || '未知';
        tdRoom.title = c.url; 
        
        const tdType = document.createElement('td');
        tdType.textContent = c.type === 'normal-comment' ? '评论' : 
                             (c.type === 'notify-comment' ? '通知' : 
                             (c.type === 'room-bottom-message' ? '动态' : c.type || '-'));
        
        const tdLevel = document.createElement('td');
        tdLevel.textContent = c.level || '-';
        if (c.imgs) {
            // 简单的将图片 HTML 作为 title 提示，或者这里可以尝试渲染图片，但要注意安全
            // 暂时只显示文本等级
            // tdLevel.innerHTML = c.imgs; // 如果需要显示图标，可以取消注释，但需调整 CSP
        }

        const tdNick = document.createElement('td');
        var levelimg = c.imgs || "";
        if(levelimg){
            tdNick.innerHTML = levelimg + c.nickname;
        }else{
        tdNick.textContent = c.nickname || '-';
        }
        
        const tdContent = document.createElement('td');
        tdContent.textContent = c.content  || '';
        
        if(c.contimes){
            tdContent.innerHTML += `<br/>${c.contimes}`;
        }
        
        tr.appendChild(tdTime);
        tr.appendChild(tdRoom);
        tr.appendChild(tdType);
        //tr.appendChild(tdLevel);
        tr.appendChild(tdNick);
        tr.appendChild(tdContent);
        tr.dataset.data = JSON.stringify(c); // 方便后续扩展使用
        
        fragment.appendChild(tr);
    });

    tableBody.appendChild(fragment);
    
    // 渲染分页控件
    updatePaginationControls();
}

function updatePaginationControls() {
    const totalCount = filteredComments.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
    
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}
