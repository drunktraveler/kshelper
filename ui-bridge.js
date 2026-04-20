import { HEROES } from './heroes.js';
import { runCombatSim } from './engine.js';

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0 })) }
};
let activeSlot = { side: null, index: null };

// Initialize Roster from HEROES database
let roster = {};
Object.keys(HEROES).forEach(name => {
    roster[name] = { 
        unlocked: false, 
        s1: 5, s2: 5, s3: 5, 
        widget: HEROES[name].widget ? 0 : null // 0-10 if widget exists
    };
});

// Load from LocalStorage if available
const savedRoster = localStorage.getItem('ks_roster');
if (savedRoster) roster = JSON.parse(savedRoster);

function init() {
    const sel = document.getElementById('hero-select');
    sel.innerHTML = '<option value="None">None</option>';
    Object.keys(HEROES).sort().forEach(n => {
        const o = document.createElement('option'); o.value = n; o.innerText = n; sel.appendChild(o);
    });

    const table = document.getElementById('stat-table');
    const categories = [{ label: "Attack", key: "att" }, { label: "Defense", key: "def" }, { label: "Lethality", key: "leth" }, { label: "Health", key: "hp" }];
    const units = ["Infantry", "Cavalry", "Archer"];

    renderRosterUI();
    window.showTab('battle');
    
    units.forEach(u => {
        categories.forEach(c => {
            const row = document.createElement('div');
            row.style.display = "flex"; row.style.alignItems = "center"; row.style.height = "32px"; row.style.padding = "0 30px";
            row.className = "stat-row";
            const key = `${u.toLowerCase().slice(0,3)}_${c.key}`;
            row.innerHTML = `
                <input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000">
                <div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.label}</div>
                <input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">
            `;
            table.appendChild(row);
        });
    });

    window.addBatch('atk', true); 
    window.addBatch('def', true);
    document.getElementById('hero-select').addEventListener('change', (e) => renderSkillsInModal(e.target.value, activeSlot.index));
    updateGrids();
}

window.showTab = (tab) => {
    const tabs = ['battle-tab', 'optimizer-screen', 'bear-tab'];
    const buttons = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear' };
    
    tabs.forEach(t => document.getElementById(t).classList.add('hidden'));
    Object.values(buttons).forEach(b => document.getElementById(b).className = "px-4 py-2 text-slate-500 hover:text-white uppercase");
    
    const activeTab = tab === 'battle' ? 'battle-tab' : (tab === 'formation' ? 'optimizer-screen' : 'bear-tab');
    document.getElementById(activeTab).classList.remove('hidden');
    document.getElementById(buttons[tab]).className = "px-4 py-2 bg-blue-600 rounded-lg text-white uppercase";
};

window.handleBearSim = () => {
    const setup = {
        atk: { 
            batches: Array.from(document.querySelectorAll(`#atk-batch-container > div`)).map(el => ({
                tier: parseInt(el.querySelector('.batch-tier').value),
                tg: parseInt(el.querySelector('.batch-tg').value),
                inf: parseFloat(el.querySelector('.batch-inf').value) || 0,
                cav: parseFloat(el.querySelector('.batch-cav').value) || 0,
                arc: parseFloat(el.querySelector('.batch-arc').value) || 0
            })),
            stats: getStats('atk'),
            heroes: state.atk.heroes 
        }
    };
    
    const r = runCombatSim(setup, 'average', 'average', 10, true);
    document.getElementById('bear-total-dmg').innerText = Math.round(r.totalDmg).toLocaleString();
};

