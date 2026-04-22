import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';
import { WIDGET_STATS } from './widgets.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let nakedStats = JSON.parse(localStorage.getItem('ks_naked_stats')) || null;
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) }
};

// --- 1. INITIALIZATION ---
window.init = () => {
    console.log("Kingshot Hub: Initializing logic...");
    
    // Sync roster with DB
    Object.keys(HEROES).forEach(n => { 
        if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; 
    });

    // Populate all hero selects
    const mainSel = document.getElementById('hero-select');
    const calibSels = document.querySelectorAll('.rep-hero');
    const allDropdowns = [mainSel, ...calibSels];

    allDropdowns.forEach(sel => {
        if(!sel) return;
        sel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => {
            sel.innerHTML += `<option value="${n}">${n}</option>`;
        });
    });

    if(mainSel) mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);

    // Build Stat Table (Battle Tab)
    const table = document.getElementById('stat-table');
    if(table) {
        const units = ["Infantry", "Cavalry", "Archer"];
        const cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
        table.innerHTML = '';
        units.forEach(u => cats.forEach(c => {
            const row = document.createElement('div'); row.className = "stat-row";
            row.style.display = "flex"; row.style.alignItems = "center"; row.style.height = "32px"; row.style.padding = "0 30px";
            const key = `${u.toLowerCase().slice(0,3)}_${c.k}`;
            row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000"><div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.l}</div><input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">`;
            table.appendChild(row);
        }));
    }

    window.addBatch('atk', true); window.addBatch('def', true);
    window.updateGrids(); renderRosterUI(); 
    if(nakedStats) renderNakedStats();
    window.showTab('battle');
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
    const reportHeroes = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    
    const reportVal = {};
    ['inf','cav','arc'].forEach(t => ['att','def','leth','hp'].forEach(s => {
        reportVal[`${t}_${s}`] = parseFloat(document.getElementById(`rep-${t}-${s}`).value) || 0;
    }));

    let widgetSum = 0;
    reportHeroes.forEach(name => {
        if(name === "None") return;
        if (HEROES[name].widget && HEROES[name].widget.context === ctx) widgetSum += WIDGET_GROWTH[roster[name].widget];
    });

    const results = {};
    ['inf','cav','arc'].forEach(t => {
        ['att','def','leth','hp'].forEach(s => {
            let val = reportVal[`${t}_${s}`] / (1 + widgetSum);
            reportHeroes.forEach(name => {
                if(name === "None") return;
                const d = HEROES[name];
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') val -= GROWTH_TEMPLATES[d.template][roster[name].starIndex];
                    else val -= WIDGET_STATS[d.template][roster[name].widget];
                }
            });
            results[`${t}_${s}`] = val;
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
    return {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes }
    };
}

window.handleSimulation = async () => {
    const setup = gatherSetup(); const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst, modeLabel;
    if (simMode === 'monte-carlo') {
        modeLabel = "Deep Sim (100 Runs)";
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
        modeLabel = "Quick Sim (Estimate)";
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
    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2">[BUFFS]</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    document.getElementById('result-waves').innerText = `Mode: ${modeLabel} | length: ${rAvg.wave} waves`;
    screen.scrollIntoView({ behavior: 'smooth' });
};

window.runOptimizer = (mode) => {
    const isBear = mode === 'bear';
    const setup = gatherSetup(); const atkTotal = 1000000;
    if(isBear) {
        setup.atk.stats = { inf_att: parseFloat(document.getElementById('bear-inf-att').value), inf_leth: parseFloat(document.getElementById('bear-inf-leth').value), cav_att: parseFloat(document.getElementById('bear-cav-att').value), cav_leth: parseFloat(document.getElementById('bear-cav-leth').value), arc_att: parseFloat(document.getElementById('bear-arc-att').value), arc_leth: parseFloat(document.getElementById('bear-arc-leth').value) };
    }
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity };
    let score101080 = 0;
    let defenders = [];
    if(mode==='meta') { for(let i=0; i<=100; i+=10) for(let j=0; j<=100-i; j+=10) defenders.push({inf:i/100, cav:j/100, arc:(100-i-j)/100}); }
    else if(mode==='current') { const d=setup.def.batches.reduce((s,b)=>({inf:s.inf+b.inf,cav:s.cav+b.cav,arc:s.arc+b.arc}),{inf:0,cav:0,arc:0}); const t=d.inf+d.cav+d.arc||1; defenders.push({inf:d.inf/t,cav:d.cav/t,arc:d.arc/t}); }
    else defenders.push({inf:1,cav:0,arc:0});

    for (let i = (isBear?0:20); i <= 100; i += 2) {
        for (let j = 0; j <= 100 - i; j += 2) {
            let k = 100-i-j; let totalNet = 0; let wins = 0;
            defenders.forEach(d => {
                let s = JSON.parse(JSON.stringify(setup));
                s.atk.batches = [{ tier: isBear?parseInt(document.getElementById('bear-inf-tier').value):10, tg:isBear?parseInt(document.getElementById('bear-inf-tg').value):3, inf:i*10000, cav:j*10000, arc:k*10000 }];
                if(!isBear) s.def.batches = [{ tier:10, tg:3, inf:d.inf*atkTotal, cav:d.cav*atkTotal, arc:d.arc*atkTotal }];
                const r = runCombatSim(s, 'average', 'average', 100, isBear, true);
                let out = isBear ? r.totalDmg : (r.m_cur.inf+r.m_cur.cav+r.m_cur.arc) - (r.e_cur.inf+r.e_cur.cav+r.e_cur.arc);
                if(out > 0) wins++; totalNet += out;
                if(isBear && i===10 && j===10) score101080 = out;
            });
            const score = mode === 'meta' ? (wins/defenders.length) : totalNet;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(score);
            if (score > best.score) best = { score, form: [i,j,k] };
        }
    }
    const plotId = isBear?'bear-plot':'ternary-plot';
    const mainTrace = { type:'scatterternary', a:dataPoints.a, b:dataPoints.b, c:dataPoints.c, mode:'markers', marker:{ color:dataPoints.z, colorscale:'Hot', size:10, symbol:'square' }, hovertemplate: 'Inf: %{a}<br>Cav: %{b}<br>Arc: %{c}<extra></extra>' };
    const markers = [
        { type:'scatterternary', a:[10], b:[10], c:[80], name:'10/10/80', mode:'markers', marker:{size:12, symbol:'cross', color:'white', line:{width:2, color:'black'}} },
        { type:'scatterternary', a:[best.form[0]], b:[best.form[1]], c:[best.form[2]], name:'Optimal', mode:'markers', marker:{size:15, symbol:'star', color:'cyan', line:{width:2, color:'black'}} }
    ];
    Plotly.newPlot(plotId, [mainTrace, ...markers], { ternary: { sum:100, aaxis:{title:'Infantry'}, baxis:{title:'Cavalry'}, caxis:{title:'Archer'} }, paper_bgcolor:'rgba(0,0,0,0)', font:{color:'#64748b'}, margin:{l:0,r:0,t:40,b:0}, showlegend:false });
    if(isBear) { 
        document.getElementById('bear-total-dmg').innerText = `Max Dealt: ${Math.round(best.score).toLocaleString()}`; 
        document.getElementById('bear-best-form').innerText = `Best Split: ${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
        const gain = ((best.score / (score101080 || 1)) - 1) * 100;
        document.getElementById('bear-comparison').innerText = `This is ${gain.toFixed(1)}% more damage than 10/10/80.`;
    } else {
        document.getElementById('opt-best-form').innerText = `${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
        document.getElementById('opt-best-score').innerText = `Survival Margin: +${Math.round(best.score).toLocaleString()} survivors`;
    }
};

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if (unlocked.length < 3) return alert("Please unlock at least 3 heroes in the Hero Vault.");
    
    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = '<div class="col-span-2 text-center py-4 text-blue-400 animate-pulse font-black">ANALYZING COMBINATIONS...</div>';

    const byType = { Inf: [], Cav: [], Arc: [] };
    unlocked.forEach(n => byType[HEROES[n].type].push(n));

    if (!byType.Inf.length || !byType.Cav.length || !byType.Arc.length) {
        return alert("You need at least one hero of each type (Inf, Cav, Arc) unlocked.");
    }

    // Define Scenarios
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
            let best = { leaders: [], joiners: [], score: -Infinity };

            // 1. Brute Force Leaders (1 of each type)
            for (let i of byType.Inf) {
                for (let c of byType.Cav) {
                    for (let a of byType.Arc) {
                        const leaders = [i, c, a];
                        let joiners = [];

                        if (s.j > 0) {
                            // 2. Optimized Joiner Selection
                            // Since joiners only contribute S1 and uptime stacks via Independence Rule,
                            // we can find the best joiner by testing every hero in all 4 slots.
                            // Because marginal utility of the same joiner decreases, we pick them one by one.
                            // This "Iterative Best-Fit" is effectively brute force for independent variables.
                            for (let slot = 0; slot < s.j; slot++) {
                                let bestJ = null;
                                let maxJScore = -Infinity;
                                
                                unlocked.forEach(cand => {
                                    const testJoiners = [...joiners, cand];
                                    const score = calcPowerScore(leaders, testJoiners, s.c, s.w, s.b);
                                    if (score > maxJScore) {
                                        maxJScore = score;
                                        bestJ = cand;
                                    }
                                });
                                joiners.push(bestJ);
                            }
                        }

                        const finalScore = calcPowerScore(leaders, joiners, s.c, s.w, s.b);
                        if (finalScore > best.score) {
                            best = { leaders, joiners, score: finalScore };
                        }
                    }
                }
            }

            renderOptimizerCard(s, best, resArea);
        });
    }, 50);
};

function calcPowerScore(leaders, joiners, ctx, allowWidgets, isBear) {
    let skillBuckets = {};
    let widgetMult = 1.0;
    
    // 1. Calculate Global Widget Multiplier (Product of 3 leader widgets)
    if (allowWidgets) {
        leaders.forEach(n => {
            const d = HEROES[n];
            if (d.widget && d.widget.context === ctx) {
                widgetMult *= (1 + WIDGET_GROWTH[roster[n].widget]);
            }
        });
    }

    // 2. Consolidate Hero Counts (Leader counts for S1, S2, S3. Joiners only S1)
    const heroManifest = {}; // name: { s1_count: N, s2_count: N, s3_count: N }
    
    leaders.forEach(n => {
        if (!heroManifest[n]) heroManifest[n] = { s1: 0, s2: 0, s3: 0 };
        heroManifest[n].s1++; heroManifest[n].s2++; heroManifest[n].s3++;
    });
    joiners.forEach(n => {
        if (!heroManifest[n]) heroManifest[n] = { s1: 0, s2: 0, s3: 0 };
        heroManifest[n].s1++;
    });

    // 3. Apply Independence Rule to Skills
    Object.keys(heroManifest).forEach(name => {
        const d = HEROES[name];
        const r = roster[name];
        
        d.skills.forEach((s, si) => {
            const count = heroManifest[name][`s${si+1}`];
            if (count === 0) return;

            // Bear Trap Filter: Only IDs 101, 102 (Numerical buffs)
            if (isBear && !s.ids.some(id => id < 200)) return;
            // PvP Filter: If not bear, exclude non-combat skills if necessary (not needed based on your IDs)

            const level = r[`s${si+1}`] || 5;
            const p = s.getChance(s.values[level-1]);
            const m = s.getMagnitude(s.values[level-1]);
            const dur = isBear ? 0 : (s.duration || 0);

            // Probability that at least one hero triggers the skill
            const pAny = 1 - Math.pow(1 - p, count);
            // Expected uptime across waves based on duration
            const uptime = (dur === 0) ? pAny : (1 - Math.pow(1 - pAny, dur));

            s.ids.forEach((id, idx) => {
                const mag = Array.isArray(m) ? m[idx] : m;
                skillBuckets[id] = (skillBuckets[id] || 0) + (uptime * mag);
            });
        });
    });

    // 4. Final Aggregation
    let skillTotalMult = 1.0;
    Object.values(skillBuckets).forEach(v => skillTotalMult *= (1 + v));

    // 5. Account Stats Integration (The most important fix)
    if (document.getElementById('use-account-stats').checked && nakedStats) {
        let totalWeightedStat = 0;
        const types = ['inf', 'cav', 'arc'];
        
        types.forEach(t => {
            // Base Naked Stat
            let baseAtt = nakedStats[`${t}_att`];
            let baseLeth = nakedStats[`${t}_leth`];

            // Add Flat Hero Stars & Widget Stats
            leaders.forEach(n => {
                const d = HEROES[n];
                const r = roster[n];
                if (d.type.toLowerCase().slice(0,3) === t) {
                    baseAtt += GROWTH_TEMPLATES[d.template][r.starIndex];
                    if (d.widget) baseLeth += WIDGET_STATS[d.template][r.widget];
                }
            });

            // Apply global Widget Multiplier and Skill Multiplier
            // Note: In simplified power score, we treat Att * Leth as the efficiency metric
            const finalAtt = baseAtt * widgetMult * skillTotalMult;
            const finalLeth = baseLeth * widgetMult * skillTotalMult;
            
            totalWeightedStat += (finalAtt * finalLeth);
        });
        
        return totalWeightedStat;
    }

    // Default: Return abstract multiplier if no account stats
    return skillTotalMult * widgetMult;
}

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);
