import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';
import { WIDGET_STATS } from './widgets.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let nakedStats = JSON.parse(localStorage.getItem('ks_naked_stats')) || null;
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };
let optRole = 'atk'; 
const sumTroops = (c) => Math.round((c.inf || 0) + (c.cav || 0) + (c.arc || 0));

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
window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        const el = document.getElementById(screens[k]);
        if (el) el.classList.toggle('hidden', k !== tab);
        const b = document.getElementById(btns[k]);
        if (b) b.className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold text-white shadow-lg" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
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
    const container = document.getElementById('skill-inputs'); container.innerHTML = '';
    if(name === "None") return;
    const h = HEROES[name]; const max = (slot < 3) ? h.skills.length : 1;
    for(let i=0; i<max; i++) {
        const div = document.createElement('div');
        div.innerHTML = `<div class="text-[9px] text-slate-500 font-black uppercase mb-1">${h.skills[i].name}</div>${renderLevelPicker(name, 's'+(i+1), modalTemp['s'+(i+1)], false)}`;
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
    const mode = document.getElementById('report-mode').value;
    const ctx = document.getElementById('report-ctx').value;
    const reportHeroNames = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    
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
    if (mode === 'rally') {
        reportHeroNames.forEach(name => {
            if (name === "None" || !HEROES[name]) return;
            const d = HEROES[name], r = roster[name];
            if (d.widget && d.widget.context === ctx) wMults[d.widget.stat] += WIDGET_GROWTH[r.widget];
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
                const d = HEROES[name], r = roster[name];
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') {
                        val -= (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    } else if (s === 'leth' || s === 'hp') {
                        // VERIFIED: Pulling from widgets.js correctly
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

window.runOptimizer = (mode) => {
    const isBear = mode === 'bear', setup = gatherSetup();
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity, winRate: 0, net: 0 };
    let opponents = [];

    const userSide = optRole === 'atk' ? setup.atk : setup.def;
    const userTotal = userSide.batches.reduce((s, b) => s + (b.inf + b.cav + b.arc), 0) || 1;
    const oppSide = optRole === 'atk' ? setup.def : setup.atk;
    const oppTotal = oppSide.batches.reduce((s, b) => s + (b.inf + b.cav + b.arc), 0) || 1;

    let bearStats = {}, bearTiers = {};
    if (isBear) {
        opponents.push({inf:1, cav:0, arc:0}); 
        bearStats = { 
            inf_att: parseFloat(document.getElementById('bear-inf-att').value), inf_leth: parseFloat(document.getElementById('bear-inf-leth').value), 
            cav_att: parseFloat(document.getElementById('bear-cav-att').value), cav_leth: parseFloat(document.getElementById('bear-cav-leth').value), 
            arc_att: parseFloat(document.getElementById('bear-arc-att').value), arc_leth: parseFloat(document.getElementById('bear-arc-leth').value) 
        };
        bearTiers = {
            inf: parseInt(document.getElementById('bear-inf-tier').value), inf_tg: parseInt(document.getElementById('bear-inf-tg').value),
            cav: parseInt(document.getElementById('bear-cav-tier').value), cav_tg: parseInt(document.getElementById('bear-cav-tg').value),
            arc: parseInt(document.getElementById('bear-arc-tier').value), arc_tg: parseInt(document.getElementById('bear-arc-tg').value)
        };
    } else if (mode === 'current') {
        const d = oppSide.batches.reduce((s,b) => ({inf:s.inf+b.inf, cav:s.cav+b.cav, arc:s.arc+b.arc}), {inf:0,cav:0,arc:0});
        opponents.push({inf: d.inf/oppTotal, cav: d.cav/oppTotal, arc: d.arc/oppTotal});
    } else if (mode === 'custom') {
        const i = parseFloat(document.getElementById('custom-inf').value)||0, c = parseFloat(document.getElementById('custom-cav').value)||0, a = parseFloat(document.getElementById('custom-arc').value)||0;
        const t = i+c+a || 1; opponents.push({inf:i/t, cav:c/t, arc:a/t});
    } else {
        // Meta Opponents: 10% steps (66 variants) to maintain performance while maximizing user precision
        for(let i=0; i<=100; i+=10) for(let j=0; j<=100-i; j+=10) opponents.push({inf:i/100, cav:j/100, arc:(100-i-j)/100});
    }

    // EXHAUSTIVE SEARCH: 1% steps = 5151 iterations
    for (let i=0; i<=100; i++) {
        for (let j=0; j<=100-i; j++) {
            let k=100-i-j, wins = 0, totalMargin = 0;
            
            opponents.forEach(opp => {
                let s = JSON.parse(JSON.stringify(setup));
                const varBatch = {
                    inf_tier: isBear ? bearTiers.inf : userSide.batches[0].inf_tier, 
                    inf_tg: isBear ? bearTiers.inf_tg : userSide.batches[0].inf_tg, 
                    inf: (i/100) * userTotal,
                    cav_tier: isBear ? bearTiers.cav : userSide.batches[0].cav_tier, 
                    cav_tg: isBear ? bearTiers.cav_tg : userSide.batches[0].cav_tg, 
                    cav: (j/100) * userTotal,
                    arc_tier: isBear ? bearTiers.arc : userSide.batches[0].arc_tier, 
                    arc_tg: isBear ? bearTiers.arc_tg : userSide.batches[0].arc_tg, 
                    arc: (k/100) * userTotal
                };

                const fixBatch = {
                    inf_tier: oppSide.batches[0].inf_tier, inf_tg: oppSide.batches[0].inf_tg, inf: opp.inf * oppTotal,
                    cav_tier: oppSide.batches[0].cav_tier, cav_tg: oppSide.batches[0].cav_tg, cav: opp.cav * oppTotal,
                    arc_tier: oppSide.batches[0].arc_tier, arc_tg: oppSide.batches[0].arc_tg, arc: opp.arc * oppTotal
                };

                if (optRole === 'atk') { 
                    s.atk.batches = [varBatch]; s.def.batches = isBear ? s.def.batches : [fixBatch];
                    if(isBear) s.atk.stats = bearStats;
                } else { 
                    s.def.batches = [varBatch]; s.atk.batches = [fixBatch];
                }
                
                const r = runCombatSim(s, 'average', 'average', isBear ? 1 : 1000, isBear, true);
                const val = isBear ? r.totalDmg : (optRole === 'atk' ? sumTroops(r.m_cur) - sumTroops(r.e_cur) : sumTroops(r.e_cur) - sumTroops(r.m_cur));
                if (!isBear && val > 0) wins++; totalMargin += val;
            });

            const finalScore = isBear ? totalMargin : (wins * 1e20) + totalMargin;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(isBear ? totalMargin : wins);
            
            if (finalScore > best.score) {
                best = { score: finalScore, form: [i,j,k], winRate: (wins/opponents.length)*100, net: totalMargin/opponents.length };
            }
        }
    }
    renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
    resArea.innerText = `${best.form[0]} / ${best.form[1]} / ${best.form[2]}`;
    scoreArea.innerHTML = isBear ? `Full Range Precision Analysis Complete` : `Meta Coverage: ${best.winRate.toFixed(1)}% | Avg Margin: <span class="${best.net > 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${Math.round(best.net).toLocaleString()}</span>`;
};

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

    let b = { 
        101:{i:0,c:0,a:0}, 102:{i:0,c:0,a:0}, 201:{i:0,c:0,a:0}, 202:{i:0,c:0,a:0}, 
        203:{i:0,c:0,a:0}, 204:{i:0,c:0,a:0}, 205:{i:0,c:0,a:0}, 206:0 
    };
    let wM = { attack: 1.0, defense: 1.0, lethality: 1.0, health: 1.0 };

    const lineup = {}; 
    leads.forEach(n => { if(n!=="None") lineup[n] = (lineup[n]||0) + 1; });
    const totalLineup = {...lineup};
    joiners.forEach(n => { if(n!=="None") totalLineup[n] = (totalLineup[n]||0) + 1; });

    // 1. STATS & WIDGETS (Leaders Only)
    Object.keys(lineup).forEach(name => {
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
        if (scenarioLabel !== "Solo Attack" && h.widget && h.widget.context === ctx) {
            wM[h.widget.stat] += (WIDGET_GROWTH[r.widget] || 0);
        }
    });

    // 2. SKILL PROCESSING
    Object.keys(totalLineup).forEach(name => {
        const h = HEROES[name], r = roster[name] || { s1:5, s2:5, s3:5 };
        const leadCount = lineup[name] || 0;
        const joinCount = totalLineup[name] - leadCount;

        h.skills.forEach((skill, si) => {
            const instances = leadCount + (si === 0 ? joinCount : 0);
            if (instances <= 0) return;
            const x = skill.values[(r[`s${si+1}`] || 5) - 1];
            const p = skill.getChance(x), mFull = skill.getMagnitude(x);
            const uptime = (name === "Alcar" && si === 2) ? 1.0 : (1 - Math.pow(1 - p, isBear ? 1 : (skill.duration || 1)));
            
            skill.ids.forEach((id, idx) => {
                if (isBear && id >= 200) return;
                const mPart = Array.isArray(mFull) ? mFull[idx] : mFull;
                ['inf', 'cav', 'arc'].forEach(u => {
                    let val = (typeof mPart === 'object' && mPart !== null) ? (mPart[u] || 0) : mPart;
                    if (id === 206) b[206] += val * instances * uptime;
                    else if (b[id]) b[id][u[0]] += val * instances * uptime;
                });
            });
        });
    });

    const f = { i: formation[0], c: formation[1], a: formation[2] };
    const getM = (id, uChar) => 1 + b[id][uChar];

    // Offense (D): (Stats * Ally Buffs)
    const dmg = (u, baseAtk) => {
        const c = u[0];
        return Math.sqrt(f[c]) * baseAtk * (1 + curS[u].att/100) * wM.attack * getM(101, c) * 
               (1 + curS[u].leth/100) * wM.lethality * getM(102, c);
    };
    const totalD = dmg('inf', 597) + (dmg('cav', 1790) * 1.6) + dmg('arc', 2387);

    if (isBear) return totalD;

    // Tanking (T): (Your Stats) * (ALL 2XX Multipliers)
    const tank = (u, baseHP) => {
        const c = u[0];
        return f[c] * baseHP * (1 + curS[u].hp/100) * wM.health * 
               10 * (1 + curS[u].def/100) * wM.defense *
               getM(201, c) * getM(202, c) * getM(203, c) * getM(204, c) * getM(205, c);
    };
    const totalT = tank('inf', 1790) + tank('cav', 597) + tank('arc', 448);

    return totalD * totalT * (1 + b[206]);
}

window.calculateOptimalLineups = async () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked && n !== "None");
    if (unlocked.length < 3) return alert("Unlock 3+ heroes.");

    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = `<div class="col-span-full p-12 text-center text-blue-500 animate-pulse font-black uppercase tracking-widest">Solving Scientific Ceiling...</div>`;

    const jList = ["Chenko", "Amane", "Howard", "Eric", "Gordon", "Fahd", "Hilde", "Saul", "Alcar", "Margot", "Rosa"];
    const jPool = unlocked.filter(n => jList.includes(n));

    const scenarios = [
        { l: "Solo Attack", ctx: "off", bear: false },
        { l: "Solo Defense", ctx: "def", bear: false },
        { l: "Rally (Offense)", ctx: "off", rally: true, bear: false },
        { l: "Garrison (Defense)", ctx: "def", rally: true, bear: false },
        { l: "Bear Trap", ctx: "off", rally: true, bear: true }
    ];

    const pivots = [[50,20,30], [60,40,0], [33,33,34], [70,10,20], [10,10,80], [30,60,10], [50,50,0]];

    const byT = { 
        Inf: unlocked.filter(n => HEROES[n].type === "Inf"),
        Cav: unlocked.filter(n => HEROES[n].type === "Cav"),
        Arc: unlocked.filter(n => HEROES[n].type === "Arc")
    };
    ['Inf', 'Cav', 'Arc'].forEach(t => { if(byT[t].length === 0) byT[t] = ["None"]; });

    await new Promise(r => setTimeout(r, 100));
    resArea.innerHTML = '';

    for (const s of scenarios) {
        let bCeil = -1;
        // Accurate baseline search (5% steps for speed)
        for (let i=0; i<=100; i+=5) {
            for (let c=0; c<=100-i; c+=5) {
                const v = getSystemVolume(["None","None","None"], [], [i, c, 100-i-c], s.ctx, s.bear, s.l);
                if (v > bCeil) bCeil = v;
            }
        }

        let candidates = [];
        for (let i of byT.Inf) {
            for (let c of byT.Cav) {
                for (let a of byT.Arc) {
                    const leads = [i, c, a];
                    let bestPV = -1, bestJ = [];
                    for (const p of pivots) {
                        let curJ = [];
                        if (s.rally || s.bear) {
                            for (let slot=0; slot<4; slot++) {
                                let bj = "None", mv = -1;
                                jPool.forEach(cand => {
                                    const v = getSystemVolume(leads, [...curJ, cand], p, s.ctx, s.bear, s.l);
                                    if (v > mv) { mv = v; bj = cand; }
                                });
                                curJ.push(bj);
                            }
                        }
                        const v = getSystemVolume(leads, curJ, p, s.ctx, s.bear, s.l);
                        if (v > bestPV) { bestPV = v; bestJ = curJ; }
                    }
                    candidates.push({ leads, joiners: bestJ, score: bestPV });
                }
            }
        }

        candidates.sort((a,b) => b.score - a.score);
        const top3 = candidates.slice(0, 3);
        
        const card = document.createElement('div');
        card.className = "glass-card p-6 border-l-4 border-blue-500 col-span-1 md:col-span-2 mb-6";
        card.innerHTML = `<div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">${s.l}</div>`;

        for (let rk = 0; rk < top3.length; rk++) {
            const team = top3[rk];
            let peakV = -1;
            for (let fI=0; fI<=100; fI+=2) { // 2% deep dive for speed
                for (let fC=0; fC<=100-fI; fC+=2) {
                    const v = getSystemVolume(team.leads, team.joiners, [fI, fC, 100-fI-fC], s.ctx, s.bear, s.l);
                    if (v > peakV) peakV = v;
                }
            }
            const gain = peakV / bCeil;
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
                        <div class="text-[10px] font-black text-white uppercase leading-tight">${team.leads.join(' / ')}</div>
                        <div class="text-[8px] text-slate-500 font-bold uppercase truncate max-w-[200px]">${jN || 'Solo Setup'}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[8px] text-slate-600 font-black uppercase mb-1">Account Improvement</div>
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
    let skillBuckets = {}; 
    let widgetGrowthSum = { attack: 0, defense: 0, lethality: 0, health: 0 };
    
    // 1. WIDGET MULTIPLIERS (Additive within same stat)
    // Solo Attack = None | Solo Defense = Def Only | Rally = Context specific
    if (isRally || ctx === 'def') {
        leaders.forEach(n => {
            if (n === "None" || !HEROES[n]) return;
            const d = HEROES[n], r = roster[n];
            if (d.widget && d.widget.context === ctx) {
                widgetGrowthSum[d.widget.stat] += WIDGET_GROWTH[r.widget];
            }
        });
    }

    const widgetEffect = (1 + widgetGrowthSum.attack) * (1 + widgetGrowthSum.lethality) * 
                         (isBear ? 1 : (1 + widgetGrowthSum.defense) * (1 + widgetGrowthSum.health));

    // 2. SKILL STACKING (Manifest used to count instances of a hero)
    const manifest = {};
    leaders.forEach(n => { if(n!=="None"){ manifest[n] = manifest[n] || { l:0, j:0 }; manifest[n].l++; }});
    joiners.forEach(n => { if(n!=="None"){ manifest[n] = manifest[n] || { l:0, j:0 }; manifest[n].j++; }});

    for (const name in manifest) {
        const d = HEROES[name], r = roster[name], count = manifest[name];
        d.skills.forEach((s, si) => {
            const instances = count.l + (si === 0 ? count.j : 0);
            if (instances === 0) return;
            const x = s.values[(r[`s${si+1}`]||5)-1], p = s.getChance(x), m = s.getMagnitude(x);
            
            let effectiveMagnitude;
            if (p >= 1.0) {
                effectiveMagnitude = instances; // Additive: (1 + .25 + .25)
            } else {
                // Probabilistic: 1 - (1-p)^n
                const probAny = 1 - Math.pow(1 - p, instances);
                effectiveMagnitude = (1 - Math.pow(1 - probAny, isBear ? 1 : (s.duration || 1)));
            }

            s.ids.forEach((id, idx) => {
                if (isBear && id >= 200) return;
                const val = (Array.isArray(m) ? m[idx] : m) * effectiveMagnitude;
                skillBuckets[id] = (skillBuckets[id] || 0) + val;
            });
        });
    }

    let skillMult = 1.0;
    Object.keys(skillBuckets).forEach(id => skillMult *= (1 + skillBuckets[id]));

    // 3. STAT POWER GAIN (The "Normal Multiplier" upgrade to your account)
    let statEffect = 1.0;
    if (document.getElementById('use-account-stats').checked && nakedStats) {
        let totalNakedVol = 0, totalFinalVol = 0;

        ['inf', 'cav', 'arc'].forEach(t => {
            const naked = { att: nakedStats[`${t}_att`], leth: nakedStats[`${t}_leth`], def: nakedStats[`${t}_def`], hp: nakedStats[`${t}_hp`] };
            let flats = { att: 0, def: 0, leth: 0, hp: 0 };
            
            leaders.forEach(name => {
                if (name === "None" || !HEROES[name]) return;
                const d = HEROES[name], r = roster[name];
                if (d.type.toLowerCase().slice(0,3) === t) {
                    flats.att += (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    flats.def += (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    if (d.widget) {
                        const templateStats = WIDGET_STATS[d.template];
                        flats.leth += (templateStats ? templateStats[r.widget] : 0);
                        flats.hp += (templateStats ? templateStats[r.widget] : 0);
                    }
                }
            });

            const nVol = isBear ? (naked.att * naked.leth) : (naked.att * naked.leth * naked.def * naked.hp);
            const fVol = isBear ? ((naked.att+flats.att)*(naked.leth+flats.leth)) : ((naked.att+flats.att)*(naked.leth+flats.leth)*(naked.def+flats.def)*(naked.hp+flats.hp));
            
            totalNakedVol += nVol;
            totalFinalVol += fVol;
        });
        statEffect = totalFinalVol / (totalNakedVol || 1);
    }

    return statEffect * skillMult * widgetEffect;
}

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);
