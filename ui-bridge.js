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

window.toggleDetails = () => {
    const box = document.getElementById('battle-details');
    const btn = document.getElementById('toggle-details-btn');
    box.classList.toggle('hidden');
    btn.innerText = box.classList.contains('hidden') ? 'View Combat Buffs +' : 'Hide Combat Buffs -';
};

window.setOptRole = (role) => {
    optRole = role;
    document.getElementById('opt-role-atk').className = role === 'atk' ? "px-3 py-1 text-[10px] font-bold rounded bg-blue-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
    document.getElementById('opt-role-def').className = role === 'def' ? "px-3 py-1 text-[10px] font-bold rounded bg-red-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
};

window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    if (!container) return;
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 relative mb-2";
    const types = [
        { label: 'Infantry', key: 'inf', color: 'text-blue-400', val: 500000 },
        { label: 'Cavalry', key: 'cav', color: 'text-amber-400', val: 200000 },
        { label: 'Archers', key: 'arc', color: 'text-emerald-400', val: 300000 }
    ];
    let html = `<div class="flex justify-between items-center"><span class="text-[9px] font-bold text-slate-500 uppercase">Troop Configuration</span>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[10px] font-black uppercase">Remove</button>` : ''}</div>`;
    types.forEach(t => {
        html += `<div class="grid grid-cols-12 gap-2 items-center border-b border-slate-800/50 pb-2">
            <div class="col-span-3 text-[10px] font-bold ${t.color}">${t.label}</div>
            <select class="batch-tier-${t.key} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v===10?'selected':''}>T${v}</option>`).join('')}</select>
            <select class="batch-tg-${t.key} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v===3?'selected':''}>TG${v}</option>`).join('')}</select>
            <input type="number" class="batch-${t.key} col-span-5 input-dark !text-right" value="${initial ? t.val : 0}" oninput="window.updateFormation('${side}')">
        </div>`;
    });
    div.innerHTML = html;
    container.appendChild(div); window.updateFormation(side);
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
        h += `<button onclick="event.stopPropagation(); ${action}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}">${i}</button>`;
    }
    return h + `</div>`;
}

function renderStarSelector(name, currentIndex) {
    let html = `<select onclick="event.stopPropagation()" onchange="event.stopPropagation(); window.updateRoster('${name}', 'starIndex', this.value)" class="bg-slate-800 text-[10px] text-slate-300 rounded px-2 py-1 border border-slate-700 w-full mt-1">`;
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
        card.className = `p-4 glass-card border-2 cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2" onclick="event.stopPropagation()"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3"><div><span class="text-[8px] text-slate-500 font-black uppercase">Development</span>${renderStarSelector(n, r.starIndex)}</div>${skillsHtml}</div>` : ''}`;
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
            if (h.name !== 'None') div.innerHTML = `<img src="./assets/${h.name.toLowerCase()}.png" class="w-full h-full object-cover rounded-full">`;
            else div.innerText = (i + 1);
            div.onclick = () => window.openHeroModal(side, i);
            container.appendChild(div);
        });
    });
};

function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({
        inf_tier: parseInt(el.querySelector('.batch-tier-inf').value), inf_tg: parseInt(el.querySelector('.batch-tg-inf').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0,
        cav_tier: parseInt(el.querySelector('.batch-tier-cav').value), cav_tg: parseInt(el.querySelector('.batch-tg-cav').value), cav: parseFloat(el.querySelector('.batch-cav').value)||0,
        arc_tier: parseInt(el.querySelector('.batch-tier-arc').value), arc_tg: parseInt(el.querySelector('.batch-tg-arc').value), arc: parseFloat(el.querySelector('.batch-arc').value)||0
    }));
    return { atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes }, def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes } };
}

