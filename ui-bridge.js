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

// --- INITIALIZATION ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; });
    const mainSel = document.getElementById('hero-select');
    if(mainSel) {
        mainSel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { mainSel.innerHTML += `<option value="${n}">${n}</option>`; });
        mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);
    }
    document.querySelectorAll('.rep-hero').forEach(sel => {
        sel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { sel.innerHTML += `<option value="${n}">${n}</option>`; });
    });
    buildStatTable();
    window.addBatch('atk', true); window.addBatch('def', true);
    window.updateGrids(); renderRosterUI(); 
    if(nakedStats) renderNakedStats();
    window.showTab('battle');
};

function buildStatTable() {
    const table = document.getElementById('stat-table'); if(!table) return;
    const units = ["Infantry", "Cavalry", "Archer"], cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    table.innerHTML = '';
    units.forEach(u => cats.forEach(c => {
        const row = document.createElement('div'); row.className = "stat-row";
        const key = `${u.toLowerCase().slice(0,3)}_${c.k}`;
        row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" value="1000" class="input-dark !w-[70px] !bg-transparent !border-none !text-emerald-500 font-black" oninput="window.updateStatColors(this)">
            <div class="text-[9px] font-black uppercase text-slate-500">${u} ${c.l}</div>
            <input type="number" data-side="def" data-stat="${key}" value="1000" class="input-dark !w-[70px] !bg-transparent !border-none !text-red-500 font-black text-right" oninput="window.updateStatColors(this)">`;
        table.appendChild(row);
    }));
}

// --- SIMULATION (Fixed Range Bar & Colored Logs) ---
window.handleSimulation = async () => {
    const setup = gatherSetup(); 
    const mode = document.getElementById('sim-mode-select').value;
    let rFinal, rBest, rWorst, winAtk = 0, winDef = 0;

    if (mode === 'monte-carlo') {
        let results = [], sumAtk = 0, sumDef = 0;
        for (let i = 0; i < 100; i++) {
            const r = runCombatSim(setup, 'stochastic', 'stochastic');
            const atkV = sumTroops(r.m_cur), defV = sumTroops(r.e_cur);
            if (atkV > defV) { winAtk++; sumAtk += atkV; } else { winDef++; sumDef += defV; }
            results.push(r);
        }
        rFinal = {
            m_cur: { inf: winAtk >= winDef ? (sumAtk/Math.max(1,winAtk)) : 0, cav:0, arc:0 },
            e_cur: { inf: winDef > winAtk ? (sumDef/Math.max(1,winDef)) : 0, cav:0, arc:0 },
            wave: results[50].wave, atk_logs: results[50].atk_logs, def_logs: results[50].def_logs
        };
        results.sort((a,b) => sumTroops(a.m_cur) - sumTroops(a.e_cur));
        rWorst = results[0]; rBest = results[99];
    } else {
        rFinal = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky'); rWorst = runCombatSim(setup, 'unlucky', 'lucky');
    }

    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = Math.round(sumTroops(rFinal.m_cur)).toLocaleString();
    document.getElementById('res-def-total').innerText = Math.round(sumTroops(rFinal.e_cur)).toLocaleString();
    
    // Fixed Range Bar and Capitalization
    const sAtk = sumTroops(rFinal.m_cur), sDef = sumTroops(rFinal.e_cur);
    const score = (sAtk / (sumTroops(setup.atk.batches[0]) || 1)) - (sDef / (sumTroops(setup.def.batches[0]) || 1));
    const bar = document.getElementById('luck-bar-inner');
    bar.style.left = "50%"; bar.style.width = Math.abs(score * 50) + "%";
    if(score < 0) bar.style.transform = "translateX(-100%)"; else bar.style.transform = "none";

    document.getElementById('result-waves').innerHTML = `<span class="text-blue-400 font-black uppercase">Monte-Carlo Analysis</span><br>Atk Wins: ${winAtk}% | Def Wins: ${winDef}%<br>Representative Duration: ${rFinal.wave} Waves`;
    document.getElementById('res-atk-range').innerText = `Range: ${sumTroops(rWorst.m_cur).toLocaleString()} - ${sumTroops(rBest.m_cur).toLocaleString()}`;
    document.getElementById('res-def-range').innerText = `Range: ${sumTroops(rBest.e_cur).toLocaleString()} - ${sumTroops(rWorst.e_cur).toLocaleString()}`;

    const logHTML = (side, data) => `
        <div class="${side === 'atk' ? 'text-emerald-500' : 'text-red-500'} font-black border-b border-slate-800 mb-2 mt-4 uppercase text-[10px] pb-1">${side === 'atk' ? 'Attacker' : 'Defender'} Multipliers</div>
        <div class="text-slate-400 font-bold text-[9px] mb-1">[Passive] Standard 10% RPS Counters Active</div>
        <div class="text-slate-300 font-bold text-[9px] mb-2">[Troop Efficiency] ${data.troopEff || 'None'}</div>
        ${data.skills.map(s => `<div class="flex justify-between border-b border-slate-900/50 py-0.5"><span class="text-slate-400">${s.name}</span> <span class="${s.isPassive?'text-blue-400':'text-amber-500'} font-black">${s.val}</span></div>`).join('')}
        ${data.triggers ? `<div class="text-amber-500/50 text-[8px] mt-1 italic">Stochastic Triggers: ${data.triggers}</div>` : ''}
    `;
    document.getElementById('battle-details').innerHTML = logHTML('atk', rFinal.atk_logs) + logHTML('def', rFinal.def_logs);
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

// --- OPTIMIZERS (Heatmaps & Reference Circles Restored) ---
window.runOptimizer = (mode) => {
    const isBear = mode === 'bear', setup = gatherSetup();
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity, winRate: 0, net: 0 };
    let opponents = [];

    if (isBear) { 
        opponents.push({inf:1, cav:0, arc:0}); 
        // Sync Bear Stats from inputs
        setup.atk.stats = { inf_att: parseFloat(document.getElementById('bear-inf-att').value), inf_leth: parseFloat(document.getElementById('bear-inf-leth').value), cav_att: parseFloat(document.getElementById('bear-cav-att').value), cav_leth: parseFloat(document.getElementById('bear-cav-leth').value), arc_att: parseFloat(document.getElementById('bear-arc-att').value), arc_leth: parseFloat(document.getElementById('bear-arc-leth').value) };
    } else if (mode === 'current') {
        const t = optRole === 'atk' ? setup.def : setup.atk;
        const total = sumTroops(processBatchData(t.batches)) || 1;
        const d = processBatchData(t.batches);
        opponents.push({inf: d.inf/total, cav: d.cav/total, arc: d.arc/total});
    } else {
        for(let i=0; i<=100; i+=20) for(let j=0; j<=100-i; j+=20) opponents.push({inf:i/100, cav:j/100, arc:(100-i-j)/100});
    }

    for (let i=0; i<=100; i+=5) {
        for (let j=0; j<=100-i; j+=5) {
            let k=100-i-j, wins = 0, totalNet = 0;
            opponents.forEach(opp => {
                let s = JSON.parse(JSON.stringify(setup));
                const userBatch = { inf_tier: isBear ? parseInt(document.getElementById('bear-inf-tier').value) : 10, inf_tg: isBear ? parseInt(document.getElementById('bear-inf-tg').value) : 3, inf:i*1000, cav_tier: isBear ? parseInt(document.getElementById('bear-cav-tier').value) : 10, cav_tg: isBear ? parseInt(document.getElementById('bear-cav-tg').value) : 3, cav:j*1000, arc_tier: isBear ? parseInt(document.getElementById('bear-arc-tier').value) : 10, arc_tg: isBear ? parseInt(document.getElementById('bear-arc-tg').value) : 3, arc:k*1000 };
                if (optRole === 'atk') s.atk.batches = [userBatch]; else s.def.batches = [userBatch];
                const r = runCombatSim(s, 'average', 'average', 1, isBear, true);
                const val = isBear ? r.totalDmg : (optRole === 'atk' ? sumTroops(r.m_cur) - sumTroops(r.e_cur) : sumTroops(r.e_cur) - sumTroops(r.m_cur));
                if (!isBear && val > 0) wins++; totalNet += val;
            });
            const score = isBear ? totalNet : (wins * 1e15) + totalNet;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(isBear ? totalNet : wins);
            if (score > best.score) best = { score, form: [i,j,k], winRate: (wins/opponents.length)*100, net: totalNet/opponents.length };
        }
    }
    renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
    resArea.innerText = `${best.form[0]} / ${best.form[1]} / ${best.form[2]}`;
    scoreArea.innerText = isBear ? `Maximized Damage Split` : `Coverage: ${best.winRate.toFixed(1)}% | Net: ${Math.round(best.net).toLocaleString()}`;
};

function renderTernary(id, data, best, isBear) {
    const traces = [{ type:'scatterternary', a:data.a, b:data.b, c:data.c, mode:'markers', marker:{ color:data.z, colorscale: 'Viridis', size:7, line:{width:0.5, color:'#1e293b'} } },
        { type:'scatterternary', a:[isBear?10:50], b:[isBear?10:20], c:[isBear?80:30], name:'Standard', mode:'markers', marker:{size:12, symbol:'circle-open', color:'white', line:{width:2}} },
        { type:'scatterternary', a:[best.form[0]], b:[best.form[1]], c:[best.form[2]], name:'Best', mode:'markers', marker:{size:16, symbol:'star', color:'cyan', line:{width:2, color:'black'}} }];
    Plotly.newPlot(id, traces, { ternary: { sum:100, aaxis:{title:'Inf'}, baxis:{title:'Cav'}, caxis:{title:'Arc'} }, paper_bgcolor:'rgba(0,0,0,0)', font:{color:'#64748b'}, margin:{l:0,r:0,t:30,b:0}, showlegend: false });
}

// --- BEST HEROES (Restored Scenarios & Logic) ---
window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if (unlocked.length < 3) return alert("Unlock 3 heroes in Roster.");
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden');
    resArea.innerHTML = '<div class="col-span-2 text-center py-8 text-blue-500 animate-pulse font-black uppercase">Solving BIP Synergies...</div>';
    const byType = { Inf: [], Cav: [], Arc: [] }; unlocked.forEach(n => byType[HEROES[n].type].push(n));
    const scenarios = [{ l: "Solo Attack", c: "off", j: 0 }, { l: "Solo Defense", c: "def", j: 0 }, { l: "Rally (Offense)", c: "off", j: 4 }, { l: "Garrison (Defense)", c: "def", j: 4 }, { l: "Bear Trap", c: "off", j: 4, b: true }];
    setTimeout(() => {
        resArea.innerHTML = '';
        scenarios.forEach(s => {
            let best = { leaders: [], score: -1 };
            for (let i of byType.Inf) for (let c of byType.Cav) for (let a of byType.Arc) {
                const score = calcPowerScore([i, c, a], [], s.c, s.b);
                if (score > best.score) best = { leaders: [i, c, a], score };
            }
            const card = document.createElement('div'); card.className = "glass-card p-6 border-t-2 border-blue-500 flex justify-between items-center";
            card.innerHTML = `<div><div class="text-[10px] font-black text-blue-400 uppercase mb-2">${s.l}</div>
                <div class="flex -space-x-3">${best.leaders.map(n => `<div class="w-12 h-12 rounded-full border-2 border-blue-500 overflow-hidden shadow-lg z-10 bg-slate-900"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>`).join('')}</div></div>
                <div class="text-right text-2xl font-black text-white">${best.score.toFixed(3)}x</div>`;
            resArea.appendChild(card);
        });
    }, 100);
};

function calcPowerScore(leaders, joiners, ctx, isBear) {
    let skillBuckets = {}; let widgets = { atk:1, leth:1, def:1, hp:1 };
    leaders.forEach(n => {
        const d = HEROES[n], r = roster[n];
        if (d.widget && d.widget.context === ctx) widgets[d.widget.stat] *= (1 + WIDGET_GROWTH[r.widget]);
        d.skills.forEach((s, si) => {
            const x = s.values[(r[`s${si+1}`]||5)-1], p = s.getChance(x), m = s.getMagnitude(x);
            const ev = (p >= 1.0) ? m : (1 - Math.pow(1 - p, s.duration || 1)) * m;
            s.ids.forEach((id, idx) => { if(!isBear || id < 200) skillBuckets[id] = (skillBuckets[id] || 0) + (Array.isArray(ev)?ev[idx]:ev); });
        });
    });
    let sMult = 1.0; Object.values(skillBuckets).forEach(v => sMult *= (1+v));
    let statEffect = 1.0;
    if (document.getElementById('use-account-stats').checked && nakedStats) {
        let totalGain = 0;
        ['inf', 'cav', 'arc'].forEach(t => {
            const n = { att: nakedStats[`${t}_att`], leth: nakedStats[`${t}_leth`], def: nakedStats[`${t}_def`], hp: nakedStats[`${t}_hp`] };
            let flats = { att: 0, def: 0 };
            leaders.forEach(name => { if(HEROES[name].type.toLowerCase().slice(0,3) === t) flats.att += GROWTH_TEMPLATES[HEROES[name].template][roster[name].starIndex]; });
            totalGain += ((n.att + flats.att) * widgets.atk * (n.leth * widgets.leth)) / ((n.def + flats.def) * widgets.def * (n.hp * widgets.hp));
        });
        statEffect = totalGain / 3;
    }
    return statEffect * sMult * (isBear ? 1 : (widgets.atk * widgets.leth));
}

// --- ROSTER (Widgets & Level Pickers Restored) ---
function renderWidgetPicker(hero, current) {
    let h = `<div class="flex flex-wrap gap-1 mt-1">`;
    for(let i=0; i<=10; i++) h += `<button onclick="event.stopPropagation(); window.updateRoster('${hero}','widget',${i})" class="w-5 h-5 rounded text-[8px] font-bold ${current == i ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    return h + `</div>`;
}

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); if(!grid) return; grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { roster[n].unlocked = !roster[n].unlocked; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2" onclick="event.stopPropagation()"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3"><div><span class="text-[8px] text-slate-500 font-black uppercase">Development</span>${renderStarSelector(n, r.starIndex)}</div>${skillsHtml}${h.widget ? `<div class="mt-2 pt-2 border-t border-slate-800" onclick="event.stopPropagation()"><span class="text-[8px] text-amber-500 font-black uppercase">Widget</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>` : ''}`;
        grid.appendChild(card);
    });
}

// --- UTILS (Gathering Logic fixed for per-unit Tiers) ---
function gatherSetup() {
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({
        inf_tier: parseInt(el.querySelector('.batch-tier-inf').value), inf_tg: parseInt(el.querySelector('.batch-tg-inf').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0,
        cav_tier: parseInt(el.querySelector('.batch-tier-cav').value), cav_tg: parseInt(el.querySelector('.batch-tg-cav').value), cav: parseFloat(el.querySelector('.batch-cav').value)||0,
        arc_tier: parseInt(el.querySelector('.batch-tier-arc').value), arc_tg: parseInt(el.querySelector('.batch-tg-arc').value), arc: parseFloat(el.querySelector('.batch-arc').value)||0
    }));
    const stats = (s) => { const o = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => o[i.dataset.stat] = parseFloat(i.value)||0); return o; };
    return { atk: { batches: collect('atk'), stats: stats('atk'), heroes: state.atk.heroes }, def: { batches: collect('def'), stats: stats('def'), heroes: state.def.heroes } };
}

function processBatchData(batches) {
    let totals = {inf:0,cav:0,arc:0};
    batches.forEach(b => { totals.inf += b.inf||0; totals.cav += b.cav||0; totals.arc += b.arc||0; });
    return totals;
}

window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        if(document.getElementById(screens[k])) document.getElementById(screens[k]).classList.toggle('hidden', k !== tab);
        if(document.getElementById(btns[k])) document.getElementById(btns[k]).className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold text-white shadow-lg" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
};

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
    state[activeSlot.side].heroes[activeSlot.index] = { name, ...modalTemp, starIndex: roster[name]?.starIndex || 30 };
    window.updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

window.updateGrids = () => {
    ['atk','def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`); if(!container) return; container.innerHTML = '';
        state[side].heroes.forEach((h, i) => {
            const div = document.createElement('div');
            div.className = `hero-circle ${i < 3 ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
            if (h.name !== 'None') div.innerHTML = `<img src="./assets/${h.name.toLowerCase()}.png" class="w-full h-full object-cover rounded-full shadow-inner">`;
            else div.innerText = (i + 1);
            div.onclick = () => window.openHeroModal(side, i);
            container.appendChild(div);
        });
    });
};

window.updateRoster = (n,k,v) => { roster[n][k]=parseInt(v); localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };
window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};
window.openHeroModal = (side, index) => { activeSlot = { side, index }; const h = state[side].heroes[index]; modalTemp = { s1: h.s1, s2: h.s2, s3: h.s3 }; document.getElementById('hero-select').value = h.name; renderSkillsInModal(h.name, index); document.getElementById('heroModal').classList.replace('hidden', 'flex'); };
document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', window.init);
