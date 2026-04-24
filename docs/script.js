// ================= تنظیمات اصلی ==================
const MY_WORKER_URL = "https://nyaa-proxy-zeta.vercel.app";
const TARGET_DOMAIN = "https://nyaa-proxy-zeta.vercel.app";  
const Nyaa_DOMAIN = "https://nyaa.si"; 
const SIMILARITY_THRESHOLD = 0.6; 

let allGroups = []; 
let isScanning = false;
let allFetchedData = [];
let scanAbortController = null;

const btnScan = document.getElementById('btnScan');
const btnIcon = document.getElementById('scan-icon');
const btnText = document.getElementById('btnText');
const grid = document.getElementById('anime-list');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const debugConsole = document.getElementById('debug-console');


// متغیرهای جدید برای My Anime List
const btnOpenMyList = document.getElementById('btnOpenMyList');
const modal = document.getElementById('myListModal');
const btnCloseMyList = document.getElementById('btnCloseMyList');
const btnSaveMyList = document.getElementById('btnSaveMyList');
const myListFilter = document.getElementById('myListFilter');

// متغیرهای بخش جستجو و لیست هوشمند
const myListSearchInput = document.getElementById('myListSearchInput');
const btnSearchForList = document.getElementById('btnSearchForList');
const myListSearchResults = document.getElementById('myListSearchResults');
const myListContainer = document.getElementById('myListContainer');

const clearMyListSearch = document.getElementById('clearMyListSearch');

// منطق دکمه پاکسازی در لیست من
myListSearchInput.oninput = function() {
    clearMyListSearch.style.display = this.value ? 'block' : 'none';
};

clearMyListSearch.onclick = function() {
    myListSearchInput.value = '';
    this.style.display = 'none';
    myListSearchResults.style.display = 'none';
    myListSearchInput.focus();
};

// لود کردن دیتای ذخیره شده
let mySavedList = JSON.parse(localStorage.getItem('mySmartAnimeList') || "[]");

