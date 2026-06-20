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
// Helper to sum objects
const sumTroops = (c) => (c.inf || 0) + (c.cav || 0) + (c.arc || 0);

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) }
};

// --- 1. INITIALIZATION ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; });
    const mainSel = document.getElementById('hero-select');
    const calibSels = document.querySelectorAll('.rep-hero');
    [mainSel, ...calibSels].forEach(sel => {
        if(!sel) return;
        sel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { sel.innerHTML += `<option value="${n}">${n}</option>`; });
    });
    if(mainSel) mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);
    buildStatTable();
    window.addBatch('atk', true); window.addBatch('def', true);
    window.updateGrids(); renderRosterUI(); 
    if(nakedStats) renderNakedStats();
    window.showTab('battle');
};

window.syncFormationUI = () => {
    const sides = ['atk', 'def'];
    const stats = ['att', 'def', 'leth', 'hp'];
    const units = ['inf', 'cav', 'arc'];

    sides.forEach(side => {
        // 1. Sync Heroes
        const heroCont = document.getElementById(`opt-${side}-heroes`);
        if (heroCont) {
            heroCont.innerHTML = '';
            state[side].heroes.slice(0,3).forEach(h => {
                const div = document.createElement('div');
                div.className = `w-10 h-10 rounded-full border-2 ${side==='atk'?'border-emerald-500/30':'border-red-500/30'} bg-slate-900 overflow-hidden`;
                div.innerHTML = h.name !== "None" ? `<img src="./assets/${h.name.toLowerCase()}.png" class="w-full h-full object-cover">` : '';
                heroCont.appendChild(div);
            });
        }

        // 2. Sync Stats (Mirroring the Sim Tab Stat Table)
        const statGrid = document.getElementById(`opt-${side}-stats-grid`);
        if (statGrid) {
            statGrid.innerHTML = '';
            units.forEach(u => {
                stats.forEach(s => {
                    const key = `${u}_${s}`;
                    const val = document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`)?.value || 1000;
                    statGrid.innerHTML += `
                        <div>
                            <label class="text-[7px] text-slate-500 uppercase font-black block mb-1">${u} ${s}</label>
                            <input type="number" value="${val}" oninput="window.globalStatUpdate('${side}', '${key}', this.value)" class="input-dark !py-1 !text-[10px]">
                        </div>`;
                });
            });
        }

        // 3. Sync Tiers (Mirroring the first batch of the Sim Tab)
        const tierGrid = document.getElementById(`opt-${side}-tiers`);
        if (tierGrid) {
            tierGrid.innerHTML = '';
            units.forEach(u => {
                const t = document.querySelector(`#${side}-batch-container .batch-tier-${u}`)?.value || 10;
                const tg = document.querySelector(`#${side}-batch-container .batch-tg-${u}`)?.value || 3;
                tierGrid.innerHTML += `
                    <div class="flex flex-col gap-1">
                        <label class="text-[7px] text-slate-500 uppercase font-black">${u} tier/tg</label>
                        <div class="flex gap-1">
                            <select onchange="window.globalTierUpdate('${side}', '${u}', 'tier', this.value)" class="bg-slate-900 text-[9px] border border-slate-700 rounded px-1 font-bold text-slate-300 outline-none flex-grow">
                                ${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v==t?'selected':''}>T${v}</option>`).join('')}
                            </select>
                            <select onchange="window.globalTierUpdate('${side}', '${u}', 'tg', this.value)" class="bg-slate-900 text-[9px] border border-slate-700 rounded px-1 font-bold text-slate-300 outline-none flex-grow">
                                ${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v==tg?'selected':''}>TG${v}</option>`).join('')}
                            </select>
                        </div>
                    </div>`;
            });
        }
    });
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

function buildStatTable() {
    const table = document.getElementById('stat-table');
    if(!table) return;
    const units = ["Infantry", "Cavalry", "Archer"], cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    table.innerHTML = '';
    units.forEach(u => cats.forEach(c => {
        const row = document.createElement('div'); row.className = "stat-row";
        const key = `${u.toLowerCase().slice(0,3)}_${c.k}`;
        row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; color:#10b981; font-weight:800; width:70px;" value="1000"><div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; flex-grow:1;">${u} ${c.l}</div><input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; color:#ef4444; font-weight:800; width:70px; text-align:right;" value="1000">`;
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

// --- 2. GLOBAL UI HANDLERS ---
const originalShowTab = window.showTab;
window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        const el = document.getElementById(screens[k]);
        if (el) el.classList.toggle('hidden', k !== tab);
        const b = document.getElementById(btns[k]);
        if (b) b.className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold text-white shadow-lg" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
    if (tab === 'formation') window.syncFormationUI();
    originalShowTab(tab);
};

window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    if (!container) return;
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-2 relative mb-2";
    
    const types = [
        { label: 'Infantry', key: 'inf', color: 'text-blue-400', def: 500000 },
        { label: 'Cavalry', key: 'cav', color: 'text-amber-400', def: 200000 },
        { label: 'Archers', key: 'arc', color: 'text-emerald-400', def: 300000 }
    ];

    let html = `<div class="flex justify-between items-center mb-1">
        <span class="text-[9px] font-bold text-slate-500 uppercase">Army Batch</span>
        ${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[10px] font-black uppercase">Remove</button>` : ''}
    </div>`;

    types.forEach(t => {
        html += `
        <div class="grid grid-cols-12 gap-2 items-center border-b border-slate-800/40 pb-1 mb-1">
            <div class="col-span-3 text-[10px] font-bold ${t.color}">${t.label}</div>
            <select class="batch-tier-${t.key} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
                ${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v===10?'selected':''}>T${v}</option>`).join('')}
            </select>
            <select class="batch-tg-${t.key} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
                ${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v===3?'selected':''}>TG${v}</option>`).join('')}
            </select>
            <input type="number" class="batch-${t.key} col-span-5 input-dark !text-right" value="${initial ? t.def : 0}" oninput="window.updateFormation('${side}')">
        </div>`;
    });

    div.innerHTML = html;
    container.appendChild(div); 
    window.updateFormation(side);
};

window.updateFormation = (side) => {
    let i=0, c=0, a=0;
    document.querySelectorAll(`#${side}-batch-container > div`).forEach(row => {
        i += parseFloat(row.querySelector('.batch-inf').value) || 0;
        c += parseFloat(row.querySelector('.batch-cav').value) || 0;
        a += parseFloat(row.querySelector('.batch-arc').value) || 0;
    });
    const total = i+c+a; const bar = document.getElementById(`${side}-f-bar`);
    if (total > 0 && bar) {
        bar.children[0].style.width = (i/total*100)+'%'; bar.children[1].style.width = (c/total*100)+'%'; bar.children[2].style.width = (a/total*100)+'%';
        document.getElementById(`${side}-inf-pct`).innerText = Math.round(i/total*100)+'%';
        document.getElementById(`${side}-cav-pct`).innerText = Math.round(c/total*100)+'%';
        document.getElementById(`${side}-arc-pct`).innerText = Math.round(a/total*100)+'%';
    }
};

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};