window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 relative mb-2";
    div.innerHTML = `
        <div class="flex justify-between items-center"><div class="flex gap-2">
                <select class="batch-tier bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
                    ${[11,10,9,8,7,6,5,4,3,2,1].map(t => `<option value="${t}" ${t===10?'selected':''}>T${t}</option>`).join('')}
                </select>
                <select class="batch-tg bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
                    ${[5,4,3,2,1,0].map(tg => `<option value="${tg}" ${tg===3?'selected':''}>TG${tg}</option>`).join('')}
                </select>
            </div>
            ${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[10px] font-black">REMOVE</button>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-2">
            <input type="number" class="batch-inf input-dark text-blue-400" value="500000" oninput="window.updateFormation('${side}')">
            <input type="number" class="batch-cav input-dark text-amber-400" value="200000" oninput="window.updateFormation('${side}')">
            <input type="number" class="batch-arc input-dark text-emerald-400" value="300000" oninput="window.updateFormation('${side}')">
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
    const hInfo = HEROES[name];
    const max = (slot < 3) ? hInfo.skills.length : 1;
    for (let i = 0; i < max; i++) {
        const lv = data ? data['s'+(i+1)] : 1;
        const div = document.createElement('div');
        div.innerHTML = `<div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1"><span>${hInfo.skills[i].name}</span><span id="lv-${i+1}-disp" class="text-blue-400">${lv}</span></div>
            <input type="range" min="1" max="5" value="${lv}" class="w-full accent-blue-500" oninput="document.getElementById('lv-${i+1}-disp').innerText = this.value">`;
        container.appendChild(div);
    }
}

window.saveHeroConfig = () => {
    const { side, index } = activeSlot; const sliders = document.querySelectorAll('#skill-inputs input');
    state[side].heroes[index] = { name: document.getElementById('hero-select').value, s1: parseInt(sliders[0]?.value || 1), s2: parseInt(sliders[1]?.value || 1), s3: parseInt(sliders[2]?.value || 1), star: 5, sub: 0 };
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

window.handleSimulation = async () => {
    const getStats = (s) => {
        const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj;
    };
    const collect = (side) => {
        return Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({
            tier: parseInt(el.querySelector('.batch-tier').value),
            tg: parseInt(el.querySelector('.batch-tg').value),
            inf: parseFloat(el.querySelector('.batch-inf').value) || 0,
            cav: parseFloat(el.querySelector('.batch-cav').value) || 0,
            arc: parseFloat(el.querySelector('.batch-arc').value) || 0
        }));
    };

    const setup = {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes }
    };

    const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst, modeLabel;

    if (simMode === 'monte-carlo') {
        modeLabel = "Monte Carlo (100x)";
        const runs = 100; let batch = [];
        for (let i = 0; i < runs; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        
        batch.sort((a, b) => (a.m_cur.inf + a.m_cur.cav + a.m_cur.arc) - (b.m_cur.inf + b.m_cur.cav + b.m_cur.arc));
        const atkWins = batch.filter(r => (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) > (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc)).length;
        const winner = atkWins >= 50 ? 'atk' : 'def';

        rAvg = {
            m_cur: { 
                inf: winner === 'atk' ? batch.reduce((s,r)=>s+r.m_cur.inf,0)/runs : 0,
                cav: winner === 'atk' ? batch.reduce((s,r)=>s+r.m_cur.cav,0)/runs : 0,
                arc: winner === 'atk' ? batch.reduce((s,r)=>s+r.m_cur.arc,0)/runs : 0
            },
            e_cur: {
                inf: winner === 'def' ? batch.reduce((s,r)=>s+r.e_cur.inf,0)/runs : 0,
                cav: winner === 'def' ? batch.reduce((s,r)=>s+r.e_cur.cav,0)/runs : 0,
                arc: winner === 'def' ? batch.reduce((s,r)=>s+r.e_cur.arc,0)/runs : 0
            },
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

    const screen = document.getElementById('result-screen');
    screen.classList.remove('hidden');

    const getScore = (r) => ( (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / r.startDef ) - ( (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / r.startAtk );
    const sMin = getScore(rBest), sMax = getScore(rWorst);
    const luckBar = document.getElementById('luck-visual-bar');
    luckBar.style.left = ((Math.min(sMin, sMax) + 1) * 50) + "%";
    luckBar.style.width = Math.max(1.5, Math.abs(sMax - sMin) * 50) + "%";

    document.getElementById('result-waves').innerText = `Mode: ${modeLabel} | Length: ${rAvg.wave} waves`;
    document.getElementById('res-atk-total').innerHTML = `<span>${Math.round(rAvg.m_cur.inf+rAvg.m_cur.cav+rAvg.m_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(rWorst.m_cur.inf+rWorst.m_cur.cav+rWorst.m_cur.arc).toLocaleString()} - ${Math.round(rBest.m_cur.inf+rBest.m_cur.cav+rBest.m_cur.arc).toLocaleString()}</div>`;
    document.getElementById('res-def-total').innerHTML = `<span>${Math.round(rAvg.e_cur.inf+rAvg.e_cur.cav+rAvg.e_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(rBest.e_cur.inf+rBest.e_cur.cav+rBest.e_cur.arc).toLocaleString()} - ${Math.round(rWorst.e_cur.inf+rWorst.e_cur.cav+rWorst.e_cur.arc).toLocaleString()}</div>`;

    document.getElementById('res-atk-details').innerText = `Inf: ${Math.round(rAvg.m_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.m_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.m_cur.arc).toLocaleString()}`;
    document.getElementById('res-def-details').innerText = `Inf: ${Math.round(rAvg.e_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.e_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.e_cur.arc).toLocaleString()}`;
    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2">[ATTACKER BUFFS]</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + `<div class="text-red-500 font-black mb-2 mt-4">[DEFENDER BUFFS]</div>` + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

window.toggleDetails = () => {
    const isHidden = document.getElementById('battle-details').classList.toggle('hidden');
    document.getElementById('toggle-details-btn').innerText = isHidden ? 'View Combat Modifiers +' : 'Hide Combat Modifiers -';
};

window.runOptimizer = (type = 'current') => {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collectBatches = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: 10, tg: 3, inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    
    const atkBatch = collectBatches('atk'); const defBatch = collectBatches('def');
    const attackerTotal = atkBatch.reduce((s, b) => s + b.inf + b.cav + b.arc, 0);
    const atkStats = getStats('atk'); const defStats = getStats('def');
    const score = type === 'meta' ? wr : (aS - dS) * 100; // Return net survival %
    document.getElementById('opt-best-score').innerText = type === 'meta' ? `Winrate against Meta: ${(best.winrate * 100).toFixed(1)}%` : `Projected Net Survival: +${best.score.toFixed(1)}%`;

    let metaDefenders = [];
    if (type === 'meta') {
        for (let i=0; i<=100; i+=10) for (let j=0; j<=100-i; j+=10) metaDefenders.push({ inf: i/100, cav: j/100, arc: (100-i-j)/100 });
    } else {
        const total = defBatch.reduce((s, b) => s + b.inf + b.cav + b.arc, 0);
        metaDefenders.push({ inf: defBatch[0].inf/total, cav: defBatch[0].cav/total, arc: defBatch[0].arc/total });
    }

    let dataPoints = { a: [], b: [], c: [], z: [] };
    let best = { form: [0,0,0], winrate: -1, netSurv: -Infinity };

    for (let i = 20; i <= 100; i += 1) { 
        for (let j = 0; j <= 100 - i; j += 1) {
            let k = 100 - i - j;
            let wins = 0; let totalNetSurv = 0;

            metaDefenders.forEach(def => {
                const s = {
                    atk: { batches: [{ tier: 10, tg: 3, inf: i*(attackerTotal/100), cav: j*(attackerTotal/100), arc: k*(attackerTotal/100) }], stats: atkStats, heroes: state.atk.heroes },
                    def: { batches: [{ tier: 10, tg: 3, inf: def.inf*attackerTotal, cav: def.cav*attackerTotal, arc: def.arc*attackerTotal }], stats: defStats, heroes: state.def.heroes }
                };
                const r = runCombatSim(s, 'average', 'average');
                const aS = (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / attackerTotal;
                const dS = (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / attackerTotal;
                if (aS > dS) wins++;
                totalNetSurv += (aS - dS);
            });

            const wr = wins / metaDefenders.length;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(type === 'meta' ? wr : totalNetSurv);
            if (wr > best.winrate || (wr === best.winrate && totalNetSurv > best.netSurv)) best = { winrate: wr, netSurv: totalNetSurv, form: [i, j, k] };
        }
    }

    function renderRosterUI() {
    const grid = document.getElementById('roster-grid');
    grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(name => {
        const h = HEROES[name];
        const r = roster[name];
        const card = document.createElement('div');
        card.className = `p-4 rounded-2xl border-2 transition-all ${r.unlocked ? 'bg-slate-900 border-blue-500/50' : 'bg-slate-950 border-slate-800 opacity-50'}`;
        
        card.innerHTML = `
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-700">
                    <img src="./assets/${name.toLowerCase()}.png" class="w-full h-full object-cover" onerror="this.style.display='none'">
                </div>
                <div class="font-bold text-xs uppercase tracking-tight">${name}</div>
                <input type="checkbox" ${r.unlocked ? 'checked' : ''} onchange="window.toggleHero('${name}')" class="ml-auto">
            </div>
            ${r.unlocked ? `
                <div class="space-y-3">
                    <div>
                        <span class="text-[9px] text-slate-500 uppercase font-black">Skills: ${r.s1}-${r.s2}-${r.s3}</span>
                        <input type="range" min="1" max="5" value="${r.s1}" onchange="window.updateRoster('${name}', 's1', this.value)" class="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500">
                    </div>
                    ${h.widget ? `
                    <div>
                        <span class="text-[9px] text-amber-500 uppercase font-black">Widget Level: ${r.widget}</span>
                        <input type="range" min="0" max="10" value="${r.widget}" onchange="window.updateRoster('${name}', 'widget', this.value)" class="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500">
                    </div>` : ''}
                </div>
            ` : ''}
        `;
        grid.appendChild(card);
    });
}

    window.toggleHero = (name) => { roster[name].unlocked = !roster[name].unlocked; saveRoster(); renderRosterUI(); };
window.updateRoster = (name, key, val) => { 
    roster[name][key] = parseInt(val); 
    if(key === 's1') { roster[name].s2 = parseInt(val); roster[name].s3 = parseInt(val); } // Simplify: assume equal skills
    saveRoster(); renderRosterUI(); 
};
const saveRoster = () => localStorage.setItem('ks_roster', JSON.stringify(roster));

// --- THE OPTIMIZER ENGINE ---

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(name => roster[name].unlocked);
    if (unlocked.length < 3) { alert("Please unlock at least 3 heroes in the roster."); return; }

    const resultsArea = document.getElementById('optimizer-results');
    resultsArea.classList.remove('hidden');
    resultsArea.innerHTML = '';

    const scenarios = [
        { label: "Optimal Attack (Rally)", context: "off", useJoiners: false },
        { label: "Optimal Attack w/ Joiners", context: "off", useJoiners: true },
        { label: "Optimal Defense (Garrison)", context: "def", useJoiners: false },
        { label: "Optimal Defense w/ Joiners", context: "def", useJoiners: true }
    ];

    scenarios.forEach(scen => {
        const best = findBestLineup(unlocked, scen.context, scen.useJoiners);
        const card = document.createElement('div');
        card.className = "glass-card p-6 border-t-2 border-blue-500/50";
        card.innerHTML = `
            <span class="text-[10px] font-black text-blue-500 uppercase tracking-widest">${scen.label}</span>
            <div class="mt-4 flex gap-2">
                ${best.leaders.map(name => `<div class="w-10 h-10 rounded-full border border-blue-500 overflow-hidden bg-slate-900 flex items-center justify-center text-[10px] font-bold" title="${name}"><img src="./assets/${name.toLowerCase()}.png" class="w-full h-full object-cover" onerror="this.remove()"><span>${name[0]}</span></div>`).join('')}
            </div>
            ${scen.useJoiners ? `
            <div class="mt-2 flex gap-2 opacity-60">
                ${best.joiners.map(name => `<div class="w-8 h-8 rounded-full border border-slate-700 overflow-hidden bg-slate-900 flex items-center justify-center text-[8px] font-bold" title="${name} (Joiner)"><img src="./assets/${name.toLowerCase()}.png" class="w-full h-full object-cover" onerror="this.remove()"><span>${name[0]}</span></div>`).join('')}
            </div>` : ''}
            <div class="mt-4 text-2xl font-black">${(best.score).toFixed(3)}x <span class="text-xs text-slate-500 font-normal">multiplier</span></div>
        `;
        resultsArea.appendChild(card);
    });
};

function findBestLineup(heroNames, context, includeJoiners) {
    let best = { leaders: [], joiners: [], score: 0 };

    // 1. Get every combination of 3 leaders
    const combinations = getCombinations(heroNames, 3);

    combinations.forEach(trio => {
        // Calculate Trio Multiplier
        let trioScore = calculateCrossProduct(trio, [], context);
        let currentJoiners = [];

        if (includeJoiners) {
            // Greedy search for 4 joiners: pick the 4 remaining heroes that add the most to the cross-product
            const remaining = heroNames.filter(n => !trio.includes(n));
            const joinerPool = remaining.map(name => ({
                name,
                impact: calculateCrossProduct(trio, [name], context) // impact of just this 1 joiner
            })).sort((a, b) => b.impact - a.impact);

            currentJoiners = joinerPool.slice(0, 4).map(j => j.name);
            trioScore = calculateCrossProduct(trio, currentJoiners, context);
        }

        if (trioScore > best.score) {
            best = { leaders: trio, joiners: currentJoiners, score: trioScore };
        }
    });

    return best;
}

function calculateCrossProduct(leaders, joiners, context) {
    let pools = {};

    // Process Leaders (all 3 skills)
    leaders.forEach(name => {
        const d = HEROES[name];
        const r = roster[name];
        // Hero Widget Multiplier
        const hWidget = (d.widget && d.widget.context === context) ? (1 + WIDGET_GROWTH[r.widget]) : 1.0;

        d.skills.forEach((s, i) => {
            const X = s.values[r[`s${i+1}`]-1];
            const ev = (s.duration === 0 ? s.getChance(X) * s.getMagnitude(X) : (1 - Math.pow(1-s.getChance(X), s.duration)) * s.getMagnitude(X));
            
            s.ids.forEach((id, idx) => {
                const val = (Array.isArray(ev) ? ev[idx] : ev) * hWidget;
                pools[id] = (pools[id] || 0) + val;
            });
        });
    });

    // Process Joiners (Only Skill 1)
    joiners.forEach(name => {
        const d = HEROES[name];
        const r = roster[name];
        const s = d.skills[0];
        const X = s.values[r.s1-1];
        const ev = (s.duration === 0 ? s.getChance(X) * s.getMagnitude(X) : (1 - Math.pow(1-s.getChance(X), s.duration)) * s.getMagnitude(X));
        
        s.ids.forEach((id, idx) => {
            pools[id] = (pools[id] || 0) + (Array.isArray(ev) ? ev[idx] : ev);
        });
    });

    // Cross product: (1 + sumID1) * (1 + sumID2) ...
    let total = 1.0;
    Object.values(pools).forEach(sum => total *= (1 + sum));
    return total;
}

// Combinations helper
function getCombinations(array, size) {
    let result = [];
    function helper(start, combo) {
        if (combo.length === size) { result.push([...combo]); return; }
        for (let i = start; i < array.length; i++) {
            combo.push(array[i]); helper(i + 1, combo); combo.pop();
        }
    }
    helper(0, []); return result;
}


    Plotly.newPlot('ternary-plot', [{ type: 'scatterternary', mode: 'markers', a: dataPoints.a, b: dataPoints.b, c: dataPoints.c, marker: { size: 6, color: dataPoints.z, colorscale: 'Portland' } }], { ternary: { sum: 100, aaxis: {title: 'Inf'}, baxis: {title: 'Cav'}, caxis: {title: 'Arc'} }, paper_bgcolor: 'rgba(0,0,0,0)', font: {color: '#64748b'} });
    document.getElementById('opt-best-form').innerText = `${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
    document.getElementById('opt-best-score').innerText = `Efficiency score: ${(best.winrate * 100).toFixed(1)}%`;
    document.getElementById('optimizer-screen').classList.remove('hidden');
    document.getElementById('optimizer-screen').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', init);
