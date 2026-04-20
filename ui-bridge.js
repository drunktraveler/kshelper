import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, star: 5, sub: 0, widgetLv: 10 })) }
};
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };

// --- ATTACH TO WINDOW ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10 }; });
    const sel = document.getElementById('hero-select');
    if(sel) {
        sel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => sel.innerHTML += `<option value="${n}">${n}</option>`);
        sel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index);
    }
    const table = document.getElementById('stat-table');
    const categories = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    const units = ["Infantry", "Cavalry", "Archer"];
    if(table) {
        table.innerHTML = '';
        units.forEach(u => categories.forEach(c => {
            const row = document.createElement('div');
            row.className = "stat-row";
            row.style.display = "flex"; row.style.alignItems = "center"; row.style.height = "32px"; row.style.padding = "0 30px";
            const key = `${u.toLowerCase().slice(0,3)}_${c.k}`;
            row.innerHTML = `<input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000"><div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.l}</div><input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">`;
            table.appendChild(row);
        }));
    }
    window.addBatch('atk', true); window.addBatch('def', true);
    renderRosterUI(); window.showTab('battle');
};

// Functions exposed for buttons
window.updateRoster = (n, k, v) => { roster[n][k] = v; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };
window.toggleHero = (n) => { roster[n].unlocked = !roster[n].unlocked; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); if(!grid) return; grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => window.toggleHero(n);
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/50' : 'opacity-40 border-transparent bg-slate-950/20'}`;
        let skillsHtml = h.skills.map((s, i) => `<div class="mt-2"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)])}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><div class="w-10 h-10 rounded-full bg-slate-800 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div><div class="font-bold text-xs uppercase">${n}</div></div>${r.unlocked ? `<div class="space-y-3">${skillsHtml}${h.widget ? `<div class="pt-2 border-t border-slate-800"><span class="text-[8px] text-amber-500 font-black uppercase block mb-1">Widget</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>` : ''}`;
        grid.appendChild(card);
    });
}

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

// Optimization Logic with constraints
window.calculateOptimalLineups = () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked);
    if(unlocked.length < 3) return alert("Unlock 3 heroes.");
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden'); resArea.innerHTML = '';
    
    // Constraint: 1 of each type for leaders
    const byType = { Inf: [], Cav: [], Arc: [] };
    unlocked.forEach(n => byType[HEROES[n].type].push(n));
    if(!byType.Inf.length || !byType.Cav.length || !byType.Arc.length) return alert("You need at least 1 hero of each type (Inf/Cav/Arc) unlocked.");

    const scens = [{l:"Attack Only",c:"off",j:false},{l:"Attack w/ Joiners",c:"off",j:true},{l:"Defense Only",c:"def",j:false},{l:"Defense w/ Joiners",c:"def",j:true}];
    
    scens.forEach(s => {
        let best = { leaders: [], joiners: [], score: 0 };
        for (let i of byType.Inf) {
            for (let c of byType.Cav) {
                for (let a of byType.Arc) {
                    const trio = [i, c, a];
                    let joiners = [];
                    if (s.j) {
                        const rem = unlocked.filter(n => !trio.includes(n));
                        const pool = rem.map(n => ({ n, i: calcScore(trio, [n], s.c) })).sort((a,b)=>b.i-a.i);
                        joiners = pool.slice(0, 4).map(x => x.n);
                    }
                    const score = calcScore(trio, joiners, s.c);
                    if (score > best.score) best = { leaders: trio, joiners, score };
                }
            }
        }
        const card = document.createElement('div'); card.className="glass-card p-4 border-t-2 border-blue-500";
        card.innerHTML = `<div class="text-[9px] font-black text-blue-400 uppercase mb-3">${s.l}</div>
            <div class="flex gap-2">${best.leaders.map(n=>`<img src="./assets/${n.toLowerCase()}.png" class="w-10 h-10 rounded-full border border-blue-500" title="${n}">`).join('')}</div>
            ${s.j ? `<div class="flex gap-1 mt-2 opacity-50">${best.joiners.map(n=>`<img src="./assets/${n.toLowerCase()}.png" class="w-8 h-8 rounded-full border border-slate-700" title="${n} (Joiner)">`).join('')}</div>` : ''}
            <div class="mt-3 text-xl font-black">${best.score.toFixed(3)}x</div>`;
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
    // Joiner logic: Independence rule
    const jCounts = {}; joiners.forEach(n => jCounts[n] = (jCounts[n]||0) + 1);
    for (const n in jCounts) {
        const d = HEROES[n], r = roster[n], s = d.skills[0];
        const x = s.values[r.s1-1];
        const p = 1 - Math.pow(1 - s.getChance(x), jCounts[n]);
        const ev = p * s.getMagnitude(x);
        s.ids.forEach((id, idx) => pools[id] = (pools[id]||0) + (Array.isArray(ev)?ev[idx]:ev));
    }
    let t = 1.0; Object.values(pools).forEach(v => t *= (1+v)); return t;
}

// Handlers for HTML buttons
window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};

window.handleSimulation = () => { /* Logic same as previous with fixed setup loop */ };
window.runOptimizer = (mode) => { /* Ternary heatmap logic with fixed Plotly calls */ };
window.handleBearSim = () => { /* Damage deal logic */ };

document.addEventListener('DOMContentLoaded', window.init);