// --- 3. ROSTER RENDERERS ---
function renderLevelPicker(hero, key, current, isRoster = true) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const action = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${action}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}">${i}</button>`;
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
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50 shadow-lg shadow-blue-900/20' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2" onclick="event.stopPropagation()"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700 shadow-inner"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase tracking-tighter">${n}</div></div>${r.unlocked ? `<div class="space-y-3"><div><span class="text-[8px] text-slate-500 font-black uppercase">Development Level</span>${renderStarSelector(n, r.starIndex)}</div>${skillsHtml}${h.widget ? `<div class="pt-2 border-t border-slate-800" onclick="event.stopPropagation()"><span class="text-[8px] text-amber-500 font-black uppercase block mb-1">Widget Level</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>` : ''}`;
        grid.appendChild(card);
    });
}
window.updateRoster = (n,k,v) => { roster[n][k]=parseInt(v); localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

// --- 4. BATTLE LOGIC ---
window.openHeroModal = (side, index) => {
    activeSlot = { side, index }; const h = state[side].heroes[index];
    modalTemp = { s1: h.s1, s2: h.s2, s3: h.s3 };
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index);
    document.getElementById('heroModal').classList.replace('hidden', 'flex');
};
window.updateModalLevel = (k, v) => { modalTemp[k] = v; renderSkillsInModal(document.getElementById('hero-select').value, activeSlot.index); };

