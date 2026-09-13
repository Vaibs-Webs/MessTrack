/* ==========================================================================
   MessTrack - 40-Day / 60-Tiffin Mess Card Engine & Application Logic
   ========================================================================== */

(function () {
    "use strict";

    // 1. CONSTANTS & APPLICATION STATE
    const STORAGE_KEY = "messtrack_data_v4";
    const TOTAL_CARD_TIFFINS = 60;
    const CARD_VALIDITY_DAYS = 40;

    const DEFAULT_SETTINGS = {
        appName: "MessTrack",
        currency: "INR",
        theme: "light"
    };

    // Global State
    let appState = {
        settings: { ...DEFAULT_SETTINGS },
        activeCardId: null,
        cards: [],
        activity: []
    };

    // Temporary UI State
    let activeDayContext = { cardId: null, dateStr: null };
    let confirmActionCallback = null;

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // Helper: Add Days to ISO Date String (YYYY-MM-DD)
    function addDaysToDate(dateStr, daysCount) {
        const d = new Date(dateStr + "T00:00:00");
        d.setDate(d.getDate() + daysCount);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    // 2. INITIALIZATION & STORAGE
    function init() {
        loadData();
        applyTheme(appState.settings.theme);
        setupEventListeners();
        renderApp();
    }

    // Generate fresh 40-Day Card structure starting on startDateStr
    function createCardStructure(cardId, startDateStr, amountPaid, notes) {
        // End Date = Start Date + 39 days (Produces exactly 40 calendar days)
        const endDateStr = addDaysToDate(startDateStr, CARD_VALIDITY_DAYS - 1);
        const days = [];

        for (let i = 0; i < CARD_VALIDITY_DAYS; i++) {
            const dateStr = addDaysToDate(startDateStr, i);
            const dateObj = new Date(dateStr + "T00:00:00");
            const dayOfWeek = DAY_NAMES[dateObj.getDay()];

            days.push({
                dayIndex: i + 1,
                date: dateStr,
                dayOfWeek: dayOfWeek,
                morning: {
                    type: "no_tiffin", // "no_tiffin" (0), "normal" (1), "feast" (2)
                    tiffinCost: 0,
                    tiffinNumbers: []
                },
                evening: {
                    type: "no_tiffin",
                    tiffinCost: 0,
                    tiffinNumbers: []
                },
                updatedAt: null
            });
        }

        // Build 60 Tiffins Array (#01 to #60)
        const tiffins = [];
        for (let c = 1; c <= TOTAL_CARD_TIFFINS; c++) {
            tiffins.push({
                number: c,
                status: "available",
                usedOnDate: null,
                timeOfDay: null,
                eventType: null
            });
        }

        const card = {
            id: cardId,
            startDate: startDateStr,
            endDate: endDateStr,
            totalTiffins: TOTAL_CARD_TIFFINS,
            amountPaid: Number(amountPaid) || 6000,
            notes: notes || "",
            createdAt: new Date().toISOString(),
            completedAt: null,
            days: days,
            tiffins: tiffins
        };

        rebuildTiffinAllocations(card);
        return card;
    }

    // SEQUENTIAL TIFFIN REALLOCATION ENGINE (Chronological: Morning first, Evening second)
    function rebuildTiffinAllocations(card) {
        if (!card || !Array.isArray(card.days) || !Array.isArray(card.tiffins)) {
            return { success: false, tiffinsUsed: 0, tiffinsRemaining: TOTAL_CARD_TIFFINS };
        }

        // Reset all 60 tiffins
        card.tiffins.forEach(t => {
            t.status = "available";
            t.usedOnDate = null;
            t.timeOfDay = null;
            t.eventType = null;
        });

        let tiffinPointer = 1;
        let lastTiffinUsedDate = null;

        // Process all 40 calendar days chronologically
        for (let i = 0; i < card.days.length; i++) {
            const day = card.days[i];

            // 1. Morning
            const mCost = getCostForType(day.morning.type);
            day.morning.tiffinCost = mCost;
            day.morning.tiffinNumbers = [];

            if (mCost > 0) {
                if (tiffinPointer + mCost - 1 > TOTAL_CARD_TIFFINS) {
                    return {
                        success: false,
                        error: "exceeded_limit",
                        availableTiffins: TOTAL_CARD_TIFFINS - (tiffinPointer - 1),
                        required: mCost,
                        date: day.date,
                        timeOfDay: "morning"
                    };
                }

                for (let k = 0; k < mCost; k++) {
                    const assignedNum = tiffinPointer + k;
                    day.morning.tiffinNumbers.push(assignedNum);

                    const tObj = card.tiffins.find(t => t.number === assignedNum);
                    if (tObj) {
                        tObj.status = "used";
                        tObj.usedOnDate = day.date;
                        tObj.timeOfDay = "morning";
                        tObj.eventType = day.morning.type;
                    }
                }
                tiffinPointer += mCost;
                lastTiffinUsedDate = day.date;
            }

            // 2. Evening
            const eCost = getCostForType(day.evening.type);
            day.evening.tiffinCost = eCost;
            day.evening.tiffinNumbers = [];

            if (eCost > 0) {
                if (tiffinPointer + eCost - 1 > TOTAL_CARD_TIFFINS) {
                    return {
                        success: false,
                        error: "exceeded_limit",
                        availableTiffins: TOTAL_CARD_TIFFINS - (tiffinPointer - 1),
                        required: eCost,
                        date: day.date,
                        timeOfDay: "evening"
                    };
                }

                for (let k = 0; k < eCost; k++) {
                    const assignedNum = tiffinPointer + k;
                    day.evening.tiffinNumbers.push(assignedNum);

                    const tObj = card.tiffins.find(t => t.number === assignedNum);
                    if (tObj) {
                        tObj.status = "used";
                        tObj.usedOnDate = day.date;
                        tObj.timeOfDay = "evening";
                        tObj.eventType = day.evening.type;
                    }
                }
                tiffinPointer += eCost;
                lastTiffinUsedDate = day.date;
            }
        }

        const tiffinsUsed = tiffinPointer - 1;
        const tiffinsRemaining = TOTAL_CARD_TIFFINS - tiffinsUsed;

        // Set card completion timestamp if all 60 tiffins are consumed
        if (tiffinsUsed === TOTAL_CARD_TIFFINS && !card.completedAt) {
            card.completedAt = lastTiffinUsedDate || new Date().toISOString();
        } else if (tiffinsUsed < TOTAL_CARD_TIFFINS) {
            card.completedAt = null;
        }

        return {
            success: true,
            tiffinsUsed: tiffinsUsed,
            tiffinsRemaining: tiffinsRemaining
        };
    }

    function getCostForType(type) {
        if (type === "normal") return 1;
        if (type === "feast") return 2;
        return 0; // "no_tiffin"
    }

    // Default Initial Demo Card Setup
    function createInitialDemoCard() {
        const startDateStr = "2026-09-14";
        const cardId = "card-2026-09-14";
        const demoCard = createCardStructure(cardId, startDateStr, 6000, "Mess Card #1 — Daily Meal Tracker");

        const sampleLogs = [
            { dayIdx: 1, m: "normal", e: "feast" },       // 14 Sep Mon -> Morning 1 + Evening 2 = 3
            { dayIdx: 2, m: "normal", e: "normal" },      // 15 Sep Tue -> Morning 1 + Evening 1 = 2
            { dayIdx: 3, m: "no_tiffin", e: "normal" },   // 16 Sep Wed -> Morning 0 + Evening 1 = 1
            { dayIdx: 4, m: "feast", e: "no_tiffin" },    // 17 Sep Thu -> Morning 2 + Evening 0 = 2
            { dayIdx: 5, m: "no_tiffin", e: "no_tiffin" },// 18 Sep Fri -> Morning 0 + Evening 0 = 0
            { dayIdx: 6, m: "normal", e: "feast" },       // 19 Sep Sat -> Morning 1 + Evening 2 = 3
            { dayIdx: 7, m: "normal", e: "feast" },       // 20 Sep Sun -> Morning 1 + Evening 2 (Sunday Feast = 2) = 3
            { dayIdx: 8, m: "feast", e: "feast" },        // 21 Sep Mon -> Morning 2 + Evening 2 = 4
            { dayIdx: 9, m: "normal", e: "normal" },
            { dayIdx: 10, m: "normal", e: "no_tiffin" },
            { dayIdx: 11, m: "feast", e: "normal" },
            { dayIdx: 12, m: "normal", e: "normal" }
        ];

        sampleLogs.forEach(log => {
            const d = demoCard.days[log.dayIdx - 1];
            if (d) {
                d.morning.type = log.m;
                d.evening.type = log.e;
                d.updatedAt = new Date().toISOString();
            }
        });

        rebuildTiffinAllocations(demoCard);

        const demoActivity = [
            {
                id: "act-1",
                text: "Evening Feast logged on 20 Sep (2 Tiffins)",
                timestamp: new Date().toISOString(),
                type: "feast"
            },
            {
                id: "act-2",
                text: "Morning Feast & Evening Feast on 21 Sep (4 Tiffins)",
                timestamp: new Date().toISOString(),
                type: "feast"
            },
            {
                id: "act-3",
                text: "Morning Normal & Evening Feast on 14 Sep (3 Tiffins)",
                timestamp: new Date().toISOString(),
                type: "feast"
            }
        ];

        return {
            settings: { ...DEFAULT_SETTINGS },
            activeCardId: cardId,
            cards: [demoCard],
            activity: demoActivity
        };
    }

    function loadData() {
        try {
            const rawData = localStorage.getItem(STORAGE_KEY);
            if (!rawData) {
                appState = createInitialDemoCard();
                saveData();
                return;
            }

            const parsed = JSON.parse(rawData);
            if (parsed && typeof parsed === "object") {
                appState = {
                    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
                    activeCardId: parsed.activeCardId || null,
                    cards: Array.isArray(parsed.cards) ? parsed.cards : [],
                    activity: Array.isArray(parsed.activity) ? parsed.activity : []
                };
            }

            appState.cards.forEach(card => rebuildTiffinAllocations(card));
            sanitizeActiveCard();

        } catch (e) {
            console.error("Error loading MessTrack v4 data:", e);
            appState = createInitialDemoCard();
            saveData();
        }
    }

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        } catch (e) {
            console.error("Failed to save data to localStorage:", e);
            showToast("Failed to save data locally.", "danger");
        }
    }

    function sanitizeActiveCard() {
        if (!appState.cards || appState.cards.length === 0) {
            appState.activeCardId = null;
            return;
        }
        const exists = appState.cards.some(c => c.id === appState.activeCardId);
        if (!exists) {
            appState.activeCardId = appState.cards[0].id;
        }
    }

    function getActiveCard() {
        if (!appState.cards || appState.cards.length === 0) {
            appState.activeCardId = null;
            return null;
        }
        const active = appState.cards.find(c => c.id === appState.activeCardId);
        if (!active) {
            appState.activeCardId = appState.cards[0].id;
            return appState.cards[0];
        }
        return active;
    }

    // 3. STATS & CALCULATIONS
    function calculateCardStats(card) {
        if (!card || !Array.isArray(card.days) || !Array.isArray(card.tiffins)) {
            return {
                totalTiffins: 60,
                usedTiffins: 0,
                remainingTiffins: 60,
                usagePercentage: 0,
                amountPaid: 0,
                costPerTiffin: 0,
                normalCount: 0,
                feastCount: 0,
                noTiffinCount: 0,
                totalActiveEvents: 0,
                daysPassed: 0,
                daysRemaining: 40,
                isCardCompleted: false,
                isCardExpired: false
            };
        }

        const usedTiffins = card.tiffins.filter(t => t.status === "used").length;
        const remainingTiffins = TOTAL_CARD_TIFFINS - usedTiffins;
        const usagePercentage = Math.round((usedTiffins / TOTAL_CARD_TIFFINS) * 100);

        const amountPaid = Number(card.amountPaid) || 0;
        const costPerTiffin = Math.round(amountPaid / TOTAL_CARD_TIFFINS);

        let normalCount = 0;
        let feastCount = 0;
        let noTiffinCount = 0;

        card.days.forEach(d => {
            if (d.morning.type === "normal") normalCount++;
            else if (d.morning.type === "feast") feastCount++;
            else if (d.morning.type === "no_tiffin") noTiffinCount++;

            if (d.evening.type === "normal") normalCount++;
            else if (d.evening.type === "feast") feastCount++;
            else if (d.evening.type === "no_tiffin") noTiffinCount++;
        });

        const totalActiveEvents = normalCount + feastCount;

        const todayStr = new Date().toISOString().split("T")[0];
        let daysPassed = 0;
        if (todayStr >= card.startDate) {
            const startMs = new Date(card.startDate + "T00:00:00").getTime();
            const currMs = Math.min(new Date(todayStr + "T00:00:00").getTime(), new Date(card.endDate + "T00:00:00").getTime());
            daysPassed = Math.floor((currMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
        }

        const daysRemaining = Math.max(0, CARD_VALIDITY_DAYS - daysPassed);
        const isCardCompleted = usedTiffins >= TOTAL_CARD_TIFFINS;
        const isCardExpired = todayStr > card.endDate && !isCardCompleted;

        return {
            totalTiffins: TOTAL_CARD_TIFFINS,
            usedTiffins,
            remainingTiffins,
            usagePercentage,
            amountPaid,
            costPerTiffin,
            normalCount,
            feastCount,
            noTiffinCount,
            totalActiveEvents,
            daysPassed,
            daysRemaining,
            isCardCompleted,
            isCardExpired
        };
    }

    function calculateAllTimeStats() {
        let totalTiffins = 0;
        let usedTiffins = 0;
        let remainingTiffins = 0;
        let totalSpent = 0;
        let totalFeasts = 0;

        appState.cards.forEach(card => {
            const stats = calculateCardStats(card);
            totalTiffins += stats.totalTiffins;
            usedTiffins += stats.usedTiffins;
            remainingTiffins += stats.remainingTiffins;
            totalSpent += stats.amountPaid;
            totalFeasts += stats.feastCount;
        });

        return {
            totalTiffins,
            usedTiffins,
            remainingTiffins,
            totalSpent,
            totalFeasts,
            cardCount: appState.cards.length
        };
    }

    function formatCurrency(amount) {
        return "₹" + Number(amount || 0).toLocaleString("en-IN");
    }

    function formatDateFormatted(dateStr) {
        if (!dateStr) return "";
        const parts = dateStr.split("-");
        if (parts.length === 3) {
            const d = parseInt(parts[2], 10);
            const m = parseInt(parts[1], 10) - 1;
            const y = parts[0];
            return `${d < 10 ? '0' + d : d} ${SHORT_MONTH_NAMES[m]} ${y}`;
        }
        return dateStr;
    }

    function formatRelativeTime(isoStr) {
        if (!isoStr) return "";
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return "";

        const now = new Date();
        const diffSec = Math.floor((now - date) / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSec < 60) return "Just now";
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays}d ago`;

        return `${date.getDate()} ${SHORT_MONTH_NAMES[date.getMonth()]}`;
    }

    // 4. RENDERING VIEWS & SAFE EMPTY STATES
    function renderApp() {
        sanitizeActiveCard();

        renderDashboard();
        renderMyCard();
        renderHistory();
        renderSettings();
        updateSidebarPill(getActiveCard());
    }

    function updateSidebarPill(activeCard) {
        const pillText = document.getElementById("sidebar-active-card-text");
        if (!pillText) return;

        if (activeCard) {
            pillText.textContent = `${formatDateFormatted(activeCard.startDate).split(" ")[1]} Card`;
        } else {
            pillText.textContent = "No Active Card";
        }
    }

    // Dashboard Renderer
    function renderDashboard() {
        const activeCard = getActiveCard();
        const emptyState = document.getElementById("dashboard-empty-state");
        const contentWrapper = document.getElementById("dashboard-content-wrapper");

        if (!activeCard) {
            if (emptyState) emptyState.classList.remove("hidden");
            if (contentWrapper) contentWrapper.classList.add("hidden");
            document.getElementById("dashboard-subtitle").textContent = "No Active Card";
            return;
        }

        if (emptyState) emptyState.classList.add("hidden");
        if (contentWrapper) contentWrapper.classList.remove("hidden");

        const stats = calculateCardStats(activeCard);

        const startFormatted = formatDateFormatted(activeCard.startDate);
        const endFormatted = formatDateFormatted(activeCard.endDate);
        document.getElementById("dash-card-period-title").textContent = `${startFormatted} → ${endFormatted}`;
        document.getElementById("dash-card-days-info").textContent = `Day ${stats.daysPassed} of 40 Calendar Days (${stats.daysRemaining} Days Remaining)`;
        document.getElementById("dashboard-subtitle").textContent = "Active 60-Tiffin Card Overview";

        const statusBadge = document.getElementById("dash-status-badge");
        if (stats.isCardCompleted) {
            statusBadge.textContent = "CARD COMPLETED (60/60 USED)";
            statusBadge.className = "badge badge-primary";
        } else if (stats.isCardExpired) {
            statusBadge.textContent = "PERIOD EXPIRED";
            statusBadge.className = "badge badge-secondary";
        } else {
            statusBadge.textContent = "ACTIVE CARD";
            statusBadge.className = "badge badge-primary";
        }

        document.getElementById("dash-amount-paid").textContent = formatCurrency(stats.amountPaid);
        document.getElementById("dash-cost-per-check").textContent = formatCurrency(stats.costPerTiffin);

        document.getElementById("dash-stat-total").textContent = stats.totalTiffins;
        document.getElementById("dash-stat-used").textContent = stats.usedTiffins;
        document.getElementById("dash-stat-remaining").textContent = stats.remainingTiffins;
        document.getElementById("dash-stat-feasts").textContent = stats.feastCount;

        document.getElementById("dash-stat-used-pct").textContent = `${stats.usagePercentage}% consumed`;
        document.getElementById("dash-stat-remaining-pct").textContent = `${100 - stats.usagePercentage}% balance`;

        document.getElementById("dash-progress-sub").textContent = `${stats.usedTiffins} / 60 Tiffins Consumed`;
        document.getElementById("dash-progress-pct").textContent = `${stats.usagePercentage}%`;
        document.getElementById("dash-progress-fill").style.width = `${stats.usagePercentage}%`;

        document.getElementById("dash-cnt-normal").textContent = stats.normalCount;
        document.getElementById("dash-cnt-feasts").textContent = stats.feastCount;
        document.getElementById("dash-cnt-notiffin").textContent = stats.noTiffinCount;
        document.getElementById("dash-cnt-total-events").textContent = stats.totalActiveEvents;

        renderRecentActivity();
        renderAllTimeStats();
    }

    function renderRecentActivity() {
        const container = document.getElementById("dashboard-activity-list");
        if (!container) return;

        container.innerHTML = "";

        if (!appState.activity || appState.activity.length === 0) {
            container.innerHTML = `<p class="text-muted text-sm text-center py-4">No recent activity recorded.</p>`;
            return;
        }

        const recentList = appState.activity.slice(0, 8);

        recentList.forEach(act => {
            const item = document.createElement("div");
            item.className = "activity-item";

            let iconClass = "act-icon-normal";
            let symbol = "✓";

            if (act.type === "feast") {
                iconClass = "act-icon-feast";
                symbol = "🔥";
            } else if (act.type === "no_tiffin") {
                iconClass = "act-icon-notiffin";
                symbol = "—";
            }

            item.innerHTML = `
                <div class="act-icon ${iconClass}">${symbol}</div>
                <div class="act-content">
                    <div class="act-text">${escapeHtml(act.text)}</div>
                    <div class="act-time">${formatRelativeTime(act.timestamp)}</div>
                </div>
            `;

            container.appendChild(item);
        });
    }

    function renderAllTimeStats() {
        const atStats = calculateAllTimeStats();

        document.getElementById("at-total-checks").textContent = atStats.totalTiffins;
        document.getElementById("at-used-checks").textContent = atStats.usedTiffins;
        document.getElementById("at-remaining-checks").textContent = atStats.remainingTiffins;
        document.getElementById("at-total-feasts").textContent = atStats.totalFeasts;
        document.getElementById("at-total-spent").textContent = formatCurrency(atStats.totalSpent);
        document.getElementById("alltime-card-count").textContent = `${atStats.cardCount} Card${atStats.cardCount === 1 ? '' : 's'}`;

        renderMonthlyBarChart();
    }

    function renderMonthlyBarChart() {
        const container = document.getElementById("monthly-bar-chart");
        if (!container) return;

        container.innerHTML = "";
        if (appState.cards.length === 0) return;

        const chartCards = [...appState.cards].slice(0, 6).reverse();

        chartCards.forEach(c => {
            const stats = calculateCardStats(c);
            const pct = stats.usagePercentage;
            const label = `${SHORT_MONTH_NAMES[new Date(c.startDate + "T00:00:00").getMonth()]}`;

            const barGroup = document.createElement("div");
            barGroup.className = "chart-bar-group";
            barGroup.title = `Card (${formatDateFormatted(c.startDate)}): ${stats.usedTiffins}/60 Tiffins (${pct}%)`;

            barGroup.innerHTML = `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar-fill" style="height: ${Math.max(pct, 5)}%;"></div>
                </div>
                <span class="chart-bar-label">${label}</span>
            `;

            container.appendChild(barGroup);
        });
    }

    // Digital Mess Card Renderer (My Card)
    function renderMyCard() {
        const activeCard = getActiveCard();
        const emptyState = document.getElementById("mycard-empty-state");
        const contentWrapper = document.getElementById("mycard-content-wrapper");
        const selectWrapper = document.getElementById("mycard-select-wrapper");

        if (!activeCard) {
            if (emptyState) emptyState.classList.remove("hidden");
            if (contentWrapper) contentWrapper.classList.add("hidden");
            if (selectWrapper) selectWrapper.classList.add("hidden");
            return;
        }

        if (emptyState) emptyState.classList.add("hidden");
        if (contentWrapper) contentWrapper.classList.remove("hidden");
        if (selectWrapper) selectWrapper.classList.remove("hidden");

        const cardDropdown = document.getElementById("card-select-dropdown");
        if (cardDropdown) {
            cardDropdown.innerHTML = "";
            appState.cards.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c.id;
                opt.textContent = `${formatDateFormatted(c.startDate)} → ${formatDateFormatted(c.endDate)}`;
                if (c.id === appState.activeCardId) opt.selected = true;
                cardDropdown.appendChild(opt);
            });
        }

        const stats = calculateCardStats(activeCard);

        document.getElementById("card-display-period").textContent = `${formatDateFormatted(activeCard.startDate)} → ${formatDateFormatted(activeCard.endDate)}`;
        document.getElementById("card-display-notes").textContent = activeCard.notes || "40-Day Tracking Period";
        document.getElementById("card-pill-capacity").textContent = "60 Tiffins Quota";
        document.getElementById("card-pill-cost").textContent = `${formatCurrency(stats.amountPaid)} Paid`;

        document.getElementById("card-stat-used").textContent = stats.usedTiffins;
        document.getElementById("card-stat-remaining").textContent = stats.remainingTiffins;
        document.getElementById("card-stat-feasts-cnt").textContent = stats.feastCount;
        document.getElementById("card-stat-pct").textContent = `${stats.usagePercentage}%`;

        document.getElementById("grid-lbl-available").textContent = `Available (${stats.remainingTiffins})`;
        document.getElementById("grid-lbl-used").textContent = `Used (${stats.usedTiffins})`;

        // 1. RENDER 60 TIFFINS GRID (#01 to #60)
        const checkGridContainer = document.getElementById("check-grid-container");
        checkGridContainer.innerHTML = "";

        activeCard.tiffins.forEach(tiffin => {
            const box = document.createElement("div");
            box.className = `check-item-box status-${tiffin.status}`;
            box.setAttribute("data-tiffin-num", tiffin.number);

            let titleText = `Tiffin #${tiffin.number} Available`;
            if (tiffin.status === "used") {
                const timeLabel = tiffin.timeOfDay === "morning" ? "Morning" : "Evening";
                const typeLabel = tiffin.eventType === "feast" ? "Feast" : "Normal";
                titleText = `Tiffin #${tiffin.number} used on ${formatDateFormatted(tiffin.usedOnDate)} (${timeLabel} ${typeLabel})`;
            }
            box.title = titleText;

            const iconSymbol = tiffin.status === "used" ? "✓" : "○";

            box.innerHTML = `
                <span class="check-num">#${String(tiffin.number).padStart(2, '0')}</span>
                <span class="check-icon">${iconSymbol}</span>
            `;

            checkGridContainer.appendChild(box);
        });

        // 2. RENDER 40-DAY CALENDAR TIMELINE
        const calendarContainer = document.getElementById("calendar-timeline-container");
        calendarContainer.innerHTML = "";

        activeCard.days.forEach(day => {
            const dayCard = document.createElement("div");
            dayCard.className = "day-timeline-card";
            dayCard.setAttribute("data-date", day.date);

            const dayCost = day.morning.tiffinCost + day.evening.tiffinCost;

            function formatMealBadge(mealObj) {
                if (mealObj.type === "normal") return `<span class="badge badge-normal">✓ Normal (1 Tiffin)</span>`;
                if (mealObj.type === "feast") return `<span class="badge badge-feast">🔥 Feast (2 Tiffins)</span>`;
                return `<span class="badge badge-notiffin">— No Tiffin (0 Tiffins)</span>`;
            }

            function formatTiffinNums(nums) {
                if (!nums || nums.length === 0) return "";
                if (nums.length === 1) return `#${String(nums[0]).padStart(2, '0')}`;
                return `#${String(nums[0]).padStart(2, '0')}–${String(nums[nums.length - 1]).padStart(2, '0')}`;
            }

            dayCard.innerHTML = `
                <div class="dt-header">
                    <span class="dt-date">${formatDateFormatted(day.date)}</span>
                    <span class="dt-dayname">${day.dayOfWeek} (Day ${day.dayIndex} of 40)</span>
                </div>
                <div class="dt-meals-container">
                    <div class="dt-meal-line">
                        <span class="dt-meal-lbl">☀ Morning:</span>
                        <div class="flex items-center gap-1">
                            ${formatMealBadge(day.morning)}
                            <span class="text-xs text-muted">${formatTiffinNums(day.morning.tiffinNumbers)}</span>
                        </div>
                    </div>
                    <div class="dt-meal-line">
                        <span class="dt-meal-lbl">🌙 Evening:</span>
                        <div class="flex items-center gap-1">
                            ${formatMealBadge(day.evening)}
                            <span class="text-xs text-muted">${formatTiffinNums(day.evening.tiffinNumbers)}</span>
                        </div>
                    </div>
                </div>
                <div class="dt-day-total-row">
                    <span>Day Total Consumption:</span>
                    <span>${dayCost} Tiffin${dayCost === 1 ? '' : 's'}</span>
                </div>
            `;

            dayCard.addEventListener("click", () => {
                openDayEventModal(activeCard.id, day.date);
            });

            calendarContainer.appendChild(dayCard);
        });
    }

    // History Renderer
    function renderHistory() {
        const container = document.getElementById("history-list-container");
        const emptyState = document.getElementById("history-empty-state");
        if (!container) return;

        container.innerHTML = "";

        if (!appState.cards || appState.cards.length === 0) {
            if (emptyState) emptyState.classList.remove("hidden");
            container.classList.add("hidden");
            return;
        }

        if (emptyState) emptyState.classList.add("hidden");
        container.classList.remove("hidden");

        appState.cards.forEach(card => {
            const stats = calculateCardStats(card);
            const isActive = card.id === appState.activeCardId;

            const historyCard = document.createElement("div");
            historyCard.className = "history-card";

            let statusLabel = "Card Active";
            if (stats.isCardCompleted && card.completedAt) {
                statusLabel = `Card Completed on ${formatDateFormatted(card.completedAt)}`;
            } else if (stats.isCardExpired) {
                statusLabel = `Tracking Period Expired`;
            }

            historyCard.innerHTML = `
                <div class="history-card-header">
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="history-month-name">60-Tiffin Mess Card</h2>
                            ${isActive ? '<span class="badge badge-primary">Active</span>' : ''}
                            ${stats.isCardCompleted ? '<span class="badge badge-primary">Completed</span>' : ''}
                        </div>
                        <p class="history-meta">Period: ${formatDateFormatted(card.startDate)} → ${formatDateFormatted(card.endDate)} (40 Days) • ${statusLabel}</p>
                    </div>
                    <div class="history-actions">
                        <button class="btn btn-secondary btn-sm view-card-btn" data-card-id="${card.id}">
                            🍱 View Card
                        </button>
                        <button class="btn btn-danger btn-sm delete-card-btn" data-card-id="${card.id}">
                            🗑️ Delete
                        </button>
                    </div>
                </div>

                <div class="history-stats-grid">
                    <div>
                        <div class="hstat-val">60</div>
                        <div class="hstat-lbl">Tiffins</div>
                    </div>
                    <div>
                        <div class="hstat-val text-success">${stats.usedTiffins}</div>
                        <div class="hstat-lbl">Used</div>
                    </div>
                    <div>
                        <div class="hstat-val text-accent">${stats.remainingTiffins}</div>
                        <div class="hstat-lbl">Remaining</div>
                    </div>
                    <div>
                        <div class="hstat-val text-amber">${stats.feastCount}</div>
                        <div class="hstat-lbl">Feasts</div>
                    </div>
                    <div>
                        <div class="hstat-val">${formatCurrency(stats.amountPaid)}</div>
                        <div class="hstat-lbl">Paid</div>
                    </div>
                </div>

                <div class="progress-bar-track" style="margin: 0; height: 6px;">
                    <div class="progress-bar-fill" style="width: ${stats.usagePercentage}%;"></div>
                </div>
            `;

            historyCard.querySelector(".view-card-btn").addEventListener("click", () => {
                appState.activeCardId = card.id;
                saveData();
                showSection("my-card");
                renderApp();
            });

            historyCard.querySelector(".delete-card-btn").addEventListener("click", () => {
                confirmDeleteCard(card.id);
            });

            container.appendChild(historyCard);
        });
    }

    function renderSettings() {
        const currentTheme = appState.settings.theme || "light";
        const lightRadio = document.getElementById("theme-light");
        const darkRadio = document.getElementById("theme-dark");

        if (currentTheme === "dark") {
            darkRadio.checked = true;
        } else {
            lightRadio.checked = true;
        }
    }

    // 5. NAVIGATION & CONTROLS
    function showSection(sectionId, updateHash = true) {
        document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
        document.querySelectorAll(".nav-link").forEach(link => link.classList.remove("active"));

        const targetSection = document.getElementById(`${sectionId}-section`);
        const targetLink = document.querySelector(`.nav-link[data-section="${sectionId}"]`);

        if (targetSection) targetSection.classList.add("active");
        if (targetLink) targetLink.classList.add("active");

        closeMobileSidebar();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function toggleMobileSidebar() {
        document.getElementById("sidebar").classList.toggle("open");
        document.getElementById("sidebar-backdrop").classList.toggle("active");
    }

    function closeMobileSidebar() {
        const sidebar = document.getElementById("sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");
        if (sidebar) sidebar.classList.remove("open");
        if (backdrop) backdrop.classList.remove("active");
    }

    // 6. DAY EVENT MODAL & DUAL-MEAL REALLOCATION
    function openDayEventModal(cardId, dateStr) {
        const card = appState.cards.find(c => c.id === cardId);
        if (!card) return;

        const day = card.days.find(d => d.date === dateStr);
        if (!day) return;

        activeDayContext = { cardId, dateStr };

        document.getElementById("day-modal-title").textContent = formatDateFormatted(dateStr);
        document.getElementById("day-modal-sub").textContent = `${day.dayOfWeek} (Day ${day.dayIndex} of 40)`;

        updateModalOptionButtons("morning", day.morning.type);
        updateModalOptionButtons("evening", day.evening.type);

        updateModalDayTotalText(day.morning.type, day.evening.type);

        openModal("day-event-modal");
    }

    function updateModalOptionButtons(timeOfDay, selectedType) {
        const pillElem = document.getElementById(`day-modal-${timeOfDay}-pill`);
        let label = "No Tiffin — 0 Tiffins";
        if (selectedType === "normal") label = "Normal — 1 Tiffin";
        if (selectedType === "feast") label = "Feast — 2 Tiffins";
        pillElem.textContent = label;

        document.querySelectorAll(`.meal-opt-btn[data-time="${timeOfDay}"]`).forEach(btn => {
            const btnType = btn.getAttribute("data-type");
            if (btnType === selectedType) {
                btn.classList.add("active-opt");
            } else {
                btn.classList.remove("active-opt");
            }
        });
    }

    function updateModalDayTotalText(mType, eType) {
        const mCost = getCostForType(mType);
        const eCost = getCostForType(eType);
        const total = mCost + eCost;
        document.getElementById("day-modal-total-checks-text").textContent = `${total} Tiffin${total === 1 ? '' : 's'}`;
    }

    function handleUpdateMealEvent(timeOfDay, newType) {
        const { cardId, dateStr } = activeDayContext;
        if (!cardId || !dateStr) return;

        const card = appState.cards.find(c => c.id === cardId);
        if (!card) return;

        const day = card.days.find(d => d.date === dateStr);
        if (!day) return;

        const currentMealObj = day[timeOfDay];
        if (currentMealObj.type === newType) return;

        // SAFE REALLOCATION TEST ON CLONE
        const cloneCard = JSON.parse(JSON.stringify(card));
        const cloneDay = cloneCard.days.find(d => d.date === dateStr);
        cloneDay[timeOfDay].type = newType;

        const testResult = rebuildTiffinAllocations(cloneCard);

        if (!testResult.success) {
            if (testResult.availableTiffins === 0) {
                showToast("No tiffins remaining on this card.", "warning");
            } else {
                showToast(`Only ${testResult.availableTiffins} tiffin remains. A feast requires ${testResult.required} tiffins.`, "warning");
            }
            return;
        }

        // Apply to real card
        day[timeOfDay].type = newType;
        day.updatedAt = new Date().toISOString();

        rebuildTiffinAllocations(card);

        updateModalOptionButtons(timeOfDay, newType);
        updateModalDayTotalText(day.morning.type, day.evening.type);

        const labelTime = timeOfDay === "morning" ? "Morning" : "Evening";
        let labelMeal = "Normal (1 Tiffin)";
        if (newType === "feast") labelMeal = "Feast (2 Tiffins)";
        if (newType === "no_tiffin") labelMeal = "No Tiffin (0 Tiffins)";

        const logMsg = `${labelTime} meal set to ${labelMeal} for ${formatDateFormatted(dateStr)}`;
        addActivityLog(logMsg, newType);

        saveData();
        renderApp();
        showToast(logMsg, newType === "feast" ? "warning" : "success");
    }

    function addActivityLog(text, type) {
        appState.activity.unshift({
            id: "act-" + Date.now(),
            text: text,
            timestamp: new Date().toISOString(),
            type: type
        });

        if (appState.activity.length > 20) {
            appState.activity = appState.activity.slice(0, 20);
        }
    }

    // Add Card Form Submit
    function handleAddCardSubmit(e) {
        e.preventDefault();

        const startDateVal = document.getElementById("add-start-date").value;
        const amountPaidVal = parseFloat(document.getElementById("add-amount-input").value);
        const notesVal = document.getElementById("add-notes-input").value.trim();

        if (!startDateVal) {
            showToast("Please select a valid card start date.", "warning");
            return;
        }

        if (isNaN(amountPaidVal) || amountPaidVal < 0) {
            showToast("Amount paid cannot be negative.", "warning");
            return;
        }

        const cardId = `card-${startDateVal}`;

        if (appState.cards.some(c => c.id === cardId)) {
            showToast(`A card starting on ${formatDateFormatted(startDateVal)} already exists!`, "warning");
            return;
        }

        const newCard = createCardStructure(cardId, startDateVal, amountPaidVal, notesVal);

        appState.cards.unshift(newCard);
        appState.cards.sort((a, b) => b.startDate.localeCompare(a.startDate));
        appState.activeCardId = cardId;

        addActivityLog(`Created new 60-Tiffin Mess Card starting ${formatDateFormatted(startDateVal)}`, "normal");

        saveData();
        renderApp();
        showSection("dashboard");
        showToast(`60-Tiffin Mess Card created successfully!`, "success");

        document.getElementById("add-card-form").reset();
        setupAddCardFormDefaults();
    }

    // Delete Card Logic
    function confirmDeleteCard(cardId) {
        const card = appState.cards.find(c => c.id === cardId);
        if (!card) return;

        const name = `${formatDateFormatted(card.startDate)} Card`;
        showConfirmModal(
            `Are you sure you want to delete the ${name}? All tiffin records for this card will be permanently removed.`,
            () => {
                deleteCard(cardId);
            }
        );
    }

    function deleteCard(cardId) {
        appState.cards = appState.cards.filter(c => c.id !== cardId);

        if (appState.cards.length === 0) {
            appState.activeCardId = null;
        } else if (appState.activeCardId === cardId) {
            appState.activeCardId = appState.cards[0].id;
        }

        saveData();
        renderApp();
        showToast("Card record deleted.", "info");
    }

    // Modal Helpers
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add("hidden");
            document.body.style.overflow = "";
        }
    }

    function showConfirmModal(message, callback) {
        document.getElementById("confirm-modal-message").textContent = message;
        confirmActionCallback = callback;
        openModal("confirm-modal");
    }

    // Theme Management
    function applyTheme(theme) {
        appState.settings.theme = theme;
        document.documentElement.setAttribute("data-theme", theme);
    }

    function handleThemeChange(theme) {
        applyTheme(theme);
        saveData();
        showToast(`Theme changed to ${theme === "dark" ? "Dark Mode 🌙" : "Light Mode ☀️"}`, "info");
    }

    // Export & Import Data
    function exportData() {
        const exportObj = {
            version: "4.0",
            system: "40-Day / 60-Tiffin Morning & Evening Mess Engine",
            exportedAt: new Date().toISOString(),
            data: appState
        };

        const jsonStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `mess-track-backup-${dateStamp}.json`;

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        showToast("Backup file exported successfully!", "success");
    }

    function importData(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const parsed = JSON.parse(e.target.result);
                let targetData = parsed.data || parsed;

                if (!targetData || !Array.isArray(targetData.cards)) {
                    showToast("Invalid backup file structure. Existing data remains unchanged.", "danger");
                    return;
                }

                showConfirmModal(
                    "Restoring backup will replace all current MessTrack card records. Continue?",
                    () => {
                        appState = {
                            settings: { ...DEFAULT_SETTINGS, ...(targetData.settings || {}) },
                            activeCardId: targetData.activeCardId || (targetData.cards.length > 0 ? targetData.cards[0].id : null),
                            cards: targetData.cards,
                            activity: Array.isArray(targetData.activity) ? targetData.activity : []
                        };

                        appState.cards.forEach(c => rebuildTiffinAllocations(c));

                        saveData();
                        applyTheme(appState.settings.theme);
                        renderApp();
                        showToast("Backup restored successfully!", "success");
                    }
                );

            } catch (err) {
                console.error("Import JSON parse error:", err);
                showToast("Invalid JSON file. Existing data was not changed.", "danger");
            }
        };

        reader.readAsText(file);
    }

    function clearAllData() {
        showConfirmModal(
            "Are you sure you want to delete ALL MessTrack cards? This will permanently wipe all records.",
            () => {
                appState.cards = [];
                appState.activity = [];
                appState.activeCardId = null;

                saveData();
                renderApp();
                showToast("All MessTrack data has been cleared.", "info");
            }
        );
    }

    // Toast Notifications
    function showToast(message, type = "info") {
        const container = document.getElementById("toast-container");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        let icon = "ℹ️";
        if (type === "success") icon = "✅";
        if (type === "danger") icon = "❌";
        if (type === "warning") icon = "⚠️";

        toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            toast.style.transition = "all 0.25s ease";
            setTimeout(() => {
                if (toast.parentNode) container.removeChild(toast);
            }, 250);
        }, 3200);
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function setupAddCardFormDefaults() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const startDate = `${yyyy}-${mm}-${dd}`;

        document.getElementById("add-start-date").value = startDate;
        document.getElementById("add-amount-input").value = 6000;
    }

    // 7. EVENT LISTENERS
    function setupEventListeners() {
        document.querySelectorAll(".nav-link").forEach(link => {
            link.addEventListener("click", () => {
                const section = link.getAttribute("data-section");
                showSection(section);
            });
        });

        document.querySelectorAll(".create-card-btn").forEach(btn => {
            btn.addEventListener("click", () => showSection("add-card"));
        });

        document.getElementById("hamburger-btn").addEventListener("click", toggleMobileSidebar);
        document.getElementById("close-sidebar-btn").addEventListener("click", closeMobileSidebar);
        document.getElementById("sidebar-backdrop").addEventListener("click", closeMobileSidebar);

        document.getElementById("quick-theme-toggle").addEventListener("click", () => {
            const newTheme = appState.settings.theme === "dark" ? "light" : "dark";
            handleThemeChange(newTheme);
            renderSettings();
        });

        document.getElementById("dash-quick-view-card-btn").addEventListener("click", () => showSection("my-card"));

        const cardSelectDropdown = document.getElementById("card-select-dropdown");
        if (cardSelectDropdown) {
            cardSelectDropdown.addEventListener("change", (e) => {
                appState.activeCardId = e.target.value;
                saveData();
                renderApp();
            });
        }

        const addCardForm = document.getElementById("add-card-form");
        if (addCardForm) {
            addCardForm.addEventListener("submit", handleAddCardSubmit);
            document.getElementById("add-cancel-btn").addEventListener("click", () => showSection("dashboard"));
        }

        document.querySelectorAll(".meal-opt-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const timeOfDay = btn.getAttribute("data-time");
                const type = btn.getAttribute("data-type");
                handleUpdateMealEvent(timeOfDay, type);
            });
        });

        document.getElementById("close-day-modal").addEventListener("click", () => closeModal("day-event-modal"));
        document.getElementById("cancel-day-modal").addEventListener("click", () => closeModal("day-event-modal"));

        document.getElementById("close-confirm-modal").addEventListener("click", () => closeModal("confirm-modal"));
        document.getElementById("confirm-modal-cancel-btn").addEventListener("click", () => closeModal("confirm-modal"));
        document.getElementById("confirm-modal-action-btn").addEventListener("click", () => {
            if (typeof confirmActionCallback === "function") confirmActionCallback();
            closeModal("confirm-modal");
        });

        document.querySelectorAll('input[name="theme-choice"]').forEach(radio => {
            radio.addEventListener("change", (e) => handleThemeChange(e.target.value));
        });

        document.getElementById("export-backup-btn").addEventListener("click", exportData);

        const importFileInput = document.getElementById("import-file-input");
        document.getElementById("import-backup-btn").addEventListener("click", () => {
            importFileInput.value = "";
            importFileInput.click();
        });

        importFileInput.addEventListener("change", (e) => {
            if (e.target.files.length > 0) importData(e.target.files[0]);
        });

        document.getElementById("clear-all-data-btn").addEventListener("click", clearAllData);

        setupAddCardFormDefaults();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
