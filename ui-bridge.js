import { HEROES } from './heroes.js';
import { runCombatSim } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) }
};
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };

// --- INITIALIZATION ---
function init() {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10 }; });
    
    const sel = document.getElementById('hero-select');
    sel.innerHTML = '<option value="None">None</option>';
    Object.keys(HEROES).sort().forEach(n => {
        const o = document.createElement('option'); o.value = n; o.innerText = n; sel.appendChild(o);
    });

    const table = document.getElementById('stat-table');
    const categories = [{ label: "Attack", key: "att" }, { label: "Defense", key: "def" }, { label: "Lethality", key: "leth" }, { label: "Health", key: "hp" }];
    const units = ["Infantry", "Cavalry", "Archer"];
    units.forEach(u => {
        categories.forEach(c => {
            const row = document.createElement('div');
            row.style.display = "flex"; row.style.alignItems = "center"; row.style.height = "32px"; row.style.padding = "0 30px";
            row.className = "stat-row";
            const key = `${u.toLowerCase().slice(0,3)}_${c.key}`;
            row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000"><div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.label}</div><input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">`;
            table.appendChild(row);
        });
    });

    window.addBatch('atk', true); window.addBatch('def', true);
    sel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);
    renderRosterUI();
    window.showTab('battle');
}

// --- TAB SYSTEM ---
window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        document.getElementById(screens[k]).classList.toggle('hidden', k !== tab);
        const b = document.getElementById(btns[k]);
        if(b) b.className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
};

// --- BATCH MANAGEMENT ---
window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 relative mb-2";
    div.innerHTML = `<div class="flex justify-between items-center"><div class="flex gap-2">
            <select class="batch-tier bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[11,10,9,8,7,6,5,4,3,2,1].map(t => `<option value="${t}" ${t===10?'selected':''}>T${t}</option>`).join('')}</select>
            <select class="batch-tg bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[5,4,3,2,1,0].map(tg => `<option value="${tg}" ${tg===3?'selected':''}>TG${tg}</option>`).join('')}</select>
        </div>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[10px] font-black">REMOVE</button>` : ''}</div>
        <div class="grid grid-cols-3 gap-2">
            <input type="number" class="batch-inf input-dark text-blue-400" value="500000" oninput="window.updateFormation('${side}')"><input type="number" class="batch-cav input-dark text-amber-400" value="200000" oninput="window.updateFormation('${side}')"><input type="number" class="batch-arc input-dark text-emerald-400" value="300000" oninput="window.updateFormation('${side}')">
        </div>`;
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

// --- LEVEL PICKER RENDERERS ---
function renderLevelPicker(hero, key, current, isRoster = true) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const action = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${action}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return h + `</div>`;
}

function renderWidgetPicker(hero, current) {
    let h = `<div class="flex flex-wrap gap-1 max-w-[150px]">`;
    for(let i=0; i<=10; i++) {
        h += `<button onclick="event.stopPropagation(); window.updateRoster('${hero}','widget',${i})" class="w-5 h-5 rounded text-[8px] font-bold ${current == i ? 'bg-amber-600' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return h + `</div>`;
}

// --- ROSTER LOGIC ---
function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); if(!grid) return; grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { roster[n].unlocked = !roster[n].unlocked; saveRoster(); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50 shadow-lg shadow-blue-900/20' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3">${skillsHtml}${h.widget ? `<div class="pt-2 border-t border-slate-800"><span class="text-[8px] text-amber-500 font-black uppercase block mb-1">Widget Level</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>` : ''}`;
        grid.appendChild(card);
    });
}
window.updateRoster = (n,k,v) => { roster[n][k]=v; saveRoster(); renderRosterUI(); };
const saveRoster = () => localStorage.setItem('ks_roster', JSON.stringify(roster));

// --- BATTLE MODAL LOGIC ---
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
    state[activeSlot.side].heroes[activeSlot.index] = { name, ...modalTemp, star: 5, sub: 0, widgetLv: roster[name]?.widget || 0 };
    updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

function updateGrids() {
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
}

