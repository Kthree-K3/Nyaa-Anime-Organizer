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
const statusBadge = document.getElementById('status-badge');
const langFilter = document.getElementById('langFilter');

function log(msg, type = 'info') {
    const colors = { error: '#f87171', success: '#4ade80', info: '#94a3b8' };
    const div = document.createElement('div');
    div.style.color = colors[type];
    div.innerHTML = `> [${new Date().toLocaleTimeString()}] ${msg}`;
    debugConsole.appendChild(div);
    debugConsole.scrollTop = debugConsole.scrollHeight;
    statusBadge.innerText = msg;
}

// ================= بخش جستجو =================

searchInput.oninput = function() {
    const query = this.value.toLowerCase();
    clearSearch.style.display = query ? 'block' : 'none';
    const cards = document.querySelectorAll('.anime-card');
    cards.forEach(card => {
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

// ================= الگوریتم نام پوشه (فقط حذف کروشه‌ها) =================

function cleanTitle(raw) {
    let name = raw.trim();

    // ۱. فقط و فقط حذف تمام محتوای داخل کروشه []
    name = name.replace(/\[.*?\]/g, '');

    // ۲. تبدیل تمام نقطه‌ها به فاصله (به جز پسوند فایل)
    name = name.replace(/\.(?!(mkv|mp4|avi|ts|zip|rar)$)/gi, ' ');

    /**
     * ۳. پیدا کردن اولین نشانگر توقف (Stop Markers)
     */
    const stopMarkers = [
        /\s-\s\d+/i,            // " - 06"
        /\sS\d+E\d+/i,          // " S02E06"
        /\sS\d+\s?-\s?\d+/i,    // " S2 - 06"
        /\s\d+(st|nd|rd|th)\sSeason/i, // " 2nd Season"
        /\sSeason\s\d+/i,       // " Season 02"
        /\sEp\s?\d+/i,          // " Ep 01"
        /\s\d{2,}\s/            // عدد دو رقمی مجزا
    ];

    let firstMatchIndex = name.length;
    stopMarkers.forEach(pattern => {
        const match = name.match(pattern);
        if (match && match.index < firstMatchIndex) {
            firstMatchIndex = match.index;
        }
    });

    // برش نام قبل از اولین مارکر
    let cleaned = name.substring(0, firstMatchIndex).trim();

    // ۴. تمیزکاری نهایی کاراکترهای مزاحم در انتهای نام
    cleaned = cleaned.replace(/[:\-~]+$/, '').trim();

    return cleaned || "Unknown Anime";
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
    const days = parseInt(document.getElementById('dateRange').value);
    const filterEng = langFilter.checked;

    btnScan.disabled = true;
    searchInput.disabled = true;
    btnIcon.classList.add('spinning');
    btnText.innerText = "Scanning...";
    grid.innerHTML = '';
    log(`Starting scan (Category: Anime, EngOnly: ${filterEng})...`, 'info');

    let collectedData = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let page = 1;
    let keepScanning = true;

    try {
        while (keepScanning) {
            log(`Fetching page ${page}...`);
            // آدرس اختصاصی انیمه
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

                // فیلتر زبان
                if (filterEng && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(rawTitle)) {
                    continue;
                }

                let status = 'normal';
                if (tr.classList.contains('success')) status = 'trusted';
                if (tr.classList.contains('danger')) status = 'remake';

                collectedData.push({
                    rawTitle: rawTitle,
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
        searchInput.disabled = false;
    } catch (e) {
        log(`Error: ${e.message}`, 'error');
    } finally {
        btnScan.disabled = false;
        btnIcon.classList.remove('spinning');
        btnText.innerText = "Start scanning";
    }
}

// ================= گروه‌بندی و سورت دوطرفه =================

function organizeGroups(data) {
    allGroups = [];
    data.forEach(item => {
        let g = allGroups.find(x => getSimilarity(x.name, item.cleanName) > SIMILARITY_THRESHOLD);
        if (g) {
            g.items.push(item);
        } else {
            allGroups.push({ 
                name: item.cleanName, 
                items: [item],
                currentSort: 'date',
                isAsc: false 
            });
        }
    });
    allGroups.sort((a,b) => b.items[0].fullDate - a.items[0].fullDate);
}

window.sortItems = function(groupIndex, criteria) {
    const group = allGroups[groupIndex];
    if (group.currentSort === criteria) {
        group.isAsc = !group.isAsc;
    } else {
        group.currentSort = criteria;
        group.isAsc = (criteria === 'name'); 
    }

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
    const btns = document.querySelectorAll(`#ep-${idx} .sort-btn`);
    btns.forEach(btn => {
        const criteria = btn.getAttribute('data-sort');
        const icon = btn.querySelector('.dir-icon');
        if (criteria === group.currentSort) {
            btn.classList.add('active');
            icon.className = group.isAsc ? 'fas fa-sort-up dir-icon' : 'fas fa-sort-down dir-icon';
        } else {
            btn.classList.remove('active');
            icon.className = 'fas fa-sort dir-icon';
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
                    <button class="sort-btn active" data-sort="date" onclick="sortItems(${i}, 'date')">
                        Date <i class="fas fa-sort-down dir-icon"></i>
                    </button>
                    <button class="sort-btn" data-sort="size" onclick="sortItems(${i}, 'size')">
                        Size <i class="fas fa-sort dir-icon"></i>
                    </button>
                    <button class="sort-btn" data-sort="name" onclick="sortItems(${i}, 'name')">
                        Name <i class="fas fa-sort dir-icon"></i>
                    </button>
                </div>
                <div id="ep-list-${i}">
                    ${renderEpisodeItems(g.items)}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function toggleCard(id) {
    const el = document.getElementById(`ep-${id}`);
    const isVisible = window.getComputedStyle(el).display === 'block';
    el.style.display = isVisible ? 'none' : 'block';
}