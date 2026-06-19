import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';
import { WIDGET_STATS } from './widgets.js';
import { UNITS } from './units.js'; 

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let nakedStats = JSON.parse(localStorage.getItem('ks_naked_stats')) || null;
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };
let optRole = 'atk'; 

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) },
    bear: { heroes: Array(3).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) }
};

// --- INITIALIZATION ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { 
        if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; 
    });
    
    const mainSel = document.getElementById('hero-select');
    if (mainSel) {
        mainSel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { mainSel.innerHTML += `<option value="${n}">${n}</option>`; });
        mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index, activeSlot.side);
    }
    
    buildStatTable(); // Build Battle Sim Table
    initFormationGrids(); // Build Formations Tab Grids (ONCE)
    window.addBatch('atk', true); 
    window.addBatch('def', true);
    window.updateGrids(); 
    renderRosterUI(); 
    window.showTab('battle');
};

// --- NAVIGATION ---
window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        const el = document.getElementById(screens[k]);
        if (el) el.classList.toggle('hidden', k !== tab);
        const b = document.getElementById(btns[k]);
        if (b) b.className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold text-white shadow-lg" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
    window.updateGrids(); // Refresh grids on tab change
};

// --- HERO MODAL LOGIC ---
window.openHeroModal = (side, index) => {
    activeSlot = { side, index };
    const h = state[side].heroes[index];
    modalTemp = { s1: h.s1, s2: h.s2, s3: h.s3 };
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index, side);
    document.getElementById('heroModal').classList.replace('hidden', 'flex');
};

window.syncFormationUI = () => {
    ['atk', 'def'].forEach(side => {
        const statGrid = document.getElementById(`opt-${side}-stats-grid`);
        if (statGrid) {
            statGrid.innerHTML = '';
            ['inf', 'cav', 'arc'].forEach(u => {
                ['att', 'def', 'leth', 'hp'].forEach(s => {
                    const key = `${u}_${s}`;
                    const val = document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`)?.value || 1000;
                    statGrid.innerHTML += `<div><label class="text-[7px] text-slate-500 font-black block">${u} ${s}</label><input type="number" value="${val}" oninput="window.updateSharedStat('${side}', '${key}', this.value)" class="input-dark !py-1 !text-[10px]"></div>`;
                });
            });
        }
        const tierGrid = document.getElementById(`opt-${side}-tiers`);
        if (tierGrid) {
            tierGrid.innerHTML = '';
            ['inf', 'cav', 'arc'].forEach(u => {
                const t = document.querySelector(`#${side}-batch-container .batch-tier-${u}`)?.value || 10;
                const tg = document.querySelector(`#${side}-batch-container .batch-tg-${u}`)?.value || 3;
                tierGrid.innerHTML += `<div class="flex flex-col gap-1"><label class="text-[7px] text-slate-500 uppercase font-black">${u} T/TG</label><div class="flex gap-1"><select onchange="window.updateSharedTier('${side}','${u}','tier',this.value)" class="bg-slate-900 text-[9px] border border-slate-700 rounded px-1 text-slate-300 outline-none">${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v==t?'selected':''}>T${v}</option>`).join('')}</select><select onchange="window.updateSharedTier('${side}','${u}','tg',this.value)" class="bg-slate-900 text-[9px] border border-slate-700 rounded px-1 text-slate-300 outline-none">${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v==tg?'selected':''}>TG${v}</option>`).join('')}</select></div></div>`;
            });
        }
    });
};

window.updateSharedTier = (side, unit, type, val, origin) => {
    const targetSelector = origin === 'sim' ? `.opt-${side}-${unit}-${type}` : `#${side}-batch-container .batch-${type}-${unit}`;
    const target = document.querySelector(targetSelector);
    if (target && target.value !== val) target.value = val;
};

// --- CORE SYNC ENGINE (No Destructive Re-rendering) ---
window.updateSharedStat = (side, key, val, origin) => {
    // 1. Update internal state if needed (optional, we mostly pull from DOM)
    // 2. Find the "other" input and update it
    const targetSelector = origin === 'sim' ? `.opt-${side}-${key}` : `input[data-side="${side}"][data-stat="${key}"]`;
    const target = document.querySelector(targetSelector);
    if (target && target.value !== val) target.value = val;

    // 3. Update Colors in Battle Sim
    const simInput = document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`);
    if (simInput) window.updateStatColors(simInput);
};

// Initializes the Formations tab grids without filling them with innerHTML repeatedly
function initFormationGrids() {
    ['atk', 'def'].forEach(side => {
        const statGrid = document.getElementById(`opt-${side}-stats-grid`);
        const tierGrid = document.getElementById(`opt-${side}-tiers`);
        if (!statGrid || !tierGrid) return;

        statGrid.innerHTML = '';
        ['inf', 'cav', 'arc'].forEach(u => {
            ['att', 'def', 'leth', 'hp'].forEach(s => {
                const key = `${u}_${s}`;
                statGrid.innerHTML += `
                    <div>
                        <label class="text-[7px] text-slate-500 uppercase font-black block">${u} ${s}</label>
                        <input type="number" value="1000" 
                            class="opt-${side}-${key} input-dark !py-1 !text-[10px]" 
                            oninput="window.updateSharedStat('${side}', '${key}', this.value, 'opt')">
                    </div>`;
            });
        });

        tierGrid.innerHTML = '';
        ['inf', 'cav', 'arc'].forEach(u => {
            tierGrid.innerHTML += `
                <div class="flex flex-col gap-1">
                    <label class="text-[7px] text-slate-500 uppercase font-black">${u} T/TG</label>
                    <div class="flex gap-1">
                        <select class="opt-${side}-${u}-tier bg-slate-900 text-[9px] border border-slate-700 rounded text-slate-300" onchange="window.updateSharedTier('${side}','${u}','tier',this.value,'opt')">
                            ${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v==10?'selected':''}>T${v}</option>`).join('')}
                        </select>
                        <select class="opt-${side}-${u}-tg bg-slate-900 text-[9px] border border-slate-700 rounded text-slate-300" onchange="window.updateSharedTier('${side}','${u}','tg',this.value,'opt')">
                            ${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v==3?'selected':''}>TG${v}</option>`).join('')}
                        </select>
                    </div>
                </div>`;
        });
    });
}


// --- GLOBAL SYNC ENGINE ---
window.globalSync = () => {
    window.updateGrids(); 
    window.updateFormation('atk'); 
    window.updateFormation('def');
    window.syncFormationUI();
};

// Global Handlers to keep both tabs in perfect sync
window.globalStatUpdate = (side, key, val) => {
    document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`).value = val;
    window.syncFormationUI();
};

window.globalTierUpdate = (side, unit, type, val) => {
    document.querySelector(`#${side}-batch-container .batch-${type}-${unit}`).value = val;
    window.syncFormationUI();
};