// --- OPTIMIZERS ---
window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if(unlocked.length < 3) return alert("Unlock 3 heroes.");
    const res = document.getElementById('optimizer-results'); res.classList.remove('hidden'); res.innerHTML = '';
    [{l:"Optimal Attack",c:"off",j:false},{l:"Optimal Attack w/ Joiners",c:"off",j:true},{l:"Optimal Defense",c:"def",j:false},{l:"Optimal Defense w/ Joiners",c:"def",j:true}].forEach(s => {
        const b = findBestLineup(unlocked, s.c, s.j);
        const card = document.createElement('div'); card.className="glass-card p-4 border-t-2 border-blue-500";
        card.innerHTML = `<div class="text-[9px] font-black text-blue-400 uppercase mb-3">${s.l}</div><div class="flex gap-2">${b.leaders.map(n=>`<img src="./assets/${n.toLowerCase()}.png" class="w-10 h-10 rounded-full border border-blue-500">`).join('')}</div><div class="mt-3 text-xl font-black">${b.score.toFixed(3)}x</div>`;
        res.appendChild(card);
    });
};

function findBestLineup(names, ctx, j) {
    let best = { leaders: [], joiners: [], score: 0 };
    const combos = getCombinations(names, 3);
    combos.forEach(trio => {
        let currentJoiners = [];
        if (j) {
            const rem = names.filter(n => !trio.includes(n));
            const pool = rem.map(n => ({ n, i: calcScore(trio, [n], ctx) })).sort((a,b)=>b.i-a.i);
            currentJoiners = pool.slice(0, 4).map(x => x.n);
        }
        const score = calcScore(trio, currentJoiners, ctx);
        if (score > best.score) best = { leaders: trio, joiners: currentJoiners, score };
    });
    return best;
}

function calcScore(leaders, joiners, ctx) {
    let pools = {};
    leaders.forEach(n => {
        const d = HEROES[n], r = roster[n];
        const hW = (d.widget && d.widget.context === ctx) ? (1 + WIDGET_GROWTH[r.widget]) : 1.0;
        d.skills.forEach((s, i) => {
            const x = s.values[r[`s${i+1}`]-1];
            const ev = s.duration === 0 ? s.getChance(x)*s.getMagnitude(x) : (1-Math.pow(1-s.getChance(x), s.duration))*s.getMagnitude(x);
            s.ids.forEach((id, idx) => pools[id] = (pools[id]||0) + ((Array.isArray(ev)?ev[idx]:ev)*hW));
        });
    });
    joiners.forEach(n => {
        const r = roster[n]; const s = HEROES[n].skills[0]; const x = s.values[r.s1-1];
        const ev = s.duration === 0 ? s.getChance(x)*s.getMagnitude(x) : (1-Math.pow(1-s.getChance(x), s.duration))*s.getMagnitude(x);
        s.ids.forEach((id, idx) => pools[id] = (pools[id]||0) + (Array.isArray(ev)?ev[idx]:ev));
    });
    let t = 1.0; Object.values(pools).forEach(v => t *= (1+v)); return t;
}