window.handleSimulation = async () => {
    const setup = gatherSetup(); 
    const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst, modeLabel;

    if (simMode === 'monte-carlo') {
        modeLabel = "Monte Carlo (100x)";
        let batch = [];
        for (let i = 0; i < 100; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        batch.sort((a,b) => (sumTroops(a.m_cur) - sumTroops(a.e_cur)) - (sumTroops(b.m_cur) - sumTroops(b.e_cur)));
        rAvg = batch[50]; rWorst = batch[0]; rBest = batch[99];
    } else {
        modeLabel = "Range Analysis (95% CI)";
        rAvg = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky');
        rWorst = runCombatSim(setup, 'unlucky', 'lucky');
    }

    const screen = document.getElementById('result-screen');
    screen.classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = sumTroops(rAvg.m_cur).toLocaleString();
    document.getElementById('res-def-total').innerText = sumTroops(rAvg.e_cur).toLocaleString();
    document.getElementById('result-waves').innerHTML = `<span class="text-blue-400 font-black">${modeLabel}</span><br>Avg Duration: <span class="text-white">${rAvg.wave} Waves</span>`;
    document.getElementById('res-atk-range').innerText = `Range: ${sumTroops(rWorst.m_cur).toLocaleString()} - ${sumTroops(rBest.m_cur).toLocaleString()}`;
    document.getElementById('res-def-range').innerText = `Range: ${sumTroops(rBest.e_cur).toLocaleString()} - ${sumTroops(rWorst.e_cur).toLocaleString()}`;
    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2 border-b border-emerald-900/30 pb-1 uppercase">Attacker</div>` + rAvg.atk_mults.map(l => `<div>${l}</div>`).join('') + `<div class="text-red-500 font-black mt-4 mb-2 border-b border-red-900/30 pb-1 uppercase">Defender</div>` + rAvg.def_mults.map(l => `<div>${l}</div>`).join('');
    screen.scrollIntoView({ behavior: 'smooth' });
};

// --- 5. ACCOUNT CALIBRATION ---
window.toggleAccountStats = () => {
    const isEnabled = document.getElementById('use-account-stats').checked;
    document.getElementById('account-stats-ui').classList.toggle('hidden', !isEnabled);
};

window.reverseEngineerAccount = () => {
    const ctx = document.getElementById('report-ctx').value;
    const reportHeroNames = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    const reportVal = {};
    ['inf','cav','arc'].forEach(t => ['att','def','leth','hp'].forEach(s => {
        reportVal[`${t}_${s}`] = parseFloat(document.getElementById(`rep-${t}-${s}`).value) || 0;
    }));
    const results = {};
    ['inf','cav','arc'].forEach(t => {
        ['att','def','leth','hp'].forEach(s => {
            let val = reportVal[`${t}_${s}`];
            reportHeroNames.forEach(name => {
                if(name === "None") return;
                const d = HEROES[name], r = roster[name];
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') val -= (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
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
    const div = document.getElementById('naked-stats-display'); div.classList.remove('hidden');
    div.innerHTML = Object.entries(nakedStats).map(([k, v]) => `<div class="text-center"><div class="text-[8px] text-slate-500 uppercase">${k}</div><div class="text-xs font-bold text-blue-400">${v.toFixed(1)}%</div></div>`).join('');
}

// --- 6. OPTIMIZER ---
window.runOptimizer = (mode) => {
    const isBear = mode === 'bear', setup = gatherSetup();
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity, wins: 0, net: 0 };
    let opponents = [];
    if (isBear) opponents.push({inf:1, cav:0, arc:0}); 
    else for(let i=0; i<=100; i+=20) for(let j=0; j<=100-i; j+=20) opponents.push({inf:i/100, cav:j/100, arc:(100-i-j)/100});

    for (let i=0; i<=100; i+=5) {
        for (let j=0; j<=100-i; j+=5) {
            let k=100-i-j, wins = 0, totalNet = 0;
            opponents.forEach(opp => {
                let s = JSON.parse(JSON.stringify(setup));
                const userBatches = [{ inf_tier:10, inf_tg:3, inf:i*1000, cav_tier:10, cav_tg:3, cav:j*1000, arc_tier:10, arc_tg:3, arc:k*1000 }];
                const oppBatches = [{ inf_tier:10, inf_tg:3, inf:opp.inf*100000, cav_tier:10, cav_tg:3, cav:opp.cav*100000, arc_tier:10, arc_tg:3, arc:opp.arc*100000 }];
                if (optRole === 'atk') { s.atk.batches = userBatches; s.def.batches = oppBatches; }
                else { s.def.batches = userBatches; s.atk.batches = oppBatches; }
                const r = runCombatSim(s, 'average', 'average', 1, isBear, true);
                const val = isBear ? r.totalDmg : (sumTroops(r.m_cur) - sumTroops(r.e_cur));
                if (!isBear && val > 0) wins++; totalNet += val;
            });
            const score = isBear ? totalNet : (wins * 1e15) + totalNet;
            if (score > best.score) best = { score, form: [i,j,k], wins, net: totalNet/opponents.length };
        }
    }
    resArea.innerText = `${best.form[0]} / ${best.form[1]} / ${best.form[2]}`;
    scoreArea.innerText = isBear ? `Total Dmg: ${Math.round(best.net).toLocaleString()}` : `Win Rate: ${((best.wins/opponents.length)*100).toFixed(1)}%`;
};

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if (unlocked.length < 3) return alert("Unlock 3 heroes.");
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden');
    resArea.innerHTML = '<div class="col-span-2 text-center text-blue-500 animate-pulse font-bold">CALCULATING...</div>';
    setTimeout(() => {
        resArea.innerHTML = '';
        const scenarios = [{ l: "Solo Attack", c: "off" }, { l: "Rally (Off)", c: "off" }];
        scenarios.forEach(s => {
            const card = document.createElement('div'); card.className = "glass-card p-4";
            card.innerHTML = `<div class="text-[10px] text-blue-400 font-bold uppercase">${s.l}</div><div class="text-xl font-black text-white">Analysis Ready</div>`;
            resArea.appendChild(card);
        });
    }, 100);
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', window.init);