function log(msg, type = 'info') {
    const colors = { error: '#f87171', success: '#4ade80', info: '#94a3b8' };
    const div = document.createElement('div');
    div.style.color = colors[type];
    div.innerHTML = `> [${new Date().toLocaleTimeString()}] ${msg}`;
    debugConsole.appendChild(div);
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

searchInput.oninput = function() {
    const query = this.value.toLowerCase().trim();
    clearSearch.style.display = query.length > 0 ? 'block' : 'none';
    const cards = document.querySelectorAll('.anime-card');

    if (query.length === 0) {
        cards.forEach(card => {
            card.style.display = '';
            const list = card.querySelector('.episodes-list');
            if (list) list.style.display = 'none';
            card.querySelectorAll('.episode-item').forEach(item => item.style.display = '');
        });
        return;
    }

    cards.forEach(card => {
        const listContainer = card.querySelector('.episodes-list');
        const items = card.querySelectorAll('.episode-item');
        let hasMatch = false;

        items.forEach(item => {
            const titleEl = item.querySelector('.ep-raw-title');
            const text = titleEl ? titleEl.textContent.toLowerCase() : '';
            
            if (text.includes(query)) {
                item.style.display = '';
                hasMatch = true;
            } else {
                item.style.display = 'none';
            }
        });

        if (hasMatch) {
            card.style.display = '';
            if (listContainer) listContainer.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
};

clearSearch.onclick = function() {
    searchInput.value = '';
    this.style.display = 'none';
    
    document.querySelectorAll('.anime-card').forEach(card => {
        card.style.display = '';
        const list = card.querySelector('.episodes-list');
        if (list) list.style.display = 'none';
        card.querySelectorAll('.episode-item').forEach(item => item.style.display = '');
    });
    
    searchInput.focus();
};

// مدیریت کلیک روی صفحه برای بستن هر دو مودال
window.onclick = function(event) {
    const infoModal = document.getElementById('animeInfoModal');
    if (event.target == modal) {
        modal.style.display = "none";
        myListSearchResults.style.display = 'none';
    }
    if (event.target == infoModal) {
        infoModal.style.display = "none";
    }
}

// ================= الگوریتم نام پوشه =================
function cleanTitle(raw) {
    let name = raw.trim();
    
    // 1. حذف محتویات داخل براکت []
    name = name.replace(/\[.*?\]/g, '');
    
    // 2. حذف مطلق تمام پرانتزها و محتویات داخلشان ()
    name = name.replace(/(\s\(.*?\))\s.*/, '$1');
    name = name.replace(/\(.*?\)/g, '');
    
    // 3. تبدیل نقطه و آندرلاین به فاصله
    name = name.replace(/[._](?!(mkv|mp4|avi|ts|zip|rar)$)/gi, ' ');

    const stopMarkers = [
        /\sEpisode\s?\d+/i,
        /\s-\s\d+/i, /\sS\d+E\d+/i, /\sS\d+\s?-\s?\d+/i, 
        /\s\d+(st|nd|rd|th)\sSeason/i, /\sSeason\s\d+/i, 
        /\sEp\s?\d+/i, /\s\d{2,}\s/,
        /\sS\d+/i, 
        /\sE\d+/i   
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

// ================= منطق مدیریت لیست هوشمند (Smart Watchlist Logic) =================

myListFilter.onchange = function() {
    refreshData();
};

btnOpenMyList.onclick = function() {
    modal.style.display = "block";
    renderMySavedList();
    myListSearchInput.focus();

    // بررسی وجود فیلتر در بخش لیست من
    let myListSort = document.getElementById('myListSortSelect');
    if (!myListSort) {
        // پیدا کردن محل قرارگیری (کنار دکمه سرچ)
        const searchWrapper = document.querySelector('#myListModal .search-wrapper');
        const searchBtn = document.getElementById('btnSearchForList');

        myListSort = document.createElement('select');
        myListSort.id = 'myListSortSelect';
        myListSort.className = 'res-filter';
        // کمی فاصله از چپ و راست
        myListSort.style.margin = '0 5px';
        
        myListSort.innerHTML = `
            <option value="START_DATE_DESC" selected>Date</option>
            <option value="POPULARITY_DESC">Popularity</option>
        `;
        
        // اگر متنی نوشته شده بود و فیلتر تغییر کرد، دوباره سرچ کن
        myListSort.onchange = () => {
            if(myListSearchInput.value.trim()) {
                searchAniListForAdd(myListSearchInput.value);
            }
        };
        
        // اضافه کردن قبل از دکمه + (Search)
        searchWrapper.insertBefore(myListSort, searchBtn);
    } else {
        // ریست به پیش‌فرض
        myListSort.value = "START_DATE_DESC";
    }
};

btnCloseMyList.onclick = function() {
    modal.style.display = "none";
    myListSearchResults.style.display = 'none';
};

// افزودن انیمه با استخراج خودکار کلمات کلیدی
function addToMyList(anime) {
    if (mySavedList.some(x => x.id === anime.id)) return;

    // بدون هیچ تمیزکاری؛ دقیقاً همان متنی که از AniList آمده استفاده می‌شود.
    const eng = anime.english || "";
    const rom = anime.romaji || "";
    
    const keywordSet = new Set();
    if (eng.trim()) keywordSet.add(eng);
    if (rom.trim()) keywordSet.add(rom);
    
    mySavedList.unshift({
        id: anime.id,
        english: anime.english,
        romaji: anime.romaji,
        cover: anime.cover,
        keywords: Array.from(keywordSet).join('\n')
    });
    
    localStorage.setItem('mySmartAnimeList', JSON.stringify(mySavedList));
    renderMySavedList();
}

// نمایش لیست با قابلیت ویرایش و نمایش تگ‌ها
function renderMySavedList() {
    myListContainer.innerHTML = '';
    if (mySavedList.length === 0) {
        myListContainer.innerHTML = '<div style="color:gray; grid-column:1/-1; text-align:center; padding:20px;">List is empty. Search to add.</div>';
        return;
    }
   mySavedList.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'saved-item';
        const keywords = item.keywords || ''; 
        div.innerHTML = `
            <img src="${item.cover}" onclick="openAnimeInfoById(${item.id})" title="View Details">
            <div class="saved-item-info" id="view-mode-${index}" style="display:flex; flex-direction:column; flex:1;">
                <!-- عنوان کلیک‌خور برای باز کردن مشخصات -->
                <span class="saved-item-title" onclick="openAnimeInfoById(${item.id})">${item.romaji}</span>
                
                <!-- فقط کلیک روی کادر کلیدواژه ویرایش را باز می‌کند -->
                <div class="keywords-area" onclick="toggleEditKeywords(${index}, true)" title="One keyword per line. Each line will be used to match torrent titles">
                    ${keywords.split('\n').filter(k => k).join(', ')}
                </div>
            </div>
            <div class="edit-keywords-box" id="edit-mode-${index}">
                <textarea id="input-keywords-${index}" placeholder="Keywords (one per line)...">${keywords}</textarea>
                <div class="edit-actions">
                    <button class="btn-edit-save" onclick="saveKeywords(${index})" title="Save Changes"><i class="fas fa-check-circle"></i></button>
                    <button class="btn-edit-cancel" onclick="toggleEditKeywords(${index}, false)" title="Cancel"><i class="fas fa-times-circle"></i></button>
                </div>
            </div>
            <button class="btn-remove-item" onclick="removeFromMyList(${index})"><i class="fas fa-times"></i></button>
        `;
        myListContainer.appendChild(div);
    });
}

// سوییچ بین نمایش و ویرایش
// سوییچ بین نمایش و ویرایش با قابلیت ریست کردن متن در صورت انصراف
window.toggleEditKeywords = function(index, isEdit) {
    const viewEl = document.getElementById(`view-mode-${index}`);
    const editEl = document.getElementById(`edit-mode-${index}`);
    const textarea = document.getElementById(`input-keywords-${index}`);

    if (viewEl && editEl && textarea) {
        if (!isEdit) {
            // اگر دکمه انصراف زده شد، متن باکس را به مقدار اصلی برگردان
            textarea.value = mySavedList[index].keywords;
        }
        
        viewEl.style.display = isEdit ? 'none' : 'flex';
        editEl.style.display = isEdit ? 'block' : 'none';
        
        if (isEdit) textarea.focus();
    }
};


window.saveKeywords = function(index) {
    const textarea = document.getElementById(`input-keywords-${index}`);
    const value = textarea.value;
    
    // فقط فضای خالی ابتدا و انتها حذف می‌شود، هیچ جایگزینی کاراکتری انجام نمی‌شود.
    mySavedList[index].keywords = value.trim();
    localStorage.setItem('mySmartAnimeList', JSON.stringify(mySavedList));
    
    renderMySavedList();
};

window.removeFromMyList = function(index) {
    mySavedList.splice(index, 1);
    localStorage.setItem('mySmartAnimeList', JSON.stringify(mySavedList));
    renderMySavedList();
};

btnSearchForList.onclick = () => searchAniListForAdd(myListSearchInput.value);
myListSearchInput.onkeypress = (e) => { if (e.key === 'Enter') searchAniListForAdd(myListSearchInput.value); };

// جستجو با نمایش دوخطی و بستن خودکار باکس نتایج
async function searchAniListForAdd(query) {
    if (!query.trim()) return;
    
    // گرفتن مقدار فیلتر مربوط به این مودال
    const sortSelect = document.getElementById('myListSortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'START_DATE_DESC';

    myListSearchResults.style.display = 'block';
    clearMyListSearch.style.display = 'block';
    myListSearchResults.innerHTML = '<div style="padding:10px; color:gray;">Searching...</div>';

    // کوئری با پشتیبانی از $sort
    const gql = `query ($s: String, $sort: [MediaSort]) { Page(perPage: 10) { media(search: $s, type: ANIME, sort: $sort) { id title { romaji english } coverImage { medium } } } }`;
    
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: gql, variables: { s: query, sort: sortValue } })
        });
        const json = await res.json();
        myListSearchResults.innerHTML = '';
        
        if (!json.data.Page.media.length) {
            myListSearchResults.innerHTML = '<div style="padding:10px;">No results found.</div>';
            return;
        }

        json.data.Page.media.forEach(anime => {
            const div = document.createElement('div');
            div.className = 'add-item-row';
            const engTitle = anime.title.english || "";
            div.innerHTML = `
                <img src="${anime.coverImage.medium}" class="add-item-img">
                <div class="add-item-info-search">
                    <span class="add-item-romaji">${anime.title.romaji}</span>
                    <span class="add-item-english">${engTitle}</span>
                </div>`;
            
            div.onclick = () => {
                addToMyList({
                    id: anime.id,
                    english: anime.title.english || "",
                    romaji: anime.title.romaji,
                    cover: anime.coverImage.medium
                });
                myListSearchInput.value = '';
                myListSearchResults.style.display = 'none';
                clearMyListSearch.style.display = 'none';
            };
            myListSearchResults.appendChild(div);
        });
    } catch (e) { 
        myListSearchResults.innerHTML = '<div style="padding:10px; color:red;">Error fetching data.</div>'; 
    }
}

