import { HEROES } from './heroes.js';
import { runCombatSim } from './engine.js';
import { GROWTH_TEMPLATES } from './constants.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0, widgetLv: 10 })) }
};

function init() {
    // Fill roster defaults
    Object.keys(HEROES).forEach(n => { 
        if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10 }; 
    });
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

window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        document.getElementById(screens[k]).classList.toggle('hidden', k !== tab);
        const btn = document.getElementById(btns[k]);
        if (btn) btn.className = k === tab ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
};

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
    const total = i + c + a;
    const bar = document.getElementById(`${side}-f-bar`);
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

window.openHeroModal = (side, index) => {
    activeSlot = { side, index }; const h = state[side].heroes[index];
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index, h);
    document.getElementById('heroModal').classList.replace('hidden', 'flex');
};

function renderSkillsInModal(name, slot, data = null) {
    const container = document.getElementById('skill-inputs'); container.innerHTML = '';
    if (name === "None") return;
    const hInfo = HEROES[name]; const max = (slot < 3) ? hInfo.skills.length : 1;
    for (let i = 0; i < max; i++) {
        const lv = data ? data['s'+(i+1)] : 1;
        const div = document.createElement('div');
        div.innerHTML = `<div class="flex justify-between text-[10px] font-bold text-slate-500 mb-1 uppercase"><span>${hInfo.skills[i].name}</span><span id="lv-${i+1}-disp" class="text-blue-400">${lv}</span></div><input type="range" min="1" max="5" value="${lv}" class="w-full accent-blue-500" oninput="document.getElementById('lv-${i+1}-disp').innerText = this.value">`;
        container.appendChild(div);
    }
}

