# 🍱 MessTrack — 60-Check Morning & Evening Mess Card System

MessTrack is a lightweight, responsive, pure client-side web application designed to accurately simulate a **real physical 60-check mess/tiffin card** with independent **Morning and Evening** meal tracking.

---

## 🎟️ Core System Rules & Mechanics

### 1. Two Separate Concepts
- **60 Checks Balance**: Total tiffin quota (`totalChecks = 60`). The card is **COMPLETED** as soon as all 60 checks are consumed (e.g. in 40 days, 45 days, etc.).
- **60-Day Tracking Period**: Maximum calendar validity window (`endDate = startDate + 59 days`).

### 2. Independent Morning & Evening Entries
Every calendar day in the 60-day tracking period contains two independent meal periods:
- ☀ **Morning**
- 🌙 **Evening**

Each meal period independently has **EXACTLY THREE CHOICES** (regardless of the day of the week):

| Selection | Check Cost | Description |
| :--- | :---: | :--- |
| `Normal` | **1 Check** | Standard tiffin consumed |
| `Feast` | **2 Checks** | Feast tiffin consumed (available any morning or evening) |
| `No Tiffin` | **0 Checks** | No tiffin taken during this period |

*Note: Sunday is a standard calendar date. A Sunday Feast consumes 2 checks per period (same as any other day). No Tiffin consumes 0 checks.*

### 3. Sequential Check Allocation Engine
Checks #01 to #60 are allocated chronologically in this order:
$$\text{Date 1 Morning} \rightarrow \text{Date 1 Evening} \rightarrow \text{Date 2 Morning} \rightarrow \text{Date 2 Evening} \rightarrow \dots$$

**Check Cap Protection**: If an edit causes total checks to exceed 60, the system blocks the update with a clear warning: *"Not enough checks remaining. Only X checks remain, selected meal requires Y checks."*

### 4. Zero Cards & Empty State Management
When zero cards exist in the application (or when all cards are deleted):
- `activeCardId` resets to `null` and `localStorage` stores `cards: []`.
- Dashboard, My Card, and History views render clean empty state cards displaying: *"No Mess Card Yet — You don't have an active mess card. Create a new 60-check card to start tracking your tiffins."* with a functional **`[ + Create New Card ]`** button.
- Navigating to **+ New Card** or clicking any empty state button opens the card creation form, and submitting immediately renders the new active card without page refresh.

---

## ✨ Features

- 🎟️ **60-Check Coupon Grid**: Visual grid showing check balance (#01 to #60) with `AVAILABLE` (○) and `USED` (✓) statuses. Hovering or inspecting any used check reveals which Date & Morning/Evening entry consumed it.
- 📅 **60-Day Calendar Timeline**: Cards displaying Date, Day of week, Morning status, Evening status, and Day Total Checks consumed (0 to 4 checks).
- 📊 **Dynamic Analytics Dashboard**: Calculates total checks (60), checks used, checks remaining, feast counts, usage %, amount paid, and cost per check (`Amount Paid / 60`).
- 📈 **All-Cards History**: Visual bar charts and multi-card history records with completion timestamps.
- 🌓 **Light & Dark Mode**: Built-in visual theme toggle with CSS variables.
- 💾 **Local Browser Persistence**: Stores data securely in `localStorage` under `messtrack_data_v3`.
- 📥 **Backup & Restore**: Export complete card database to JSON (`mess-track-backup-YYYY-MM-DD.json`) and import backups with validation.
- 📱 **Mobile & Desktop Responsive**: Clean layout for all viewports from 320px to 4K.

---

## 🛠️ Technology Stack

- **HTML5**: Semantic markup with accessibility standards.
- **CSS3**: CSS Custom Properties (Theme tokens), Flexbox, CSS Grid.
- **Vanilla JavaScript (ES6+)**: Pure client-side logic, sequential check recalculation engine, local storage persistence, modal dialogs, and JSON export/import.
- **Zero Dependencies**: Pure HTML/CSS/JS with zero build tools, node packages, or external dependencies.

---

## 📁 Project Structure

```
mess-track/
├── index.html       # Single Page Application structure
├── style.css        # CSS Design system, 60-check grid & Morning/Evening timeline styles
├── script.js        # 60-Check Morning/Evening Engine & localStorage logic
└── README.md        # Project documentation
```

---

## 🚀 How to Run Locally

1. **Directly open `index.html`**:
   Double-click `index.html` or drag it into any web browser.

2. **Or run via local web server (Optional)**:
   ```bash
   python -m http.server 8000
   ```
   Open `http://localhost:8000` in your browser.