window.syncOptimizerUI = () => {
    const mySide = optRole;
    const oppSide = optRole === 'atk' ? 'def' : 'atk';

    document.getElementById('opt-my-label').innerText = mySide.toUpperCase();
    document.getElementById('opt-opp-label').innerText = oppSide.toUpperCase();

    const renderMinis = (side, targetId) => {
        const container = document.getElementById(targetId);
        container.innerHTML = '';
        state[side].heroes.slice(0,3).forEach(h => {
            const div = document.createElement('div');
            div.className = `w-8 h-8 rounded-full border border-slate-700 bg-slate-900 overflow-hidden relative`;
            if (h.name !== "None") {
                div.innerHTML = `<img src="./assets/${h.name.toLowerCase()}.png" class="w-full h-full object-cover">`;
            } else { div.innerHTML = `<span class="absolute inset-0 flex items-center justify-center text-[8px] text-slate-700">?</span>`; }
            container.appendChild(div);
        });
    };

    renderMinis(mySide, 'opt-my-heroes');
    renderMinis(oppSide, 'opt-opp-heroes');
    
    // Sync initial stats from Battle Sim inputs
    const myStats = Array.from(document.querySelectorAll(`input[data-side="${mySide}"]`));
    const oppStats = Array.from(document.querySelectorAll(`input[data-side="${oppSide}"]`));
    
    // Using simple Atk/Leth averages for the mirror mirror
    if (myStats.length) document.getElementById('opt-my-atk').value = myStats[0].value;
    if (oppStats.length) document.getElementById('opt-opp-atk').value = oppStats[0].value;
};

// Update window.setOptRole to trigger sync
const oldSetOptRole = window.setOptRole;
window.setOptRole = (role) => {
    oldSetOptRole(role);
    window.syncOptimizerUI();
};

// --- UPDATED BATTLE SIM UI ---
function buildStatTable() {
    const table = document.getElementById('stat-table');
    if(!table) return;
    const units = ["inf", "cav", "arc"], cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    table.innerHTML = '';
    units.forEach(u => cats.forEach(c => {
        const key = `${u}_${c.k}`;
        const row = document.createElement('div'); 
        row.className = "stat-row";
        row.innerHTML = `
            <input type="number" data-side="atk" data-stat="${key}" oninput="window.updateSharedStat('atk','${key}',this.value,'sim')" class="text-emerald-500 font-bold w-16 bg-transparent text-center" value="1000">
            <div class="text-[9px] font-black text-slate-500 flex-grow text-center uppercase">${u} ${c.l}</div>
            <input type="number" data-side="def" data-stat="${key}" oninput="window.updateSharedStat('def','${key}',this.value,'sim')" class="text-red-500 font-bold w-16 bg-transparent text-center" value="1000">`;
        table.appendChild(row);
    }));
}

window.toggleDetails = () => {
    const box = document.getElementById('battle-details');
    const btn = document.getElementById('toggle-details-btn');
    const isHidden = box.classList.toggle('hidden');
    btn.innerText = isHidden ? 'View Combat Buffs +' : 'Hide Combat Buffs -';
};

window.setOptRole = (role) => {
    optRole = role;
    document.getElementById('opt-role-atk').className = role === 'atk' ? "px-3 py-1 text-[10px] font-bold rounded bg-blue-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
    document.getElementById('opt-role-def').className = role === 'def' ? "px-3 py-1 text-[10px] font-bold rounded bg-red-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
};

// --- BATTLE TAB HELPERS ---
window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-1 mb-2";
    
    const types = [{l:'Inf', k:'inf', c:'text-blue-400'}, {l:'Cav', k:'cav', c:'text-amber-400'}, {l:'Arc', k:'arc', c:'text-emerald-400'}];
    let html = `<div class="flex justify-between items-center"><span class="text-[8px] font-bold text-slate-600 uppercase">Batch</span>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[8px]">DEL</button>`:''}</div>`;
    
    types.forEach(t => {
        html += `
        <div class="grid grid-cols-12 gap-1 items-center">
            <div class="col-span-3 text-[9px] font-bold ${t.c}">${t.l}</div>
            <select class="batch-tier-${t.k} col-span-2 bg-slate-900 text-[9px] border border-slate-800 rounded" onchange="window.updateSharedTier('${side}','${t.k}','tier',this.value,'sim')"><option value="11">T11</option><option value="10" selected>T10</option><option value="9">T9</option></select>
            <select class="batch-tg-${t.k} col-span-2 bg-slate-900 text-[9px] border border-slate-800 rounded" onchange="window.updateSharedTier('${side}','${t.k}','tg',this.value,'sim')"><option value="5">TG5</option><option value="3" selected>TG3</option></select>
            <input type="number" class="batch-${t.k} col-span-5 input-dark !text-right !py-0" value="${initial ? (t.k==='inf'?500000:250000) : 0}" oninput="window.updateFormation('${side}')">
        </div>`;
    });
    div.innerHTML = html;
    container.appendChild(div);
    window.updateFormation(side);
};

window.updateFormation = (side) => {
    let i=0, c=0, a=0;
    document.querySelectorAll(`#${side}-batch-container > div`).forEach(row => {
        i += parseFloat(row.querySelector(`.batch-inf`).value) || 0;
        c += parseFloat(row.querySelector(`.batch-cav`).value) || 0;
        a += parseFloat(row.querySelector(`.batch-arc`).value) || 0;
    });
    const total = i+c+a || 1;
    
    // Update all bars and text elements associated with this side
    document.querySelectorAll(`.${side}-f-bar`).forEach(bar => {
        bar.children[0].style.width = (i/total*100)+'%';
        bar.children[1].style.width = (c/total*100)+'%';
        bar.children[2].style.width = (a/total*100)+'%';
    });
    document.querySelectorAll(`.${side}-inf-pct`).forEach(el => el.innerText = Math.round(i/total*100)+'%');
    document.querySelectorAll(`.${side}-cav-pct`).forEach(el => el.innerText = Math.round(c/total*100)+'%');
    document.querySelectorAll(`.${side}-arc-pct`).forEach(el => el.innerText = Math.round(a/total*100)+'%');
};

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};

// --- 3. ROSTER RENDERERS ---
function renderLevelPicker(hero, key, current, isRoster) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const act = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${act}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return h + `</div>`;
}

