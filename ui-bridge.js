import { HEROES } from './heroes.js';
import { runCombatSim } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) }
};
let activeSlot = { side: null, index: null };

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
    document.getElementById('hero-select').addEventListener('change', (e) => renderSkillsInModal(e.target.value, activeSlot.index));
    renderRosterUI();
    window.showTab('battle');
}

window.showTab = (tab) => {
    const screens = ['battle-tab', 'optimizer-screen', 'bear-tab', 'roster-tab'];
    screens.forEach(s => document.getElementById(s).classList.add('hidden'));
    const active = tab === 'battle' ? 'battle-tab' : (tab === 'formation' ? 'optimizer-screen' : tab + '-tab');
    document.getElementById(active).classList.remove('hidden');
};

// --- ELEGANT PICKERS ---
function renderLevelPicker(name, skillKey, currentVal, isRoster = true) {
    let html = `<div class="flex gap-1">`;
    for (let i = 1; i <= 5; i++) {
        const action = isRoster ? `window.updateRoster('${name}', '${skillKey}', ${i})` : `window.updateModalSkill('${skillKey}', ${i})`;
        html += `<button onclick="event.stopPropagation(); ${action}" class="w-6 h-6 rounded text-[10px] font-bold ${currentVal == i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return html + `</div>`;
}

function renderWidgetPicker(name, currentVal) {
    let html = `<div class="flex flex-wrap gap-1 max-w-[140px]">`;
    for (let i = 0; i <= 10; i++) {
        html += `<button onclick="event.stopPropagation(); window.updateRoster('${name}', 'widget', ${i})" class="w-5 h-5 rounded text-[8px] font-bold ${currentVal == i ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return html + `</div>`;
}

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { r.unlocked = !r.unlocked; saveRoster(); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3">${skillsHtml}${h.widget ? `<div class="pt-2 border-t border-slate-800"><span class="text-[8px] text-amber-500 font-black uppercase block mb-1">Widget Level</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>` : ''}`;
        grid.appendChild(card);
    });
}

window.updateRoster = (n, k, v) => { roster[n][k] = v; saveRoster(); renderRosterUI(); };
const saveRoster = () => localStorage.setItem('ks_roster', JSON.stringify(roster));

// --- BATTLE MODAL SKILLS ---
let modalTempLevels = { s1: 5, s2: 5, s3: 5 };
window.updateModalSkill = (key, val) => {
    modalTempLevels[key] = val;
    renderSkillsInModal(document.getElementById('hero-select').value, activeSlot.index);
};

function renderSkillsInModal(name, slot) {
    const container = document.getElementById('skill-inputs'); container.innerHTML = '';
    if (name === "None") return;
    const hInfo = HEROES[name]; const max = (slot < 3) ? hInfo.skills.length : 1;
    for (let i = 0; i < max; i++) {
        const div = document.createElement('div');
        div.innerHTML = `<div class="text-[9px] text-slate-500 font-black uppercase mb-1">${hInfo.skills[i].name}</div>${renderLevelPicker(name, 's'+(i+1), modalTempLevels['s'+(i+1)], false)}`;
        container.appendChild(div);
    }
}

window.openHeroModal = (side, index) => {
    activeSlot = { side, index }; const h = state[side].heroes[index];
    modalTempLevels = { s1: h.s1, s2: h.s2, s3: h.s3 };
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index);
    document.getElementById('heroModal').classList.replace('hidden', 'flex');
};

window.saveHeroConfig = () => {
    const { side, index } = activeSlot; const name = document.getElementById('hero-select').value;
    state[side].heroes[index] = { name, ...modalTempLevels, star: 5, sub: 0, widgetLv: roster[name]?.widget || 0 };
    updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

// --- SIMULATION ---
window.handleSimulation = async () => {
    const setup = gatherSetup();
    const simMode = document.getElementById('sim-mode-select').value;
    let rAvg, rBest, rWorst;

    if (simMode === 'monte-carlo') {
        const runs = 100; let batch = [];
        for (let i = 0; i < runs; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        batch.sort((a, b) => (a.m_cur.inf + a.m_cur.cav + a.m_cur.arc) - (b.m_cur.inf + b.m_cur.cav + b.m_cur.arc));
        const atkWins = batch.filter(r => (r.m_cur.inf+r.m_cur.cav+r.m_cur.arc) > (r.e_cur.inf+r.e_cur.cav+r.e_cur.arc)).length;
        const winner = atkWins >= 50 ? 'atk' : 'def';
        rAvg = {
            m_cur: { inf: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.inf,0)/runs:0, cav: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.cav,0)/runs:0, arc: winner==='atk'?batch.reduce((s,r)=>s+r.m_cur.arc,0)/runs:0 },
            e_cur: { inf: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.inf,0)/runs:0, cav: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.cav,0)/runs:0, arc: winner==='def'?batch.reduce((s,r)=>s+r.e_cur.arc,0)/runs:0 },
            wave: Math.round(batch.reduce((s,r)=>s+r.wave,0)/runs),
            atk_mults: batch[Math.floor(runs/2)].atk_mults, def_mults: batch[Math.floor(runs/2)].def_mults,
            startAtk: batch[0].startAtk, startDef: batch[0].startDef
        };
        rWorst = batch[0]; rBest = batch[runs-1];
    } else {
        rAvg = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave);
        rWorst = runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave);
    }

    document.getElementById('result-screen').classList.remove('hidden');
    const aS = Math.round(rAvg.m_cur.inf+rAvg.m_cur.cav+rAvg.m_cur.arc), dS = Math.round(rAvg.e_cur.inf+rAvg.e_cur.cav+rAvg.e_cur.arc);
    document.getElementById('res-atk-total').innerText = aS.toLocaleString();
    document.getElementById('res-def-total').innerText = dS.toLocaleString();
    document.getElementById('result-waves').innerText = `Simulation ended after ${rAvg.wave} waves`;
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

function gatherSetup() {
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collect = (side) => Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({ tier: parseInt(el.querySelector('.batch-tier').value), tg: parseInt(el.querySelector('.batch-tg').value), inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    return {
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes.map(h => ({ ...h, starBonus: GROWTH_TEMPLATES[HEROES[h.name]?.template || 'SEASON_1'][(h.star*6)+h.sub] })) },
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes.map(h => ({ ...h, starBonus: GROWTH_TEMPLATES[HEROES[h.name]?.template || 'SEASON_1'][(h.star*6)+h.sub] })) }
    };
}

// (Helper updateGrids and addBatch remain same as your provided versions)
document.addEventListener('DOMContentLoaded', init);
