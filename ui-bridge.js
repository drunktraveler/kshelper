import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH, WIDGET_STATS } from './constants.js';
import { UNITS } from './units.js'; 

const sumTroops = (c) => (c.inf || 0) + (c.cav || 0) + (c.arc || 0);

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };
let optRole = 'atk'; 

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5 })) },
    bear: { heroes: Array(3).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5 })) }
};

window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; });
    const mainSel = document.getElementById('hero-select');
    if (mainSel) {
        mainSel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { mainSel.innerHTML += `<option value="${n}">${n}</option>`; });
        mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index, activeSlot.side);
    }
    buildStatTable(); initFormationGrids(); 
    window.addBatch('atk', true); window.addBatch('def', true);
    window.updateGrids(); renderRosterUI(); 
    window.showTab('battle');
};

function getLiveSetup(side, formationOverride = null) {
    const stats = {};
    ['inf', 'cav', 'arc'].forEach(u => {
        ['att', 'def', 'leth', 'hp'].forEach(s => {
            const el = document.querySelector(`input[data-side="${side}"][data-stat="${u}_${s}"]`);
            stats[`${u}_${s}`] = parseFloat(el?.value) || 0;
        });
    });

    const getVal = (u, type) => {
        const optEl = document.querySelector(`.opt-${side}-${u}-${type}`);
        const simEl = document.querySelector(`#${side}-batch-container .batch-${type}-${u}`);
        const raw = optEl?.value ?? simEl?.value;
        return (raw !== undefined && raw !== null && raw !== "") ? parseInt(raw) : (type === 'tier' ? 10 : 3);
    };

    let total = 0;
    const processedBatches = [];
    document.querySelectorAll(`#${side}-batch-container > div`).forEach(row => {
        const b = {
            inf: parseFloat(row.querySelector('.batch-inf').value) || 0,
            cav: parseFloat(row.querySelector('.batch-cav').value) || 0,
            arc: parseFloat(row.querySelector('.batch-arc').value) || 0,
            inf_tier: parseInt(row.querySelector('.batch-tier-inf').value),
            inf_tg: parseInt(row.querySelector('.batch-tg-inf').value),
            cav_tier: parseInt(row.querySelector('.batch-tier-cav').value),
            cav_tg: parseInt(row.querySelector('.batch-tg-cav').value),
            arc_tier: parseInt(row.querySelector('.batch-tier-arc').value),
            arc_tg: parseInt(row.querySelector('.batch-tg-arc').value)
        };
        total += (b.inf + b.cav + b.arc);
        processedBatches.push(b);
    });

    if (formationOverride) {
        const collapsed = {
            inf: (formationOverride[0]/100) * (total || 1000000),
            cav: (formationOverride[1]/100) * (total || 1000000),
            arc: (formationOverride[2]/100) * (total || 1000000),
            inf_tier: getVal('inf', 'tier'), inf_tg: getVal('inf', 'tg'),
            cav_tier: getVal('cav', 'tier'), cav_tg: getVal('cav', 'tg'),
            arc_tier: getVal('arc', 'tier'), arc_tg: getVal('arc', 'tg')
        };
        return { heroes: state[side].heroes, stats, batches: [collapsed] };
    }
    return { heroes: state[side].heroes, stats, batches: processedBatches };
}

