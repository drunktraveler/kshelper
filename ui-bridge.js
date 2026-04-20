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

// --- 1. CORE INIT ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10 }; });
    
    const sel = document.getElementById('hero-select');
    if(sel) {
        sel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { sel.innerHTML += `<option value="${n}">${n}</option>`; });
        sel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);
    }
    
    const table = document.getElementById('stat-table');
    const categories = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    const units = ["Infantry", "Cavalry", "Archer"];
    if(table) {
        table.innerHTML = '';
        units.forEach(u => categories.forEach(c => {
            const row = document.createElement('div'); row.className = "stat-row";
            row.style.display = "flex"; row.style.alignItems = "center"; row.style.height = "32px"; row.style.padding = "0 30px";
            const key = `${u.toLowerCase().slice(0,3)}_${c.k}`;
            row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000"><div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.l}</div><input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">`;
            table.appendChild(row);
        }));
    }
    window.addBatch('atk', true); window.addBatch('def', true);
    window.updateGrids(); renderRosterUI(); window.showTab('battle');
};

// --- 2. GLOBAL HANDLERS ---
window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        const el = document.getElementById(screens[k]);
        if (el) el.classList.toggle('hidden', k !== tab);
        if (document.getElementById(btns[k])) document.getElementById(btns[k]).className = k === tab ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold uppercase";
    });
};

window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    if (!container) return;
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 relative mb-2";
    div.innerHTML = `<div class="flex justify-between items-center"><div class="flex gap-2">
            <select class="batch-tier bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[11,10,9,8,7,6,5,4,3,2,1].map(t => `<option value="${t}" ${t===10?'selected':''}>T${t}</option>`).join('')}</select>
            <select class="batch-tg bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[5,4,3,2,1,0].map(tg => `<option value="${tg}" ${tg===3?'selected':''}>TG${tg}</option>`).join('')}</select>
        </div>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[10px] font-black uppercase">Remove</button>` : ''}</div>
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

// --- 3. ROSTER ---
function renderLevelPicker(hero, key, current, isRoster = true) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const action = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${action}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return h + `</div>`;
}

function renderWidgetPicker(hero, current) {
    let h = `<div class="flex flex-wrap gap-1 max-w-[150px]">`;
    for(let i=0; i<=10; i++) h += `<button onclick="event.stopPropagation(); window.updateRoster('${hero}','widget',${i})" class="w-5 h-5 rounded text-[8px] font-bold ${current == i ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    return h + `</div>`;
}

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); if(!grid) return; grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { roster[n].unlocked = !roster[n].unlocked; saveRoster(); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3">${skillsHtml}${h.widget ? `<div class="pt-2 border-t border-slate-800"><span class="text-[8px] text-amber-500 font-black uppercase block mb-1">Widget</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>` : ''}`;
        grid.appendChild(card);
    });
}
window.updateRoster = (n, k, v) => { roster[n][k] = v; saveRoster(); renderRosterUI(); };
const saveRoster = () => localStorage.setItem('ks_roster', JSON.stringify(roster));

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
    state[activeSlot.side].heroes[activeSlot.index] = { name, ...modalTemp, star: 5, sub: 0, widgetLv: roster[name]?.widget || 0 };
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

// --- 5. SIMULATION & HEATMAPS ---
window.handleSimulation = async () => {
    const setup = gatherSetup(); const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst;

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
            atk_mults: batch[50].atk_mults, def_mults: batch[50].def_mults,
            startAtk: batch[0].startAtk, startDef: batch[0].startDef
        };
        rWorst = batch[0]; rBest = batch[runs-1];
    } else {
        rAvg = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave);
        rWorst = runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave);
    }

    const screen = document.getElementById('result-screen'); screen.classList.remove('hidden');
    const getScore = (r) => ( (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / (r.startDef||1) ) - ( (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / (r.startAtk||1) );
    const sMin = getScore(rBest), sMax = getScore(rWorst);
    document.getElementById('luck-bar-inner').style.left = ((Math.min(sMin, sMax) + 1) * 50) + "%";
    document.getElementById('luck-bar-inner').style.width = Math.max(1.5, Math.abs(sMax - sMin) * 50) + "%";
    
    document.getElementById('res-atk-total').innerText = Math.round(rAvg.m_cur.inf+rAvg.m_cur.cav+rAvg.m_cur.arc).toLocaleString();
    document.getElementById('res-def-total').innerText = Math.round(rAvg.e_cur.inf+rAvg.e_cur.cav+rAvg.e_cur.arc).toLocaleString();
    document.getElementById('res-atk-details').innerText = `Inf: ${Math.round(rAvg.m_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.m_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.m_cur.arc).toLocaleString()}`;
    document.getElementById('res-def-details').innerText = `Inf: ${Math.round(rAvg.e_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.e_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.e_cur.arc).toLocaleString()}`;
    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2">[BUFFS]</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    document.getElementById('result-waves').innerText = `Waves: ${rAvg.wave}`;
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

window.runOptimizer = (mode) => {
    const setup = gatherSetup(); const atkTotal = 1000000;
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity };

    let defenders = [];
    if(mode==='meta') { for(let i=0; i<=100; i+=10) for(let j=0; j<=100-i; j+=10) defenders.push({inf:i/100, cav:j/100, arc:(100-i-j)/100}); }
    else { const def=setup.def.batches.reduce((s,b)=>({inf:s.inf+b.inf,cav:s.cav+b.cav,arc:s.arc+b.arc}),{inf:0,cav:0,arc:0}); const t=def.inf+def.cav+def.arc||1; defenders.push({inf:def.inf/t,cav:def.cav/t,arc:def.arc/t}); }

    for (let i = 20; i <= 100; i += 2) {
        for (let j = 0; j <= 100 - i; j += 2) {
            let k = 100-i-j; let wins = 0, totalNet = 0;
            defenders.forEach(d => {
                let s = JSON.parse(JSON.stringify(setup));
                s.atk.batches = [{ tier:10, tg:3, inf:i*10000, cav:j*10000, arc:k*10000 }];
                if(mode!=='bear') s.def.batches = [{ tier:10, tg:3, inf:d.inf*atkTotal, cav:d.cav*atkTotal, arc:d.arc*atkTotal }];
                const r = runCombatSim(s, 'average', 'average', 100, mode==='bear');
                let outcome = mode==='bear' ? r.totalDmg : (r.m_cur.inf+r.m_cur.cav+r.m_cur.arc) - (r.e_cur.inf+r.e_cur.cav+r.e_cur.arc);
                if (outcome > 0) wins++;
                totalNet += outcome;
            });
            const finalScore = mode === 'meta' ? (wins/defenders.length) : totalNet;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(finalScore);
            if (finalScore > best.score) best = { score: finalScore, form: [i,j,k] };
        }
    }
    const plotId = mode==='bear'?'bear-plot':'ternary-plot';
    Plotly.newPlot(plotId, [{ type:'scatterternary', a:dataPoints.a, b:dataPoints.b, c:dataPoints.c, marker:{ color:dataPoints.z, colorscale:'Portland', size:8 } }], { ternary: { sum:100, aaxis:{title:'Infantry'}, baxis:{title:'Cavalry'}, caxis:{title:'Archer'} }, paper_bgcolor:'rgba(0,0,0,0)', font:{color:'#64748b'} });
    if(mode==='bear') document.getElementById('bear-total-dmg').innerText = Math.round(best.score).toLocaleString();
    else document.getElementById('opt-best-score').innerText = `Best result: +${Math.round(best.score).toLocaleString()} survivors`;
    document.getElementById('opt-best-form').innerText = `${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
};

// --- ROSTER OPTIMIZER ---
window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if(unlocked.length < 3) return alert("Unlock 3 heroes.");
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden'); resArea.innerHTML = '';
    const byType = { Inf: [], Cav: [], Arc: [] };
    unlocked.forEach(n => byType[HEROES[n].type].push(n));

    [{l:"Rally",c:"off",j:false},{l:"Rally w/ Joiners",c:"off",j:true},{l:"Garrison",c:"def",j:false},{l:"Garrison w/ Joiners",c:"def",j:true}].forEach(s => {
        let best = { leaders: [], joiners: [], score: 0 };
        for (let i of byType.Inf) for (let c of byType.Cav) for (let a of byType.Arc) {
            const trio = [i, c, a]; let joiners = [];
            if (s.j) {
                const pool = unlocked.filter(n => !trio.includes(n));
                joiners = pool.map(n => ({ n, i: calcScore(trio, [n], s.c) })).sort((a,b)=>b.i-a.i).slice(0, 4).map(x => x.n);
            }
            const score = calcScore(trio, joiners, s.c);
            if (score > best.score) best = { leaders: trio, joiners, score };
        }
        const card = document.createElement('div'); card.className="glass-card p-4 border-t-2 border-blue-500 flex justify-between items-center";
        card.innerHTML = `<div><div class="text-[9px] font-black text-blue-400 uppercase mb-3">${s.l}</div>
            <div class="flex gap-2">${best.leaders.map(n=>`<img src="./assets/${n.toLowerCase()}.png" class="w-10 h-10 rounded-full border border-blue-500" title="${n}">`).join('')}</div>
            ${s.j ? `<div class="flex gap-1 mt-2 opacity-50">${best.joiners.map(n=>`<img src="./assets/${n.toLowerCase()}.png" class="w-6 h-6 rounded-full border border-slate-700" title="${n}">`).join('')}</div>` : ''}</div>
            <div class="text-right"><div class="text-2xl font-black">${best.score.toFixed(3)}x</div></div>`;
        resArea.appendChild(card);
    });
};

function calcScore(leaders, joiners, ctx) {
    let pools = {};
    leaders.forEach(n => {
        const d = HEROES[n], r = roster[n];
        const hW = (d.widget && d.widget.context === ctx) ? (1 + WIDGET_GROWTH[r.widget]) : 1.0;
        d.skills.forEach((s, i) => {
            const x = s.values[r[`s${i+1}`]-1];
            const p = s.getChance(x);
            const ev = s.duration === 0 ? p*s.getMagnitude(x) : (1-Math.pow(1-p, s.duration))*s.getMagnitude(x);
            s.ids.forEach((id, idx) => pools[id] = (pools[id]||0) + ((Array.isArray(ev)?ev[idx] : ev)*hW));
        });
    });
    const jCounts = {}; joiners.forEach(n => jCounts[n] = (jCounts[n]||0) + 1);
    for (const n in jCounts) {
        const d = HEROES[n], r = roster[n], s = d.skills[0];
        const p = 1 - Math.pow(1 - s.getChance(s.values[r.s1-1]), jCounts[n]);
        const ev = p * s.getMagnitude(s.values[r.s1-1]);
        s.ids.forEach((id, idx) => pools[id] = (pools[id]||0) + (Array.isArray(ev)?ev[idx]:ev));
    }
    let t = 1.0; Object.values(pools).forEach(v => t *= (1+v)); return t;
}

function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: parseInt(el.querySelector('.batch-tier').value), tg: parseInt(el.querySelector('.batch-tg').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    return {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes.map(h => ({ ...h, starBonus: GROWTH_TEMPLATES[HEROES[h.name]?.template || 'SEASON_1'][(h.star*6)+h.sub] })) },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes.map(h => ({ ...h, starBonus: GROWTH_TEMPLATES[HEROES[h.name]?.template || 'SEASON_1'][(h.star*6)+h.sub] })) }
    };
}

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};

window.toggleDetails = () => {
    const box = document.getElementById('battle-details');
    const isHidden = box.classList.toggle('hidden');
    document.getElementById('toggle-details-btn').innerText = isHidden ? 'View Buffs +' : 'Hide Buffs -';
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);