function renderWidgetPicker(hero, current) {
    let h = `<div class="flex flex-wrap gap-1 max-w-[150px]">`;
    for(let i=0; i<=10; i++) {
        h += `<button onclick="event.stopPropagation(); window.updateRoster('${hero}','widget',${i})" class="w-5 h-5 rounded text-[8px] font-bold ${current == i ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return h + `</div>`;
}

function renderStarSelector(name, currentIndex) {
    let html = `<select onclick="event.stopPropagation()" onchange="event.stopPropagation(); window.updateRoster('${name}', 'starIndex', this.value)" 
                class="bg-slate-800 text-[10px] text-slate-300 rounded px-2 py-1 outline-none border border-slate-700 w-full mt-1 cursor-pointer hover:border-blue-500 transition-colors">`;
    for (let i = 0; i <= 30; i++) {
        const star = Math.floor(i / 6), sub = i % 6;
        html += `<option value="${i}" ${currentIndex == i ? 'selected' : ''}>${star === 5 ? '5.0 (Max)' : 'Star: '+star+'.'+sub}</option>`;
        if (star === 5) break; 
    }
    return html + `</select>`;
}

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); if(!grid) return; grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { roster[n].unlocked = !roster[n].unlocked; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 cursor-pointer ${r.unlocked ? 'border-blue-500' : 'opacity-40 border-transparent'}`;
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><img src="./assets/${n.toLowerCase()}.png" class="w-8 h-8 rounded-full border border-slate-700"><b>${n}</b></div>`;
        if(r.unlocked) {
            h.skills.forEach((s,i) => { card.innerHTML += `<div class="mt-2 text-[8px] uppercase font-bold text-slate-500">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)], true)}`; });
        }
        grid.appendChild(card);
    });
}

window.updateModalLevel = (k, v) => { modalTemp[k] = v; renderSkillsInModal(document.getElementById('hero-select').value, activeSlot.index, activeSlot.side); };
window.updateRoster = (n,k,v) => { roster[n][k]=parseInt(v); localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

function renderSkillsInModal(name, index, side) {
    const container = document.getElementById('skill-inputs'); 
    container.innerHTML = '';
    if(name === "None") return;
    
    const h = HEROES[name];
    // Leaders (atk/def index 0-2 or bear) get all skills. Joiners get S1 only.
    const isLead = (side === 'bear' || index < 3);
    const max = isLead ? h.skills.length : 1;
    
    for(let i=0; i<max; i++) {
        const s = h.skills[i];
        const div = document.createElement('div');
        div.className = "mb-4";
        div.innerHTML = `<div class="text-[9px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(name, 's'+(i+1), modalTemp['s'+(i+1)], false)}`;
        container.appendChild(div);
    }
}