window.runOptimizer = (mode) => {
    const setup = gatherSetup(); const atkTotal = 1000000;
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity };
    for (let i = 20; i <= 100; i += 2) {
        for (let j = 0; j <= 100 - i; j += 2) {
            let k = 100-i-j;
            let curSetup = JSON.parse(JSON.stringify(setup));
            curSetup.atk.batches = [{ tier:10, tg:3, inf:i*(atkTotal/100), cav:j*(atkTotal/100), arc:k*(atkTotal/100) }];
            const r = runCombatSim(curSetup, 'average', 'average', 100, mode === 'bear');
            let score = mode === 'bear' ? r.totalDmg : (r.m_cur.inf+r.m_cur.cav+r.m_cur.arc) - (r.e_cur.inf+r.e_cur.cav+r.e_cur.arc);
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(score);
            if (score > best.score) best = { score, form: [i,j,k] };
        }
    }
    const plotId = mode === 'bear' ? 'bear-plot' : 'ternary-plot';
    Plotly.newPlot(plotId, [{ type: 'scatterternary', a: dataPoints.a, b: dataPoints.b, c: dataPoints.c, marker: { color: dataPoints.z, colorscale: 'Portland' } }], { ternary: { sum: 100 }, paper_bgcolor: 'rgba(0,0,0,0)', font: {color:'#64748b'} });
    if(mode === 'bear') {
        document.getElementById('bear-total-dmg').innerText = Math.round(best.score).toLocaleString();
        document.getElementById('bear-best-form').innerText = `Best Bear: ${best.form[0]}/${best.form[1]}/${best.form[2]}`;
    } else {
        document.getElementById('opt-best-form').innerText = `${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
        document.getElementById('opt-best-score').innerText = `Survival Edge: +${Math.round(best.score).toLocaleString()} troops`;
    }
};

window.handleSimulation = async () => {
    const setup = gatherSetup(); const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rLuck, rBad;
    if (simMode === 'monte-carlo') {
        const runs = 100; let batch = [];
        for (let i = 0; i < runs; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        batch.sort((a,b) => (a.m_cur.inf+a.m_cur.cav+a.m_cur.arc) - (b.m_cur.inf+b.m_cur.cav+b.m_cur.arc));
        const atkWins = batch.filter(r => (r.m_cur.inf+r.m_cur.cav+r.m_cur.arc) > (r.e_cur.inf+r.e_cur.cav+r.e_cur.arc)).length;
        const winner = atkWins >= 50 ? 'atk' : 'def';
        rAvg = {
            m_cur: { inf: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.inf,0)/runs:0, cav: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.cav,0)/runs:0, arc: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.arc,0)/runs:0 },
            e_cur: { inf: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.inf,0)/runs:0, cav: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.cav,0)/runs:0, arc: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.arc,0)/runs:0 },
            wave: Math.round(batch.reduce((s,r)=>s+r.wave,0)/runs),
            atk_mults: batch[Math.floor(runs/2)].atk_mults, def_mults: batch[Math.floor(runs/2)].def_mults,
            startAtk: batch[0].startAtk, startDef: batch[0].startDef
        };
        rLuck = batch[runs-1]; rBad = batch[0];
    } else {
        rAvg = runCombatSim(setup, 'average', 'average');
        rLuck = runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave);
        rBad = runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave);
    }
    const screen = document.getElementById('result-screen'); screen.classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = Math.round(rAvg.m_cur.inf+rAvg.m_cur.cav+rAvg.m_cur.arc).toLocaleString();
    document.getElementById('res-def-total').innerText = Math.round(rAvg.e_cur.inf+rAvg.e_cur.cav+rAvg.e_cur.arc).toLocaleString();
    document.getElementById('result-waves').innerText = `Length: ${rAvg.wave} (Range: ${rLuck.wave}-${rBad.wave})`;
    screen.scrollIntoView({ behavior: 'smooth' });
};

// --- HELPERS ---
function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: parseInt(el.querySelector('.batch-tier').value), tg: parseInt(el.querySelector('.batch-tg').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    return {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes.map(h => ({ ...h, widgetLv: roster[h.name]?.widget || 0 })) },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes.map(h => ({ ...h, widgetLv: roster[h.name]?.widget || 0 })) }
    };
}
function getCombinations(arr, size) {
    let res = []; function h(start, c) { if(c.length===size){res.push([...c]);return;} for(let i=start;i<arr.length;i++){c.push(arr[i]);h(i+1,c);c.pop();} }
    h(0, []); return res;
}
window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};
window.handleBearSim = () => {
    const r = runCombatSim(gatherSetup(), 'average', 'average', 10, true);
    document.getElementById('bear-total-dmg').innerText = Math.round(r.totalDmg).toLocaleString();
};
window.toggleDetails = () => {
    const box = document.getElementById('battle-details');
    const isHidden = box.classList.toggle('hidden');
    document.getElementById('toggle-details-btn').innerText = isHidden ? 'View Combat Modifiers +' : 'Hide Combat Modifiers -';
};
document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', init);