// ================= منطق Export و Import لیست انیمه‌ها =================

const btnExportList = document.getElementById('btnExportList');
const btnImportList = document.getElementById('btnImportList');
const importFileInput = document.getElementById('importFileInput');

// خروجی گرفتن از لیست به صورت فایل JSON
btnExportList.onclick = function() {
    if (mySavedList.length === 0) {
        alert("Your list is empty!");
        return;
    }
    const dataStr = JSON.stringify(mySavedList, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `my_anime_list_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    log("List exported to JSON file.", "success");
};

// باز کردن پنجره انتخاب فایل برای ایمپورت
btnImportList.onclick = () => importFileInput.click();

// خواندن فایل و جایگزینی در دیتابیس محلی
importFileInput.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                if (confirm(`Import ${importedData.length} items? This will replace your current list.`)) {
                    mySavedList = importedData;
                    localStorage.setItem('mySmartAnimeList', JSON.stringify(mySavedList));
                    renderMySavedList();
                    log("List imported successfully.", "success");
                }
            } else {
                throw new Error("Invalid file format.");
            }
        } catch (err) {
            alert("Error: The file is not a valid JSON list.");
            log("Import failed: Invalid JSON.", "error");
        }
    };
    reader.readAsText(file);
    // ریست کردن ورودی فایل برای استفاده‌های بعدی
    this.value = '';
};

// ================= عملیات اسکن اصلی (یکپارچه با لیست هوشمند) =================
// تابع کمکی برای بازگرداندن سریع ظاهر دکمه به حالت اول
function resetScanUI() {
    isScanning = false;
    scanAbortController = null;
    btnScan.disabled = false;
    btnScan.classList.remove('btn-danger');
    btnIcon.classList.remove('spinning');
    btnText.innerText = "Start scanning";
    searchInput.disabled = false;
}

async function startScanner() {
    // ۱. اگر در حال اسکن بود، بلافاصله ظاهر را ریست کن و درخواست را قطع کن
    if (isScanning) { 
        log("Stopping scan immediately...", "error"); 
        if (scanAbortController) scanAbortController.abort(); 
        resetScanUI(); // ریست آنی ظاهر دکمه بدون معطلی
        return; 
    }

    isScanning = true;
    scanAbortController = new AbortController();
    
    const rangeMode = document.getElementById('dateRange').value;
    
    // تنظیمات ظاهری شروع اسکن
    btnScan.disabled = false;
    searchInput.disabled = true;
    btnIcon.classList.add('spinning');
    btnText.innerText = "Stop scanning";
    btnScan.classList.add('btn-danger');
    grid.innerHTML = '';
    
    const cutoffDate = new Date();
    if (rangeMode === '24h') cutoffDate.setHours(cutoffDate.getHours() - 24);
    else if (rangeMode === 'today') cutoffDate.setHours(0, 0, 0, 0);
    else if (rangeMode === '2d') { cutoffDate.setDate(cutoffDate.getDate() - 1); cutoffDate.setHours(0, 0, 0, 0); }
    else if (rangeMode === '3d') { cutoffDate.setDate(cutoffDate.getDate() - 2); cutoffDate.setHours(0, 0, 0, 0); }
    else if (rangeMode === '4d') { cutoffDate.setDate(cutoffDate.getDate() - 3); cutoffDate.setHours(0, 0, 0, 0); }
    else if (rangeMode === '5d') { cutoffDate.setDate(cutoffDate.getDate() - 4); cutoffDate.setHours(0, 0, 0, 0); }
    else if (rangeMode === '6d') { cutoffDate.setDate(cutoffDate.getDate() - 5); cutoffDate.setHours(0, 0, 0, 0); }
    else if (rangeMode === '7d') { cutoffDate.setDate(cutoffDate.getDate() - 6); cutoffDate.setHours(0, 0, 0, 0); }

    log(`Initializing scan. Cutoff: ${cutoffDate.toLocaleString()}`, 'info');

    allFetchedData = []; 
    let page = 1;
    let keepScanning = true;

    try {
        while (keepScanning && isScanning) {
            log(`Fetching page ${page}...`);
            
            const response = await fetch(`${MY_WORKER_URL}/?c=1_2&p=${page}`, {
                signal: scanAbortController.signal
            });
            
            const htmlText = await response.text();
            if (!isScanning) break;

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const rows = doc.querySelectorAll('tr.default, tr.success, tr.danger, tr.info');
            if (rows.length === 0) break;

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
                const lowerRawTitle = rawTitle.toLowerCase();

                let matchedId = null;
                if (mySavedList.length > 0) {
                    const matchedAnime = mySavedList.find(anime => {
                        const keywordList = anime.keywords.toLowerCase().split('\n').filter(k => k.trim() !== "");
                        return keywordList.some(keyword => getSimilarity(cleanTitle(rawTitle), cleanTitle(keyword)) > SIMILARITY_THRESHOLD);
                    });
                    if (matchedAnime) matchedId = matchedAnime.id;
                }

                let status = tr.classList.contains('success') ? 'trusted' : (tr.classList.contains('danger') ? 'remake' : 'normal');

                allFetchedData.push({
                    rawTitle,
                    cleanName: cleanTitle(rawTitle),
                    watchlistId: matchedId,
                    link: TARGET_DOMAIN + linkEl.getAttribute('href'),
                    magnet: tds[2].querySelector('a[href^="magnet:"]')?.getAttribute('href') || '',
                    size: tds[3].innerText.trim(),
                    sizeBytes: sizeToBytes(tds[3].innerText.trim()),
                    date: new Date(timestamp * 1000).toLocaleString('sv').substring(0, 16),
                    fullDate: itemDate,
                    status: status,
                    seeds: tds[5].innerText.trim(), 
                    peers: tds[6].innerText.trim()
                });
            }
            log(`Page ${page}: Done.`, 'success');
            if (!keepScanning || !isScanning) break;
            page++;
            
            // وقفه ۱.۲ ثانیه‌ای قابل قطع شدن
            await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, 1200);
                if (scanAbortController) {
                    scanAbortController.signal.addEventListener('abort', () => {
                        clearTimeout(t);
                        reject(new Error('AbortError'));
                    });
                }
            });
        }
        
        refreshData();
        log(isScanning ? "Task Complete." : "Scan aborted by user.", isScanning ? 'success' : 'info');

    } catch (e) {
        if (e.name === 'AbortError' || e.message === 'AbortError') {
            log("Scan aborted by user.", "info");
        } else {
            log(`Error: ${e.message}`, 'error');
        }
    } finally {
        // ریست نهایی برای اطمینان در صورت اتمام طبیعی اسکن
        resetScanUI();
    }
}

// تابع جدید: اعمال فیلتر و بازسازی گروه‌ها بدون اسکن مجدد
function refreshData() {
    // اگر داده‌ای دانلود نشده، کاری نکن
    if (allFetchedData.length === 0) return;

    const isMyListEnabled = myListFilter.checked;
    let dataProcess = [];

    if (isMyListEnabled) {
        // اگر فیلتر روشن است، فقط آنهایی که در لیست هستند (watchlistId دارند) را جدا کن
        dataProcess = allFetchedData.filter(item => item.watchlistId !== null);
    } else {
        // اگر فیلتر خاموش است، همه داده‌های دانلود شده را نشان بده
        dataProcess = allFetchedData;
    }
    
    // ارسال داده‌های فیلتر شده به تابع گروه‌بندی
    organizeGroups(dataProcess);
    
    // بازسازی ظاهر گرافیکی
    renderUI();
}

function organizeGroups(data) {
    allGroups = [];
    
    data.forEach(item => {
        let g;

        // گام ۱: پیدا کردن گروه
        // اگر شناسه لیست دارد، فقط با شناسه پیدا کن (ادغام نام‌های مختلف یک انیمه)
        if (item.watchlistId) {
            g = allGroups.find(x => x.watchlistId === item.watchlistId);
        }

        // اگر شناسه ندارد (یا پیدا نشد)، با روش قدیمی شباهت اسم پیدا کن
        if (!g) {
            g = allGroups.find(x => !x.watchlistId && getSimilarity(x.name, item.cleanName) > SIMILARITY_THRESHOLD);
        }

        if (g) {
            g.items.push(item);
        } else {
            // ساخت گروه جدید (نام موقت می‌گذاریم، پایین اصلاح می‌شود)
            allGroups.push({ 
                name: item.cleanName, 
                watchlistId: item.watchlistId || null,
                items: [item], 
                currentSort: 'date', 
                isAsc: false,
                currentRes: 'ALL' 
            });
        }
    });

    // گام ۲: تعیین نام نهایی پوشه بر اساس "پرتکرارترین نام"
    allGroups.forEach(group => {
        const nameCounts = {};
        let maxCount = 0;
        let bestName = group.name; // نام پیش‌فرض

        // شمارش تمام نام‌های تمیز شده‌ی داخل این گروه
        group.items.forEach(item => {
            const n = item.cleanName;
            nameCounts[n] = (nameCounts[n] || 0) + 1;
            
            if (nameCounts[n] > maxCount) {
                maxCount = nameCounts[n];
                bestName = n;
            }
        });

        // نام گروه می‌شود همان نامی که بیشترین تکرار را داشته
        group.name = bestName;
    });

    // مرتب‌سازی گروه‌ها بر اساس تاریخ جدیدترین آیتم
    allGroups.sort((a,b) => b.items[0].fullDate - a.items[0].fullDate);
}

// تابع جدید با پشتیبانی از مرتب‌سازی بر اساس نام
window.sortItems = function(idx, criteria) {
    const g = allGroups[idx];
    if (g.currentSort === criteria) {
        g.isAsc = !g.isAsc;
    } else {
        g.currentSort = criteria;
        // تنظیم جهت پیش‌فرض: تاریخ (نزولی)، بقیه (صعودی)
        g.isAsc = (criteria !== 'date'); 
    }
    
    const asc = g.isAsc ? 1 : -1;
    g.items.sort((a, b) => {
        if (criteria === 'size') return (a.sizeBytes - b.sizeBytes) * asc;
        if (criteria === 'date') return (a.fullDate - b.fullDate) * asc;
        if (criteria === 'name') return a.rawTitle.localeCompare(b.rawTitle) * asc;
        return 0;
    });
    
    renderGroupList(idx);
    updateSortBarUI(idx);
};

function updateSortBarUI(idx) {
    const group = allGroups[idx];
    document.querySelectorAll(`#ep-${idx} .sort-btn`).forEach(btn => {
        const criteria = btn.getAttribute('data-sort');
        if (!criteria) return; 
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

// اضافه کردن فیلتر کیفیت به هر گروه
function renderUI() {
    grid.innerHTML = '';
    allGroups.forEach((g, i) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.setAttribute('data-title', g.name);
        card.innerHTML = `
            <div class="anime-header" onclick="toggleCard(${i})">
                <span class="anime-title">${g.name}</span>
                <div style="display:flex; align-items:center; gap:5px">
                    <span class="badge" style="margin-right:5px">${g.items.length} Files</span>
                    
                    <!-- دکمه انی‌لیست -->
                    <button class="header-icon-btn" title="View on AniList" onclick="event.stopPropagation(); openAnimeInfo(${i})">
                        <img src="https://anilist.co/img/icons/favicon-32x32.png" alt="AL">
                    </button>

                    <!-- دکمه جدید Nyaa Proxy (مخفی شده) -->
                    <button class="header-icon-btn" style="display: none;" title="Search Nyaa Proxy" onclick="event.stopPropagation(); window.open('${TARGET_DOMAIN}/?f=0&c=1_2&q=' + encodeURIComponent('${g.name.replace(/'/g, "\\'")}').replace(/%20/g, '+'), '_blank')">
                        <img src="favicon-Red.ico" alt="N">
                    </button>

                    
                    <!-- دکمه جدید Nyaa -->
                    <button class="header-icon-btn" title="Search Nyaa.si" onclick="event.stopPropagation(); window.open('${Nyaa_DOMAIN}/?f=0&c=1_2&q=' + encodeURIComponent('${g.name.replace(/'/g, "\\'")}').replace(/%20/g, '+'), '_blank')">
                        <img src="favicon.ico" alt="N">
                    </button>

                     <!-- دکمه گوگل -->
                    <button class="header-icon-btn" title="Search Google" onclick="event.stopPropagation(); window.open('https://www.google.com/search?q=' + encodeURIComponent('${g.name.replace(/'/g, "\\'")}'), '_blank')">
                        <img src="https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico" alt="G">
                    </button>

                    <i class="fas fa-chevron-down" style="color:var(--text-dim); font-size:0.8rem; margin-left:5px"></i>
                </div>
            </div>
            <div id="ep-${i}" class="episodes-list ltr-content">
                <div class="sort-bar">
                    <select class="res-filter" onchange="filterByRes(${i}, this.value)">
                        <option value="ALL">Qulity: ALL</option>
                        <option value="1080">1080p</option>
                        <option value="720">720p</option>
                        <option value="480">480p</option>
                    </select>

                    <button class="sort-btn" data-sort="date" onclick="sortItems(${i}, 'date')">
                        Date <i class="fas fa-sort dir-icon"></i>
                    </button>

                    <button class="sort-btn" data-sort="size" onclick="sortItems(${i}, 'size')">
                        Size <i class="fas fa-sort dir-icon"></i>
                    </button>

                    <button class="sort-btn" data-sort="name" onclick="sortItems(${i}, 'name')">
                        Name <i class="fas fa-sort dir-icon"></i>
                    </button>
                </div>
                <div id="ep-list-${i}">${renderEpisodeItems(g.items)}</div>
            </div>
        `;
        grid.appendChild(card);
        updateSortBarUI(i);
    });
}


window.filterByRes = function(idx, res) {
    allGroups[idx].currentRes = res;
    renderGroupList(idx);
};

function renderGroupList(idx) {
    const g = allGroups[idx];
    let itemsToDisplay = g.items;
    
    if (g.currentRes !== 'ALL') {
        itemsToDisplay = g.items.filter(item => 
            item.rawTitle.toLowerCase().includes(g.currentRes.toLowerCase())
        );
    }
    document.getElementById(`ep-list-${idx}`).innerHTML = renderEpisodeItems(itemsToDisplay);
}

function renderEpisodeItems(items) {
    if (items.length === 0) return '<div style="padding:20px; text-align:center; color:var(--text-dim)">No items found.</div>';
    
    return items.map(item => `
        <div class="episode-item is-${item.status}">
            <div class="ep-info">
                <span class="ep-raw-title" onclick="this.classList.toggle('full-text')" title="${item.rawTitle}">${item.rawTitle}</span>
                <div class="ep-meta">
                    <i class="fas fa-weight-hanging"></i> <b>${item.size}</b> &nbsp;&nbsp; 
                    <i class="far fa-clock"></i> <b>${item.date}</b>
                </div>
            </div>
            <div class="ep-actions">
                 <span style="color:#22c55e; font-weight:bold; font-size:0.85rem; margin-right:5px">
                   <i class="fas fa-arrow-up"></i> ${item.seeds}
                 </span>
                 <span style="color:#ef4444; font-weight:bold; font-size:0.85rem; margin-right:10px">
                     <i class="fas fa-arrow-down"></i> ${item.peers}
                 </span>
                 ${item.magnet ? `<a href="${item.magnet}" class="btn-magnet" title="Magnet Link"><i class="fas fa-magnet"></i></a>` : ''}
                 <a href="${item.link}" target="_blank" class="btn-link" style="display: none;" title="Nyaa Proxy"><i class="fas fa-external-link-alt"></i> Nyaa Proxy</a>
                 <a href="${item.link.replace('nyaa-proxy-zeta.vercel.app', 'nyaa.si')}" target="_blank" class="btn-link" title="Nyaa Link"><i class="fas fa-external-link-alt"></i> Nyaa.si</a>
            </div>
        </div>
    `).join('');
}

function toggleCard(id) {
    const el = document.getElementById(`ep-${id}`);
    el.style.display = (window.getComputedStyle(el).display === 'block') ? 'none' : 'block';
}

// ================= بخش اطلاعات انیمه (AniList GraphQL) =================
const infoModal = document.getElementById('animeInfoModal');
const btnCloseAnimeInfo = document.getElementById('btnCloseAnimeInfo');
const aniListSearchInput = document.getElementById('aniListSearchInput');
const btnSearchAniList = document.getElementById('btnSearchAniList');
const aniListContent = document.getElementById('aniListContent');

let currentAniListResults = []; // برای نگهداری نتایج جستجو در حافظه

// بستن مودال با دکمه ضربدر
btnCloseAnimeInfo.onclick = function() {
    infoModal.style.display = "none";
};

window.openAnimeInfo = function(idx) {
    const groupName = allGroups[idx].name;
    aniListSearchInput.value = groupName;
    infoModal.style.display = "block";

    // بررسی وجود فیلتر؛ اگر نبود ساخته شود
    let sortSelect = document.getElementById('aniListSortSelect');
    if (!sortSelect) {
        const wrapper = document.querySelector('#animeInfoModal .search-wrapper');
        sortSelect = document.createElement('select');
        sortSelect.id = 'aniListSortSelect';
        sortSelect.className = 'res-filter'; // استفاده از استایل دکمه‌های موجود
        sortSelect.style.marginLeft = '10px';
        
        // گزینه‌ها: تاریخ (پیش‌فرض) و محبوبیت
        sortSelect.innerHTML = `
            <option value="START_DATE_DESC" selected>Date</option>
            <option value="POPULARITY_DESC">Popularity</option>
        `;
        
        // با تغییر فیلتر، جستجو مجدد انجام شود
        sortSelect.onchange = () => {
            searchAniList(aniListSearchInput.value);
        };
        
        wrapper.appendChild(sortSelect);
    } else {
        // ریست کردن به حالت پیش‌فرض (تاریخ) در هر بار باز شدن
        sortSelect.value = "START_DATE_DESC";
    }

    // شروع جستجو
    searchAniList(groupName);
};

// جستجو با دکمه یا زدن کلید Enter روی کیبورد
btnSearchAniList.onclick = () => searchAniList(aniListSearchInput.value);
aniListSearchInput.onkeypress = function(e) {
    if (e.key === 'Enter') searchAniList(this.value);
};

async function searchAniList(searchQuery) {
    if (!searchQuery.trim()) return;
    
    // خواندن مقدار فیلتر (اگر ساخته نشده بود پیش‌فرض تاریخ باشد)
    const sortSelect = document.getElementById('aniListSortSelect');
    const sortValue = sortSelect ? sortSelect.value : 'START_DATE_DESC';
    
    aniListContent.innerHTML = '<div style="text-align:center; padding:20px; color:var(--primary);"><i class="fas fa-spinner spinning" style="font-size: 2rem;"></i><div style="margin-top:10px;">Searching AniList...</div></div>';
    
    // کوئری آپدیت شده با متغیر $sort
    const query = `
    query ($search: String, $sort: [MediaSort]) {
        Page (page: 1, perPage: 10) {
            media (search: $search, type: ANIME, sort: $sort) {
                id
                siteUrl
                title { romaji english }
                coverImage { large }
                bannerImage
                description(asHtml: false)
                averageScore
                episodes
                status
                seasonYear
                format
                nextAiringEpisode { episode }
                genres
                studios(isMain: true) { nodes { name } }
                relations {
                    edges {
                        relationType(version: 2)
                        node { id title { romaji } siteUrl type }
                    }
                }
            }
        }
    }`;

    const variables = { search: searchQuery, sort: sortValue };
    const url = 'https://graphql.anilist.co';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables })
    };

    try {
        const response = await fetch(url, options);
        const json = await response.json();
        
        if (!response.ok) throw new Error(json.errors ? json.errors[0].message : "API Error");
        
        currentAniListResults = json.data.Page.media;
        renderAniListResults();
    } catch (error) {
        aniListContent.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">Error: ${error.message}</div>`;
    }
}