// --- UPDATE MODAL SAVE ---
window.saveHeroConfig = () => {
    const name = document.getElementById('hero-select').value;
    state[activeSlot.side].heroes[activeSlot.index] = { 
        name, ...modalTemp, 
        starIndex: roster[name]?.starIndex || 30, 
        widgetLv: roster[name]?.widget || 10 
    };
    window.globalSync(); 
    document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

// --- HERO GRID LOGIC (Targets Classes correctly) ---
window.updateGrids = () => {
    ['atk','def','bear'].forEach(side => {
        const containers = document.querySelectorAll(`.${side}-hero-grid`);
        containers.forEach(container => {
            container.innerHTML = '';
            state[side].heroes.forEach((h, i) => {
                const div = document.createElement('div');
                const isLead = (side === 'bear' || i < 3);
                div.className = `hero-circle ${isLead ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
                if (h.name !== 'None') {
                    div.innerHTML = `<img src="./assets/${h.name.toLowerCase()}.png" class="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none">`;
                } else {
                    div.innerHTML = `<span class="text-[10px] pointer-events-none">${side === 'bear' ? ['I','C','A'][i] : (i+1)}</span>`;
                }
                div.onclick = () => window.openHeroModal(side, i);
                container.appendChild(div);
            });
        });
    });
};

// --- 5. ACCOUNT CALIBRATION ---
window.toggleAccountStats = () => {
    const isEnabled = document.getElementById('use-account-stats').checked;
    document.getElementById('account-stats-ui').classList.toggle('hidden', !isEnabled);
};

window.reverseEngineerAccount = () => {
    const reportType = document.getElementById('report-type').value;
    const reportHeroNames = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    
    // Logic: Solo = no widgets. Rally = Offense widgets. Garrison = Defense widgets.
    const widgetCtx = reportType === 'rally' ? 'off' : (reportType === 'garrison' ? 'def' : 'none');

    const tBuffs = {
        att: 1 + (parseFloat(document.getElementById('temp-buff-att').value) / 100),
        def: 1 + (parseFloat(document.getElementById('temp-buff-def').value) / 100),
        leth: 1 + (parseFloat(document.getElementById('temp-buff-leth').value) / 100),
        hp: 1 + (parseFloat(document.getElementById('temp-buff-hp').value) / 100)
    };

    const reportVal = {};
    ['inf','cav','arc'].forEach(t => ['att','def','leth','hp'].forEach(s => {
        reportVal[`${t}_${s}`] = parseFloat(document.getElementById(`rep-${t}-${s}`).value) || 0;
    }));

    let wMults = { attack: 0, defense: 0, lethality: 0, health: 0 };
    if (widgetCtx !== 'none') {
        reportHeroNames.forEach(name => {
            if (name === "None" || !HEROES[name]) return;
            const d = HEROES[name], r = roster[name] || { widget: 10 };
            if (d.widget && d.widget.context === widgetCtx) {
                wMults[d.widget.stat] += (WIDGET_GROWTH[r.widget] || 0);
            }
        });
    }

    const results = {};
    ['inf','cav','arc'].forEach(t => {
        ['att', 'def', 'leth', 'hp'].forEach(s => {
            const statMap = { att: "attack", def: "defense", leth: "lethality", hp: "health" };
            const category = statMap[s];
            let val = reportVal[`${t}_${s}`] / ((1 + wMults[category]) * tBuffs[s]);
            
            reportHeroNames.forEach(name => {
                if (name === "None" || !HEROES[name]) return;
                const d = HEROES[name], r = roster[name] || { starIndex: 30, widget: 10 };
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') {
                        val -= (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    } else if (s === 'leth' || s === 'hp') {
                        const widgetData = WIDGET_STATS[d.template];
                        if (widgetData) val -= (widgetData[r.widget] || 0);
                    }
                }
            });
            results[`${t}_${s}`] = Math.max(0, val);
        });
    });
    nakedStats = results;
    localStorage.setItem('ks_naked_stats', JSON.stringify(nakedStats));
    renderNakedStats();
};

function renderNakedStats() {
    const div = document.getElementById('naked-stats-display');
    if (!div) return;
    div.classList.remove('hidden');
    div.innerHTML = '';
    div.className = "space-y-2 p-4 bg-slate-950/50 rounded-xl border border-slate-800 mt-4";

    const types = [
        { l: 'Infantry', k: 'inf', c: 'text-blue-400' },
        { l: 'Cavalry', k: 'cav', c: 'text-amber-400' },
        { l: 'Archers', k: 'arc', c: 'text-emerald-400' }
    ];

    types.forEach(t => {
        const row = document.createElement('div');
        row.className = "grid grid-cols-5 gap-2 items-center border-b border-slate-900/40 pb-1";
        let h = `<div class="text-[10px] font-black ${t.c} uppercase">${t.l}</div>`;
        ['att', 'def', 'leth', 'hp'].forEach(s => {
            const val = nakedStats[`${t.k}_${s}`] || 0;
            h += `<div class="text-center">
                <div class="text-[7px] text-slate-500 uppercase font-black">${s}</div>
                <div class="text-[10px] font-bold text-white">${val.toFixed(1)}%</div>
            </div>`;
        });
        row.innerHTML = h;
        div.appendChild(row);
    });
}

// --- 6. SIMULATION & OPTIMIZERS ---
function gatherSetup() {
    const getStats = (s) => { 
        const obj = {}; 
        document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); 
        return obj; 
    };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({
        inf_tier: parseInt(el.querySelector('.batch-tier-inf').value),
        inf_tg: parseInt(el.querySelector('.batch-tg-inf').value),
        inf: parseFloat(el.querySelector('.batch-inf').value)||0,
        cav_tier: parseInt(el.querySelector('.batch-tier-cav').value),
        cav_tg: parseInt(el.querySelector('.batch-tg-cav').value),
        cav: parseFloat(el.querySelector('.batch-cav').value)||0,
        arc_tier: parseInt(el.querySelector('.batch-tier-arc').value),
        arc_tg: parseInt(el.querySelector('.batch-tg-arc').value),
        arc: parseFloat(el.querySelector('.batch-arc').value)||0
    }));
    return { 
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes }, 
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes } 
    };
}

window.handleSimulation = async () => {
    const setup = gatherSetup(); 
    const mode = document.getElementById('sim-mode-select').value;
    
    let rFinal, rBest, rWorst;
    let winAtk = 0, winDef = 0, winRateText = "";

    if (mode === 'monte-carlo') {
        let results = [], sumAtkWins = 0, sumDefWins = 0;
        for (let i = 0; i < 100; i++) {
            const r = runCombatSim(setup, 'stochastic', 'stochastic');
            const aV = sumTroops(r.m_cur), dV = sumTroops(r.e_cur);
            if (aV > dV) { winAtk++; sumAtkWins += aV; } 
            else if (dV > aV) { winDef++; sumDefWins += dV; }
            results.push(r);
        }
        winRateText = `Atk Wins: ${winAtk}% | Def Wins: ${winDef}%`;
        rFinal = {
            m_cur: { inf: winAtk >= winDef ? (winAtk > 0 ? sumAtkWins / winAtk : 0) : 0, cav: 0, arc: 0 },
            e_cur: { inf: winDef > winAtk ? (winDef > 0 ? sumDefWins / winDef : 0) : 0, cav: 0, arc: 0 },
            wave: results[0].wave, atk_logs: results[0].atk_logs, def_logs: results[0].def_logs
        };
        results.sort((a,b) => sumTroops(a.m_cur) - sumTroops(a.e_cur));
        rWorst = results[0]; rBest = results[99];
    } else {
        // Deterministic Range Assignment
        rFinal = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky'); 
        rWorst = runCombatSim(setup, 'unlucky', 'lucky');
    }

    const sAtk = Math.round(sumTroops(rFinal.m_cur)), sDef = Math.round(sumTroops(rFinal.e_cur));
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = sAtk.toLocaleString();
    document.getElementById('res-def-total').innerText = sDef.toLocaleString();
    
    document.getElementById('res-atk-range').innerText = `Range: ${sumTroops(rWorst.m_cur).toLocaleString()} - ${sumTroops(rBest.m_cur).toLocaleString()}`;
    document.getElementById('res-def-range').innerText = `Range: ${sumTroops(rBest.e_cur).toLocaleString()} - ${sumTroops(rWorst.e_cur).toLocaleString()}`;

    const bar = document.getElementById('luck-bar-inner');
    const score = (sAtk - sDef) / (sumTroops(setup.atk.batches[0]) + sumTroops(setup.def.batches[0]) || 1);
    bar.style.left = "50%"; bar.style.width = Math.abs(score * 50) + "%";
    bar.style.transform = score < 0 ? "translateX(-100%)" : "none";

    document.getElementById('result-waves').innerHTML = `
        <span class="text-blue-400 font-black uppercase">${mode} Analysis</span><br>
        ${winRateText ? winRateText + '<br>' : ''}
        Representative Duration: ${rFinal.wave} Waves`;

    const logHTML = (side, data) => `
        <div class="${side === 'atk' ? 'text-emerald-500' : 'text-red-500'} font-black border-b border-slate-800 mb-2 mt-4 uppercase text-[10px] pb-1">${side === 'atk' ? 'Attacker' : 'Defender'} Multipliers</div>
        <div class="text-slate-300 font-bold text-[9px] mb-2">[Troop Efficiency] ${data.troopEff || 'None'}</div>
        ${data.skills.map(s => `<div class="flex justify-between border-b border-slate-900/50 py-0.5"><span class="text-slate-400">${s.name}</span> <span class="${s.isPassive?'text-blue-400':'text-amber-500'} font-black">${s.val}</span></div>`).join('')}
    `;
    document.getElementById('battle-details').innerHTML = logHTML('atk', rFinal.atk_logs) + logHTML('def', rFinal.def_logs);
};

function totalInstances(heroes, name) { return heroes.filter(h => h.name === name).length; }
function isLead(heroes, name) { return heroes.slice(0,3).some(h => h.name === name); }

function getBearSpecificVolume(heroes, formation, bearConfig) {
    // bearConfig contains: { inf_base, cav_base, arc_base, inf_acc, cav_acc, arc_acc, weights }
    
    let m101 = { inf: 1.0, cav: 1.0, arc: 1.0 }, m102 = { inf: 1.0, cav: 1.0, arc: 1.0 };
    let wAtk = 1.0, wLeth = 1.0;

    const lineup = {}; 
    heroes.forEach((h, idx) => { if(h.name !== "None") lineup[h.name] = (lineup[h.name] || 0) + 1; });
    const leadNames = Object.keys(lineup);
    
    // Process All 7 Heroes (Leads All, Joiners S1)
    // Note: Bear Tab uses currently selected ATK heroes
    state.atk.heroes.forEach((h, idx) => {
        if (h.name === "None") return;
        const data = HEROES[h.name], r = roster[h.name] || { s1:5, s2:5, s3:5, widget:10 };
        const isLead = idx < 3;

        // Offense Widgets (Leads Only)
        if (isLead && data.widget && data.widget.context === 'off') {
            const val = WIDGET_GROWTH[r.widget] || 0;
            if (data.widget.stat === "attack") wAtk += val;
            if (data.widget.stat === "lethality") wLeth += val;
        }

        // Skills (Only 1XX)
        data.skills.forEach((s, si) => {
            if (!isLead && si > 0) return; // Joiners S1 only
            
            const x = s.values[(r[`s${si+1}`] || 5) - 1];
            const p = s.getChance(x), mFull = s.getMagnitude(x);
            // S3 permanent for Alcar, otherwise 1-wave uptime
            const uptime = (h.name === "Alcar" && si === 2) ? 1.0 : p; 

            s.ids.forEach((id, idx) => {
                if (id >= 200) return; // Immune to debuffs
                const m = Array.isArray(mFull) ? mFull[idx] : mFull;
                ['inf', 'cav', 'arc'].forEach(u => {
                    let val = (typeof m === 'object' && m !== null) ? (m[u] || 0) : m;
                    if (id === 101) m101[u] += val * uptime;
                    if (id === 102) m102[u] += val * uptime;
                });
            });
        });
    });

    const f = { inf: formation[0], cav: formation[1], arc: formation[2] };
    let totalDmg = 0;

    ['inf', 'cav', 'arc'].forEach(u => {
        if (f[u] <= 0) return;
        
        // 1. Base Stats from bearConfig (UNITS table)
        const base = bearConfig[`${u}_base`];
        const acc = bearConfig[`${u}_acc`];
        const w = bearConfig.weights[u];

        // 2. Ability EV
        let abil = 1.0;
        if (u === 'arc') {
            const effP = (0.3 * w.tg5) + (0.2 * (w.tg3 - w.tg5));
            abil *= (1 + (effP * 0.5)); // Howling Wind
            abil *= 1.1; // Ranged Strike (Always on vs Bear)
        }
        if (u === 'cav' && w.tg3 > 0) {
            const effP = (0.15 * w.tg5) + (0.1 * (w.tg3 - w.tg5));
            abil *= (1 + (effP * 1.0)); // Assault Lance
        }

        // 3. Final Multipliers
        const totalAtk = base[0] * (1 + acc.att/100) * wAtk * m101[u];
        const totalLeth = base[2] * (1 + acc.leth/100) * wLeth * m102[u];

        // 4. Engine Formula
        // sqrt(count) * 1000 * Atk * Leth * RPS(1.0) * Abil / (10 * 83.3333 * 100)
        const d = (Math.sqrt(f[u] * 10000) * 1000 * totalAtk * totalLeth * abil) / 83333.3;
        totalDmg += d;
    });

    return totalDmg;
}

window.runOptimizer = async (mode) => {
    const isBear = mode === 'bear';
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    
    resArea.innerText = "Analyzing...";

    setTimeout(() => {
        let dataPoints = { a: [], b: [], c: [], z: [] };
        let best = { form: [0, 0, 0], score: -Infinity };

        const mySide = isBear ? 'atk' : optRole;
        const oppSide = mySide === 'atk' ? 'def' : 'atk';

        // Scrape static opponent formation from Sim tab
        let oppFormation = [33, 33, 34];
        if (mode === 'current') {
            let i=0, c=0, a=0;
            document.querySelectorAll(`#${oppSide}-batch-container > div`).forEach(row => {
                i += parseFloat(row.querySelector('.batch-inf').value) || 0;
                c += parseFloat(row.querySelector('.batch-cav').value) || 0;
                a += parseFloat(row.querySelector('.batch-arc').value) || 0;
            });
            const tot = i+c+a || 1;
            oppFormation = [(i/tot)*100, (c/tot)*100, (a/tot)*100];
        }

        // Optimization Loop
        for (let i = 0; i <= 100; i += 2) {
            for (let j = 0; j <= 100 - i; j += 2) {
                let k = 100 - i - j;
                let currentForm = [i, j, k];
                
                let score;
                if (isBear) {
                    // Pass Bear heroes directly
                    score = getSystemVolume(state.bear.heroes, [], currentForm, 'off', true, "Bear", null);
                } else {
                    // PVP: Pass live state hero objects AND the sideContext ('atk' or 'def')
                    const myLeads = state[mySide].heroes.slice(0,3);
                    const myJoins = state[mySide].heroes.slice(3);
                    const oppLeads = state[oppSide].heroes.slice(0,3);
                    const oppJoins = state[oppSide].heroes.slice(3);

                    const myVol = getSystemVolume(myLeads, myJoins, currentForm, mySide === 'atk' ? 'off' : 'def', false, "PVP", mySide);
                    const oppVol = getSystemVolume(oppLeads, oppJoins, oppFormation, oppSide === 'atk' ? 'off' : 'def', false, "PVP", oppSide);
                    
                    score = myVol / oppVol;
                }

                if (score > best.score) best = { score, form: currentForm };
                dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(score);
            }
        }

        renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
        resArea.innerText = best.form.join(' / ');
        if (!isBear) scoreArea.innerHTML = `Volume Advantage: <span class="text-blue-400 font-bold">${best.score.toFixed(3)}x</span>`;
    }, 50);
};

// Ensure globalSync triggers the optimizer so UI changes shift the heatmap instantly
window.globalSync = () => {
    window.updateGrids(); 
    window.updateFormation('atk'); 
    window.updateFormation('def');
    window.syncFormationUI();
    if (document.getElementById('optimizer-screen').classList.contains('hidden') === false) {
        window.runOptimizer('current');
    }
};

// --- BEAR OPTIMIZER ---
function calculateBearDamage(config, formation) {
    const units = ['inf', 'cav', 'arc'];
    const longUnits = ['infantry', 'cavalry', 'archers'];
    let b = { inf: {101:0, 102:1, 103:1, 104:1, 105:1, 106:1}, cav: {101:0, 102:1, 103:1, 104:1, 105:1, 106:1}, arc: {101:0, 102:1, 103:1, 104:1, 105:1, 106:1} };
    let wM = { attack: 1.0, lethality: 1.0 };

    state.bear.heroes.forEach((h) => {
        if (h.name === "None") return;
        const d = HEROES[h.name];
        const r = roster[h.name] || { s1:5, s2:5, s3:5, widget:10 };

        if (d.widget && d.widget.context === 'off') wM[d.widget.stat] += (WIDGET_GROWTH[r.widget] || 0);

        d.skills.forEach((s, si) => {
            const x = s.values[(r[`s${si+1}`] || 5) - 1];
            let uptime = s.interval ? (1 / s.interval) : s.getChance(x);
            const mFull = s.getMagnitude(x);
            s.ids.forEach((id, mIdx) => {
                if (id >= 200) return;
                (s.units || ["inf", "cav", "arc"]).forEach(u => {
                    const rawM = Array.isArray(mFull) ? mFull[mIdx] : mFull;
                    let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
                    if (id === 101) b[u][id] += (mag * uptime);
                    else b[u][id] *= (1 + (mag * uptime));
                });
            });
        });
    });

    let totalDmg = 0;
    units.forEach((u, idx) => {
        const pct = formation[idx];
        if (pct <= 0) return;
        const unitBase = UNITS[longUnits[idx]][config[`${u}_tier`]][config[`${u}_tg`]];
        const acc = config[`${u}_acc`];
        let abil = (u === 'arc') ? 1.1 : 1.0; 
        if (u === 'cav' && config[`${u}_tg`] >= 3) abil *= (1 + (config[`${u}_tg`] >= 5 ? 0.15 : 0.1));

        const totalAtk = unitBase[0] * (1 + acc.att/100) * wM.attack * (1 + b[u][101]) * b[u][102] * b[u][103] * b[u][104] * b[u][105] * b[u][106];
        const totalLeth = unitBase[2] * (1 + acc.leth/100) * wM.lethality;
        totalDmg += (Math.sqrt(pct * 10000) * 1000 * totalAtk * totalLeth * abil) / 83333.3;
    });
    return isNaN(totalDmg) ? 0 : totalDmg;
}


function calculateBearPotentials(config) {
    let m101 = { inf: 1.0, cav: 1.0, arc: 1.0 }, m102 = { inf: 1.0, cav: 1.0, arc: 1.0 };
    let wAtk = 1.0, wLeth = 1.0;

    state.atk.heroes.forEach((h, idx) => {
        if (h.name === "None") return;
        const d = HEROES[h.name], r = roster[h.name] || { s1:5, s2:5, s3:5, widget:10 };
        const isLead = idx < 3;

        if (isLead && d.widget && d.widget.context === 'off') {
            const val = WIDGET_GROWTH[r.widget] || 0;
            if (d.widget.stat === "attack") wAtk += val;
            if (d.widget.stat === "lethality") wLeth += val;
        }

        d.skills.forEach((s, si) => {
            if (!isLead && si > 0) return;
            const x = s.values[(r[`s${si+1}`] || 5) - 1];
            const uptime = (h.name === "Alcar" && si === 2) ? 1.0 : s.getChance(x);
            s.ids.forEach((id, idx) => {
                if (id >= 200) return;
                const m = Array.isArray(s.getMagnitude(x)) ? s.getMagnitude(x)[idx] : s.getMagnitude(x);
                ['inf', 'cav', 'arc'].forEach(u => {
                    let val = (typeof m === 'object' && m !== null) ? (m[u] || 0) : m;
                    if (id === 101) m101[u] += val * uptime;
                    if (id === 102) m102[u] += val * uptime;
                });
            });
        });
    });

    const out = {};
    ['inf', 'cav', 'arc'].forEach(u => {
        let abil = 1.0;
        if (u === 'arc') abil *= (1 + ((config.weights.arc.tg5 ? 0.3 : (config.weights.arc.tg3 ? 0.2 : 0)) * 0.5)) * 1.1;
        if (u === 'cav') abil *= (1 + ((config.weights.cav.tg5 ? 0.15 : (config.weights.cav.tg3 ? 0.1 : 0)) * 1.0));
        
        const tA = config[`${u}_base`][0] * (1 + config[`${u}_acc`].att/100) * wAtk * m101[u];
        const tL = config[`${u}_base`][2] * (1 + config[`${u}_acc`].leth/100) * wLeth * m102[u];
        out[u] = (1000 * tA * tL * abil) / 8333.33;
    });
    return out;
}

function renderTernary(id, data, best, isBear) {
    const traces = [
        { 
            type: 'scatterternary',
            a: data.a,
            b: data.b,
            c: data.c,
            mode: 'markers',
            name: 'Efficiency',
            marker: { 
                color: data.z, 
                colorscale: 'Viridis', 
                size: 5, 
                opacity: 0.8,
                showscale: false,
                line: { width: 0 }
            },
            hoverinfo: 'none'
        },
        // Standard Reference Point (e.g., 50/20/30)
        { 
            type: 'scatterternary',
            a: [isBear ? 10 : 50],
            b: [isBear ? 10 : 20],
            c: [isBear ? 80 : 30],
            name: 'Standard Meta',
            mode: 'markers',
            marker: { 
                size: 12, 
                symbol: 'circle-open', 
                color: 'rgba(255,255,255,0.4)', 
                line: { width: 2 } 
            } 
        },
        // Optimal Point (The Cyan Star)
        { 
            type: 'scatterternary',
            a: [best.form[0]],
            b: [best.form[1]],
            c: [best.form[2]],
            name: 'Optimal',
            mode: 'markers',
            marker: { 
                size: 18, 
                symbol: 'star', 
                color: '#00f2ff', 
                line: { width: 1.5, color: '#080a0f' } 
            } 
        }
    ];

    const layout = {
        ternary: { 
            sum: 100,
            aaxis: { 
                title: 'INF', 
                titlefont: { size: 12, color: '#3b82f6', family: 'Inter, sans-serif' }, 
                tickfont: { color: '#64748b', size: 10 }, 
                gridcolor: 'rgba(255,255,255,0.05)',
                linecolor: 'rgba(255,255,255,0.1)'
            },
            baxis: { 
                title: 'CAV', 
                titlefont: { size: 12, color: '#f59e0b', family: 'Inter, sans-serif' }, 
                tickfont: { color: '#64748b', size: 10 }, 
                gridcolor: 'rgba(255,255,255,0.05)',
                linecolor: 'rgba(255,255,255,0.1)'
            },
            caxis: { 
                title: 'ARC', 
                titlefont: { size: 12, color: '#10b981', family: 'Inter, sans-serif' }, 
                tickfont: { color: '#64748b', size: 10 }, 
                gridcolor: 'rgba(255,255,255,0.05)',
                linecolor: 'rgba(255,255,255,0.1)'
            },
            bgcolor: 'rgba(0,0,0,0)'
        },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 20, r: 20, t: 40, b: 20 },
        showlegend: false,
        hovermode: false,
        font: { family: 'Inter, sans-serif' }
    };

    const config = { 
        displayModeBar: false, 
        responsive: true 
    };

    Plotly.newPlot(id, traces, layout, config);
}

// --- UPDATED SYSTEM VOLUME LOGIC (Reflecting periodic and troop specific) ---
function getSystemVolume(leadHeroes, joinerHeroes, formation, ctx, isBear, scenarioLabel, sideContext = null) {
    const rawStats = JSON.parse(localStorage.getItem('ks_naked_stats'));
    const isCalibrated = !!rawStats;
    const fallback = rawStats || { inf_att:1000, inf_hp:500, inf_def:1000, inf_leth:500, cav_att:1000, cav_hp:500, cav_def:1000, cav_leth:500, arc_att:1000, arc_hp:500, arc_def:1000, arc_leth:500 };

    let curS = {
        inf: { att: fallback.inf_att, leth: fallback.inf_leth, hp: fallback.inf_hp, def: fallback.inf_def },
        cav: { att: fallback.cav_att, leth: fallback.cav_leth, hp: fallback.cav_hp, def: fallback.cav_def },
        arc: { att: fallback.arc_att, leth: fallback.arc_leth, hp: fallback.arc_hp, def: fallback.arc_def }
    };

    // If we are evaluating a live UI tab ('atk' or 'def'), override fallback stats with live UI inputs
    if (sideContext && (sideContext === 'atk' || sideContext === 'def')) {
        ['inf', 'cav', 'arc'].forEach(u => {
            ['att', 'def', 'leth', 'hp'].forEach(s => {
                const inputEl = document.querySelector(`input[data-side="${sideContext}"][data-stat="${u}_${s}"]`);
                if (inputEl) curS[u][s] = parseFloat(inputEl.value) || 0;
            });
        });
    }

    // Initialize Multiplier Buckets
    const createB = () => ({ 101:0, 102:0, 103:0, 104:0, 105:0, 106:0, 201:0, 202:0, 203:0, 204:0, 205:0, 250:0 });
    let b = { inf: createB(), cav: createB(), arc: createB() };
    let wM = { attack: 1.0, defense: 1.0, lethality: 1.0, health: 1.0 };

    // Process Hero Object (Reads live modal levels instead of global roster if available)
    const processHero = (heroInput, isLead) => {
        // Handle both raw string names (from Best Heroes tab) and state objects (from Sim/Formations tabs)
        const name = typeof heroInput === 'string' ? heroInput : heroInput?.name;
        if (!name || name === "None" || !HEROES[name]) return;

        const h = HEROES[name];
        const globalRoster = roster[name] || { s1:5, s2:5, s3:5, widget:10, starIndex:30 };
        // Use live state levels if provided, otherwise fall back to global roster
        const levels = typeof heroInput === 'object' ? { s1: heroInput.s1, s2: heroInput.s2, s3: heroInput.s3, widget: heroInput.widgetLv || globalRoster.widget, starIndex: heroInput.starIndex || globalRoster.starIndex } : globalRoster;

        if (isLead) {
            const tk = h.type.toLowerCase().slice(0, 3);
            if (isCalibrated && !sideContext) {
                // Only add growth template flats if we are using naked account stats
                const growth = GROWTH_TEMPLATES[h.template][levels.starIndex] || 0;
                curS[tk].att += growth; curS[tk].def += growth;
                if (h.widget) {
                    const flats = WIDGET_STATS[h.template] || [];
                    const fVal = flats[levels.widget] || 0;
                    if (h.widget.stat === "lethality") curS[tk].leth += fVal;
                    if (h.widget.stat === "health") curS[tk].hp += fVal;
                    if (h.widget.stat === "attack") curS[tk].att += fVal;
                    if (h.widget.stat === "defense") curS[tk].def += fVal;
                }
            }
            if (scenarioLabel.includes("Rally") || scenarioLabel.includes("Garrison") || scenarioLabel.includes("Bear") || scenarioLabel.includes("PVP")) {
                if (h.widget && h.widget.context === ctx) {
                    wM[h.widget.stat] += (WIDGET_GROWTH[levels.widget] || 0);
                }
            }
        }

        h.skills.forEach((skill, si) => {
            if (!isLead && si > 0) return;
            const lvl = isLead ? (levels[`s${si+1}`] || 5) : (levels.s1 || 5);
            const x = skill.values[lvl - 1];
            
            const dur = isBear ? 1 : (skill.duration || 1);
            let uptime = skill.interval ? Math.min(1.0, dur / skill.interval) : skill.getChance(x);
            if (dur > 1 && !skill.interval) uptime = 1 - Math.pow(1 - uptime, dur);

            const mFull = skill.getMagnitude(x);
            (skill.units || ["inf", "cav", "arc"]).forEach(u => {
                skill.ids.forEach((id, idx) => {
                    const rawM = Array.isArray(mFull) ? mFull[idx] : mFull;
                    let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
                    b[u][id] += (mag * uptime);
                });
            });
        });
    };

    leadHeroes.forEach(l => processHero(l, true));
    joinerHeroes.forEach(j => processHero(j, false));

    const f = [formation[0], formation[1], formation[2]];
    const longUnits = ['infantry', 'cavalry', 'archers'];

    // Dynamic Base Stat Scraper (Reads live DOM Tiers/TG if sideContext is provided)
    const getBaseStat = (u, statIndex) => {
        let t = 10, tg = 3;
        if (sideContext && (sideContext === 'atk' || sideContext === 'def')) {
            const tierEl = document.querySelector(`#${sideContext}-batch-container .batch-tier-${u}`);
            const tgEl = document.querySelector(`#${sideContext}-batch-container .batch-tg-${u}`);
            if (tierEl) t = parseInt(tierEl.value) || 10;
            if (tgEl) tg = parseInt(tgEl.value) || 3;
        }
        const uIdx = ['inf', 'cav', 'arc'].indexOf(u);
        return UNITS[longUnits[uIdx]][t][tg][statIndex];
    };

    const getOff = (u, idx) => {
        const stats = curS[u];
        const mult = (1 + b[u][101]) * (1 + b[u][102]) * (1 + b[u][103]) * (1 + b[u][104]) * (1 + b[u][105]) * (1 + b[u][106]);
        const baseAtk = getBaseStat(u, 0);
        const baseLeth = getBaseStat(u, 2);
        
        return Math.sqrt(f[idx] * 1000000) * baseAtk * (1 + stats.att/100) * wM.attack * baseLeth * (1 + stats.leth/100) * wM.lethality * mult;
    };
    
    const totalD = getOff('inf', 0) + getOff('cav', 1) + getOff('arc', 2);
    if (isBear) return totalD;

    const getSurv = (u, idx) => {
        const stats = curS[u];
        const baseHP = getBaseStat(u, 3);
        const baseDef = getBaseStat(u, 1);
        const dodgeMult = 1 / (1 - Math.min(0.9, b[u][250]));
        const mult = (1 + b[u][201]) * (1 + b[u][202]) * (1 + b[u][203]) * (1 + b[u][204]) * (1 + b[u][205]) * dodgeMult;
        
        return (f[idx] * 1000000) * baseHP * (1 + stats.hp/100) * wM.health * baseDef * (1 + stats.def/100) * wM.defense * mult;
    };

    return totalD * (getSurv('inf', 0) + getSurv('cav', 1) + getSurv('arc', 2));
}


window.calculateOptimalLineups = async () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked && n !== "None");
    if (unlocked.length < 3) return alert("Please unlock at least one hero of each type in the Roster.");

    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = `<div class="col-span-full p-12 text-center text-blue-500 animate-pulse font-black uppercase tracking-widest">Calculating Scientific Peak...</div>`;

    // Whitelist and Pivots
    const jPool = ["Saul", "Hilde", "Alcar", "Chenko", "Amane", "Howard", "Gordon", "Fahd", "Eric"];
    const pivots = [[50,20,30], [70,30,0], [60,20,20], [33,33,34], [50,0,50], [60,40,0], [10,10,80], [5,5,90]];

    const byT = { 
        Inf: unlocked.filter(n => HEROES[n].type === "Inf"),
        Cav: unlocked.filter(n => HEROES[n].type === "Cav"),
        Arc: unlocked.filter(n => HEROES[n].type === "Arc")
    };
    // Ensure we have at least "None" to prevent loop crashes
    ['Inf', 'Cav', 'Arc'].forEach(t => { if(byT[t].length === 0) byT[t] = ["None"]; });

    const scenarios = [
        { l: "Solo Attack", ctx: "off", bear: false, rally: false },
        { l: "Solo Defense", ctx: "def", bear: false, rally: false },
        { l: "Rally (Offense)", ctx: "off", bear: false, rally: true },
        { l: "Garrison (Defense)", ctx: "def", bear: false, rally: true },
        { l: "Bear Trap", ctx: "off", bear: true, rally: true }
    ];

    await new Promise(r => setTimeout(r, 50));
    resArea.innerHTML = '';

    for (const s of scenarios) {
        // 1. Calculate Peak Baseline (No Heroes)
        let baselinePeak = 0;
        pivots.forEach(p => {
            const v = getSystemVolume(["None","None","None"], [], p, s.ctx, s.bear, s.l);
            if (v > baselinePeak) baselinePeak = v;
        });

        let candidates = [];

        // 2. Step through Leader Combinations (Strict 1 per type)
        for (let i of byT.Inf) {
            for (let c of byT.Cav) {
                for (let a of byT.Arc) {
                    const leads = [i, c, a];
                    let curJ = [];

                    // 3. Greedy Joiner Selection (if applicable)
                     // JOINER GREEDY FILL
                    if (s.rally) {
                        for (let slot=0; slot<4; slot++) {
                            let bj = "None", bestSlotV = -1;
                            jPool.forEach(heroName => {
                                let peakWithCandidate = -1;
                                pivots.forEach(p => {
                                    // FIXED: Passing correct flags to getSystemVolume
                                    const v = getSystemVolume(leads, [...curJ, heroName], p, s.ctx, s.bear, s.l);
                                    if (v > peakWithCandidate) peakWithCandidate = v;
                                });
                                if (peakWithCandidate > bestSlotV) {
                                    bestSlotV = peakWithCandidate;
                                    bj = heroName;
                                }
                            });
                            curJ.push(bj);
                        }
                    }

                    // Calculate the final Peak Volume for this team across benchmark pivots
                    let finalPeakVolume = -1;
                    pivots.forEach(p => {
                        const v = getSystemVolume(leads, curJ, p, s.ctx, s.bear, s.l);
                        if (v > finalPeakVolume) finalPeakVolume = v;
                    });

                    candidates.push({ leads, joiners: curJ, score: finalPeakVolume });
                }
            }
        }

        // 4. Final 2% Resolution Deep Dive for Top 3
        candidates.sort((a,b) => b.score - a.score);
        const top3Final = candidates.slice(0, 3).map(team => {
            let sweepBestVol = -1;
            // High-res sweep to find the absolute ceiling
            for (let fI = 0; fI <= 100; fI += 2) {
                for (let fC = 0; fC <= 100 - fI; fC += 2) {
                    const fA = 100 - fI - fC;
                    const v = getSystemVolume(team.leads, team.joiners, [fI, fC, fA], s.ctx, s.bear, s.l);
                    if (v > sweepBestVol) sweepBestVol = v;
                }
            }
            return { ...team, gain: sweepBestVol / baselinePeak };
        });

        // 5. Render
        renderScenarioResults(s.l, top3Final, resArea);
    }
};

