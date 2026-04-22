import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';
import { WIDGET_STATS } from './widgets.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let nakedStats = JSON.parse(localStorage.getItem('ks_naked_stats')) || null;
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };
let optRole = 'atk'; 
const sum = (c) => Math.round(c.inf + c.cav + c.arc);

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
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 relative mb-2";
    div.innerHTML = `<div class="flex justify-between items-center"><div class="flex gap-2">
            <select class="batch-tier bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[11,10,9,8,7,6,5,4,3,2,1].map(t => `<option value="${t}" ${t===10?'selected':''}>T${t}</option>`).join('')}</select>
            <select class="batch-tg bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">${[5,4,3,2,1,0].map(tg => `<option value="${tg}" ${tg===3?'selected':''}>TG${tg}</option>`).join('')}
            </select></div>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[10px] font-black uppercase">Remove</button>` : ''}</div>
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
    const ctx = document.getElementById('report-ctx').value;
    const reportHeroNames = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    
    const reportVal = {};
    ['inf','cav','arc'].forEach(t => ['att','def','leth','hp'].forEach(s => {
        reportVal[`${t}_${s}`] = parseFloat(document.getElementById(`rep-${t}-${s}`).value) || 0;
    }));

    // 1. Find the global widget multiplier used in the report
    let widgetPercSum = 0;
    reportHeroNames.forEach(name => {
        if(name === "None") return;
        const d = HEROES[name];
        const r = roster[name];
        if (d.widget && d.widget.context === ctx) widgetPercSum += WIDGET_GROWTH[r.widget];
    });

    const results = {};
    ['inf','cav','arc'].forEach(t => {
        ['att','def','leth','hp'].forEach(s => {
            // 2. Remove the multiplier effect first
            let val = reportVal[`${t}_${s}`] / (1 + widgetPercSum);
            
            // 3. Subtract flat bonuses from stars and widgets
            reportHeroNames.forEach(name => {
                if(name === "None") return;
                const d = HEROES[name];
                const r = roster[name];
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') {
                        val -= (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    } else {
                        // Lethality/HP use Widget Stats flats
                        if (d.widget) val -= (WIDGET_STATS[d.template][r.widget] || 0);
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
    div.classList.remove('hidden');
    div.innerHTML = Object.entries(nakedStats).map(([key, val]) => `
        <div class="text-center"><div class="text-[8px] text-slate-500 uppercase font-black">${key.replace('_',' ')}</div><div class="text-xs font-bold text-blue-400">${val.toFixed(1)}%</div></div>`).join('');
}

// --- 6. SIMULATION & OPTIMIZERS ---
function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: parseInt(el.querySelector('.batch-tier').value), tg: parseInt(el.querySelector('.batch-tg').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    return { atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes }, def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes } };
}

window.handleSimulation = async () => {
    const setup = gatherSetup(); 
    const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst, modeLabel;

    if (simMode === 'monte-carlo') {
        modeLabel = "Stochastic Sampling (100 Runs)";
        let batch = [];
        for (let i = 0; i < 100; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        batch.sort((a,b) => (sum(a.m_cur) - sum(a.e_cur)) - (sum(b.m_cur) - sum(b.e_cur)));
        rAvg = batch[50]; rWorst = batch[0]; rBest = batch[99];
    } else {
        modeLabel = "Deterministic Range (95% CI)";
        rAvg = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky');
        rWorst = runCombatSim(setup, 'unlucky', 'lucky');
    }

    const screen = document.getElementById('result-screen');
    screen.classList.remove('hidden');
    
    document.getElementById('res-atk-total').innerText = sum(rAvg.m_cur).toLocaleString();
    document.getElementById('res-def-total').innerText = sum(rAvg.e_cur).toLocaleString();

    const score = (r) => (sum(r.m_cur) / (r.startAtk||1)) - (sum(r.e_cur) / (r.startDef||1));
    const sAvg = score(rAvg), sMin = score(rWorst), sMax = score(rBest);
    const luckPct = ((sAvg - sMin) / (Math.abs(sMax - sMin) || 1)) * 100;

    document.getElementById('result-waves').innerHTML = `
        <span class="text-blue-400 font-black">${modeLabel}</span><br>
        Avg Duration: <span class="text-white">${rAvg.wave} Waves</span>
        ${simMode === 'monte-carlo' ? `<br>Visualized Battle Luck: <span class="text-amber-500">${luckPct.toFixed(0)}th Percentile</span>` : ''}
    `;

    document.getElementById('res-atk-range').innerText = `Range: ${sum(rWorst.m_cur).toLocaleString()} - ${sum(rBest.m_cur).toLocaleString()}`;
    document.getElementById('res-def-range').innerText = `Range: ${sum(rBest.e_cur).toLocaleString()} - ${sum(rWorst.e_cur).toLocaleString()}`;

    const bar = document.getElementById('luck-bar-inner');
    const rightSidePos = ((1 - Math.min(sMin, sMax)) * 50); 
    bar.style.right = (100 - rightSidePos) + "%"; 
    bar.style.width = Math.max(1, Math.abs(sMax - sMin) * 50) + "%";
    bar.style.left = "auto";

    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2 border-b border-emerald-900/30 pb-1">ATTACKER BUFFS</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + `<div class="text-red-500 font-black mt-4 mb-2 border-b border-red-900/30 pb-1">DEFENDER BUFFS</div>` + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    screen.scrollIntoView({ behavior: 'smooth' });
};

window.runOptimizer = (mode) => {
    const isBear = mode === 'bear', setup = gatherSetup();
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    if(!isBear) document.getElementById('opt-transparency').classList.toggle('hidden', mode !== 'meta');

    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity, winRate: 0, net: 0 };
    let opponents = [];

    const userSide = optRole === 'atk' ? setup.atk : setup.def;
    const userTotal = userSide.batches.reduce((s,b)=> s + sum(b), 0) || 1;
    const leadTier = userSide.batches[0].tier, leadTG = userSide.batches[0].tg;

    const oppSide = optRole === 'atk' ? setup.def : setup.atk;
    const oppTotal = (mode === 'meta' || mode === 'custom') ? userTotal : (optRole === 'atk' ? setup.def : setup.atk).batches.reduce((s,b)=> s + (b.inf+b.cav+b.arc), 0);
    const leadTG = userSide.batches[0].tg;

     if (isBear) { opponents.push({inf:1, cav:0, arc:0}); }
    else if (mode === 'current') {
        const side = optRole === 'atk' ? setup.def : setup.atk;
        const d = side.batches.reduce((s,b)=>({inf:s.inf+b.inf,cav:s.cav+b.cav,arc:s.arc+b.arc}),{inf:0,cav:0,arc:0});
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
            let k=100-i-j, wins=0, totalNet=0;
            opponents.forEach(opp => {
                let s = JSON.parse(JSON.stringify(setup));
                const userBatches = userSide.batches.map(b => ({ tier: b.tier, tg: b.tg, inf: (i/100)*sum(b), cav: (j/100)*sum(b), arc: (k/100)*sum(b) }));
                const oppBatch = { tier: leadTier, tg: leadTG, inf: opp.inf*userTotal, cav: opp.cav*userTotal, arc: opp.arc*userTotal };

                if (isBear) {
                    s.atk.batches = [
                        { tier: parseInt(document.getElementById('bear-inf-tier').value), tg: parseInt(document.getElementById('bear-inf-tg').value), inf: i * (userTotal/100), cav: 0, arc: 0 },
                        { tier: parseInt(document.getElementById('bear-cav-tier').value), tg: parseInt(document.getElementById('bear-cav-tg').value), inf: 0, cav: j * (userTotal/100), arc: 0 },
                        { tier: parseInt(document.getElementById('bear-arc-tier').value), tg: parseInt(document.getElementById('bear-arc-tg').value), inf: 0, cav: 0, arc: k * (userTotal/100) }
                    ];
                } else if (optRole === 'atk') { s.atk.batches = userBatches; s.def.batches = [oppBatch]; }
                else { s.atk.batches = [oppBatch]; s.def.batches = userBatches; }

                const r = runCombatSim(s, 'average', 'average', 1, isBear, true);
                const mySurv = optRole==='atk'?sum(r.m_cur):sum(r.e_cur), opSurv = optRole==='atk'?sum(r.e_cur):sum(r.m_cur);
                if (mySurv > opSurv) wins++; totalNet += (mySurv - opSurv);
            });
            const finalScore = isBear ? totalNet : (wins * 1e12) + totalNet;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(isBear?totalNet:wins);
            if (finalScore > best.score) best = { score: finalScore, form: [i,j,k], winRate: (wins/opponents.length)*100, net: totalNet/opponents.length };
        }
    }
    renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
    resArea.innerText = `${best.form[0]} / ${best.form[1]} / ${best.form[2]}`;
    scoreArea.innerHTML = isBear ? "Split for Max Damage." : (mode === 'meta' ? `Coverage: ${best.winRate.toFixed(1)}%` : `RESULT: <span class="${best.net > 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${best.net > 0 ? 'WIN' : 'LOSS'}</span> | Margin: ${Math.round(best.net).toLocaleString()}`);
};

function renderTernary(id, data, best, isBear) {
    const traces = [{ type:'scatterternary', a:data.a, b:data.b, c:data.c, mode:'markers', marker:{ color:data.z, colorscale: 'Viridis', size:6 } },
        { type:'scatterternary', a:[isBear?10:50], b:[isBear?10:20], c:[isBear?80:30], name:'Ref', mode:'markers', marker:{size:10, symbol:'circle', color:'white', line:{width:2, color:'black'}} },
        { type:'scatterternary', a:[best.form[0]], b:[best.form[1]], c:[best.form[2]], name:'Best', mode:'markers', marker:{size:14, symbol:'star', color:'cyan', line:{width:2, color:'black'}} }];
    Plotly.newPlot(id, traces, { ternary: { sum:100, aaxis:{title:'Inf'}, baxis:{title:'Cav'}, caxis:{title:'Arc'} }, paper_bgcolor:'rgba(0,0,0,0)', font:{color:'#64748b'}, margin:{l:0,r:0,t:30,b:0}, showlegend: false });
}

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if (unlocked.length < 3) return alert("Unlock at least 3 heroes.");
    
    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = '<div class="col-span-1 md:col-span-2 text-center py-12"><div class="text-blue-500 font-black animate-pulse tracking-widest uppercase">Analyzing Best-In-Slot Synergies...</div></div>';

    // Best-in-Slot Joiner Pool (S1 focus)
    const joinerWhiteList = ['Chenko', 'Amane', 'Howard', 'Eric', 'Gordon', 'Fahd', 'Saul', 'Hilde'];
    const joinerCandidates = unlocked.filter(n => joinerWhiteList.includes(n));

    const byType = { Inf: [], Cav: [], Arc: [] };
    unlocked.forEach(n => byType[HEROES[n].type].push(n));

    const scenarios = [
        { l: "Solo Attack", c: "off", j: 0, w: false, b: false },
        { l: "Solo Defense", c: "def", j: 0, w: true, b: false },
        { l: "Rally (Offense)", c: "off", j: 4, w: true, b: false },
        { l: "Garrison (Defense)", c: "def", j: 4, w: true, b: false },
        { l: "Optimal Bear", c: "off", j: 4, w: true, b: true }
    ];

    setTimeout(() => {
        resArea.innerHTML = ''; 
        scenarios.forEach(s => {
            let best = { leaders: [], joiners: [], score: -1 };

            for (let i of byType.Inf) {
                for (let c of byType.Cav) {
                    for (let a of byType.Arc) {
                        const leaders = [i, c, a];
                        let currentJoiners = [];

                        if (s.j > 0) {
                            for (let slot = 0; slot < s.j; slot++) {
                                let bestJ = null, maxJScore = -1;
                                // Use pruned candidates for joiner slots
                                joinerCandidates.forEach(cand => {
                                    const score = calcPowerScore(leaders, [...currentJoiners, cand], s.c, s.w, s.b);
                                    if (score > maxJScore) { maxJScore = score; bestJ = cand; }
                                });
                                currentJoiners.push(bestJ);
                            }
                        }

                        const finalScore = calcPowerScore(leaders, currentJoiners, s.c, s.w, s.b);
                        if (finalScore > best.score) {
                            best = { leaders, joiners: currentJoiners, score: finalScore };
                        }
                    }
                }
            }
            renderOptimizerCard(s, best, resArea);
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

function calcPowerScore(leaders, joiners, ctx, allowWidgets, isBear) {
    let skillBuckets = {};
    let widgetMult = 1.0;
    
    // 1. Global Widget Multiplier (Leaders only)
    if (allowWidgets) {
        leaders.forEach(n => {
            const d = HEROES[n];
            const r = roster[n];
            if (d && d.widget && d.widget.context === ctx) {
                widgetMult *= (1 + WIDGET_GROWTH[r.widget]);
            }
        });
    }

    // 2. Tally Skill Counts (Leaders get S1-S3, Joiners S1 only)
    const manifest = {}; 
    leaders.forEach(n => {
        if(!manifest[n]) manifest[n] = { s1: 0, s2: 0, s3: 0 };
        manifest[n].s1++; manifest[n].s2++; manifest[n].s3++;
    });
    joiners.forEach(n => {
        if(!manifest[n]) manifest[n] = { s1: 0, s2: 0, s3: 0 };
        manifest[n].s1++;
    });

    // 3. Process Buckets
    for (const name in manifest) {
        const d = HEROES[name];
        const r = roster[name];
        if (!d) continue;

        d.skills.forEach((s, si) => {
            const count = manifest[name][`s${si+1}`];
            if (!count || count <= 0) return;

            const lvl = r[`s${si+1}`] || 5;
            const p = s.getChance(s.values[lvl-1]);
            const m = s.getMagnitude(s.values[lvl-1]);
            const dur = isBear ? 0 : (s.duration || 0);

            let effectiveMagnitude;

            if (p >= 1.0) {
                // PASSIVE STACKING: 10% x 3 heroes = 30%
                effectiveMagnitude = count * 1.0; // The '1.0' represents uptime
            } else {
                // CHANCE STACKING: Uptime-based (Independence Rule)
                const pAny = 1 - Math.pow(1 - p, count);
                effectiveMagnitude = (dur === 0) ? pAny : (1 - Math.pow(1 - pAny, dur));
            }

            s.ids.forEach((id, idx) => {
                // BEAR LEAK FIX: Strictly block non-1xx IDs during Bear calculation
                if (isBear && id >= 200) return;

                const mag = Array.isArray(m) ? m[idx] : m;
                skillBuckets[id] = (skillBuckets[id] || 0) + (effectiveMagnitude * mag);
            });
        });
    }

    // 4. Combine Buckets Multiplicatively
    let skillMult = 1.0;
    Object.values(skillBuckets).forEach(v => skillMult *= (1 + v));

    // 5. Apply Account Stat Scaling
    let statEffect = 1.0;
    const isUsingStats = document.getElementById('use-account-stats').checked && nakedStats;

    if (isUsingStats) {
        let totalGain = 0;
        ['inf', 'cav', 'arc'].forEach(t => {
            const nakedAtt = nakedStats[`${t}_att`] || 1;
            const nakedLeth = nakedStats[`${t}_leth`] || 1;
            let flatsAtt = 0, flatsLeth = 0;

            leaders.forEach(n => {
                const d = HEROES[n];
                const r = roster[n];
                if (d && d.type.toLowerCase().slice(0,3) === t) {
                    flatsAtt += (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    if (d.widget) flatsLeth += (WIDGET_STATS[d.template][r.widget] || 0);
                }
            });

            totalGain += ((nakedAtt + flatsAtt) / nakedAtt) * ((nakedLeth + flatsLeth) / nakedLeth);
        });
        statEffect = totalGain / 3;
    }

    return statEffect * widgetMult * skillMult;
}

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);