function renderSkillsInModal(name, slot) {
    const container = document.getElementById('skill-inputs'); 
    container.innerHTML = '';
    if(name === "None") return;
    
    const h = HEROES[name]; 
    const max = (slot < 3) ? h.skills.length : 1;
    
    for(let i=0; i<max; i++) {
        const skill = h.skills[i];
        const div = document.createElement('div');
        div.className = "p-3 bg-slate-950/50 rounded-lg border border-slate-800 mb-2";
        
        // Show what units are affected if it's restricted
        const unitTag = skill.units ? `<span class="text-[7px] bg-blue-900 text-blue-200 px-1 rounded ml-2">${skill.units.join(', ').toUpperCase()}</span>` : '';
        
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="text-[9px] text-slate-400 font-black uppercase tracking-widest">${skill.name}${unitTag}</div>
                <div class="text-[8px] text-slate-600 font-bold">ID: ${skill.ids.join('+')}</div>
            </div>
            ${renderLevelPicker(name, 's'+(i+1), modalTemp['s'+(i+1)], false)}
        `;
        container.appendChild(div);
    }
}

window.saveHeroConfig = () => {
    const name = document.getElementById('hero-select').value;
    state[activeSlot.side].heroes[activeSlot.index] = { name, ...modalTemp, starIndex: 30, widgetLv: roster[name]?.widget || 0 };
    window.updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

window.updateGrids = () => {
    ['atk','def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`); if(!container) return; container.innerHTML = '';
        state[side].heroes.forEach((h, i) => {
            const div = document.createElement('div');
            div.className = `hero-circle ${i < 3 ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
            if (h.name !== 'None') {
                div.innerHTML = `<span style="position:absolute;z-index:1">${h.name[0]}</span><img src="./assets/${h.name.toLowerCase()}.png" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2" onerror="this.style.opacity='0'">`;
            } else { div.innerText = (i + 1); }
            div.onclick = () => window.openHeroModal(side, i);
            container.appendChild(div);
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
    
    if (!resArea) return;
    resArea.innerText = "Analyzing...";

    // Give UI thread air to render "Analyzing..."
    setTimeout(async () => {
        try {
            let dataPoints = { a: [], b: [], c: [], z: [] };
            let best = { form: [0, 0, 0], score: -Infinity };

            if (isBear) {
                // --- 1. BEAR TRAP SCIENTIFIC LOGIC ---
                let potentials = { inf: 0, cav: 0, arc: 0 };
                let m101 = { inf: 1.0, cav: 1.0, arc: 1.0 }, m102 = { inf: 1.0, cav: 1.0, arc: 1.0 };
                let wAtk = 1.0, wLeth = 1.0;

                // A. Process Current Attacker Heroes (State from Sim Tab)
                state.atk.heroes.forEach((h, idx) => {
                    if (h.name === "None" || !HEROES[h.name]) return;
                    const d = HEROES[h.name], r = roster[h.name] || { s1: 5, s2: 5, s3: 5, widget: 10 };
                    const isLead = idx < 3;

                    if (isLead && d.widget && d.widget.context === 'off') {
                        const val = WIDGET_GROWTH[r.widget] || 0;
                        if (d.widget.stat === "attack") wAtk += val;
                        if (d.widget.stat === "lethality") wLeth += val;
                    }

                    d.skills.forEach((s, si) => {
                        if (!isLead && si > 0) return; // Joiners S1 only
                        const x = s.values[(r[`s${si + 1}`] || 5) - 1];
                        const uptime = (h.name === "Alcar" && si === 2) ? 1.0 : s.getChance(x);
                        
                        s.ids.forEach((id, idxM) => {
                            if (id >= 200) return; // Debuffs ignored
                            const m = Array.isArray(s.getMagnitude(x)) ? s.getMagnitude(x)[idxM] : s.getMagnitude(x);
                            ['inf', 'cav', 'arc'].forEach(u => {
                                let val = (typeof m === 'object' && m !== null) ? (m[u] || 0) : m;
                                if (id === 101) m101[u] += val * uptime;
                                if (id === 102) m102[u] += val * uptime;
                            });
                        });
                    });
                });

                // B. Calculate Base Unit Potentials
                ['inf', 'cav', 'arc'].forEach(u => {
                    const t = parseInt(document.getElementById(`bear-${u}-tier`).value);
                    const tg = parseInt(document.getElementById(`bear-${u}-tg`).value);
                    const longU = u === 'arc' ? 'archers' : (u === 'inf' ? 'infantry' : 'cavalry');
                    
                    const base = UNITS[longU][t][tg];
                    const accAtt = parseFloat(document.getElementById(`bear-${u}-att`).value) || 0;
                    const accLeth = parseFloat(document.getElementById(`bear-${u}-leth`).value) || 0;
                    
                    let abil = 1.0;
                    if (u === 'arc') {
                        const effP = (tg >= 5 ? 0.3 : (tg >= 3 ? 0.2 : 0));
                        abil *= (1 + (effP * 0.5)) * 1.1; // Incl. Ranged Strike
                    }
                    if (u === 'cav' && tg >= 3) {
                        const effP = (tg >= 5 ? 0.15 : 0.1);
                        abil *= (1 + (effP * 1.0));
                    }

                    const tA = base[0] * (1 + accAtt / 100) * wAtk * m101[u];
                    const tL = base[2] * (1 + accLeth / 100) * wLeth * m102[u];
                    potentials[u] = (1000 * tA * tL * abil) / 8333.33;
                });

                // C. Formation Search
                for (let i = 0; i <= 100; i++) {
                    for (let j = 0; j <= 100 - i; j++) {
                        let k = 100 - i - j;
                        const score = (Math.sqrt(i * 10000) * potentials.inf) +
                                      (Math.sqrt(j * 10000) * potentials.cav) +
                                      (Math.sqrt(k * 10000) * potentials.arc);
                        if (score > best.score) best = { score, form: [i, j, k] };
                        dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(score);
                    }
                }
                scoreArea.innerHTML = `Predicted Dmg: <span class="text-emerald-400 font-bold">${Math.round(best.score).toLocaleString()}</span>`;

            } else {
                // --- 2. PVP FORMATION LOGIC (Simulation Sweep) ---
                const mySide = optRole;
                const oppSide = mySide === 'atk' ? 'def' : 'atk';
                const setup = gatherSetup();

                // Simple representative opponent (Standard Meta)
                const opp = JSON.parse(JSON.stringify(setup[oppSide]));
                if (mode === 'custom') {
                    const i = parseFloat(document.getElementById('custom-inf').value) || 33;
                    const c = parseFloat(document.getElementById('custom-cav').value) || 33;
                    const a = parseFloat(document.getElementById('custom-arc').value) || 34;
                    const tot = i + c + a || 1;
                    opp.batches = [{ inf: (i/tot)*1000000, cav: (c/tot)*1000000, arc: (a/tot)*1000000, inf_tier:10, cav_tier:10, arc_tier:10, inf_tg:3, cav_tg:3, arc_tg:3 }];
                }

                for (let i = 0; i <= 100; i += 2) {
                    for (let j = 0; j <= 100 - i; j += 2) {
                        let k = 100 - i - j;
                        const testSetup = { atk: {}, def: {} };
                        const myConfig = JSON.parse(JSON.stringify(setup[mySide]));
                        myConfig.batches = [{ inf: i*10000, cav: j*10000, arc: k*10000, inf_tier:10, cav_tier:10, arc_tier:10, inf_tg:3, cav_tg:3, arc_tg:3 }];
                        
                        testSetup[mySide] = myConfig;
                        testSetup[oppSide] = opp;

                        const r = runCombatSim(testSetup, 'average', 'average', 1000, false, true);
                        const mS = (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc);
                        const oS = (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc);
                        const res = mS - oS;

                        if (res > best.score) best = { score: res, form: [i, j, k] };
                        dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(res);
                    }
                }
                scoreArea.innerHTML = `Survival Margin: <span class="text-blue-400 font-bold">${Math.round(best.score).toLocaleString()}</span>`;
            }

            renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
            resArea.innerText = `${best.form[0]} / ${best.form[1]} / ${best.form[2]}`;

        } catch (err) {
            console.error("Optimizer Crash:", err);
            resArea.innerText = "Error";
        }
    }, 50);
};

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
            type: 'scatterternary', a: data.a, b: data.b, c: data.c, mode: 'markers', 
            name: 'Heatmap',
            marker: { 
                color: data.z, 
                colorscale: 'Viridis', 
                size: 4, 
                opacity: 0.7,
                showscale: false 
            },
            hoverinfo: 'none'
        },
        // Standard Reference Marker (50/20/30 or 10/10/80)
        { 
            type: 'scatterternary', a: [isBear ? 10 : 50], b: [isBear ? 10 : 20], c: [isBear ? 80 : 30], 
            name: 'Standard Reference', mode: 'markers', 
            marker: { size: 14, symbol: 'circle-open', color: 'white', line: { width: 3 } } 
        },
        // Best Result Marker (Cyan Star)
        { 
            type: 'scatterternary', a: [best.form[0]], b: [best.form[1]], c: [best.form[2]], 
            name: 'Optimal Point', mode: 'markers', 
            marker: { size: 20, symbol: 'star', color: '#00f2ff', line: { width: 1.5, color: 'black' } } 
        }
    ];

    const layout = {
        ternary: { 
            sum: 100, 
            aaxis: { title: 'INF', titlefont: { size: 12, color: '#3b82f6' }, tickfont: { color: '#64748b' }, min: 0 }, 
            baxis: { title: 'CAV', titlefont: { size: 12, color: '#f59e0b' }, tickfont: { color: '#64748b' }, min: 0 }, 
            caxis: { title: 'ARC', titlefont: { size: 12, color: '#10b981' }, tickfont: { color: '#64748b' }, min: 0 } 
        },
        paper_bgcolor: 'rgba(0,0,0,0)', 
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8', family: 'Inter, sans-serif' },
        margin: { l: 10, r: 10, t: 40, b: 20 }, 
        showlegend: false
    };

    Plotly.newPlot(id, traces, layout, { displayModeBar: false, responsive: true });
}
// --- UPDATED SYSTEM VOLUME LOGIC ---
function getSystemVolume(leads, joiners, formation, ctx, isBear, scenarioLabel) {
    const rawStats = JSON.parse(localStorage.getItem('ks_naked_stats'));
    const isCalibrated = !!rawStats;
    const s = rawStats || { 
        inf_att: 1000, inf_hp: 500, inf_def: 1000, inf_leth: 500,
        cav_att: 1000, cav_hp: 500, cav_def: 1000, cav_leth: 500,
        arc_att: 1000, arc_hp: 500, arc_def: 1000, arc_leth: 500
    };

    let curS = {
        inf: { att: s.inf_att, leth: s.inf_leth, hp: s.inf_hp, def: s.inf_def },
        cav: { att: s.cav_att, leth: s.cav_leth, hp: s.cav_hp, def: s.cav_def },
        arc: { att: s.arc_att, leth: s.arc_leth, hp: s.arc_hp, def: s.arc_def }
    };

    // ID Buckets per Troop Type
    const createBuckets = () => ({
        101: 0, 102: 1, 103: 1, 104: 1, 105: 1, 106: 1,
        201: 0, 202: 1, 203: 1, 204: 1, 205: 1, 250: 1 
    });

    let b = { inf: createBuckets(), cav: createBuckets(), arc: createBuckets() };
    let wM = { attack: 1.0, defense: 1.0, lethality: 1.0, health: 1.0 };

    const lineup = {}; 
    leads.forEach(n => { if(n !== "None") lineup[n] = (lineup[n] || 0) + 1; });
    
    // 1. LEADERS: Apply Star Stats and Widgets
     leads.forEach(name => {
        if (name === "None") return;
        const h = HEROES[name], r = roster[name] || { s1:5, s2:5, s3:5, widget:10, starIndex:30 };
        const tk = h.type.toLowerCase().slice(0, 3);
        
        if (isCalibrated) {
            const star = GROWTH_TEMPLATES[h.template][r.starIndex] || 0;
            curS[tk].att += star; curS[tk].def += star;
            if (h.widget) {
                const wT = WIDGET_STATS[h.template] || [];
                if (h.widget.stat === "lethality") curS[tk].leth += (wT[r.widget] || 0);
                if (h.widget.stat === "health") curS[tk].hp += (wT[r.widget] || 0);
            }
        }

        // Logic check: Only apply Rally/Garrison widgets if the scenario allows it
        // scenarioLabel is things like "Rally (Offense)", "Garrison (Defense)", etc.
        const isRallyOrGarrison = scenarioLabel.includes("Rally") || scenarioLabel.includes("Garrison") || scenarioLabel.includes("Bear");
        if (isRallyOrGarrison && h.widget && h.widget.context === ctx) {
            wM[h.widget.stat] += (WIDGET_GROWTH[r.widget] || 0);
        }
    });

    // 2. SKILL PROCESSING
    const processPool = (heroList, isLeadPool) => {
        heroList.forEach(name => {
            if (name === "None") return;
            const h = HEROES[name], r = roster[name] || { s1:5, s2:5, s3:5 };
            
            h.skills.forEach((skill, si) => {
                if (!isLeadPool && si > 0) return; // Joiners S1 only
                
                const lvl = isLeadPool ? (r[`s${si+1}`] || 5) : 5;
                const x = skill.values[lvl - 1];
                const p = skill.getChance(x), mFull = skill.getMagnitude(x);
                
                // Account for Wave 5 gate: weight Alcar's S1 at 75% efficiency for total volume
                let uptime = (1 - Math.pow(1 - p, isBear ? 1 : (skill.duration || 1)));
                if (skill.minWave) uptime *= 0.75; 

                const affectedUnits = skill.units || ["inf", "cav", "arc"];

                skill.ids.forEach((id, idx) => {
                    if (isBear && id >= 200) return;
                    const rawM = Array.isArray(mFull) ? mFull[idx] : mFull;

                    affectedUnits.forEach(u => {
                        let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
                        const final = mag * uptime;

                        if (id === 101 || id === 201) b[u][id] += final;
                        else if (id === 250) b[u][id] *= (1 / (1 - final)); // Dodge is a survival multiplier
                        else b[u][id] *= (1 + final);
                    });
                });
            });
        });
    };

    processPool(leads, true);
    processPool(joiners, false);

    const f = { inf: formation[0], cav: formation[1], arc: formation[2] };

    // Offense Volume
    const getOff = (u) => {
        const stats = curS[u];
        const mult = (1 + b[u][101]) * b[u][102] * b[u][103] * b[u][104] * b[u][105] * b[u][106];
        return Math.sqrt(f[u] * 10000) * (stats.att/100) * (stats.leth/100) * wM.attack * wM.lethality * mult;
    };
    // 1.6x Quality Factor for Cavalry Bypass in PVP
    const totalD = getOff('inf') + (getOff('cav') * (isBear ? 1.0 : 1.6)) + getOff('arc');

    if (isBear) return totalD;

    // Survival Volume
    const getSurv = (u) => {
        const stats = curS[u];
        const mult = (1 + b[u][201]) * b[u][202] * b[u][203] * b[u][204] * b[u][205] * b[u][250];
        return f[u] * (stats.hp/100) * (stats.def/100) * wM.health * wM.defense * mult;
    };
    const totalS = getSurv('inf') + getSurv('cav') + getSurv('arc');

    return totalD * totalS;
}