window.runOptimizer = async (mode) => {
    const isBear = mode === 'bear';
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    resArea.innerText = "Simulating...";

    setTimeout(() => {
        let dataPoints = { a: [], b: [], c: [], z: [] };
        let best = { form: [0, 0, 0], wins: -1, margin: -Infinity };
        const mySide = isBear ? 'atk' : optRole;
        const oppSide = mySide === 'atk' ? 'def' : 'atk';

        let oppSet = [];
        if (mode === 'current') oppSet.push(getLiveSetup(oppSide));
        else if (mode === 'meta') [[50,20,30], [10,10,80], [60,10,30], [33,33,34], [50,0,50], [60,40,0], [10,80,10]].forEach(f => oppSet.push(getLiveSetup(oppSide, f)));
        else if (mode === 'custom') oppSet.push(getLiveSetup(oppSide, [parseFloat(document.getElementById('custom-inf').value)||33, parseFloat(document.getElementById('custom-cav').value)||33, parseFloat(document.getElementById('custom-arc').value)||34]));

        for (let i = 0; i <= 100; i += 2) {
            for (let j = 0; j <= 100 - i; j += 2) {
                let k = 100 - i - j;
                const mySetup = getLiveSetup(mySide, [i, j, k]);
                let curWins = 0, totalMargin = 0;

                oppSet.forEach(oSetup => {
                    const simS = { atk: (mySide === 'atk' ? mySetup : oSetup), def: (mySide === 'def' ? mySetup : oSetup) };
                    const res = runCombatSim(simS, 'average', 'average', 1000, isBear, true);
                    if (isBear) { totalMargin += res.totalDmg; }
                    else {
                        const mS = sumTroops(mySide === 'atk' ? res.m_cur : res.e_cur);
                        const oS = sumTroops(mySide === 'atk' ? res.e_cur : res.m_cur);
                        if (mS > oS) curWins++;
                        totalMargin += (mS - oS);
                    }
                });

                const finalScore = totalMargin / oppSet.length;
                if (isBear) {
                    if (finalScore > best.margin) best = { form: [i, j, k], wins: 0, margin: finalScore };
                    dataPoints.z.push(finalScore);
                } else {
                    if (curWins > best.wins || (curWins === best.wins && finalScore > best.margin)) {
                        best = { form: [i, j, k], wins: curWins, margin: finalScore };
                    }
                    dataPoints.z.push(curWins * 1000000 + finalScore);
                }
                dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k);
            }
        }
        renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
        resArea.innerText = best.form.join(' / ');
        scoreArea.innerHTML = isBear ? `Total Damage: ${Math.round(best.margin).toLocaleString()}` : 
            `${mode === 'meta' ? 'Wins: '+best.wins+'/7 | ' : ''}Net: ${Math.round(best.margin).toLocaleString()}`;
    }, 50);
};

window.handleSimulation = async () => {
    const setup = { atk: getLiveSetup('atk'), def: getLiveSetup('def') };
    const res = runCombatSim(setup, 'average', 'average');
    const sA = Math.round(sumTroops(res.m_cur)), sD = Math.round(sumTroops(res.e_cur));
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = sA.toLocaleString();
    document.getElementById('res-def-total').innerText = sD.toLocaleString();
    const bar = document.getElementById('luck-bar-inner');
    const totalInput = sumTroops(setup.atk.batches[0]) + sumTroops(setup.def.batches[0]);
    const score = (sA - sD) / (totalInput || 1);
    bar.style.left = "50%"; bar.style.width = Math.abs(score * 50) + "%";
    bar.style.transform = score < 0 ? "translateX(-100%)" : "none";
};

