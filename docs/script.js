// ================= تنظیمات اصلی ==================
const MY_WORKER_URL = "https://nyaa-k3.khalilkhko.workers.dev";
const TARGET_DOMAIN = "https://nyaa.si";  

const SIMILARITY_THRESHOLD = 0.8; 
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
const checkboxFilter = document.getElementById('myListFilter');


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

if (!localStorage.getItem('mySmartAnimeList') || JSON.parse(localStorage.getItem('mySmartAnimeList')).length === 0) {
    checkboxFilter.checked = false;
}

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
let cachedSchedules = null;
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
    name = name.replace(/\.(mkv|mp4|avi|ts|zip|rar|wmv|3gp|flv|m2ts)$/i, '');
    name = name.replace(/\[.*?\]/g, '');
    name = name.replace(/\s?\(.*?\)\s?/g, ' ');
    name = name.replace(/[._]/g, ' ');
    const stopMarkers = [
        /\sEpisode\s?\d+/i,
        /\sEpisodes\s?\d+/i,
        /\s-\s\d+/i, 
        /\sS\d+E\d+/i, 
        /\sS\d+\s?-\s?\d+/i, 
        /\s\d+(st|nd|rd|th)\sSeason/i, 
        /\sSeason\s\d+/i, 
        /\sEp\s?\d+/i, 
        /\sS\d+/i, 
        /\sE\d+/i,
        /\s?~/,
        /\s\d+$/, 
        /\s\d{3,4}p/i,
        /\s(BDREMUX|BD-REMUX|BDrip|BRrip|BR-rip|DVDRip|DVD-Rip|HDTV|Webrip|Web-rip|BluRay)/i,
        /\s(HEVC|x264|x265|h264|h265|10bit|10-bit|Dual Audio|Multi-Audio|FLAC|AAC|x264_10bit|x265_10bit)/i
    ];
    let firstMatchIndex = name.length;
    stopMarkers.forEach(pattern => {
        const match = name.match(pattern);
        if (match && match.index < firstMatchIndex) firstMatchIndex = match.index;
    });
    name = name.substring(0, firstMatchIndex).trim();
    return name.replace(/[:\-~,\s]+$/, '').trim() || "Unknown";
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
    cachedSchedules = null;
    localStorage.setItem('mySmartAnimeList', JSON.stringify(mySavedList));
    renderMySavedList();
}

// متغیر سراسری برای ناوبری روزها (0 = امروز، 1- = دیروز، 1 = فردا، 2- = پریروز و...)
let currentWatchlistDayOffset = 0;

// ۱. تبدیل تاریخ به فرمت استاندارد انگلیسی به وقت تهران (مثال: Tuesday, June 23, 2026) [1]
function getTehranFormattedDate(offset) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Tehran' };
    return new Intl.DateTimeFormat('en-US', options).format(targetDate);
}

// ۲. دریافت نام روز هدف به صورت نسبی (Today, Yesterday, Tomorrow) یا نام روز هفته انگلیسی [1]
function getRelativeDayLabel(offset) {
    if (offset === 0) return 'Today';
    if (offset === -1) return 'Yesterday';
    if (offset === 1) return 'Tomorrow';
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Tehran' }).format(targetDate);
}