window.calculateOptimalLineups = async () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked && n !== "None");
    if (unlocked.length < 3) return alert("Unlock 3+ heroes in Roster.");

    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = `<div class="col-span-full p-12 text-center text-blue-500 animate-pulse font-black uppercase tracking-widest">Calculating Combat Efficiency...</div>`;

    // 1. Whitelist & Pivots
    const jPool = ["Saul", "Hilde", "Alcar", "Chenko", "Amane", "Howard", "Gordon", "Fahd", "Eric", ];
    const pivots = [[50,20,30], [70,30,0], [60,20,20], [33,33,34], [50,0,50], [60,40,0]];
    
    // 2. Pre-calculate Meta-Mirror Baseline
    // We assume the opponent is 20% stronger than your naked account
    const mirrorFactor = 1.2;
    const scenarios = [
        { l: "Solo Attack", ctx: "off", bear: false },
        { l: "Solo Defense", ctx: "def", bear: false },
        { l: "Rally (Offense)", ctx: "off", rally: true, bear: false },
        { l: "Garrison (Defense)", ctx: "def", rally: true, bear: false },
        { l: "Bear Trap", ctx: "off", rally: true, bear: true }
    ];

    const byT = { 
        Inf: unlocked.filter(n => HEROES[n].type === "Inf"),
        Cav: unlocked.filter(n => HEROES[n].type === "Cav"),
        Arc: unlocked.filter(n => HEROES[n].type === "Arc")
    };
    ['Inf', 'Cav', 'Arc'].forEach(t => { if(byT[t].length === 0) byT[t] = ["None"]; });

    await new Promise(r => setTimeout(r, 100));
    resArea.innerHTML = '';

    for (const s of scenarios) {
        // Calculate the scenario "Meta Ceiling" once (Average of all pivots)
        let scenarioBaseline = 0;
        pivots.forEach(p => {
            scenarioBaseline += getSystemVolume(["None","None","None"], [], p, s.ctx, s.bear, s.l);
        });
        scenarioBaseline /= pivots.length;

        let candidates = [];
        // Phase 1: Combinatorial Search
        for (let i of byT.Inf) {
            for (let c of byT.Cav) {
                for (let a of byT.Arc) {
                    const leads = [i, c, a];
                    let bestPV = -1, bestJ = [];
                    
                    // Greedy Joiner Fill
                    let curJ = [];
                    if (s.rally || s.bear) {
                        for (let slot=0; slot<4; slot++) {
                            let bj = "None", mv = -1;
                            jPool.forEach(cand => {
                                // Test joiner across all pivots to find "Universal" strength
                                let totalV = 0;
                                pivots.forEach(p => {
                                    totalV += getSystemVolume(leads, [...curJ, cand], p, s.ctx, s.bear, s.l);
                                });
                                if (totalV > mv) { mv = totalV; bj = cand; }
                            });
                            curJ.push(bj);
                        }
                    }

                    // Score this team across all pivots
                    let teamAvgV = 0;
                    pivots.forEach(p => {
                        teamAvgV += getSystemVolume(leads, curJ, p, s.ctx, s.bear, s.l);
                    });
                    
                    candidates.push({ leads, joiners: curJ, score: teamAvgV });
                }
            }
        }

        // Phase 2: Sort and Result Generation
        candidates.sort((a,b) => b.score - a.score);
        const top3 = candidates.slice(0, 3);
        
        const card = document.createElement('div');
        card.className = "glass-card p-6 border-l-4 border-blue-500 col-span-1 md:col-span-2 mb-6";
        card.innerHTML = `<div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">${s.l}</div>`;

        for (let rk = 0; rk < top3.length; rk++) {
            const team = top3[rk];
            const gain = (team.score / scenarioBaseline);

            const jN = [...new Set(team.joiners.filter(n=>n!=="None"))].map(n => {
                const count = team.joiners.filter(x=>x===n).length;
                return `${n}${count > 1 ? ' x'+count : ''}`;
            }).join(', ');

            card.innerHTML += `
            <div class="flex items-center justify-between py-4 ${rk < 2 ? 'border-b border-slate-800' : ''}">
                <div class="flex items-center gap-5">
                    <span class="text-slate-600 font-black text-xs">#${rk+1}</span>
                    <div class="flex -space-x-3">
                        ${team.leads.map(n => `<div class="w-12 h-12 rounded-full border-2 border-blue-500/30 bg-slate-950 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>`).join('')}
                    </div>
                    <div>
                        <div class="text-[10px] font-black text-white uppercase leading-tight">${team.leads.filter(n=>n!=="None").join(' / ')}</div>
                        <div class="text-[8px] text-slate-500 font-bold uppercase truncate max-w-[200px]">${jN || 'Solo Setup'}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[8px] text-slate-600 font-black uppercase mb-1">Efficiency Gain</div>
                    <div class="text-xl font-black text-emerald-400">${gain.toFixed(3)}x</div>
                </div>
            </div>`;
        }
        resArea.appendChild(card);
        await new Promise(r => setTimeout(r, 1));
    }
};

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
