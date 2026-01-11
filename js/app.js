let map, markerLayer;
let currentMode = 'home';
let currentCategory = '';
let currentMapType = '';
let score = 0;
let currentIndex = 0;
let activeQuestions = [];
let itemsToFind = [];
let targetItem = null;
let adsEnabled = true;
let streak = 0;
let historyData = [];

// Persistence Keys
const STORAGE_KEY_SCORE = 'kpss_score';
const STORAGE_KEY_STREAK = 'kpss_streak';
const STORAGE_KEY_HISTORY = 'kpss_history';

// Audio Context
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.1); // D6
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
}

function loadProgress() {
    const savedScore = localStorage.getItem(STORAGE_KEY_SCORE);
    const savedStreak = localStorage.getItem(STORAGE_KEY_STREAK);
    const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);

    if (savedScore) score = parseInt(savedScore); // This is accumulated score, but game resets score per session usually. Let's keep it session based but maybe accumulate total?
    // Actually the game logic seems to reset score on restartCategory.
    // Let's use localStorage for "High Score" or "Total XP" maybe?
    // For now, let's keep streak persistent across sessions if we want.

    if (savedStreak) {
        streak = parseInt(savedStreak);
        document.getElementById('streak').innerText = streak;
    }

    if (savedHistory) {
        historyData = JSON.parse(savedHistory);
        updateHistoryUI();
    }
}

function saveProgress() {
    localStorage.setItem(STORAGE_KEY_STREAK, streak);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyData));
    // We can also save total questions answered etc.
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }

function showHome() {
    currentMode = 'home';
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('map-container').classList.add('hidden');
    document.getElementById('finish-modal').classList.add('hidden');
    if (window.innerWidth < 1024) document.getElementById('sidebar').classList.add('-translate-x-full'); // Ensure closed on mobile
}

// Timer Logic
let timerInterval;
const QUESTION_TIME = 20; // seconds
let timeLeft = QUESTION_TIME;

function startTimer() {
    clearInterval(timerInterval);
    timeLeft = QUESTION_TIME;
    updateTimerUI();

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeOut();
        }
    }, 1000);
}

function updateTimerUI() {
    const bar = document.getElementById('timer-bar-inner');
    if (bar) {
        const percent = (timeLeft / QUESTION_TIME) * 100;
        bar.style.width = percent + '%';
        if (timeLeft <= 5) {
            bar.classList.add('bg-rose-500');
            bar.classList.remove('bg-emerald-500');
        } else {
            bar.classList.add('bg-emerald-500');
            bar.classList.remove('bg-rose-500');
        }
    }
}

function handleTimeOut() {
    playSound('error');
    handleAnswer(null, true); // Treat as wrong (null answer, timeout=true)
}

function selectCategory(cat) {
    currentMode = 'quiz';
    currentCategory = cat;
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    document.getElementById('map-container').classList.add('hidden');

    const label = document.getElementById('active-category-label');
    label.innerText = cat === 'tarih' ? 'TARİH SORULARI' : 'COĞRAFYA SORULARI';
    label.className = `inline-block px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 ${cat === 'tarih' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`;

    restartCategory();
    if(window.innerWidth < 1024) toggleSidebar();
}

function restartCategory() {
    currentIndex = 0;
    score = 0; // Session score
    const pool = currentCategory === 'tarih' ? rawTarih : rawCografya;
    activeQuestions = [...pool].sort(() => Math.random() - 0.5);
    document.getElementById('total-q').innerText = activeQuestions.length;
    document.getElementById('finish-modal').classList.add('hidden');
    updateQuestion();
}

function updateQuestion() {
    if (currentIndex >= activeQuestions.length) {
        showFinish();
        return;
    }
    const q = activeQuestions[currentIndex];
    document.getElementById('question-text').innerText = q.text;
    document.getElementById('current-q').innerText = currentIndex + 1;
    document.getElementById('score').innerText = score;
    document.getElementById('progress').style.width = ((currentIndex + 1) / activeQuestions.length * 100) + '%';

    startTimer();
}

function handleAnswer(choice, isTimeout = false) {
    clearInterval(timerInterval);
    const q = activeQuestions[currentIndex];

    let isCorrect = false;
    if (!isTimeout) {
        isCorrect = (choice === q.answer);
    }

    if (isCorrect) {
        score++;
        streak++;
        playSound('success');
    } else {
        streak = 0;
        playSound('error');
    }
    document.getElementById('streak').innerText = streak;
    saveProgress();

    if (adsEnabled && (currentIndex + 1) % 5 === 0) {
        showAd(() => showResult(isCorrect, q, isTimeout));
    } else {
        showResult(isCorrect, q, isTimeout);
    }
}

function showResult(isCorrect, q, isTimeout) {
    const modal = document.getElementById('result-modal');
    const border = document.getElementById('modal-border');
    modal.classList.remove('hidden');

    let title = isCorrect ? 'HARİKA, DOĞRU!' : 'ÖNEMLİ BİLGİ';
    if (isTimeout) title = 'SÜRE DOLDU!';

    document.getElementById('result-icon').innerHTML = isCorrect ? '🎯' : (isTimeout ? '⏰' : '💡');
    document.getElementById('result-title').innerText = title;
    document.getElementById('result-title').className = `text-3xl font-black mb-4 italic ${isCorrect ? 'text-emerald-400' : 'text-amber-500'}`;
    border.style.borderColor = isCorrect ? '#10b981' : '#f59e0b';
    document.getElementById('result-explanation').innerText = q.explanation;

    historyData.unshift({ text: q.text, isCorrect, timestamp: new Date().toISOString() });
    updateHistoryUI();
}

