import { HEROES } from './heroes.js';
import { runCombatSim } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, widgetLv: 10 })) }
};
let activeSlot = { side: null, index: null };

function init() {
    // 1. Sync Roster with HEROES DB
    Object.keys(HEROES).forEach(n => { 
        if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10 }; 
    });

    // 2. Populate Battle Select
    const sel = document.getElementById('hero-select');
    sel.innerHTML = '<option value="None">None</option>';
    Object.keys(HEROES).sort().forEach(n => {
        const o = document.createElement('option'); o.value = n; o.innerText = n; sel.appendChild(o);
    });

    // 3. Build Stat Table
    const table = document.getElementById('stat-table');
    const categories = [{ label: "Attack", key: "att" }, { label: "Defense", key: "def" }, { label: "Lethality", key: "leth" }, { label: "Health", key: "hp" }];
    const units = ["Infantry", "Cavalry", "Archer"];
    units.forEach(u => {
        categories.forEach(c => {
            const row = document.createElement('div');
            row.className = "stat-row";
            const key = `${u.toLowerCase().slice(0,3)}_${c.key}`;
            row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000"><div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.label}</div><input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">`;
            table.appendChild(row);
        });
    });

    window.addBatch('atk', true); window.addBatch('def', true);
    document.getElementById('hero-select').addEventListener('change', (e) => renderSkillsInModal(e.target.value, activeSlot.index));
    renderRosterUI();
    window.showTab('battle');
}

// --- TAB SYSTEM ---
window.showTab = (tab) => {
    const screens = ['battle-tab', 'optimizer-screen', 'bear-tab', 'roster-tab'];
    screens.forEach(s => document.getElementById(s).classList.add('hidden'));
    const active = tab === 'battle' ? 'battle-tab' : (tab === 'formation' ? 'optimizer-screen' : tab + '-tab');
    document.getElementById(active).classList.remove('hidden');
};

// --- ROSTER UI & MODERN PICKERS ---
function renderLevelPicker(name, skillKey, currentVal) {
    let html = `<div class="flex gap-1">`;
    for (let i = 1; i <= 5; i++) {
        html += `<button onclick="event.stopPropagation(); window.updateRoster('${name}', '${skillKey}', ${i})" 
                 class="w-6 h-6 rounded text-[10px] font-bold transition-all ${currentVal == i ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}">${i}</button>`;
    }
    return html + `</div>`;
}

function renderWidgetPicker(name, currentVal) {
    let html = `<div class="flex flex-wrap gap-1 max-w-[140px]">`;
    for (let i = 0; i <= 10; i++) {
        html += `<button onclick="event.stopPropagation(); window.updateRoster('${name}', 'widget', ${i})" 
                 class="w-5 h-5 rounded text-[8px] font-bold transition-all ${currentVal == i ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return html + `</div>`;
}

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { r.unlocked = !r.unlocked; saveRoster(); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        
        let skillsHtml = h.skills.map((s, i) => `
            <div class="mt-2">
                <div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>
                ${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}
            </div>
        `).join('');

        card.innerHTML = `
            <div class="flex items-center gap-3 mb-2">
                <div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                    <img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover" onerror="this.style.display='none'">
                </div>
                <div class="font-bold text-xs uppercase tracking-tighter">${n}</div>
            </div>
            ${r.unlocked ? `<div class="space-y-3">${skillsHtml}
                ${h.widget ? `<div class="pt-2 border-t border-slate-800"><span class="text-[8px] text-amber-500 font-black uppercase block mb-1">Widget Level</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}
            </div>` : ''}`;
        grid.appendChild(card);
    });
}

window.updateRoster = (n, k, v) => { roster[n][k] = v; saveRoster(); renderRosterUI(); };
const saveRoster = () => localStorage.setItem('ks_roster', JSON.stringify(roster));

// --- BEST HEROES OPTIMIZER ---
window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if (unlocked.length < 3) return alert("Unlock at least 3 heroes.");
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden'); resArea.innerHTML = '';
    
    const scens = [
        {l:"Optimal Attack", c:"off", j:false},
        {l:"Optimal Attack w/ Joiners", c:"off", j:true},
        {l:"Optimal Defense", c:"def", j:false},
        {l:"Optimal Defense w/ Joiners", c:"def", j:true}
    ];

    scens.forEach(s => {
        const b = findBestLineup(unlocked, s.c, s.j);
        const card = document.createElement('div'); card.className="glass-card p-4 border-t-2 border-blue-500";
        card.innerHTML = `<span class="text-[9px] font-black text-blue-400 uppercase">${s.l}</span>
            <div class="flex gap-2 mt-3">${b.leaders.map(n=>`<div class="w-10 h-10 rounded-full border border-blue-500 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>`).join('')}</div>
            ${s.j ? `<div class="flex gap-1 mt-2 opacity-50">${b.joiners.map(n=>`<div class="w-6 h-6 rounded-full border border-slate-700 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>`).join('')}</div>` : ''}
            <div class="mt-3 text-xl font-black">${b.score.toFixed(3)}x <span class="text-[10px] text-slate-500 font-normal">multiplier</span></div>`;
        resArea.appendChild(card);
    });
};

function findBestLineup(names, ctx, useJoiners) {
    let best = { leaders: [], joiners: [], score: 0 };
    const combos = getCombinations(names, 3);
    combos.forEach(trio => {
        let currentJoiners = [];
        if (useJoiners) {
            const rem = names.filter(n => !trio.includes(n));
            const pool = rem.map(n => ({ n, i: calcCrossProduct(trio, [n], ctx) })).sort((a,b)=>b.i-a.i);
            currentJoiners = pool.slice(0, 4).map(x => x.n);
        }
        const score = calcCrossProduct(trio, currentJoiners, ctx);
        if (score > best.score) best = { leaders: trio, joiners: currentJoiners, score };
    });
    return best;
}

function calcCrossProduct(leaders, joiners, ctx) {
    let pools = {};
    leaders.forEach(n => {
        const d = HEROES[n], r = roster[n];
        const hW = (d.widget && d.widget.context === ctx) ? (1 + WIDGET_GROWTH[r.widget]) : 1.0;
        d.skills.forEach((s, i) => {
            const x = s.values[r['s'+(i+1)]-1];
            const ev = s.duration === 0 ? s.getChance(x)*s.getMagnitude(x) : (1-Math.pow(1-s.getChance(x), s.duration))*s.getMagnitude(x);
            s.ids.forEach((id, idx) => pools[id] = (pools[id]||0) + ((Array.isArray(ev)?ev[idx]:ev)*hW));
        });
    });
    joiners.forEach(n => {
        const r = roster[n], s = HEROES[n].skills[0], x = s.values[r.s1-1];
        const ev = s.duration === 0 ? s.getChance(x)*s.getMagnitude(x) : (1-Math.pow(1-s.getChance(x), s.duration))*s.getMagnitude(x);
        s.ids.forEach((id, idx) => pools[id] = (pools[id]||0) + (Array.isArray(ev)?ev[idx]:ev));
    });
    let t = 1.0; Object.values(pools).forEach(v => t *= (1+v));
    return t;
}

// --- BATTLE & BEAR SIM HANDLERS ---
window.handleSimulation = async () => {
    const setup = gatherSetup();
    const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst, modeLabel;

    if (simMode === 'monte-carlo') {
        modeLabel = "Monte Carlo (100 Runs)";
        const runs = 100; let batch = [];
        for (let i = 0; i < runs; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        batch.sort((a, b) => (a.m_cur.inf + a.m_cur.cav + a.m_cur.arc) - (b.m_cur.inf + b.m_cur.cav + b.m_cur.arc));
        
        const atkWins = batch.filter(r => (r.m_cur.inf+r.m_cur.cav+r.m_cur.arc) > (r.e_cur.inf+r.e_cur.cav+r.e_cur.arc)).length;
        const winner = atkWins >= 50 ? 'atk' : 'def';
        rAvg = {
            m_cur: { inf: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.inf,0)/runs:0, cav: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.cav,0)/runs:0, arc: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.arc,0)/runs:0 },
            e_cur: { inf: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.inf,0)/runs:0, cav: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.cav,0)/runs:0, arc: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.arc,0)/runs:0 },
            wave: Math.round(batch.reduce((s,r)=>s+r.wave,0)/runs),
            atk_mults: batch[Math.floor(runs/2)].atk_mults, def_mults: batch[Math.floor(runs/2)].def_mults,
            startAtk: batch[0].startAtk, startDef: batch[0].startDef
        };
        rWorst = batch[0]; rBest = batch[runs-1];
    } else {
        modeLabel = "Quick Sim (Estimate)";
        rAvg = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave);
        rWorst = runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave);
    }
    renderResultsToUI(rAvg, rBest, rWorst, modeLabel);
};

window.handleBearSim = () => {
    const r = runCombatSim(gatherSetup(), 'average', 'average', 10, true);
    document.getElementById('bear-total-dmg').innerText = Math.round(r.totalDmg).toLocaleString();
};

function renderResultsToUI(avg, best, worst, label) {
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('result-waves').innerText = `${label} | length: ${avg.wave} waves`;
    document.getElementById('res-atk-total').innerHTML = `<span>${Math.round(avg.m_cur.inf+avg.m_cur.cav+avg.m_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(worst.m_cur.inf+worst.m_cur.cav+worst.m_cur.arc).toLocaleString()} - ${Math.round(best.m_cur.inf+best.m_cur.cav+best.m_cur.arc).toLocaleString()}</div>`;
    document.getElementById('res-def-total').innerHTML = `<span>${Math.round(avg.e_cur.inf+avg.e_cur.cav+avg.e_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(best.e_cur.inf+best.e_cur.cav+best.e_cur.arc).toLocaleString()} - ${Math.round(worst.e_cur.inf+worst.e_cur.cav+worst.e_cur.arc).toLocaleString()}</div>`;
    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2 uppercase">[Attacker Buffs]</div>` + avg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + `<div class="text-red-500 font-black mb-2 mt-4 uppercase">[Defender Buffs]</div>` + avg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
}

function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: parseInt(el.querySelector('.batch-tier').value), tg: parseInt(el.querySelector('.batch-tg').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    return {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes.map(h => ({ ...h, starBonus: GROWTH_TEMPLATES[HEROES[h.name]?.template || 'SEASON_1'][(h.star*6)+h.sub] })) },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes.map(h => ({ ...h, starBonus: GROWTH_TEMPLATES[HEROES[h.name]?.template || 'SEASON_1'][(h.star*6)+h.sub] })) }
    };
}

function getCombinations(arr, size) {
    let result = [];
    function helper(start, combo) {
        if (combo.length === size) { result.push([...combo]); return; }
        for (let i = start; i < arr.length; i++) { combo.push(arr[i]); helper(i + 1, combo); combo.pop(); }
    }
    helper(0, []); return result;
}

document.addEventListener('DOMContentLoaded', init);