window.updateGrids = () => {
    ['atk','def','bear'].forEach(side => {
        const containers = document.querySelectorAll(`.${side}-hero-grid`);
        containers.forEach(cont => {
            cont.innerHTML = '';
            state[side].heroes.forEach((h, i) => {
                const div = document.createElement('div');
                const isLead = (side === 'bear' || i < 3);
                div.className = `hero-circle ${isLead ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
                div.innerHTML = h.name !== 'None' ? `<img src="./assets/${h.name.toLowerCase()}.png" class="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none">` : `<span class="pointer-events-none">${side==='bear'?['I','C','A'][i]:(i+1)}</span>`;
                div.onclick = () => window.openHeroModal(side, i);
                cont.appendChild(div);
            });
        });
    });
};

function buildStatTable() {
    const table = document.getElementById('stat-table');
    const units = ["inf", "cav", "arc"], cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    table.innerHTML = '';
    units.forEach(u => cats.forEach(c => {
        const key = `${u}_${c.k}`;
        const row = document.createElement('div'); row.className = "stat-row";
        row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" oninput="window.updateSharedStat('atk','${key}',this.value,'sim')" class="text-emerald-500 font-bold w-16 bg-transparent text-center" value="1000"><div class="text-[9px] font-black text-slate-500 flex-grow text-center uppercase">${u} ${c.l}</div><input type="number" data-side="def" data-stat="${key}" oninput="window.updateSharedStat('def','${key}',this.value,'sim')" class="text-red-500 font-bold w-16 bg-transparent text-center" value="1000">`;
        table.appendChild(row);
    }));
}

function initFormationGrids() {
    ['atk', 'def'].forEach(side => {
        const sg = document.getElementById(`opt-${side}-stats-grid`);
        const tg = document.getElementById(`opt-${side}-tiers`);
        if (!sg || !tg) return;
        sg.innerHTML = ''; tg.innerHTML = '';
        ['inf', 'cav', 'arc'].forEach(u => {
            ['att', 'def', 'leth', 'hp'].forEach(s => {
                const k = `${u}_${s}`;
                sg.innerHTML += `<div><label class="text-[7px] text-slate-500 font-black block">${u} ${s}</label><input type="number" value="1000" class="opt-${side}-${k} input-dark !py-1 !text-[10px]" oninput="window.updateSharedStat('${side}','${k}',this.value,'opt')"></div>`;
            });
            tg.innerHTML += `<div class="flex flex-col gap-1"><label class="text-[7px] text-slate-500 font-black">${u} T/TG</label><div class="flex gap-1"><select class="opt-${side}-${u}-tier bg-slate-900 text-[9px] border border-slate-700 rounded text-slate-300" onchange="window.updateSharedTier('${side}','${u}','tier',this.value,'opt')">${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v==10?'selected':''}>T${v}</option>`).join('')}</select><select class="opt-${side}-${u}-tg bg-slate-900 text-[9px] border border-slate-700 rounded text-slate-300" onchange="window.updateSharedTier('${side}','${u}','tg',this.value,'opt')">${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v==3?'selected':''}>TG${v}</option>`).join('')}</select></div></div>`;
        });
    });
}

window.updateSharedStat = (side, key, val, origin) => {
    const target = origin === 'sim' ? document.querySelector(`.opt-${side}-${key}`) : document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`);
    if (target && target.value !== val) target.value = val;
    if (origin === 'opt') window.updateStatColors(document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`));
};

window.updateSharedTier = (side, unit, type, val, origin) => {
    const target = origin === 'sim' ? document.querySelector(`.opt-${side}-${unit}-${type}`) : document.querySelector(`#${side}-batch-container .batch-${type}-${unit}`);
    if (target && target.value !== val) target.value = val;
};

window.updateFormation = (side) => {
    let i=0, c=0, a=0;
    document.querySelectorAll(`#${side}-batch-container > div`).forEach(row => {
        i += parseFloat(row.querySelector(`.batch-inf`).value) || 0;
        c += parseFloat(row.querySelector(`.batch-cav`).value) || 0;
        a += parseFloat(row.querySelector(`.batch-arc`).value) || 0;
    });
    const t = i+c+a || 1;
    document.querySelectorAll(`.${side}-f-bar`).forEach(bar => { bar.children[0].style.width=(i/t*100)+'%'; bar.children[1].style.width=(c/t*100)+'%'; bar.children[2].style.width=(a/t*100)+'%'; });
    document.querySelectorAll(`.${side}-inf-pct`).forEach(el => el.innerText = Math.round(i/t*100)+'%');
    document.querySelectorAll(`.${side}-cav-pct`).forEach(el => el.innerText = Math.round(c/t*100)+'%');
    document.querySelectorAll(`.${side}-arc-pct`).forEach(el => el.innerText = Math.round(a/t*100)+'%');
};

