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
    
    // 1. Temporary Multiplicative Buffs
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

    // 2. Widget Multipliers (Only applies if context is Rally/Defense)
    let wMults = { attack: 0, defense: 0, lethality: 0, health: 0 };
    if (mode === 'rally') {
        reportHeroNames.forEach(name => {
            if (name === "None" || !HEROES[name]) return;
            const d = HEROES[name], r = roster[name];
            if (d.widget && d.widget.context === ctx) {
                wMults[d.widget.stat] += WIDGET_GROWTH[r.widget];
            }
        });
    }

    const results = {};
    ['inf','cav','arc'].forEach(t => {
        ['att', 'def', 'leth', 'hp'].forEach(s => {
            const statMap = { att: "attack", def: "defense", leth: "lethality", hp: "health" };
            const category = statMap[s];
            
            // Step A: Division (Remove Global Multipliers)
            let val = reportVal[`${t}_${s}`] / ((1 + wMults[category]) * tBuffs[s]);
            
            // Step B: Subtraction (Remove Hero-Specific Flats)
            reportHeroNames.forEach(name => {
                if (name === "None" || !HEROES[name]) return;
                const d = HEROES[name], r = roster[name];
                
                // Only subtract if hero type (e.g. Inf) matches column type (e.g. inf)
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') {
                        // Subtract Star Growth
                        val -= (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    } else if (s === 'leth' || s === 'hp') {
                        // FIXED: Decoupled check. All widgets grant flat Leth/HP.
                        // If template is "AMADEUS", pull from WIDGET_STATS["AMADEUS"][level]
                        const templateStats = WIDGET_STATS[d.template];
                        if (templateStats) {
                            val -= (templateStats[r.widget] || 0);
                        }
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
    const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst, modeLabel;

    if (simMode === 'monte-carlo') {
        modeLabel = "Stochastic Sampling (Monte Carlo)";
        let batch = [];
        for (let i = 0; i < 100; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        batch.sort((a,b) => (sumTroops(a.m_cur) - sumTroops(a.e_cur)) - (sumTroops(b.m_cur) - sumTroops(b.e_cur)));
        rAvg = batch[50]; rWorst = batch[0]; rBest = batch[99];
    } else {
        modeLabel = "Deterministic Range (95% CI)";
        rAvg = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky');
        rWorst = runCombatSim(setup, 'unlucky', 'lucky');
    }

    const screen = document.getElementById('result-screen');
    screen.classList.remove('hidden');
    
    document.getElementById('res-atk-total').innerText = sumTroops(rAvg.m_cur).toLocaleString();
    document.getElementById('res-def-total').innerText = sumTroops(rAvg.e_cur).toLocaleString();

    const getResScore = (r) => (sumTroops(r.m_cur) / (r.startAtk||1)) - (sumTroops(r.e_cur) / (r.startDef||1));
    const sAvg = getResScore(rAvg), sMin = getResScore(rWorst), sMax = getResScore(rBest);
    const luckPct = ((sAvg - sMin) / (Math.abs(sMax - sMin) || 1)) * 100;

    document.getElementById('result-waves').innerHTML = `
        <span class="text-blue-400 font-black">${modeLabel}</span><br>
        Avg Duration: <span class="text-white">${rAvg.wave} Waves</span>
        ${simMode === 'monte-carlo' ? `<br>Visualized Battle Luck: <span class="text-amber-500">${luckPct.toFixed(0)}th Percentile</span>` : ''}
    `;

    document.getElementById('res-atk-range').innerText = `Range: ${sumTroops(rWorst.m_cur).toLocaleString()} - ${sumTroops(rBest.m_cur).toLocaleString()}`;
    document.getElementById('res-def-range').innerText = `Range: ${sumTroops(rBest.e_cur).toLocaleString()} - ${sumTroops(rWorst.e_cur).toLocaleString()}`;

    const bar = document.getElementById('luck-bar-inner');
    const rightSidePos = ((1 - Math.min(sMin, sMax)) * 50); 
    bar.style.right = (100 - rightSidePos) + "%"; 
    bar.style.width = Math.max(1.5, Math.abs(sMax - sMin) * 50) + "%";
    bar.style.left = "auto";

    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2 border-b border-emerald-900/30 pb-1 uppercase">Attacker Multipliers</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + `<div class="text-red-500 font-black mt-4 mb-2 border-b border-red-900/30 pb-1 uppercase">Defender Multipliers</div>` + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    screen.scrollIntoView({ behavior: 'smooth' });
};

window.runOptimizer = (mode) => {
    const isBear = mode === 'bear', setup = gatherSetup();
    const sum = (c) => Math.round((c.inf || 0) + (c.cav || 0) + (c.arc || 0));
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    if(!isBear) document.getElementById('opt-transparency').classList.toggle('hidden', mode !== 'meta');

    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity, winRate: 0, net: 0 };
    let opponents = [];

    // Determine Army Volume & Tiers
    const userSideData = optRole === 'atk' ? setup.atk : setup.def;
    const userTotal = userSideData.batches.reduce((s,b)=> s + sum(b), 0) || 1;
    const leadTier = userSideData.batches[0].tier;
    const leadTG = userSideData.batches[0].tg;

    if (isBear) { 
        opponents.push({inf:1, cav:0, arc:0}); 
    } else if (mode === 'current') {
        const targetSide = optRole === 'atk' ? setup.def : setup.atk;
        const d = targetSide.batches.reduce((s,b)=>({inf:s.inf+b.inf,cav:s.cav+b.cav,arc:s.arc+b.arc}),{inf:0,cav:0,arc:0});
        const t = d.inf+d.cav+d.arc || 1;
        opponents.push({inf: d.inf/t, cav: d.cav/t, arc: d.arc/t});
    } else if (mode === 'custom') {
        const i = parseFloat(document.getElementById('custom-inf').value)||0, c = parseFloat(document.getElementById('custom-cav').value)||0, a = parseFloat(document.getElementById('custom-arc').value)||0;
        const total = i+c+a || 1; opponents.push({inf:i/total, cav:c/total, arc:a/total});
    } else {
        for(let i=0; i<=100; i+=10) for(let j=0; j<=100-i; j+=10) opponents.push({inf:i/100, cav:j/100, arc:(100-i-j)/100});
    }

    for (let i=0; i<=100; i+=2) {
        for (let j=0; j<=100-i; j+=2) {
            let k=100-i-j, wins = 0, totalNet = 0;
            opponents.forEach(opp => {
                let s = JSON.parse(JSON.stringify(setup));
                
                // Varied Formation (The heatmap test)
                const varBatches = userSideData.batches.map(b => ({
                    tier: b.tier, tg: b.tg,
                    inf: (i/100) * sum(b), cav: (j/100) * sum(b), arc: (k/100) * sum(b)
                }));

                if (isBear) {
                    s.atk.stats = { 
                        inf_att: parseFloat(document.getElementById('bear-inf-att').value), inf_leth: parseFloat(document.getElementById('bear-inf-leth').value), 
                        cav_att: parseFloat(document.getElementById('bear-cav-att').value), cav_leth: parseFloat(document.getElementById('bear-cav-leth').value), 
                        arc_att: parseFloat(document.getElementById('bear-arc-att').value), arc_leth: parseFloat(document.getElementById('bear-arc-leth').value) 
                    };
                    s.atk.batches = [
                        { tier: parseInt(document.getElementById('bear-inf-tier').value), tg: parseInt(document.getElementById('bear-inf-tg').value), inf: i * 10000, cav: 0, arc: 0 },
                        { tier: parseInt(document.getElementById('bear-cav-tier').value), tg: parseInt(document.getElementById('bear-cav-tg').value), inf: 0, cav: j * 10000, arc: 0 },
                        { tier: parseInt(document.getElementById('bear-arc-tier').value), tg: parseInt(document.getElementById('bear-arc-tg').value), inf: 0, cav: 0, arc: k * 10000 }
                    ];
                } else {
                    const oppSideData = optRole === 'atk' ? setup.def : setup.atk;
                    const oppTotal = (mode === 'meta' || mode === 'custom') ? userTotal : oppSideData.batches.reduce((s,b)=> s + sum(b), 0);
                    
                    const fixBatches = (mode === 'current') ? oppSideData.batches : [{ tier: leadTier, tg: leadTG, inf: opp.inf * oppTotal, cav: opp.cav * oppTotal, arc: opp.arc * oppTotal }];

                    // Correct Role Assignment (The critical fix)
                    if (optRole === 'atk') {
                        s.atk.batches = varBatches; s.atk.heroes = setup.atk.heroes; s.atk.stats = setup.atk.stats;
                        s.def.batches = fixBatches; s.def.heroes = setup.def.heroes; s.def.stats = setup.def.stats;
                    } else {
                        s.atk.batches = fixBatches; s.atk.heroes = setup.atk.heroes; s.atk.stats = setup.atk.stats;
                        s.def.batches = varBatches; s.def.heroes = setup.def.heroes; s.def.stats = setup.def.stats;
                    }
                }

                const r = runCombatSim(s, 'average', 'average', 1, isBear, true);
                const userSurv = optRole === 'atk' ? sum(r.m_cur) : sum(r.e_cur);
                const enemySurv = optRole === 'atk' ? sum(r.e_cur) : sum(r.m_cur);
                const val = isBear ? r.totalDmg : (userSurv - enemySurv);
                
                if (!isBear && val > 0) wins++; 
                totalNet += val;
            });
            const finalScore = isBear ? totalNet : (wins * 1e15) + totalNet;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(isBear ? totalNet : wins);
            if (finalScore > best.score) best = { score: finalScore, form: [i,j,k], winRate: (wins/opponents.length)*100, net: totalNet/opponents.length };
        }
    }
    renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
    resArea.innerText = `${best.form[0]} / ${best.form[1]} / ${best.form[2]}`;
    scoreArea.innerHTML = isBear ? "Optimized Damage Split." : (mode === 'meta' ? `Meta Coverage: ${best.winRate.toFixed(1)}%` : `RESULT: <span class="${best.net > 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${best.net > 0 ? 'WIN' : 'LOSS'}</span> | Margin: ${Math.round(best.net).toLocaleString()}`);
};

function renderTernary(id, data, best, isBear) {
    const traces = [{ type:'scatterternary', a:data.a, b:data.b, c:data.c, mode:'markers', marker:{ color:data.z, colorscale: 'Viridis', size:6 } },
        { type:'scatterternary', a:[isBear?10:50], b:[isBear?10:20], c:[isBear?80:30], name:'Ref', mode:'markers', marker:{size:10, symbol:'circle', color:'white', line:{width:2, color:'black'}} },
        { type:'scatterternary', a:[best.form[0]], b:[best.form[1]], c:[best.form[2]], name:'Best', mode:'markers', marker:{size:14, symbol:'star', color:'cyan', line:{width:2, color:'black'}} }];
    Plotly.newPlot(id, traces, { ternary: { sum:100, aaxis:{title:'Inf'}, baxis:{title:'Cav'}, caxis:{title:'Arc'} }, paper_bgcolor:'rgba(0,0,0,0)', font:{color:'#64748b'}, margin:{l:0,r:0,t:30,b:0}, showlegend: false });
}

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked && n !== "None");
    if (unlocked.length < 3) return alert("Unlock at least 3 heroes in Roster.");
    
    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = '<div class="col-span-1 md:col-span-2 text-center py-12 text-blue-500 animate-pulse font-black uppercase">Solving BIP Synergies...</div>';

    const byType = { Inf: [], Cav: [], Arc: [] };
    unlocked.forEach(n => byType[HEROES[n].type].push(n));

    const scenarios = [
        { l: "Solo Attack", ctx: "off", rally: false, bear: false },
        { l: "Solo Defense", ctx: "def", rally: false, bear: false },
        { l: "Rally (Offense)", ctx: "off", rally: true, bear: false },
        { l: "Garrison (Defense)", ctx: "def", rally: true, bear: false },
        { l: "Bear Trap", ctx: "off", rally: true, bear: true }
    ];

    setTimeout(() => {
        resArea.innerHTML = '';
        scenarios.forEach(s => {
            let best = { leads: [], joiner: "None", score: -1 };

            for (let i of byType.Inf) {
                for (let c of byType.Cav) {
                    for (let a of byType.Arc) {
                        const leads = [i, c, a];
                        let bestJoinerForThisTrio = "None";
                        let maxJScore = -1;

                        // Identify best hero to fill the 4 joiner slots
                        if (s.rally || s.bear) {
                            unlocked.forEach(n => {
                                const score = calcPowerScore(leads, [n, n, n, n], s.ctx, s.rally, s.bear);
                                if (score > maxJScore) { 
                                    maxJScore = score; 
                                    bestJoinerForThisTrio = n; 
                                }
                            });
                        }

                        const finalScore = calcPowerScore(leads, (s.rally || s.bear) ? [bestJoinerForThisTrio, bestJoinerForThisTrio, bestJoinerForThisTrio, bestJoinerForThisTrio] : [], s.ctx, s.rally, s.bear);
                        if (finalScore > best.score) {
                            best = { leads, joiner: bestJoinerForThisTrio, score: finalScore };
                        }
                    }
                }
            }
            
            const card = document.createElement('div');
            card.className = "glass-card p-6 border-t-2 border-blue-500 flex justify-between items-center gap-4";
            card.innerHTML = `
                <div>
                    <div class="text-[10px] font-black text-blue-400 uppercase mb-2">${s.l}</div>
                    <div class="flex -space-x-3">
                        ${best.leads.map(n => `<div class="w-12 h-12 rounded-full border-2 border-blue-500 overflow-hidden bg-slate-900 shadow-lg z-10"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>`).join('')}
                    </div>
                    ${(s.rally || s.bear) ? `<div class="mt-2 text-[9px] text-slate-500 font-bold uppercase">Joiner: ${best.joiner} (x4)</div>` : ''}
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black text-white">${best.score.toFixed(3)}x</div>
                    <div class="text-[8px] text-slate-500 uppercase font-black">Power Factor</div>
                </div>`;
            resArea.appendChild(card);
        });
    }, 100);
};

function renderOptimizerCard(scenario, best, container) {
    const card = document.createElement('div');
    card.className = "glass-card p-6 border-t-2 border-blue-500 flex flex-col md:flex-row justify-between items-center gap-4";
    
    // Everything is now a clean multiplier (e.g., 2.450x)
    const scoreDisplay = best.score.toFixed(3) + "x";

    card.innerHTML = `
        <div class="flex flex-col md:flex-row items-center gap-6 w-full">
            <div class="text-center md:text-left min-w-[120px]">
                <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">${scenario.l}</div>
                <div class="text-2xl font-black text-white">${scoreDisplay}</div>
            </div>
            <div class="flex -space-x-3">
                ${best.leaders.map(n => `
                    <div class="w-14 h-14 rounded-full border-2 border-blue-500 bg-slate-800 overflow-hidden shadow-lg z-10">
                        <img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover">
                    </div>
                `).join('')}
            </div>
            ${best.joiners.length > 0 ? `
                <div class="flex flex-wrap gap-1 justify-center opacity-60">
                    ${best.joiners.map(n => `
                        <div class="w-10 h-10 rounded-full border border-slate-700 bg-slate-900 overflow-hidden">
                            <img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover">
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    container.appendChild(card);
}

function calcPowerScore(leaders, joiners, ctx, isRally, isBear) {
    let skillBuckets = {}; 
    let widgetMults = { attack: 1.0, defense: 1.0, lethality: 1.0, health: 1.0 };
    
    // 1. WIDGET MULTIPLIERS (Applied to Leads only)
    // Applied in Solo Defense (ctx:def), Rally, Garrison, or Bear
    if (isRally || ctx === 'def') {
        leaders.forEach(n => {
            if (n === "None" || !HEROES[n]) return;
            const d = HEROES[n], r = roster[n];
            if (d.widget && d.widget.context === ctx) {
                widgetMults[d.widget.stat] *= (1 + WIDGET_GROWTH[r.widget]);
            }
        });
    }

    // 2. SKILL STACKING Logic
    const manifest = {};
    leaders.forEach(n => { if(n !== "None"){ manifest[n] = manifest[n] || { l:0, j:0 }; manifest[n].l++; }});
    joiners.forEach(n => { if(n !== "None"){ manifest[n] = manifest[n] || { l:0, j:0 }; manifest[n].j++; }});

    for (const name in manifest) {
        const d = HEROES[name], r = roster[name], count = manifest[name];
        d.skills.forEach((s, si) => {
            // Leaders contribute all skills, Joiners only S1
            const instances = count.l + (si === 0 ? count.j : 0);
            if (instances === 0) return;

            const lvl = r[`s${si+1}`] || 5;
            const x = s.values[lvl-1], p = s.getChance(x), m = s.getMagnitude(x);
            
            let effectiveMagnitude;
            if (p >= 1.0) {
                // Rule: Deterministic skills are ADDITIVE (1 + 0.25 + 0.25)
                effectiveMagnitude = instances; 
            } else {
                // Rule: Chance based skills increase probability: 1 - (1-p)^n
                const dur = isBear ? 1 : (s.duration || 1);
                const probAny = 1 - Math.pow(1 - p, instances);
                effectiveMagnitude = (1 - Math.pow(1 - probAny, dur));
            }

            s.ids.forEach((id, idx) => {
                if (isBear && id >= 200) return; // Bear Trap ignores 2xx skills
                const val = (Array.isArray(m) ? m[idx] : m) * effectiveMagnitude;
                skillBuckets[id] = (skillBuckets[id] || 0) + val;
            });
        });
    }

    let skillMult = 1.0;
    Object.keys(skillBuckets).forEach(id => skillMult *= (1 + skillBuckets[id]));

    // 3. STAT POWER GAIN Layer
    let statEffect = 1.0;
    if (document.getElementById('use-account-stats').checked && nakedStats) {
        let totalGain = 0;
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
                        if (d.widget.stat === 'lethality') flats.leth += (templateStats ? templateStats[r.widget] : 0);
                        if (d.widget.stat === 'health') flats.hp += (templateStats ? templateStats[r.widget] : 0);
                    }
                }
            });
            const final = { att: naked.att + flats.att, leth: naked.leth + flats.leth, def: naked.def + flats.def, hp: naked.hp + flats.hp };
            // Power calculation based on scenario
            const nPwr = isBear ? (naked.att * naked.leth) : (naked.att * naked.leth * naked.def * naked.hp);
            const fPwr = isBear ? (final.att * final.leth) : (final.att * final.leth * final.def * final.hp);
            totalGain += (fPwr / (nPwr || 1));
        });
        statEffect = totalGain / 3;
    }

    // Combine Widget Multipliers
    const widgetEffect = isBear ? (widgetMults.attack * widgetMults.lethality) : (widgetMults.attack * widgetMults.lethality * widgetMults.defense * widgetMults.health);
    return statEffect * skillMult * widgetEffect;
}

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);