// نمایش جزئیات کامل (اصلاح شده: عکس وسط، متن زیر عکس)
// نمایش جزئیات کامل (اصلاح نهایی: حذف Gap مزاحم برای کاهش فاصله)
window.showAniListDetails = function(index) {
    const anime = currentAniListResults[index];
    const romaji = anime.title.romaji || 'Unknown Title';
    const english = anime.title.english || "";
    const img = anime.coverImage.large;
    
    const bannerStyle = anime.bannerImage 
        ? `background-image: url('${anime.bannerImage}');` 
        : `background: linear-gradient(45deg, #334155, #0f172a);`;

    const desc = anime.description ? anime.description.replace(/<br><br>/g, '<br>').replace(/<[^>]+>/g, '') : 'No description available.';
    const score = anime.averageScore ? anime.averageScore + '%' : 'N/A';
    const studio = anime.studios && anime.studios.nodes.length > 0 ? anime.studios.nodes[0].name : 'Unknown Studio';
    
    let airedCount = anime.episodes || '?';
    if (anime.nextAiringEpisode) {
        airedCount = anime.nextAiringEpisode.episode - 1;
    } else if (anime.status === 'FINISHED') {
        airedCount = anime.episodes || '?';
    }
    const epDisplay = (airedCount === anime.episodes) ? airedCount : `${airedCount} / ${anime.episodes || '?'}`;

    let relationsHtml = '';
    if (anime.relations && anime.relations.edges.length > 0) {
        relationsHtml = `<div class="anilist-relations"><div class="relation-title">Related Anime:</div><div class="relation-grid">` + 
        anime.relations.edges.filter(r => r.node.type === 'ANIME').slice(0, 4).map(r => `
            <a href="${r.node.siteUrl}" target="_blank" class="relation-item">
                <span class="relation-type">${r.relationType.replace('_', ' ')}</span>
                ${r.node.title.romaji}
            </a>
        `).join('') + `</div></div>`;
    }

    aniListContent.innerHTML = `
        <button class="anilist-back-btn" onclick="renderAniListResults()">
            <i class="fas fa-arrow-left"></i> Back to results
        </button>
        
        <div class="anilist-details ltr-content">
            <div class="anilist-banner" style="${bannerStyle}"></div>
            
            
            <div class="anilist-header-content" style="flex-direction: column; align-items: center; text-align: center; margin-top: -80px; gap: 5px;">
                
                
                <img src="${img}" class="anilist-details-cover" alt="cover" style="margin-bottom: 0;">
                
                <div style="width: 100%;">
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <a href="${anime.siteUrl}" target="_blank" class="anilist-link-title" title="Open in AniList">
                            ${romaji} <i class="fas fa-external-link-alt" style="font-size:0.7em; vertical-align:middle;"></i>
                        </a>
                        <div class="anilist-sub-title">${english}</div>
                    </div>
                    
                     <div class="anilist-badges-row" style="justify-content: center; margin-bottom: 5px;">
                        <span class="stat-tag"><i class="fas fa-star" style="color:#eab308"></i> ${score}</span>
                        <span class="stat-tag"><i class="fas fa-film"></i> ${anime.format || 'TV'}</span>
                        <span class="stat-tag"><i class="fas fa-video"></i> ${epDisplay} Eps</span>
                        <span class="stat-tag"><i class="fas fa-calendar"></i> ${anime.seasonYear || 'N/A'}</span>
                        <span class="stat-tag"><i class="fas fa-info-circle"></i> ${anime.status}</span>
                        <span class="stat-tag"><i class="fas fa-building"></i> ${studio}</span>
                    </div>
                </div>
            </div>

            
            <div style="padding: 0px 10px 15px 10px;">
                <div class="anilist-details-desc">${desc}</div>
                ${relationsHtml}
            </div>
        </div>
    `;
};

