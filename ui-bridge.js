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

// --- 1. INITIALIZATION & NAVIGATION ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; });
    const mainSel = document.getElementById('hero-select');
    if(mainSel) {
        mainSel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { mainSel.innerHTML += `<option value="${n}">${n}</option>`; });
        mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);
    }
    const calibSels = document.querySelectorAll('.rep-hero');
    calibSels.forEach(sel => {
        sel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { sel.innerHTML += `<option value="${n}">${n}</option>`; });
    });
    buildStatTable();
    window.addBatch('atk', true); window.addBatch('def', true);
    window.updateGrids(); renderRosterUI(); 
    if(nakedStats) renderNakedStats();
    window.showTab('battle');
};

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
    const isHidden = box.classList.toggle('hidden');
    btn.innerText = isHidden ? 'View Combat Buffs +' : 'Hide Combat Buffs -';
};

window.setOptRole = (role) => {
    optRole = role;
    document.getElementById('opt-role-atk').className = role === 'atk' ? "px-3 py-1 text-[10px] font-bold rounded bg-blue-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
    document.getElementById('opt-role-def').className = role === 'def' ? "px-3 py-1 text-[10px] font-bold rounded bg-red-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
};

// --- 2. BATCH & STATS ---
window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    if (!container) return;
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 relative mb-2";
    const types = [{ l: 'Infantry', k: 'inf', c: 'text-blue-400', v: 500000 }, { l: 'Cavalry', k: 'cav', c: 'text-amber-400', v: 200000 }, { l: 'Archers', k: 'arc', c: 'text-emerald-400', v: 300000 }];
    let html = `<div class="flex justify-between items-center"><span class="text-[9px] font-bold text-slate-500 uppercase">Army Config</span>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[10px] font-black uppercase">Remove</button>` : ''}</div>`;
    types.forEach(t => {
        html += `<div class="grid grid-cols-12 gap-2 items-center border-b border-slate-800/20 pb-1">
            <div class="col-span-3 text-[10px] font-bold ${t.c}">${t.l}</div>
            <select class="batch-tier-${t.k} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v===10?'selected':''}>T${v}</option>`).join('')}</select>
            <select class="batch-tg-${t.k} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v===3?'selected':''}>TG${v}</option>`).join('')}
            </select><input type="number" class="batch-${t.k} col-span-5 input-dark !text-right" value="${initial ? t.v : 0}" oninput="window.updateFormation('${side}')"></div>`;
    });
    div.innerHTML = html; container.appendChild(div); window.updateFormation(side);
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

function buildStatTable() {
    const table = document.getElementById('stat-table'); if(!table) return;
    const units = ["inf", "cav", "arc"], cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    table.innerHTML = '';
    units.forEach(u => cats.forEach(c => {
        const row = document.createElement('div'); row.className = "stat-row";
        const key = `${u}_${c.k}`;
        row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" value="1000" class="input-dark !w-20 !bg-transparent !border-none text-[#10b981] font-bold" oninput="window.updateStatColors(this)">
            <div class="text-[9px] font-black uppercase text-slate-500">${u} ${c.l}</div>
            <input type="number" data-side="def" data-stat="${key}" value="1000" class="input-dark !w-20 !bg-transparent !border-none text-[#ef4444] font-bold text-right" oninput="window.updateStatColors(this)">`;
        table.appendChild(row);
    }));
}