window.saveHeroConfig = () => {
    const { side, index } = activeSlot; const name = document.getElementById('hero-select').value;
    const sliders = document.querySelectorAll('#skill-inputs input');
    state[side].heroes[index] = { name, s1: parseInt(sliders[0]?.value || 1), s2: parseInt(sliders[1]?.value || 1), s3: parseInt(sliders[2]?.value || 1), star: 5, sub: 0, widgetLv: roster[name]?.widget || 0 };
    updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

function updateGrids() {
    ['atk', 'def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`); if (!container) return;
        container.innerHTML = '';
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

// --- SIMULATION HANDLER ---
window.handleSimulation = async () => {
    const setup = gatherSetup();
    const rAvg = runCombatSim(setup, 'average');
    const rAtkCeil = runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave);
    const rDefCeil = runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave);

    document.getElementById('result-screen').classList.remove('hidden');
    // Map survival spectrum
    const getScore = (r) => ( (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / r.startDef ) - ( (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / r.startAtk );
    const sMin = getScore(rAtkCeil), sMax = getScore(rDefCeil);
    document.getElementById('luck-visual-bar').style.left = ((Math.min(sMin, sMax) + 1) * 50) + "%";
    document.getElementById('luck-visual-bar').style.width = Math.max(1.5, Math.abs(sMax - sMin) * 50) + "%";

    // Text results (Standard and Extreme Range)
    const aAvg = Math.round(rAvg.m_cur.inf + rAvg.m_cur.cav + rAvg.m_cur.arc);
    const aBest = Math.round(rAtkCeil.m_cur.inf + rAtkCeil.m_cur.cav + rAtkCeil.m_cur.arc);
    const aWorst = Math.round(rDefCeil.m_cur.inf + rDefCeil.m_cur.cav + rDefCeil.m_cur.arc);
    document.getElementById('res-atk-total').innerHTML = `<span>${aAvg.toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${aWorst.toLocaleString()} - ${aBest.toLocaleString()}</div>`;
    
    // ... (Mirror for defender)
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

window.runOptimizer = (mode = 'current') => {
    const setup = gatherSetup();
    const atkTotal = setup.atk.batches.reduce((s,b)=>s+b.inf+b.cav+b.arc, 0);
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity };

    // Step Logic
    for (let i = 20; i <= 100; i += 2) { // 2% steps for speed
        for (let j = 0; j <= 100 - i; j += 2) {
            let k = 100 - i - j;
            let currentSetup = JSON.parse(JSON.stringify(setup));
            currentSetup.atk.batches = [{ tier:10, tg:3, inf:i*(atkTotal/100), cav:j*(atkTotal/100), arc:k*(atkTotal/100) }];
            
            const r = runCombatSim(currentSetup, 'average', 'average', 100, mode === 'bear');
            let score = mode === 'bear' ? r.totalDmg : (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) - (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc);
            
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(score);
            if (score > best.score) best = { score, form: [i, j, k] };
        }
    }

    const plotId = mode === 'bear' ? 'bear-plot' : 'ternary-plot';
    Plotly.newPlot(plotId, [{ type: 'scatterternary', mode: 'markers', a: dataPoints.a, b: dataPoints.b, c: dataPoints.c, marker: { size: 6, color: dataPoints.z, colorscale: 'Portland' } }], { ternary: { sum: 100, aaxis: {title:'Inf'}, baxis: {title:'Cav'}, caxis: {title:'Arc'} }, paper_bgcolor: 'rgba(0,0,0,0)', font: {color: '#64748b'} });
    
    if (mode === 'bear') {
        document.getElementById('bear-total-dmg').innerText = Math.round(best.score).toLocaleString();
        document.getElementById('bear-best-form').innerText = `Optimal Bear Formation: ${best.form[0]}/${best.form[1]}/${best.form[2]}`;
    } else {
        document.getElementById('opt-best-form').innerText = `${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
        document.getElementById('opt-best-score').innerText = `Projected Survival Edge: +${Math.round(best.score).toLocaleString()} troops`;
    }
};

// --- ROSTER UI ---
function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => window.toggleHero(n);
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500/50 bg-slate-900/50' : 'opacity-40 border-transparent bg-slate-950/20 hover:opacity-60'}`;
        
        card.innerHTML = `
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700 shadow-inner">
                    <img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover" onerror="this.style.display='none'">
                </div>
                <div class="font-bold text-xs uppercase tracking-tighter">${n}</div>
            </div>
            ${r.unlocked ? `
                <div class="space-y-4">
                    <div class="space-y-1">
                        <span class="text-[8px] text-slate-500 font-black uppercase">Skill 1</span> ${renderLevelPicker(n, 's1', r.s1)}
                        <span class="text-[8px] text-slate-500 font-black uppercase">Skill 2</span> ${renderLevelPicker(n, 's2', r.s2)}
                        <span class="text-[8px] text-slate-500 font-black uppercase">Skill 3</span> ${renderLevelPicker(n, 's3', r.s3)}
                    </div>
                    ${h.widget ? `<div class="pt-2 border-t border-slate-800">
                        <span class="text-[8px] text-amber-500 font-black uppercase">Widget Level</span> ${renderWidgetPicker(n, r.widget)}
                    </div>` : ''}
                </div>` : ''}`;
        grid.appendChild(card);
    });
}

window.toggleHero = (n) => { roster[n].unlocked = !roster[n].unlocked; saveRoster(); renderRosterUI(); };
window.updateRoster = (n, k, v) => { roster[n][k] = v; saveRoster(); renderRosterUI(); };
const saveRoster = () => localStorage.setItem('ks_roster', JSON.stringify(roster));

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if (unlocked.length < 3) return alert("Unlock at least 3 heroes.");
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden'); resArea.innerHTML = '';
    const scens = [{l:"Rally",c:"off",j:false},{l:"Rally w/ Joiners",c:"off",j:true},{l:"Garrison",c:"def",j:false},{l:"Garrison w/ Joiners",c:"def",j:true}];
    scens.forEach(s => {
        const b = findBestLineup(unlocked, s.c, s.j);
        const card = document.createElement('div'); card.className="glass-card p-4 border-t-2 border-blue-500";
        card.innerHTML = `<span class="text-[9px] font-black text-blue-400 uppercase">${s.l}</span><div class="flex gap-2 mt-3">${b.leaders.map(n=>`<div class="w-8 h-8 rounded-full border border-blue-500 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-fit"></div>`).join('')}</div>
            ${s.j?`<div class="flex gap-1 mt-2 opacity-50">${b.joiners.map(n=>`<div class="w-6 h-6 rounded-full border border-slate-700 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-fit"></div>`).join('')}</div>`:''}
            <div class="mt-3 text-xl font-black">${b.score.toFixed(3)}x</div>`;
        resArea.appendChild(card);
    });
};

function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: parseInt(el.querySelector('.batch-tier').value), tg: parseInt(el.querySelector('.batch-tg').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    return {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes.map(h => ({ ...h, widgetLv: roster[h.name]?.widget || 0 })) },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes.map(h => ({ ...h, widgetLv: roster[h.name]?.widget || 0 })) }
    };
}

function findBestLineup(names, ctx, j) {
    let best = { leaders: [], joiners: [], score: 0 };
    const combos = getCombos(names, 3);
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
        const d = HEROES[n]; const r = roster[n];
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

function getCombos(arr, size) {
    let res = []; function h(start, c) { if(c.length===size){res.push([...c]);return;} for(let i=start;i<arr.length;i++){c.push(arr[i]);h(i+1,c);c.pop();} }
    h(0, []); return res;
}

function renderLevelPicker(name, skillKey, currentVal) {
    let html = `<div class="flex gap-1">`;
    for (let i = 1; i <= 5; i++) {
        html += `<button onclick="event.stopPropagation(); window.updateRoster('${name}', '${skillKey}', ${i})" 
                 class="w-6 h-6 rounded text-[10px] font-bold transition-all ${currentVal === i ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}">${i}</button>`;
    }
    return html + `</div>`;
}

function renderWidgetPicker(name, currentVal) {
    let html = `<div class="flex flex-wrap gap-1">`;
    for (let i = 0; i <= 10; i++) {
        html += `<button onclick="event.stopPropagation(); window.updateRoster('${name}', 'widget', ${i})" 
                 class="w-5 h-5 rounded text-[8px] font-bold transition-all ${currentVal === i ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return html + `</div>`;
}

window.toggleDetails = () => {
    const isHidden = document.getElementById('battle-details').classList.toggle('hidden');
    document.getElementById('toggle-details-btn').innerText = isHidden ? 'View Combat Modifiers +' : 'Hide Combat Modifiers -';
};
document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', init);