function renderScenarioResults(title, top3, container) {
    const card = document.createElement('div');
    card.className = "glass-card p-6 border-l-4 border-blue-500 col-span-1 md:col-span-2 mb-6";
    card.innerHTML = `<div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">${title}</div>`;

    top3.forEach((team, rk) => {
        // Group joiners for clean display (e.g., Saul x2)
        const joinerMap = {};
        team.joiners.forEach(j => { if(j !== "None") joinerMap[j] = (joinerMap[j] || 0) + 1; });
        const joinerText = Object.entries(joinerMap).map(([name, count]) => `${name}${count > 1 ? ' x' + count : ''}`).join(', ');

        card.innerHTML += `
        <div class="flex items-center justify-between py-4 ${rk < 2 ? 'border-b border-slate-800' : ''}">
            <div class="flex items-center gap-5">
                <span class="text-slate-600 font-black text-xs">#${rk+1}</span>
                <div class="flex -space-x-3">
                    ${team.leads.map(n => n !== "None" ? `<div class="w-12 h-12 rounded-full border-2 border-blue-500/30 bg-slate-950 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>` : '').join('')}
                </div>
                <div>
                    <div class="text-[10px] font-black text-white uppercase leading-tight">${team.leads.filter(n => n !== "None").join(' / ')}</div>
                    <div class="text-[8px] text-slate-500 font-bold uppercase truncate max-w-[250px]">${joinerText || 'Solo Configuration'}</div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-[8px] text-slate-600 font-black uppercase mb-1">Total Efficiency</div>
                <div class="text-xl font-black text-emerald-400">${team.gain.toFixed(3)}x</div>
            </div>
        </div>`;
    });
    container.appendChild(card);
}

function renderOptimizerCard(scenario, best, container) {
    const card = document.createElement('div');
    card.className = "glass-card p-6 border-t-2 border-blue-500 flex flex-col md:flex-row justify-between items-center gap-4 mb-4";
    
    card.innerHTML = `
        <div class="flex flex-col md:flex-row items-center gap-6 w-full">
            <div class="text-center md:text-left min-w-[140px]">
                <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">${scenario.l}</div>
                <div class="text-2xl font-black text-white">${best.score.toFixed(3)}x</div>
            </div>
            <div class="flex -space-x-3">
                ${best.leaders.map(n => n !== "None" ? `
                    <div class="w-14 h-14 rounded-full border-2 border-blue-500 bg-slate-800 overflow-hidden shadow-lg z-10">
                        <img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover" onerror="this.style.opacity='0'">
                        <span class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/20">${n[0]}</span>
                    </div>
                ` : '').join('')}
            </div>
            ${best.joiners.length > 0 ? `
                <div class="flex flex-wrap gap-1 justify-center opacity-60">
                    ${best.joiners.map(n => n !== "None" ? `
                        <div class="w-10 h-10 rounded-full border border-slate-700 bg-slate-900 overflow-hidden relative">
                            <img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover" onerror="this.style.opacity='0'">
                            <span class="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/10">${n[0]}</span>
                        </div>
                    ` : '').join('')}
                </div>
            ` : ''}
        </div>
    `;
    container.appendChild(card);
}

function calcPowerScore(leaders, joiners, ctx, isRally, isBear) {
    const scenario = isBear ? "Bear Trap" : (isRally ? "Rally" : "Solo");
    return getSystemVolume(leaders, joiners, [33, 33, 34], ctx, isBear, scenario);
}

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);