// --- 3. BATTLE SIMULATION (Stochastic Mean) ---
window.handleSimulation = async () => {
    const setup = gatherSetup(); 
    const mode = document.getElementById('sim-mode-select').value;
    let rFinal, rBest, rWorst, winRateText = "";

    if (mode === 'monte-carlo') {
        let results = [];
        let winAtk = 0, winDef = 0;
        let sumAtkWins = 0, sumDefWins = 0;

        for (let i = 0; i < 100; i++) {
            const r = runCombatSim(setup, 'stochastic', 'stochastic');
            const atkV = sumTroops(r.m_cur), defV = sumTroops(r.e_cur);
            if (atkV > defV) { winAtk++; sumAtkWins += atkV; } 
            else { winDef++; sumDefWins += defV; }
            results.push(r);
        }

        winRateText = `Atk Wins: ${winAtk}% | Def Wins: ${winDef}%`;
        
        // Exact Requirement: Average of the results from the winning side. Other side = 0.
        rFinal = {
            m_cur: { inf: winAtk >= winDef ? (winAtk > 0 ? sumAtkWins / winAtk : 0) : 0, cav: 0, arc: 0 },
            e_cur: { inf: winDef > winAtk ? (winDef > 0 ? sumDefWins / winDef : 0) : 0, cav: 0, arc: 0 },
            wave: results[50].wave,
            atk_mults: results[50].atk_mults,
            def_mults: results[50].def_mults
        };
        results.sort((a,b) => (sumTroops(a.m_cur) - sumTroops(a.e_cur)));
        rWorst = results[0]; rBest = results[99];
    } else {
        rFinal = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky');
        rWorst = runCombatSim(setup, 'unlucky', 'lucky');
    }

    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = Math.round(sumTroops(rFinal.m_cur)).toLocaleString();
    document.getElementById('res-def-total').innerText = Math.round(sumTroops(rFinal.e_cur)).toLocaleString();
    document.getElementById('result-waves').innerHTML = `<span class="text-blue-400 font-black uppercase">${mode} Analysis</span><br>${winRateText}<br>Representative Duration: ${rFinal.wave} Waves`;
    document.getElementById('res-atk-range').innerText = `Range: ${sumTroops(rWorst.m_cur).toLocaleString()} - ${sumTroops(rBest.m_cur).toLocaleString()}`;
    document.getElementById('res-def-range').innerText = `Range: ${sumTroops(rBest.e_cur).toLocaleString()} - ${sumTroops(rWorst.e_cur).toLocaleString()}`;
    document.getElementById('battle-details').innerHTML = rFinal.atk_mults.join('') + rFinal.def_mults.join('');
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

// --- 4. OPTIMIZERS ---
window.runOptimizer = (mode) => {
    const isBear = mode === 'bear', setup = gatherSetup();
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity, winRate: 0, net: 0 };
    let opponents = [];

    if (isBear) { opponents.push({inf:1, cav:0, arc:0}); } 
    else if (mode === 'current') {
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
                const userBatch = { inf_tier:10, inf_tg:3, inf:i*1000, cav_tier:10, cav_tg:3, cav:j*1000, arc_tier:10, arc_tg:3, arc:k*1000 };
                const oppBatch = { inf_tier:10, inf_tg:3, inf:opp.inf*100000, cav_tier:10, cav_tg:3, cav:opp.cav*100000, arc_tier:10, arc_tg:3, arc:opp.arc*100000 };
                if (optRole === 'atk') { s.atk.batches = [userBatch]; s.def.batches = isBear ? s.def.batches : [oppBatch]; }
                else { s.def.batches = [userBatch]; s.atk.batches = [oppBatch]; }
                const r = runCombatSim(s, 'average', 'average', 1, isBear, true);
                const val = isBear ? r.totalDmg : (sumTroops(r.m_cur) - sumTroops(r.e_cur));
                if (!isBear && val > 0) wins++; totalNet += val;
            });
            const score = isBear ? totalNet : (wins * 1e15) + totalNet;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(isBear ? totalNet : wins);
            if (score > best.score) best = { score, form: [i,j,k], winRate: (wins/opponents.length)*100, net: totalNet/opponents.length };
        }
    }
    renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
    resArea.innerText = `${best.form[0]} / ${best.form[1]} / ${best.form[2]}`;
    scoreArea.innerText = isBear ? `Calculated Split for Max DMG` : `Coverage: ${best.winRate.toFixed(1)}% | Net: ${Math.round(best.net).toLocaleString()}`;
};

