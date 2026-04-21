import { HEROES } from './heroes.js';
import { WIDGET_STATS } from './widgets.js';
import { runCombatSim } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let nakedStats = JSON.parse(localStorage.getItem('ks_naked_stats')) || null;
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) }
};

// --- INITIALIZATION ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10 }; });
    const sel = document.getElementById('hero-select');
    if(sel) {
        sel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => {
            const name = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
            sel.innerHTML += `<option value="${n}">${name}</option>`;
        });
        sel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);
    }
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
    window.updateGrids(); renderRosterUI(); window.showTab('battle');
};

window.toggleAccountStats = () => {
    const isEnabled = document.getElementById('use-account-stats').checked;
    document.getElementById('account-stats-ui').classList.toggle('hidden', !isEnabled);
};

window.reverseEngineerAccount = () => {
    const ctx = document.getElementById('report-ctx').value;
    const reportHeroes = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    
    // Grab report values (Infantry example, repeat for Cav/Arc)
    const reportVal = {
        inf_att: parseFloat(document.getElementById('rep-inf-att').value) || 0,
        inf_def: parseFloat(document.getElementById('rep-inf-def').value) || 0,
        inf_leth: parseFloat(document.getElementById('rep-inf-leth').value) || 0,
        inf_hp: parseFloat(document.getElementById('rep-inf-hp').value) || 0,
        cav_att: parseFloat(document.getElementById('rep-cav-att').value) || 0,
        cav_def: parseFloat(document.getElementById('rep-cav-def').value) || 0,
        cav_leth: parseFloat(document.getElementById('rep-cav-leth').value) || 0,
        cav_hp: parseFloat(document.getElementById('rep-cav-hp').value) || 0,
        arc_att: parseFloat(document.getElementById('rep-arc-att').value) || 0,
        arc_def: parseFloat(document.getElementById('rep-arc-def').value) || 0,
        arc_leth: parseFloat(document.getElementById('rep-arc-leth').value) || 0,
        arc_hp: parseFloat(document.getElementById('rep-arc-hp').value) || 0,
    };

    // Calculate Widget Multiplier to subtract
    let widgetMult = 1.0;
    let widgetStatMap = { attack: 0, defense: 0, lethality: 0, health: 0 };
    
    reportHeroes.forEach(name => {
        if(name === "None") return;
        const d = HEROES[name];
        const r = roster[name];
        if (d.widget && d.widget.context === ctx) widgetMult += WIDGET_GROWTH[r.widget];
    });

    // Subtraction logic
    const results = {};
    const stats = ['att', 'def', 'leth', 'hp'];
    const types = ['inf', 'cav', 'arc'];

    types.forEach(t => {
        stats.forEach(s => {
            let val = reportVal[`${t}_${s}`];
            // 1. Divide by widget multiplier
            val = val / widgetMult;
            
            // 2. Subtract Hero Star/Widget Flat Bonuses
            reportHeroes.forEach(name => {
                if(name === "None") return;
                const d = HEROES[name];
                const r = roster[name];
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') {
                        val -= GROWTH_TEMPLATES[d.template][(r.s1*6)]; // Simplified star lookup
                    } else {
                        val -= WIDGET_STATS[d.template] ? WIDGET_STATS[d.template][r.widget] : 0;
                    }
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
        <div class="text-center">
            <div class="text-[8px] text-slate-500 uppercase font-black">${key.replace('_',' ')}</div>
            <div class="text-xs font-bold text-blue-400">${val.toFixed(1)}%</div>
        </div>
    `).join('');
}

// --- 2. THE ACCOUNT-AWARE OPTIMIZER ---

function calcTotalPower(leaders, joiners, ctx, allowWidgets) {
    const skillMultiplier = calcPowerScore(leaders, joiners, ctx, allowWidgets);
    if (!document.getElementById('use-account-stats').checked || !nakedStats) return skillMultiplier;

    // Calculate Stat Growth Multiplier
    let currentStats = { ...nakedStats };
    let widgetMult = 1.0;

    // Add hero/widget bonuses from the candidate trio
    leaders.forEach(name => {
        if(name === "None") return;
        const d = HEROES[name];
        const r = roster[name];
        const type = d.type.toLowerCase().slice(0,3);

        if (d.widget && d.widget.context === ctx && allowWidgets) widgetMult += WIDGET_GROWTH[r.widget];
        
        currentStats[`${type}_att`] += GROWTH_TEMPLATES[d.template][(r.s1*6)];
        currentStats[`${type}_def`] += GROWTH_TEMPLATES[d.template][(r.s1*6)];
        currentStats[`${type}_leth`] += WIDGET_STATS[d.template] ? WIDGET_STATS[d.template][r.widget] : 0;
        currentStats[`${type}_hp`] += WIDGET_STATS[d.template] ? WIDGET_STATS[d.template][r.widget] : 0;
    });

    // TPF Calculation: product of the 4 stat "areas" multiplied by skill buckets
    // We normalize this by dividing by the "Naked" area to see the actual growth factor
    let statFactor = 1.0;
    Object.keys(currentStats).forEach(key => {
        statFactor *= (1 + (currentStats[key] * widgetMult / 100));
    });

    let nakedFactor = 1.0;
    Object.keys(nakedStats).forEach(key => {
        nakedFactor *= (1 + (nakedStats[key] / 100));
    });

    return (statFactor / nakedFactor) * skillMultiplier;
}

window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    const labels = { battle: 'Battle Sim', formation: 'Formations', bear: 'Bear', roster: 'Best Heroes' };
    
    Object.keys(screens).forEach(k => {
        const el = document.getElementById(screens[k]);
        if (el) el.classList.toggle('hidden', k !== tab);
        const b = document.getElementById(btns[k]);
        if (b) {
            b.innerText = labels[k];
            b.className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold text-white" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
        }
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

function renderLevelPicker(hero, key, current, isRoster = true) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const action = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${action}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
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
        card.onclick = () => { roster[n].unlocked = !roster[n].unlocked; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50 shadow-lg shadow-blue-900/20' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3">${skillsHtml}${h.widget ? `<div class="pt-2 border-t border-slate-800"><span class="text-[8px] text-amber-500 font-black uppercase block mb-1">Widget</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>` : ''}`;
        grid.appendChild(card);
    });
}
window.updateRoster = (n,k,v) => { roster[n][k]=v; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

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

window.handleSimulation = async () => {
    const setup = gatherSetup();
    const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rLuck, rBad, modeLabel;

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
        rBad = batch[0]; rLuck = batch[runs-1];
    } else {
        modeLabel = "Quick Sim (Estimate)";
        rAvg = runCombatSim(setup, 'average', 'average');
        rLuck = runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave);
        rBad = runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave);
    }

    const screen = document.getElementById('result-screen'); screen.classList.remove('hidden');
    const getScore = (r) => ( (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / (r.startDef||1) ) - ( (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / (r.startAtk||1) );
    const sMin = getScore(rLuck), sMax = getScore(rBad);
    document.getElementById('luck-bar-inner').style.left = ((Math.min(sMin, sMax) + 1) * 50) + "%";
    document.getElementById('luck-bar-inner').style.width = Math.max(1.5, Math.abs(sMax - sMin) * 50) + "%";
    
    document.getElementById('res-atk-total').innerHTML = `<span>${Math.round(rAvg.m_cur.inf+rAvg.m_cur.cav+rAvg.m_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(rBad.m_cur.inf+rBad.m_cur.cav+rBad.m_cur.arc).toLocaleString()} - ${Math.round(rLuck.m_cur.inf+rLuck.m_cur.cav+rLuck.m_cur.arc).toLocaleString()}</div>`;
    document.getElementById('res-def-total').innerHTML = `<span>${Math.round(rAvg.e_cur.inf+rAvg.e_cur.cav+rAvg.e_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(rLuck.e_cur.inf+rLuck.e_cur.cav+rLuck.e_cur.arc).toLocaleString()} - ${Math.round(rBad.e_cur.inf+rBad.e_cur.cav+rBad.e_cur.arc).toLocaleString()}</div>`;
    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2">[ATTACKER BUFFS]</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + `<div class="text-red-500 font-black mb-2 mt-4">[DEFENDER BUFFS]</div>` + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    document.getElementById('result-waves').innerText = `Simulation complete after ${rAvg.wave} waves`;
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

window.runOptimizer = (mode) => {
    const setup = gatherSetup(); const atkTotal = 1000000;
    let dataPoints = { a:[], b:[], c:[], z:[] }, best = { form:[0,0,0], score:-Infinity };
    let defenders = [];
    if(mode==='meta') { for(let i=0; i<=100; i+=10) for(let j=0; j<=100-i; j+=10) defenders.push({inf:i/100, cav:j/100, arc:(100-i-j)/100}); }
    else if(mode==='current') { const d=setup.def.batches.reduce((s,b)=>({inf:s.inf+b.inf,cav:s.cav+b.cav,arc:s.arc+b.arc}),{inf:0,cav:0,arc:0}); const t=d.inf+d.cav+d.arc||1; defenders.push({inf:d.inf/t,cav:d.cav/t,arc:d.arc/t}); }
    else defenders.push({inf:1,cav:0,arc:0});

    for (let i = 20; i <= 100; i += 2) {
        for (let j = 0; j <= 100 - i; j += 2) {
            let k = 100-i-j; let totalNet = 0; let wins = 0;
            defenders.forEach(d => {
                let s = JSON.parse(JSON.stringify(setup));
                s.atk.batches = [{ tier:10, tg:3, inf:i*10000, cav:j*10000, arc:k*10000 }];
                if(mode!=='bear') s.def.batches = [{ tier:10, tg:3, inf:d.inf*atkTotal, cav:d.cav*atkTotal, arc:d.arc*atkTotal }];
                // isOptimizing = true forces raw survivors (prevents binary 1/0 result)
                const r = runCombatSim(s, 'average', 'average', 100, mode==='bear', true);
                let outcome = mode==='bear' ? r.totalDmg : (r.m_cur.inf+r.m_cur.cav+r.m_cur.arc) - (r.e_cur.inf+r.e_cur.cav+r.e_cur.arc);
                if(outcome > 0) wins++; totalNet += outcome;
            });
            const score = mode === 'meta' ? (wins/defenders.length) : totalNet;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(score);
            if (score > best.score) best = { score, form: [i,j,k] };
        }
    }
    const plotId = mode==='bear'?'bear-plot':'ternary-plot';
    Plotly.newPlot(plotId, [{ type:'scatterternary', a:dataPoints.a, b:dataPoints.b, c:dataPoints.c, mode:'markers', marker:{ color:dataPoints.z, colorscale:'Hot', size:10, symbol:'square' }, hovertemplate: 'Inf: %{a}<br>Cav: %{b}<br>Arc: %{c}<extra></extra>' }], { ternary: { sum:100, aaxis:{title:'Infantry'}, baxis:{title:'Cavalry'}, caxis:{title:'Archer'} }, paper_bgcolor:'rgba(0,0,0,0)', font:{color:'#64748b'}, margin:{l:0,r:0,t:40,b:0} });
    
    if(mode==='bear') { 
        document.getElementById('bear-total-dmg').innerText = Math.round(best.score).toLocaleString(); 
        document.getElementById('bear-best-form').innerText = `Best Split: ${best.form[0]}% Inf / ${best.form[1]}% Cav / ${best.form[2]}% Arc`;
    } else {
        document.getElementById('opt-best-form').innerText = `${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
        document.getElementById('opt-best-score').innerText = `Survival Margin: +${Math.round(best.score).toLocaleString()} troops`;
    }
};

window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if(unlocked.length < 3) return alert("Unlock heroes in the roster.");
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden'); resArea.innerHTML = '';
    
    const byType = { Inf: [], Cav: [], Arc: [] };
    unlocked.forEach(n => byType[HEROES[n].type].push(n));

    const scens = [
        {l:"Solo Attack", c:"off", j:false, w:false},
        {l:"Solo Defense", c:"def", j:false, w:true},
        {l:"Rally w/ Joiners", c:"off", j:true, w:true},
        {l:"Garrison w/ Joiners", c:"def", j:true, w:true}
    ];

    scens.forEach(s => {
        let best = { leaders: [], joiners: [], score: 0 };
        for (let i of (byType.Inf.length?byType.Inf:["None"])) 
        for (let c of (byType.Cav.length?byType.Cav:["None"])) 
        for (let a of (byType.Arc.length?byType.Arc:["None"])) {
            const trio = [i, c, a].filter(n => n !== "None");
            if(trio.length === 0) continue;

            let joiners = [];
            if (s.j) {
                // FIXED: We no longer filter out leaders. Anyone unlocked can be a joiner.
                for (let slot = 0; slot < 4; slot++) {
                    let bestJ = unlocked.map(n => ({ n, i: calcPowerScore(trio, [...joiners, n], s.c, s.w) })).sort((a,b)=>b.i-a.i)[0].n;
                    joiners.push(bestJ);
                }
            }
            const score = calcPowerScore(trio, joiners, s.c, s.w);
            if (score > best.score) best = { leaders: trio, joiners, score };
        }

        const card = document.createElement('div');
        card.className = "glass-card p-6 border-t-2 border-blue-500 flex justify-between items-center h-28";
        card.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="space-y-1">
                    <div class="text-[9px] font-black text-blue-400 uppercase tracking-widest">${s.l}</div>
                    <div class="flex -space-x-2">
                        ${best.leaders.map(n => `<img src="./assets/${n.toLowerCase()}.png" class="w-12 h-12 rounded-full border-2 border-blue-500 bg-slate-900 shadow-lg" title="${n}">`).join('')}
                    </div>
                </div>
                ${s.j ? `
                <div class="flex -space-x-1 opacity-50 scale-90 origin-left">
                    ${best.joiners.map(n => `<img src="./assets/${n.toLowerCase()}.png" class="w-10 h-10 rounded-full border border-slate-700 bg-slate-950">`).join('')}
                </div>` : ''}
            </div>
            <div class="text-right">
                <div class="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-tighter">Multiplier</div>
                <div class="text-3xl font-black text-white">${best.score.toFixed(3)}x</div>
            </div>`;
        resArea.appendChild(card);
    });
};

// --- THE CORRECTED BRAIN: MULTIPLIER SCORING ---
function calcPowerScore(leaders, joiners, ctx, allowWidgets) {
    let skillBuckets = {}; // { 101: sumEV, 102: sumEV ... }
    let widgetBuckets = { attack: 0, defense: 0, lethality: 0, health: 0 };
    
    // Group occurrences of specific hero-skills to handle Independence vs Additivity
    const heroSkillCounts = {}; 

    // Solo Attack Rule: Widgets are 0 if no joiners in offense
    const widgetsActive = (ctx === 'def' || joiners.length > 0) && allowWidgets;

    // 1. Map all 7 heroes (Leaders get all skills, Joiners get S1)
    const allHeroes = [
        ...leaders.map(n => ({name: n, isL: true})), 
        ...joiners.map(n => ({name: n, isL: false}))
    ];

    allHeroes.forEach(hero => {
        if (hero.name === "None" || !hero.name) return;
        const d = HEROES[hero.name];
        const r = roster[hero.name] || {s1:5, s2:5, s3:5, widget:10};

        // A. Handle Widgets (Global Layer - Additive within same stat type)
        if (hero.isL && d.widget && d.widget.context === ctx && widgetsActive) {
            widgetBuckets[d.widget.stat] += WIDGET_GROWTH[r.widget];
        }

        // B. Collect Skills (Differentiate Hilde S1 from Hilde S2)
        const skillLimit = hero.isL ? d.skills.length : 1;
        for (let i = 0; i < skillLimit; i++) {
            const skillKey = `${hero.name}_s${i}`;
            const s = d.skills[i];
            const x = s.values[r[`s${i+1}`] - 1];
            
            if (!heroSkillCounts[skillKey]) {
                heroSkillCounts[skillKey] = { 
                    p: s.getChance(x), 
                    m: s.getMagnitude(x), 
                    ids: s.ids, 
                    duration: s.duration || 0,
                    count: 0 
                };
            }
            heroSkillCounts[skillKey].count++;
        }
    });

    // 2. Resolve Skill Buckets
    for (const key in heroSkillCounts) {
        const item = heroSkillCounts[key];
        let ev;

        if (item.p >= 1.0) {
            // PASSIVE RULE: Simple additivity (n * m)
            ev = Array.isArray(item.m) ? item.m.map(v => v * item.count) : item.m * item.count;
        } else {
            // CHANCE RULE: Independence (1 - (1-p)^n)
            const pAny = 1 - Math.pow(1 - item.p, item.count);
            // Uptime logic for duration-based chance skills
            const uptime = item.duration === 0 ? pAny : (1 - Math.pow(1 - pAny, item.duration));
            ev = Array.isArray(item.m) ? item.m.map(v => uptime * v) : uptime * item.m;
        }

        item.ids.forEach((id, idx) => {
            const val = Array.isArray(ev) ? ev[idx] : ev;
            skillBuckets[id] = (skillBuckets[id] || 0) + val;
        });
    }

    // 3. Final Multiplicative Cross-Product
    // Baseline 1.0x Interaction Constant
    let totalMult = 1.00; 

    // Step 1: Multiply Widget Groups (1 + sumStatA) * (1 + sumStatB)...
    Object.values(widgetBuckets).forEach(v => {
        if (v > 0) totalMult *= (1 + v);
    });

    // Step 2: Multiply Skill ID Buckets (1 + sumEV101) * (1 + sumEV102)...
    Object.values(skillBuckets).forEach(v => {
        if (v > 0) totalMult *= (1 + v);
    });

    return totalMult;
}
function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: parseInt(el.querySelector('.batch-tier').value), tg: parseInt(el.querySelector('.batch-tg').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    return {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes }
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
    document.getElementById('toggle-details-btn').innerText = isHidden ? 'View Combat Buffs +' : 'Hide Combat Buffs -';
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);