function nextQuestion() {
    document.getElementById('result-modal').classList.add('hidden');
    currentIndex++;
    updateQuestion();
}

function showFinish() {
    document.getElementById('finish-modal').classList.remove('hidden');
    document.getElementById('final-score').innerText = score + " PUAN";
}

// --- HARİTA MODU ---
function selectMap(type) {
    currentMode = 'map';
    currentMapType = type;
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('map-container').classList.remove('hidden');

    setTimeout(() => {
        if (!map) {
            map = L.map('leaflet-map', { center: [39.0, 35.0], zoom: 6, minZoom: 5 });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
            markerLayer = L.layerGroup().addTo(map);
        }
        map.invalidateSize();
        startMapGame();
    }, 100);
    if(window.innerWidth < 1024) toggleSidebar();
}

function startMapGame() {
    markerLayer.clearLayers();
    itemsToFind = [...mapData[currentMapType]].sort(() => Math.random() - 0.5);

    mapData[currentMapType].forEach(item => {
        const icon = L.divIcon({ className: 'custom-div-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
        const marker = L.marker([item.lat, item.lng], { icon: icon }).addTo(markerLayer);
        marker.on('click', () => {
            if (targetItem && item.id === targetItem.id) {
                marker.getElement().classList.add('correct-marker');
                playSound('success');
                showMapFeedback(`${item.name} DOĞRU ✓`, true);
                setTimeout(nextMapItem, 1000);
            } else {
                playSound('error');
                showMapFeedback("YANLIŞ KONUM!", false);
            }
        });
    });
    nextMapItem();
}

function nextMapItem() {
    if (itemsToFind.length === 0) {
        document.getElementById('finish-modal').classList.remove('hidden');
        document.getElementById('final-score').innerText = "HARİTA TAMAMLANDI";
        return;
    }
    targetItem = itemsToFind.pop();
    document.getElementById('map-instruction').innerHTML = `<i class="fas fa-search-location"></i> ${targetItem.name}`;
}

function showMapFeedback(text, isSuccess) {
    const fb = document.getElementById('map-feedback');
    const fbText = document.getElementById('feedback-text');
    fbText.innerText = text;
    fbText.className = isSuccess ? "text-emerald-400 font-black" : "text-rose-400 font-black text-2xl";
    fb.classList.remove('hidden');
    setTimeout(() => fb.classList.add('hidden'), 1500);
}

// --- DİĞER FONKSİYONLAR ---
function toggleAds() {
    adsEnabled = !adsEnabled;
    const btn = document.getElementById('no-ads-btn');
    btn.innerHTML = adsEnabled ? '<i class="fas fa-bolt mr-2"></i>REKLAMLARI KALDIR' : '<i class="fas fa-check-circle mr-2"></i>REKLAMLAR KAPALI';
    btn.className = adsEnabled ? "bg-amber-600/10 text-amber-500 border border-amber-500/30 px-6 py-3 rounded-2xl text-sm font-bold shadow-lg" : "bg-emerald-600 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg";
}

function showAd(callback) {
    const overlay = document.getElementById('ad-overlay');
    const timer = document.getElementById('ad-timer');
    overlay.classList.remove('hidden');
    let time = 3;
    timer.innerText = time;
    const interval = setInterval(() => {
        time--;
        timer.innerText = time;
        if (time <= 0) { clearInterval(interval); overlay.classList.add('hidden'); callback(); }
    }, 800);
}

function updateHistoryUI() {
    const list = document.getElementById('history-list');
    list.innerHTML = historyData.slice(0, 20).map(item => `
        <div class="bg-slate-800/80 p-3 rounded-xl border-l-4 ${item.isCorrect ? 'border-emerald-500' : 'border-rose-500'}">
            <p class="text-xs text-slate-200 leading-tight">${item.text}</p>
            <div class="flex justify-between mt-2 text-[10px] text-slate-500 font-bold uppercase">
                 <span>${item.isCorrect ? 'DOĞRU' : 'YANLIŞ'}</span>
                 <span>${item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ''}</span>
            </div>
        </div>
    `).join('');
}

function switchTab(tab) {
    const tabCats = document.getElementById('tab-cats');
    const tabHistory = document.getElementById('tab-history');
    const contentCats = document.getElementById('content-cats');
    const contentHistory = document.getElementById('content-history');

    if(tab === 'cats') {
        tabCats.classList.add('border-amber-500', 'bg-slate-800/50');
        tabCats.classList.remove('border-transparent');
        tabHistory.classList.remove('border-amber-500', 'bg-slate-800/50');
        tabHistory.classList.add('border-transparent');
        contentCats.classList.remove('hidden');
        contentHistory.classList.add('hidden');
    } else {
        tabHistory.classList.add('border-amber-500', 'bg-slate-800/50');
        tabHistory.classList.remove('border-transparent');
        tabCats.classList.remove('border-amber-500', 'bg-slate-800/50');
        tabCats.classList.add('border-transparent');
        contentCats.classList.add('hidden');
        contentHistory.classList.remove('hidden');
    }
}

// Stats Modal Logic
function showStats() {
    // Calculate stats
    const totalAnswered = historyData.length;
    const totalCorrect = historyData.filter(x => x.isCorrect).length;
    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    document.getElementById('stat-total').innerText = totalAnswered;
    document.getElementById('stat-rate').innerText = accuracy + '%';
    document.getElementById('stat-streak').innerText = streak;

    document.getElementById('stats-modal').classList.remove('hidden');
}

function closeStats() {
    document.getElementById('stats-modal').classList.add('hidden');
}

window.onload = function() {
    showHome();
    loadProgress();

    // Add audio init on first user interaction
    document.body.addEventListener('click', initAudio, { once: true });
};