window.addBatch = (side, initial = false) => {
    const cont = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-1 mb-2";
    const types = [{l:'Inf', k:'inf', c:'text-blue-400'}, {l:'Cav', k:'cav', c:'text-amber-400'}, {l:'Arc', k:'arc', c:'text-emerald-400'}];
    let html = `<div class="flex justify-between items-center"><span class="text-[8px] font-bold text-slate-600 uppercase">Batch</span>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[8px]">DEL</button>`:''}</div>`;
    types.forEach(t => { html += `<div class="grid grid-cols-12 gap-1 items-center"><div class="col-span-3 text-[9px] font-bold ${t.c}">${t.l}</div><select class="batch-tier-${t.k} col-span-2 bg-slate-900 text-[9px] border border-slate-800 rounded" onchange="window.updateSharedTier('${side}','${t.k}','tier',this.value,'sim')"><option value="11">T11</option><option value="10" selected>T10</option><option value="9">T9</option></select><select class="batch-tg-${t.k} col-span-2 bg-slate-900 text-[9px] border border-slate-800 rounded" onchange="window.updateSharedTier('${side}','${t.k}','tg',this.value,'sim')"><option value="5">TG5</option><option value="3" selected>TG3</option><option value="0">TG0</option></select><input type="number" class="batch-${t.k} col-span-5 input-dark !text-right !py-0" value="${initial ? (t.k==='inf'?500000:250000) : 0}" oninput="window.updateFormation('${side}')"></div>`; });
    div.innerHTML = html; cont.appendChild(div); window.updateFormation(side);
};

window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        const el = document.getElementById(screens[k]); if (el) el.classList.toggle('hidden', k !== tab);
        const b = document.getElementById(btns[k]); if (b) b.className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold text-white shadow-lg" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
};

window.openHeroModal = (side, index) => {
    activeSlot = { side, index }; const h = state[side].heroes[index];
    modalTemp = { s1: h.s1, s2: h.s2, s3: h.s3 };
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index, side);
    document.getElementById('heroModal').classList.replace('hidden', 'flex');
};

function renderSkillsInModal(name, index, side) {
    const cont = document.getElementById('skill-inputs'); cont.innerHTML = '';
    if(name === "None") return;
    const h = HEROES[name]; const isLead = (side === 'bear' || index < 3);
    const max = isLead ? h.skills.length : 1;
    for(let i=0; i<max; i++) {
        cont.innerHTML += `<div class="mb-4"><div class="text-[9px] text-slate-500 font-black uppercase mb-1">${h.skills[i].name}</div>${renderLevelPicker(name, 's'+(i+1), modalTemp['s'+(i+1)], false)}</div>`;
    }
}

window.saveHeroConfig = () => {
    const name = document.getElementById('hero-select').value;
    state[activeSlot.side].heroes[activeSlot.index] = { name, ...modalTemp };
    window.updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

function renderLevelPicker(hero, key, current, isRoster) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const act = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${act}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return h + `</div>`;
}

window.updateModalLevel = (k, v) => { modalTemp[k] = v; renderSkillsInModal(document.getElementById('hero-select').value, activeSlot.index, activeSlot.side); };
window.updateRoster = (n,k,v) => { roster[n][k]=parseInt(v); localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); if(!grid) return; grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { roster[n].unlocked = !roster[n].unlocked; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 cursor-pointer ${r.unlocked ? 'border-blue-500' : 'opacity-40 border-transparent'}`;
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><img src="./assets/${n.toLowerCase()}.png" class="w-8 h-8 rounded-full border border-slate-700"><b>${n}</b></div>`;
        if(r.unlocked) h.skills.forEach((s,i) => { card.innerHTML += `<div class="mt-2 text-[8px] uppercase font-bold text-slate-500">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)], true)}`; });
        grid.appendChild(card);
    });
}

function renderTernary(id, data, best, isBear) {
    const traces = [{ type: 'scatterternary', a: data.a, b: data.b, c: data.c, mode: 'markers', marker: { color: data.z, colorscale: 'Viridis', size: 5, opacity: 0.8, showscale: false } }, { type: 'scatterternary', a: [best.form[0]], b: [best.form[1]], c: [best.form[2]], marker: { size: 18, symbol: 'star', color: '#00f2ff', line: { width: 1.5, color: '#080a0f' } } }];
    const layout = { ternary: { sum: 100, aaxis: { title: 'INF', titlefont: { color: '#3b82f6' } }, baxis: { title: 'CAV', titlefont: { color: '#f59e0b' } }, caxis: { title: 'ARC', titlefont: { color: '#10b981' } } }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 20, r: 20, t: 40, b: 20 }, showlegend: false, font: { family: 'Inter, sans-serif' } };
    Plotly.newPlot(id, traces, layout, { displayModeBar: false, responsive: true });
}

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};

document.addEventListener('DOMContentLoaded', window.init);
