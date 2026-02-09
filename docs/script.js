// ================= تنظیمات اصلی =================
const MY_WORKER_URL = "https://nyaa-k3.khalilkhko.workers.dev";
const TARGET_DOMAIN = "https://nyaa.land"; 
const SIMILARITY_THRESHOLD = 0.5; 

let allGroups = []; 

const btnScan = document.getElementById('btnScan');
const btnIcon = document.getElementById('scan-icon');
const btnText = document.getElementById('btnText');
const grid = document.getElementById('anime-list');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const debugConsole = document.getElementById('debug-console');
const langFilter = document.getElementById('langFilter');

function log(msg, type = 'info') {
    const colors = { error: '#f87171', success: '#4ade80', info: '#94a3b8' };
    const div = document.createElement('div');
    div.style.color = colors[type];
    div.innerHTML = `> [${new Date().toLocaleTimeString()}] ${msg}`;
    debugConsole.appendChild(div);
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

// ================= بخش جستجو =================
searchInput.oninput = function() {
    const query = this.value.toLowerCase();
    clearSearch.style.display = query ? 'block' : 'none';
    document.querySelectorAll('.anime-card').forEach(card => {
        const title = card.getAttribute('data-title').toLowerCase();
        card.style.display = title.includes(query) ? 'block' : 'none';
    });
};

clearSearch.onclick = function() {
    searchInput.value = '';
    this.style.display = 'none';
    document.querySelectorAll('.anime-card').forEach(c => c.style.display = 'block');
    searchInput.focus();
};

// ================= الگوریتم نام پوشه =================
function cleanTitle(raw) {
    let name = raw.trim();
    name = name.replace(/\[.*?\]/g, '');
    name = name.replace(/\.(?!(mkv|mp4|avi|ts|zip|rar)$)/gi, ' ');

    const stopMarkers = [
        /\s-\s\d+/i, /\sS\d+E\d+/i, /\sS\d+\s?-\s?\d+/i, 
        /\s\d+(st|nd|rd|th)\sSeason/i, /\sSeason\s\d+/i, 
        /\sEp\s?\d+/i, /\s\d{2,}\s/
    ];

    let firstMatchIndex = name.length;
    stopMarkers.forEach(pattern => {
        const match = name.match(pattern);
        if (match && match.index < firstMatchIndex) firstMatchIndex = match.index;
    });

    return name.substring(0, firstMatchIndex).trim().replace(/[:\-~]+$/, '').trim() || "Unknown";
}

function sizeToBytes(sizeStr) {
    const units = { 'KiB': 1024, 'MiB': 1024**2, 'GiB': 1024**3, 'TiB': 1024**4 };
    const match = sizeStr.match(/^([\d.]+)\s*([a-zA-Z]+)/);
    if (!match) return 0;
    return parseFloat(match[1]) * (units[match[2]] || 1);
}

function getSimilarity(s1, s2) {
    const n1 = s1.toLowerCase(), n2 = s2.toLowerCase();
    const pairs = s => {
        const res = new Set();
        for(let i=0; i<s.length-1; i++) res.add(s.substr(i,2));
        return res;
    };
    const p1 = pairs(n1), p2 = pairs(n2);
    let inter = 0;
    p1.forEach(p => { if(p2.has(p)) inter++; });
    return (2 * inter) / (p1.size + p2.size);
}

// ================= عملیات اسکن اصلی =================
btnScan.onclick = startScanner;

async function startScanner() {
    const rangeMode = document.getElementById('dateRange').value;
    const isEnglishOnly = langFilter.checked;

    btnScan.disabled = true;
    searchInput.disabled = true;
    btnIcon.classList.add('spinning');
    btnText.innerText = "Scanning...";
    grid.innerHTML = '';
    
    const cutoffDate = new Date();
    if (rangeMode === '24h') {
        cutoffDate.setHours(cutoffDate.getHours() - 24);
    } else if (rangeMode === 'today') {
        cutoffDate.setHours(0, 0, 0, 0);
    } else if (rangeMode === '2d') {
        cutoffDate.setDate(cutoffDate.getDate() - 1);
        cutoffDate.setHours(0, 0, 0, 0);
    } else if (rangeMode === '3d') {
        cutoffDate.setDate(cutoffDate.getDate() - 2);
        cutoffDate.setHours(0, 0, 0, 0);
    }

    log(`Initializing scan. Cutoff: ${cutoffDate.toLocaleString()}`, 'info');

    let collectedData = [];
    let page = 1;
    let keepScanning = true;

    try {
        while (keepScanning) {
            log(`Fetching page ${page}...`);
            const response = await fetch(`${MY_WORKER_URL}/?f=0&c=1_0&p=${page}`);
            if(!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const htmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const rows = doc.querySelectorAll('tr.default, tr.success, tr.danger, tr.info');

            if (rows.length === 0) break;

            let count = 0;
            for (let tr of rows) {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 5) continue;
                const timestamp = tds[4].getAttribute('data-timestamp');
                const itemDate = new Date(timestamp * 1000);

                if (itemDate < cutoffDate) {
                    if (!tr.classList.contains('success')) keepScanning = false;
                    continue;
                }

                const links = tds[1].querySelectorAll('a:not(.comments)');
                const linkEl = links.item(links.length - 1);
                const rawTitle = linkEl.innerText.trim();

                if (isEnglishOnly && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(rawTitle)) {
                    continue;
                }

                let status = 'normal';
                if (tr.classList.contains('success')) status = 'trusted';
                if (tr.classList.contains('danger')) status = 'remake';

                collectedData.push({
                    rawTitle,
                    cleanName: cleanTitle(rawTitle),
                    link: TARGET_DOMAIN + linkEl.getAttribute('href'),
                    magnet: tds[2].querySelector('a[href^="magnet:"]')?.getAttribute('href') || '',
                    size: tds[3].innerText.trim(),
                    sizeBytes: sizeToBytes(tds[3].innerText.trim()),
                    date: tds[4].innerText.trim(),
                    fullDate: itemDate,
                    status: status 
                });
                count++;
            }
            log(`Page ${page}: Found ${count} items.`, 'success');
            if (!keepScanning || count === 0) break;
            page++;
            await new Promise(r => setTimeout(r, 1200));
        }

        organizeGroups(collectedData);
        renderUI();
        log("Task Complete.", 'success');
        searchInput.disabled = false;
    } catch (e) {
        log(`Error: ${e.message}`, 'error');
    } finally {
        btnScan.disabled = false;
        btnIcon.classList.remove('spinning');
        btnText.innerText = "Start scanning";
    }
}

function organizeGroups(data) {
    allGroups = [];
    data.forEach(item => {
        let g = allGroups.find(x => getSimilarity(x.name, item.cleanName) > SIMILARITY_THRESHOLD);
        if (g) g.items.push(item);
        else allGroups.push({ name: item.cleanName, items: [item], currentSort: 'date', isAsc: false });
    });
    allGroups.sort((a,b) => b.items[0].fullDate - a.items[0].fullDate);
}

window.sortItems = function(groupIndex, criteria) {
    const group = allGroups[groupIndex];
    if (group.currentSort === criteria) group.isAsc = !group.isAsc;
    else { group.currentSort = criteria; group.isAsc = (criteria === 'name'); }

    const asc = group.isAsc ? 1 : -1;
    group.items.sort((a, b) => {
        if (criteria === 'date') return (a.fullDate - b.fullDate) * asc;
        if (criteria === 'size') return (a.sizeBytes - b.sizeBytes) * asc;
        if (criteria === 'name') return a.rawTitle.localeCompare(b.rawTitle) * asc;
        return 0;
    });
    document.getElementById(`ep-list-${groupIndex}`).innerHTML = renderEpisodeItems(group.items);
    updateSortBarUI(groupIndex);
};

function updateSortBarUI(idx) {
    const group = allGroups[idx];
    document.querySelectorAll(`#ep-${idx} .sort-btn`).forEach(btn => {
        const criteria = btn.getAttribute('data-sort');
        if (!criteria) return; // نادیده گرفتن دکمه گوگل
        const icon = btn.querySelector('.dir-icon');
        if (criteria === group.currentSort) {
            btn.classList.add('active');
            if(icon) icon.className = group.isAsc ? 'fas fa-sort-up dir-icon' : 'fas fa-sort-down dir-icon';
        } else {
            btn.classList.remove('active');
            if(icon) icon.className = 'fas fa-sort dir-icon';
        }
    });
}

function renderEpisodeItems(items) {
    return items.map(item => `
        <div class="episode-item is-${item.status}">
            <div class="ep-info">
                <span class="ep-raw-title" title="${item.rawTitle}">${item.rawTitle}</span>
                <div class="ep-meta">
                    <i class="fas fa-weight-hanging"></i> <b>${item.size}</b> &nbsp;&nbsp; 
                    <i class="far fa-clock"></i> <b>${item.date}</b>
                </div>
            </div>
            <div class="ep-actions">
                ${item.magnet ? `<a href="${item.magnet}" class="btn-magnet" title="Magnet Link"><i class="fas fa-magnet"></i></a>` : ''}
                <a href="${item.link}" target="_blank" class="btn-link" title="Nyaa Link"><i class="fas fa-external-link-alt"></i> Nyaa</a>
            </div>
        </div>
    `).join('');
}

function renderUI() {
    grid.innerHTML = '';
    allGroups.forEach((g, i) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.setAttribute('data-title', g.name);
        card.innerHTML = `
            <div class="anime-header" onclick="toggleCard(${i})">
                <span class="anime-title">${g.name}</span>
                <div style="display:flex; align-items:center; gap:10px">
                    <span class="badge">${g.items.length} Files</span>
                    <i class="fas fa-chevron-down" style="color:var(--text-dim); font-size:0.8rem"></i>
                </div>
            </div>
            <div id="ep-${i}" class="episodes-list ltr-content">
                <div class="sort-bar">
                    <span style="margin-right:5px">Sort:</span>
                    <button class="sort-btn active" data-sort="date" onclick="sortItems(${i}, 'date')">Date <i class="fas fa-sort-down dir-icon"></i></button>
                    <button class="sort-btn" data-sort="size" onclick="sortItems(${i}, 'size')">Size <i class="fas fa-sort dir-icon"></i></button>
                    <button class="sort-btn" data-sort="name" onclick="sortItems(${i}, 'name')">Name <i class="fas fa-sort dir-icon"></i></button>
                    <!-- دکمه گوگل رنگی شده -->
                   <button class="sort-btn" style="margin-left:auto; font-weight:800; border-color:rgba(255,255,255,0.1)" onclick="event.stopPropagation(); window.open('https://www.google.com/search?q=' + encodeURIComponent('${g.name.replace(/'/g, "\\'")}'), '_blank')"><span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span></button>
                </div>
                <div id="ep-list-${i}">${renderEpisodeItems(g.items)}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function toggleCard(id) {
    const el = document.getElementById(`ep-${id}`);
    el.style.display = (window.getComputedStyle(el).display === 'block') ? 'none' : 'block';
}