// نسخه جدید: نمایش ۳ خطی نتایج در جستجوی داخلی
window.renderAniListResults = function() {
    if (!currentAniListResults || currentAniListResults.length === 0) {
        aniListContent.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);">No results found.</div>';
        return;
    }

    const html = currentAniListResults.map((anime, index) => {
        const romaji = anime.title.romaji || 'Unknown Title';
        const english = anime.title.english || "";
        const year = anime.seasonYear || 'N/A';
        const format = anime.format || 'TV';
        const img = anime.coverImage.large;

        return `
            <div class="anilist-result-item" onclick="showAniListDetails(${index})">
                <img src="${img}" class="anilist-result-img" alt="cover">
                <div class="anilist-result-info">
                    <span class="anilist-result-romaji">${romaji}</span>
                    <span class="anilist-result-english">${english}</span>
                    <div class="anilist-result-meta">${year} • ${format} • ${anime.status}</div>
                </div>
            </div>
        `;
    }).join('');
    
    aniListContent.innerHTML = html;
};

// باز کردن مستقیم اطلاعات انیمه با استفاده از آیدی
window.openAnimeInfoById = async function(id) {
    // باز کردن مودال و نمایش لودینگ
    infoModal.style.display = "block";
    aniListContent.innerHTML = '<div style="text-align:center; padding:50px; color:var(--primary);"><i class="fas fa-spinner spinning" style="font-size: 2rem;"></i></div>';

    // کوئری برای گرفتن اطلاعات با ID (دقیقاً با همان فیلدهایی که قبلاً ساختیم)
    const query = `
    query ($id: Int) {
        Media (id: $id, type: ANIME) {
            id siteUrl title { romaji english }
            coverImage { large } bannerImage description(asHtml: false)
            averageScore episodes status seasonYear format nextAiringEpisode { episode } genres
            studios(isMain: true) { nodes { name } }
            relations {
                edges {
                    relationType(version: 2)
                    node { id title { romaji } siteUrl type }
                }
            }
        }
    }`;

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { id: id } })
        });
        const json = await response.json();
        
        if (json.data && json.data.Media) {
            
            currentAniListResults = [json.data.Media];
            showAniListDetails(0); 
            
            
            const backBtn = document.querySelector('.anilist-back-btn');
            if(backBtn) backBtn.style.display = 'none';
        }
    } catch (error) {
        aniListContent.innerHTML = `<div style="color:var(--error); padding:20px; text-align:center;">Error loading details.</div>`;
    }
};