// ۳. تابع کمکی جهت استخراج روز پخش آینده انیمه نسبت به زمان فعلی سیستم (امروز) [1]
function getDayLabelForTimestamp(airingAt) {
    if (!airingAt) return '';
    
    const now = new Date();
    const options = { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    
    const todayStr = formatter.format(now);
    const airingDate = new Date(airingAt * 1000);
    const airingStr = formatter.format(airingDate);
    
    if (todayStr === airingStr) return 'Today';
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (formatter.format(tomorrow) === airingStr) return 'Tomorrow';
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (formatter.format(yesterday) === airingStr) return 'Yesterday';
    
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Tehran' }).format(airingDate);
}

// ۴. تابع باز کردن مودال اختصاصی ویرایش کلیدواژه‌ها [1]
function openKeywordsModal(index) {
    let modalEl = document.getElementById('keywordsModal');
    
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'keywordsModal';
        modalEl.className = 'modal';
        modalEl.innerHTML = `
            <div class="modal-content ltr-content" style="max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 15px;">
                <div class="modal-header" style="margin: 0; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                    <h3 style="display: flex; align-items: center; gap: 10px; margin: 0; font-size: 1.1rem; color: var(--primary);">
                        <i class="fas fa-tags"></i> Edit Match Keywords
                    </h3>
                    <span class="close-modal" id="btnCloseKeywordsModal" style="cursor: pointer; line-height: 1;">&times;</span>
                </div>
                <div>
                    <p style="font-size: 0.82rem; color: var(--text-dim); margin: 0 0 12px 0; line-height: 1.4;">
                        Edit search keywords for <strong id="kwModalAnimeTitle" style="color: var(--text-main);"></strong>.<br>
                        Write one phrase per line. These will be matched against torrent titles.
                    </p>
                    <textarea id="kwModalTextarea" style="width: 100%; height: 160px; background: #0b0f1a; color: white; border: 1px solid var(--border); border-radius: 8px; padding: 12px; resize: none; font-family: inherit; font-size: 0.85rem; outline: none; border-color: var(--border); transition: border-color 0.2s;" placeholder="Keywords (one per line)..."></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border); padding-top: 12px; margin: 0;">
                    <button id="btnCancelKeywordsModal" class="sort-btn" style="padding: 6px 16px; border-radius: 6px;">Cancel</button>
                    <button id="btnSaveKeywordsModal" class="btn-primary" style="padding: 6px 16px; border-radius: 8px; font-size: 0.85rem;">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);

        document.getElementById('btnCloseKeywordsModal').onclick = () => modalEl.style.display = 'none';
        document.getElementById('btnCancelKeywordsModal').onclick = () => modalEl.style.display = 'none';
        
        const originalWindowClick = window.onclick;
        window.onclick = function(event) {
            if (originalWindowClick) originalWindowClick(event);
            if (event.target == modalEl) {
                modalEl.style.display = 'none';
            }
        };
    }

    const anime = mySavedList[index];
    document.getElementById('kwModalAnimeTitle').innerText = anime.romaji;
    
    const textarea = document.getElementById('kwModalTextarea');
    textarea.value = anime.keywords || '';
    
    textarea.onfocus = () => textarea.style.borderColor = 'var(--primary)';
    textarea.onblur = () => textarea.style.borderColor = 'var(--border)';

    document.getElementById('btnSaveKeywordsModal').onclick = function() {
        mySavedList[index].keywords = textarea.value.trim();
        localStorage.setItem('mySmartAnimeList', JSON.stringify(mySavedList));
        modalEl.style.display = 'none';
        renderMySavedList();
    };

    modalEl.style.display = 'block';
    textarea.focus();
}

// ۵. دریافت همزمان آرشیو گذشته و آینده زمان پخش از API سایت AniList [1]
async function fetchAiringSchedules(ids) {
    if (!ids || ids.length === 0) return {};
    
    const query = `
    query ($ids: [Int]) {
        Page(perPage: 50) {
            media(id_in: $ids, type: ANIME) {
                id
                nextAiringEpisode {
                    airingAt
                    episode
                }
                airingSchedule(notYetAired: false, page: 1, perPage: 100) {
                    nodes {
                        airingAt
                        episode
                    }
                }
            }
        }
    }`;

    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { ids } })
        });
        
        if (!res.ok) throw new Error("AniList API connection issues");
        
        const json = await res.json();
        const schedules = {};
        
        if (json?.data?.Page?.media) {
            json.data.Page.media.forEach(anime => {
                schedules[anime.id] = {
                    next: anime.nextAiringEpisode || null,
                    past: anime.airingSchedule?.nodes || []
                };
            });
        }
        return schedules;
    } catch (e) {
        console.warn("Could not fetch schedules, falling back to standard view:", e);
        return null; 
    }
}

// ۶. تطبیق ریاضی و ۱۰۰٪ واقعی تاریخ پخش‌ها بدون حدس و گمان‌های فرمولی (مقاوم در برابر تاخیرها و وققه‌ها) [1]
function isAiringOnOffsetDayInTehran(mediaId, schedule, offset) {
    if (!schedule) return false;
    
    const options = { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    const targetStr = formatter.format(targetDate);
    
    // الف) مقایسه با تاریخ واقعی قسمت آینده (Next) [1]
    if (schedule.next) {
        const nextStr = formatter.format(new Date(schedule.next.airingAt * 1000));
        if (targetStr === nextStr) return true;
    }
    
    // ب) مقایسه با تاریخ‌های واقعی و ثبت‌شده تمام قسمت‌های گذشته (Past) [1]
    if (schedule.past && schedule.past.length > 0) {
        const matchedPast = schedule.past.some(node => {
            const pastStr = formatter.format(new Date(node.airingAt * 1000));
            return targetStr === pastStr;
        });
        if (matchedPast) return true;
    }
    
    return false;
}

// ۷. دریافت ساعت پخش به وقت تهران [1]
function getTehranAiringTime(airingAt) {
    if (!airingAt) return '';
    const options = { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    return formatter.format(new Date(airingAt * 1000));
}

// ۸. محاسبه و به‌روزرسانی تایمرهای معکوس داینامیک در لیست با منطق جدید عدم نمایش تایمر برای پخش‌شده‌ها [1]
function updateWatchlistCountdowns() {
    const countdowns = document.querySelectorAll('.airing-today-countdown');
    countdowns.forEach(el => {
        const airingAt = parseInt(el.getAttribute('data-airing-at'), 10);
        if (!airingAt) return;
        
        const isTargetDay = el.getAttribute('data-is-target-day') === 'true';
        
        if (isTargetDay && currentWatchlistDayOffset < 0) {
            el.innerText = '';
            return;
        }
        
        const now = Date.now();
        const diff = (airingAt * 1000) - now;
        
        if (isTargetDay && currentWatchlistDayOffset === 0 && diff > 24 * 60 * 60 * 1000) {
            el.innerText = 'Aired';
            el.style.color = 'var(--text-dim)';
            return;
        }
        
        if (diff > 0) {
            const daysLeft = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            let timeStr = "";
            if (daysLeft > 0) {
                timeStr = `${daysLeft}d ${hours}h left`;
            } else {
                timeStr = `${hours}h ${minutes}m left`;
            }
            el.innerText = `(${timeStr})`;
            el.style.color = '#3b82f6'; 
        } else {
            el.innerText = `Aired`;
            el.style.color = 'var(--text-dim)'; 
        }
    });
}

// اجرای مداوم آپدیت معکوس [1]
setInterval(updateWatchlistCountdowns, 10000);

// ۹. تابع اصلی رندر لیست هوشمند تماشا با کنترلر ناوبری انگلیسی و موتور مرتب‌سازی زمانی [1]
async function renderMySavedList() {
    const ids = mySavedList.map(item => item.id);
    
    
    if (!cachedSchedules && ids.length > 0) {
        myListContainer.innerHTML = '<div style="color:gray; text-align:center; padding:20px;"><i class="fas fa-spinner spinning"></i> Loading schedules...</div>';
        const fetchedResult = await fetchAiringSchedules(ids);
        
        if (fetchedResult !== null) {
            cachedSchedules = fetchedResult; 
        }
    }
    
    const schedules = cachedSchedules || {};
    myListContainer.innerHTML = '';
  
    const paginationContainer = document.createElement('div');
    paginationContainer.style.cssText = 'display: flex; gap: 10px; margin-bottom: 2px; grid-column: 1 / -1; justify-content: center; align-items: center;';
    
    // دکمه عقب گرد روز (<) [1]
    const prevBtn = document.createElement('button');
    prevBtn.className = 'sort-btn';
    prevBtn.style.padding = '6px 18px';
    prevBtn.style.borderRadius = '20px';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.onclick = () => {
        currentWatchlistDayOffset--;
        renderMySavedList();
    };

    // دکمه مرکز (Today / امروز) [1]
    const todayBtn = document.createElement('button');
    todayBtn.className = `sort-btn ${currentWatchlistDayOffset === 0 ? 'active' : ''}`;
    todayBtn.style.padding = '6px 20px';
    todayBtn.style.borderRadius = '20px';
    todayBtn.style.fontWeight = 'bold';
    todayBtn.innerText = 'Today';
    todayBtn.onclick = () => {
        currentWatchlistDayOffset = 0;
        renderMySavedList();
    };

    // دکمه جلو گرد روز (>) [1]
    const nextBtn = document.createElement('button');
    nextBtn.className = 'sort-btn';
    nextBtn.style.padding = '6px 18px';
    nextBtn.style.borderRadius = '20px';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.onclick = () => {
        currentWatchlistDayOffset++;
        renderMySavedList();
    };

    paginationContainer.appendChild(prevBtn);
    paginationContainer.appendChild(todayBtn);
    paginationContainer.appendChild(nextBtn);
    
    myListContainer.appendChild(paginationContainer);

    // ۱. استخراج و رندر هدر تاریخ [1]
    const formattedTehranDate = getTehranFormattedDate(currentWatchlistDayOffset);
    const headerTarget = document.createElement('div');
    headerTarget.className = 'today-releases-header';
    headerTarget.style.cssText = 'margin-top: 0px; margin-bottom: 2px;';
    headerTarget.innerHTML = `<i class="fas fa-calendar-day"></i> Releases on ${formattedTehranDate}`;
    myListContainer.appendChild(headerTarget);

    const targetReleases = [];
    const otherReleases = [];

    mySavedList.forEach((item, index) => {
        const schedule = schedules[item.id];
        const itemWithSchedule = { ...item, originalIndex: index, schedule };
        
        // ارسال مستقیم پکیج کامل پخش‌ها جهت ارزیابی ریاضی و واقعی تاریخ [1]
        if (schedule && isAiringOnOffsetDayInTehran(item.id, schedule, currentWatchlistDayOffset)) {
            targetReleases.push(itemWithSchedule);
        } else {
            otherReleases.push(itemWithSchedule);
        }
    });

    // سورت ریلیزهای هدف (بالا) بر اساس ساعت پخش در روز جاری (از زودترین به دیرترین) [1]
    targetReleases.sort((a, b) => {
        // محاسبه زمان دقیق پخش روز جاری از روی تقویم رسمی جهت مرتب‌سازی درست [1]
        const options = { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + currentWatchlistDayOffset);
        const targetStr = formatter.format(targetDate);
        
        let aTime = 0;
        if (a.schedule.next && formatter.format(new Date(a.schedule.next.airingAt * 1000)) === targetStr) {
            aTime = a.schedule.next.airingAt;
        } else if (a.schedule.past) {
            const match = a.schedule.past.find(node => formatter.format(new Date(node.airingAt * 1000)) === targetStr);
            if (match) aTime = match.airingAt;
        }

        let bTime = 0;
        if (b.schedule.next && formatter.format(new Date(b.schedule.next.airingAt * 1000)) === targetStr) {
            bTime = b.schedule.next.airingAt;
        } else if (b.schedule.past) {
            const match = b.schedule.past.find(node => formatter.format(new Date(node.airingAt * 1000)) === targetStr);
            if (match) bTime = match.airingAt;
        }

        return aTime - bTime;
    });

    // سورت ریلیزهای دیگر (پایین) بر اساس زمان باقی‌مانده [1]
    otherReleases.sort((a, b) => {
        const aTime = (a.schedule && a.schedule.next) ? a.schedule.next.airingAt : Infinity;
        const bTime = (b.schedule && b.schedule.next) ? b.schedule.next.airingAt : Infinity;
        return aTime - bTime;
    });

    // ۲. رندر کردن کارت‌های انیمه مربوط به روز انتخاب شده [1]
    if (targetReleases.length > 0) {
        targetReleases.forEach(item => {
            const card = createSavedItemCard(item, item.originalIndex, true);
            myListContainer.appendChild(card);
        });
    } else {
        const noReleasesDiv = document.createElement('div');
        noReleasesDiv.style.cssText = 'padding: 0; margin: 0; text-align: center; color: var(--text-dim); font-size: 0.85rem;';
        noReleasesDiv.innerText = 'No releases scheduled for this day.';
        myListContainer.appendChild(noReleasesDiv);
    }

    // ایجاد خط جداکننده افقی [1]
    const divider = document.createElement('hr');
    divider.className = 'watchlist-divider';
    divider.style.cssText = 'margin: 2px 0;';
    myListContainer.appendChild(divider);

    // ۳. نمایش سایر انیمه‌های لیست تماشا در بخش پایینی [1]
    otherReleases.forEach(item => {
        const card = createSavedItemCard(item, item.originalIndex, false);
        myListContainer.appendChild(card);
    });

    // اعمال فوری زمان شمارش معکوس [1]
    updateWatchlistCountdowns();
}

// ۱۰. تابع ایجاد کارت‌ها در لیست تماشا (بر پایه خواندن اطلاعات ۱۰۰٪ واقعی پخش از پکیج تقویم) [1]
function createSavedItemCard(item, index, isOnTargetDay) {
    const div = document.createElement('div');
    div.className = `saved-item ${isOnTargetDay ? 'is-today-airing' : ''}`;
    
    // شمارش کلمات کلیدی ذخیره شده [1]
    const keywordsList = (item.keywords || '').split('\n').filter(k => k.trim());
    const keywordCount = keywordsList.length;

    let airingBadge = '';
    if (item.schedule) {
        const options = { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + currentWatchlistDayOffset);
        const targetStr = formatter.format(targetDate);

        if (isOnTargetDay) {
            // استخراج رکورد دقیق و منطبق با این روز از گذشته یا آینده بدون خطای ریاضی [1]
            let matchedNode = null;
            if (item.schedule.next && formatter.format(new Date(item.schedule.next.airingAt * 1000)) === targetStr) {
                matchedNode = item.schedule.next;
            } else if (item.schedule.past) {
                matchedNode = item.schedule.past.find(node => formatter.format(new Date(node.airingAt * 1000)) === targetStr);
            }

            if (matchedNode) {
                const timeStr = getTehranAiringTime(matchedNode.airingAt);
                const relativeDayLabel = getRelativeDayLabel(currentWatchlistDayOffset);
                const episodeInfo = ` (Ep ${matchedNode.episode})`;

                // استفاده از زمان پخش دقیق همین روز برای ثبات بخش تایمر معکوس [1]
                airingBadge = `
                   <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span class="airing-today-badge">
                           <i class="far fa-clock"></i> ${relativeDayLabel} at ${timeStr}${episodeInfo}
                        </span>
                        <span class="airing-today-countdown" data-airing-at="${matchedNode.airingAt}" data-is-target-day="true" style="font-size: 0.75rem; color: #3b82f6; font-weight: bold; margin-bottom: 5px;"></span>
                    </div>
                `;
            }
        } else if (item.schedule.next) {
            // برای ریلیزهای کلی دیگر (پایین خط جداکننده) - فقط انیمه‌های در جریان با قسمت آینده را نشان می‌دهد [1]
            const timeStr = getTehranAiringTime(item.schedule.next.airingAt);
            const dayLabel = getDayLabelForTimestamp(item.schedule.next.airingAt);

            airingBadge = `
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="airing-today-badge" style="background: rgba(148, 163, 184, 0.1); color: var(--text-dim); border: 1px solid rgba(148, 163, 184, 0.15);">
                        <i class="far fa-clock"></i> ${dayLabel} at ${timeStr} (Ep ${item.schedule.next.episode})
                    </span>
                    <span class="airing-today-countdown" data-airing-at="${item.schedule.next.airingAt}" data-is-target-day="false" style="font-size: 0.75rem; color: #3b82f6; font-weight: bold; margin-bottom: 5px;"></span>
                </div>
            `;
        }
    }

    div.innerHTML = `
        <img src="${item.cover}" onclick="openAnimeInfoById(${item.id})" title="View Details">
        <div class="saved-item-info" style="display:flex; flex-direction:column; flex:1; justify-content: center; gap: 4px;">
            <span class="saved-item-title" onclick="openAnimeInfoById(${item.id})">${item.romaji}</span>
            ${airingBadge}
            
            <!-- دکمه ویرایشگر کلیدواژه‌ها با رنگ متمایز Slate ملایم (var(--text-dim)) [1] -->
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px;">
                <button class="sort-btn" onclick="openKeywordsModal(${index})" style="padding: 2px 8px; font-size: 0.72rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; background: rgba(148, 163, 184, 0.08); border-color: rgba(148, 163, 184, 0.15); color: var(--text-dim);" title="Edit matching keywords">
                    <i class="fas fa-tags" style="color: var(--text-dim);"></i> Keywords (${keywordCount})
                </button>
            </div>
        </div>
        <button class="btn-remove-item" onclick="removeFromMyList(${index})"><i class="fas fa-times"></i></button>
    `;
    return div;
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
    cachedSchedules = null;
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
                    cachedSchedules = null;
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
    if (isScanning) { 
        log("Stopping scan immediately...", "error"); 
        if (scanAbortController) scanAbortController.abort(); 
        resetScanUI();
        return; 
    }

    isScanning = true;
    scanAbortController = new AbortController();
    
    const rangeMode = document.getElementById('dateRange').value;
    
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

    if (!cachedSchedules && mySavedList.length > 0) {
        try {
            const ids = mySavedList.map(item => item.id);
            const fetchedResult = await fetchAiringSchedules(ids);
            if (fetchedResult !== null) {
                cachedSchedules = fetchedResult;
            }
        } catch (err) {
            
        }
    }

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
        resetScanUI();
    }
}

// تابع جدید: اعمال فیلتر و بازسازی گروه‌ها بدون اسکن مجدد
function refreshData() {
    if (myListFilter.checked && (!mySavedList || mySavedList.length === 0)) {
        myListFilter.checked = false;
    }

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
        let isAiringToday = false;
        if (g.watchlistId && cachedSchedules && cachedSchedules[g.watchlistId]) {
            isAiringToday = isAiringOnOffsetDayInTehran(g.watchlistId, cachedSchedules[g.watchlistId], -1);
        }
        const titleStyle = isAiringToday ? 'style="color: #22c55e;"' : '';

        const card = document.createElement('div');
        card.className = 'anime-card';
        card.setAttribute('data-title', g.name);
        card.innerHTML = `
            <div class="anime-header" onclick="toggleCard(${i})">
                <span class="anime-title" ${titleStyle}>${g.name}</span>
                <div style="display:flex; align-items:center; gap:5px">
                    <span class="badge" style="margin-right:5px">${g.items.length} Files</span>
                    
                    <button class="header-icon-btn" title="View on AniList" onclick="event.stopPropagation(); openAnimeInfo(${i})">
                        <img src="favicon-anilist.png" alt="AL">
                    </button>

                    <button class="header-icon-btn" title="Search MAL" onclick="event.stopPropagation(); window.open('https://myanimelist.net/anime.php?q=' + encodeURIComponent('${g.name.replace(/'/g, "\\'")}').replace(/%20/g, '+'), '_blank')">
                        <img src="favicon-mal.ico" alt="MAL">
                    </button>

                    <button class="header-icon-btn" title="Search Nyaa.si" onclick="event.stopPropagation(); window.open('${TARGET_DOMAIN}/?f=0&c=1_2&q=' + encodeURIComponent('${g.name.replace(/'/g, "\\'")}').replace(/%20/g, '+'), '_blank')">
                        <img src="favicon.ico" alt="N">
                    </button>

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
                 <a href="${item.link}" target="_blank" class="btn-link" title="Nyaa Link"><i class="fas fa-external-link-alt"></i> Nyaa.si</a>
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