function renderTernary(id, data, best, isBear) {
    const traces = [{ type:'scatterternary', a:data.a, b:data.b, c:data.c, mode:'markers', marker:{ color:data.z, colorscale: 'Viridis', size:6 } },
        { type:'scatterternary', a:[best.form[0]], b:[best.form[1]], c:[best.form[2]], name:'Best', mode:'markers', marker:{size:14, symbol:'star', color:'cyan', line:{width:2, color:'black'}} }];
    Plotly.newPlot(id, traces, { ternary: { sum:100, aaxis:{title:'Inf'}, baxis:{title:'Cav'}, caxis:{title:'Arc'} }, paper_bgcolor:'rgba(0,0,0,0)', font:{color:'#64748b'}, margin:{l:0,r:0,t:30,b:0}, showlegend: false });
}

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if (unlocked.length < 3) return alert("Select at least 3 heroes in Roster tab.");
    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = '<div class="col-span-2 text-center py-8 text-blue-500 animate-pulse font-black uppercase">Solving BIP Synergies...</div>';
    const byType = { Inf: [], Cav: [], Arc: [] };
    unlocked.forEach(n => byType[HEROES[n].type].push(n));
    const scenarios = [{ l: "Solo Attack", c: "off", j: 0, w: false }, { l: "Rally (Offense)", c: "off", j: 4, w: true }, { l: "Garrison (Defense)", c: "def", j: 4, w: true }];
    setTimeout(() => {
        resArea.innerHTML = '';
        scenarios.forEach(s => {
            let best = { leaders: [], score: -1 };
            for (let i of byType.Inf) {
                for (let c of byType.Cav) {
                    for (let a of byType.Arc) {
                        const score = calcPowerScore([i, c, a], [], s.c, s.w);
                        if (score > best.score) best = { leaders: [i, c, a], score };
                    }
                }
            }
            const card = document.createElement('div'); card.className = "glass-card p-6 border-t-2 border-blue-500";
            card.innerHTML = `<div class="text-[10px] font-black text-blue-400 uppercase mb-2">${s.l}</div>
                <div class="flex gap-2 mb-4">${best.leaders.map(n => `<div class="w-10 h-10 rounded-full border border-blue-500 overflow-hidden shadow-lg"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>`).join('')}</div>
                <div class="text-xl font-black text-white">${best.score.toFixed(3)}x Pwr Score</div>`;
            resArea.appendChild(card);
        });
    }, 100);
};

function calcPowerScore(leaders, joiners, ctx, allowWidgets) {
    let skillBuckets = {};
    const manifest = {};
    leaders.forEach(n => { manifest[n] = { s1:1, s2:1, s3:1 }; });
    joiners.forEach(n => { manifest[n] = { s1:1, s2:0, s3:0 }; });
    for (const name in manifest) {
        const d = HEROES[name], r = roster[name];
        d.skills.forEach((s, si) => {
            if (!manifest[name][`s${si+1}`]) return;
            const lvl = r[`s${si+1}`] || 5;
            const x = s.values[lvl-1], p = s.getChance(x), m = s.getMagnitude(x);
            const ev = (p >= 1.0) ? m : (1 - Math.pow(1 - p, s.duration || 1)) * m;
            s.ids.forEach((id, idx) => { skillBuckets[id] = (skillBuckets[id] || 0) + (Array.isArray(ev)?ev[idx]:ev); });
        });
    }
    let mult = 1.0; Object.values(skillBuckets).forEach(v => mult *= (1+v));
    return mult;
}

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

// --- 6. UTILS & HELPERS ---
function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({
        inf_tier: parseInt(el.querySelector('.batch-tier-inf').value), inf_tg: parseInt(el.querySelector('.batch-tg-inf').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0,
        cav_tier: parseInt(el.querySelector('.batch-tier-cav').value), cav_tg: parseInt(el.querySelector('.batch-tg-cav').value), cav: parseFloat(el.querySelector('.batch-cav').value)||0,
        arc_tier: parseInt(el.querySelector('.batch-tier-arc').value), arc_tg: parseInt(el.querySelector('.batch-tg-arc').value), arc: parseFloat(el.querySelector('.batch-arc').value)||0
    }));
    return { atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes }, def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes } };
}

function processBatchData(batches) {
    let totals = {inf:0,cav:0,arc:0};
    batches.forEach(b => { totals.inf += b.inf||0; totals.cav += b.cav||0; totals.arc += b.arc||0; });
    return totals;
}

function renderLevelPicker(hero, key, current, isRoster = true) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const action = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${action}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
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
        card.className = `p-4 glass-card border-2 cursor-pointer transition-all ${r.unlocked ? 'border-blue-500 bg-slate-900/50 shadow-blue-500/20 shadow-lg' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2" onclick="event.stopPropagation()"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3"><div><span class="text-[8px] text-slate-500 font-black uppercase">Development</span>${renderStarSelector(n, r.starIndex)}</div>${skillsHtml}</div>` : ''}`;
        grid.appendChild(card);
    });
}

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
    state[activeSlot.side].heroes[activeSlot.index] = { name, ...modalTemp, starIndex: 30 };
    window.updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

window.updateRoster = (n,k,v) => { roster[n][k]=parseInt(v); localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', window.init);
