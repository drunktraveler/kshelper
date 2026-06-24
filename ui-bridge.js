import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';
import { WIDGET_STATS } from './widgets.js';
import { UNITS } from './units.js'; 

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let nakedStats = JSON.parse(localStorage.getItem('ks_naked_stats')) || null;
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };
let optRole = 'atk'; 

const META_FORMATIONS = [
    [50,20,30], [60,20,20], [40,20,40], [33,33,34], [10,10,80], [50,0,50], [55,15,30], [50,10,40], [60, 40, 0]
];

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) },
    bear: { heroes: Array(3).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5, starIndex: 30, widgetLv: 10 })) }
};

// --- 1. INITIALIZATION ---
window.init = () => {
    Object.keys(HEROES).forEach(n => { 
        if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; 
    });
    
    const mainSel = document.getElementById('hero-select');
    if (mainSel) {
        mainSel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { mainSel.innerHTML += `<option value="${n}">${n}</option>`; });
        mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index, activeSlot.side);
    }
    
    buildStatTable();
    window.addBatch('atk', true); 
    window.addBatch('def', true);
    window.updateGrids(); 
    renderRosterUI(); 
    if(nakedStats) renderNakedStats();
    window.showTab('battle');
};

function sumTroops(counts) {
    if (!counts) return 0;
    return (counts.inf || 0) + (counts.cav || 0) + (counts.arc || 0);
}

window.syncFormationUI = () => {
    const sides = ['atk', 'def'];
    const stats = ['att', 'def', 'leth', 'hp'];
    const units = ['inf', 'cav', 'arc'];

    sides.forEach(side => {
        const heroCont = document.getElementById(`opt-${side}-heroes`);
        if (heroCont) {
            heroCont.innerHTML = '';
            state[side].heroes.slice(0,3).forEach(h => {
                const div = document.createElement('div');
                div.className = `w-10 h-10 rounded-full border-2 ${side==='atk'?'border-emerald-500/30':'border-red-500/30'} bg-slate-900 overflow-hidden`;
                div.innerHTML = h.name !== "None" ? `<img src="./assets/${h.name.toLowerCase()}.png" class="w-full h-full object-cover">` : '';
                heroCont.appendChild(div);
            });
        }

        const statGrid = document.getElementById(`opt-${side}-stats-grid`);
        if (statGrid) {
            statGrid.innerHTML = '';
            units.forEach(u => {
                stats.forEach(s => {
                    const key = `${u}_${s}`;
                    const val = document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`)?.value || 1000;
                    statGrid.innerHTML += `
                        <div>
                            <label class="text-[7px] text-slate-500 uppercase font-black block mb-1">${u} ${s}</label>
                            <input type="number" step="0.1" value="${val}" oninput="window.globalStatUpdate('${side}', '${key}', this.value)" class="input-dark !py-1 !text-[10px]">
                        </div>`;
                });
            });
        }

        const tierGrid = document.getElementById(`opt-${side}-tiers`);
        if (tierGrid) {
            tierGrid.innerHTML = '';
            units.forEach(u => {
                const t = document.querySelector(`#${side}-batch-container .batch-tier-${u}`)?.value || 10;
                const tg = document.querySelector(`#${side}-batch-container .batch-tg-${u}`)?.value || 3;
                tierGrid.innerHTML += `
                    <div class="flex flex-col gap-1">
                        <label class="text-[7px] text-slate-500 uppercase font-black">${u} tier/tg</label>
                        <div class="flex gap-1">
                            <select onchange="window.globalTierUpdate('${side}', '${u}', 'tier', this.value)" class="bg-slate-900 text-[9px] border border-slate-700 rounded px-1 font-bold text-slate-300 outline-none flex-grow">
                                ${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v==t?'selected':''}>T${v}</option>`).join('')}
                            </select>
                            <select onchange="window.globalTierUpdate('${side}', '${u}', 'tg', this.value)" class="bg-slate-900 text-[9px] border border-slate-700 rounded px-1 font-bold text-slate-300 outline-none flex-grow">
                                ${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v==tg?'selected':''}>TG${v}</option>`).join('')}
                            </select>
                        </div>
                    </div>`;
            });
        }
    });
};

window.globalStatUpdate = (side, key, val) => {
    const el = document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`);
    if (el) el.value = val;
    window.syncFormationUI();
};

window.globalTierUpdate = (side, unit, type, val) => {
    const el = document.querySelector(`#${side}-batch-container .batch-${type}-${unit}`);
    if (el) el.value = val;
    window.syncFormationUI();
};

window.syncOptimizerUI = () => {
    const mySide = optRole;
    const oppSide = optRole === 'atk' ? 'def' : 'atk';

    const myLbl = document.getElementById('opt-my-label');
    const oppLbl = document.getElementById('opt-opp-label');
    if (myLbl) myLbl.innerText = mySide.toUpperCase();
    if (oppLbl) oppLbl.innerText = oppSide.toUpperCase();

    const renderMinis = (side, targetId) => {
        const container = document.getElementById(targetId);
        if (!container) return;
        container.innerHTML = '';
        state[side].heroes.slice(0,3).forEach(h => {
            const div = document.createElement('div');
            div.className = `w-8 h-8 rounded-full border border-slate-700 bg-slate-900 overflow-hidden relative`;
            if (h.name !== "None") {
                div.innerHTML = `<img src="./assets/${h.name.toLowerCase()}.png" class="w-full h-full object-cover">`;
            } else { div.innerHTML = `<span class="absolute inset-0 flex items-center justify-center text-[8px] text-slate-700">?</span>`; }
            container.appendChild(div);
        });
    };

    renderMinis(mySide, 'opt-my-heroes');
    renderMinis(oppSide, 'opt-opp-heroes');
};

window.setOptRole = (role) => {
    optRole = role;
    const atkBtn = document.getElementById('opt-role-atk');
    const defBtn = document.getElementById('opt-role-def');
    if (atkBtn) atkBtn.className = role === 'atk' ? "px-3 py-1 text-[10px] font-bold rounded bg-blue-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
    if (defBtn) defBtn.className = role === 'def' ? "px-3 py-1 text-[10px] font-bold rounded bg-red-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
    window.syncOptimizerUI();
};

function buildStatTable() {
    const containers = [
        { el: document.getElementById('stat-table'), side: 'battle' },
        { el: document.getElementById('opt-stat-table'), side: 'opt' }
    ];
    
    containers.forEach(cont => {
        if(!cont.el) return;
        const units = ["Infantry", "Cavalry", "Archer"], cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
        cont.el.innerHTML = '';
        units.forEach(u => cats.forEach(c => {
            const row = document.createElement('div'); 
            row.className = "stat-row";
            const key = `${u.toLowerCase().slice(0,3)}_${c.k}`;
            row.innerHTML = `
                <input type="number" step="0.1" data-side="atk" data-stat="${key}" oninput="window.syncStat(this)" class="text-emerald-500 font-bold w-16 bg-transparent text-center" value="1000.0">
                <div class="text-[9px] font-black text-slate-500 flex-grow text-center uppercase">${u} ${c.l}</div>
                <input type="number" step="0.1" data-side="def" data-stat="${key}" oninput="window.syncStat(this)" class="text-red-500 font-bold w-16 bg-transparent text-center" value="1000.0">
            `;
            cont.el.appendChild(row);
        }));
    });
}

window.syncStat = (el) => {
    const val = el.value;
    const stat = el.dataset.stat;
    const side = el.dataset.side;
    document.querySelectorAll(`input[data-stat="${stat}"][data-side="${side}"]`).forEach(input => {
        input.value = val;
    });
};

window.syncBatch = (batchId, side, sourceEl) => {
    const rows = document.querySelectorAll(`[data-batch-id="${batchId}"]`);
    const className = sourceEl.className.split(' ')[0]; 
    
    rows.forEach(row => {
        const target = row.querySelector(`.${className}`);
        if (target && target !== sourceEl) {
            target.value = sourceEl.value;
        }
    });
    window.updateFormation(side);
};

window.removeBatch = (batchId, side) => {
    const rows = document.querySelectorAll(`[data-batch-id="${batchId}"]`);
    rows.forEach(row => row.remove());
    window.updateFormation(side);
};

window.toggleHeroLock = (name) => {
    roster[name].unlocked = !roster[name].unlocked;
    localStorage.setItem('ks_roster', JSON.stringify(roster));
    renderRosterUI();
};

window.toggleDetails = () => {
    const box = document.getElementById('battle-details');
    const btn = document.getElementById('toggle-details-btn');
    if (!box || !btn) return;
    const isHidden = box.classList.toggle('hidden');
    btn.innerText = isHidden ? 'View Combat Buffs +' : 'Hide Combat Buffs -';
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

    if (tab === 'bear' || tab === 'battle') window.updateGrids();
};

window.addBatch = (side, initial = false) => {
    const containers = [
        document.getElementById(`${side}-batch-container`),
        document.getElementById(`opt-${side}-batch-container`)
    ];

    const batchId = 'batch-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    const types = [
        { label: 'Infantry', key: 'inf', color: 'text-blue-400', def: 500000 },
        { label: 'Cavalry', key: 'cav', color: 'text-amber-400', def: 200000 },
        { label: 'Archers', key: 'arc', color: 'text-emerald-400', def: 300000 }
    ];

    containers.forEach(container => {
        if (!container) return;
        const div = document.createElement('div');
        div.setAttribute('data-batch-id', batchId);
        div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-2 relative mb-2";
        
        let html = `<div class="flex justify-between items-center mb-1">
            <span class="text-[9px] font-bold text-slate-500 uppercase">Army Batch</span>
            ${!initial ? `<button onclick="window.removeBatch('${batchId}', '${side}')" class="text-red-500 text-[10px] font-black uppercase">Remove</button>` : ''}
        </div>`;

        types.forEach(t => {
            html += `
            <div class="grid grid-cols-12 gap-2 items-center border-b border-slate-800/40 pb-1 mb-1">
                <div class="col-span-3 text-[10px] font-bold ${t.color}">${t.label}</div>
                <select onchange="window.syncBatch('${batchId}', '${side}', this)" class="batch-tier-${t.key} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
                    ${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v===10?'selected':''}>T${v}</option>`).join('')}
                </select>
                <select onchange="window.syncBatch('${batchId}', '${side}', this)" class="batch-tg-${t.key} col-span-2 bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
                    ${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v===3?'selected':''}>TG${v}</option>`).join('')}
                </select>
                <input type="number" oninput="window.syncBatch('${batchId}', '${side}', this)" class="batch-${t.key} col-span-5 input-dark !text-right" value="${initial ? t.def : 0}">
            </div>`;
        });

        div.innerHTML = html;
        container.appendChild(div);
    });
    window.updateFormation(side);
};

window.updateFormation = (side) => {
    let i=0, c=0, a=0;
    const rows = document.querySelectorAll(`#${side}-batch-container > div`);
    
    rows.forEach(row => {
        i += parseFloat(row.querySelector('.batch-inf')?.value) || 0;
        c += parseFloat(row.querySelector('.batch-cav')?.value) || 0;
        a += parseFloat(row.querySelector('.batch-arc')?.value) || 0;
    });

    const total = i + c + a;
    const bars = [
        document.querySelector(`.${side}-f-bar`), 
        document.querySelector(`.opt-${side}-f-bar`)
    ];

    bars.forEach(bar => {
        if (!bar) return;
        bar.children[0].style.width = (total > 0 ? (i / total * 100) : 0) + '%';
        bar.children[1].style.width = (total > 0 ? (c / total * 100) : 0) + '%';
        bar.children[2].style.width = (total > 0 ? (a / total * 100) : 0) + '%';
    });

    const labels = {
        inf: document.querySelectorAll(`.${side}-inf-pct`),
        cav: document.querySelectorAll(`.${side}-cav-pct`),
        arc: document.querySelectorAll(`.${side}-arc-pct`)
    };

    if (total > 0) {
        labels.inf.forEach(el => el.innerText = Math.round(i / total * 100) + '%');
        labels.cav.forEach(el => el.innerText = Math.round(c / total * 100) + '%');
        labels.arc.forEach(el => el.innerText = Math.round(a / total * 100) + '%');
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
function renderLevelPicker(hero, key, current, isRoster) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const act = isRoster ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${act}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
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
    const grid = document.getElementById('roster-grid'); 
    if(!grid) return; 
    grid.innerHTML = '';

    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500 bg-slate-900/40' : 'opacity-40 border-transparent hover:border-slate-800'}`;
        card.onclick = () => window.toggleHeroLock(n);

        let html = `
            <div class="flex items-center gap-3 mb-4">
                <img src="./assets/${n.toLowerCase()}.png" class="w-10 h-10 rounded-full border border-slate-700">
                <b class="text-sm">${n}</b>
            </div>
        `;

        if(r.unlocked) {
            html += `<div class="space-y-4 border-t border-slate-800 pt-4" onclick="event.stopPropagation()">`;
            html += `
                <div>
                    <div class="text-[8px] uppercase font-black text-blue-400 mb-1">Hero Star Grade</div>
                    ${renderStarSelector(n, r.starIndex)}
                </div>
            `;

            h.skills.forEach((s, i) => {
                html += `
                    <div>
                        <div class="text-[8px] uppercase font-black text-slate-500 mb-1">${s.name}</div>
                        ${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)], true)}
                    </div>`;
            });

            html += `
                <div class="pt-2">
                    <div class="text-[8px] uppercase font-black text-amber-500 mb-1">Widget Level</div>
                    ${renderWidgetPicker(n, r.widget)}
                </div>
            `;
            html += `</div>`;
        }

        card.innerHTML = html;
        grid.appendChild(card);
    });
}

window.updateRoster = (n,k,v) => { roster[n][k]=parseInt(v); localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

// --- 4. BATTLE LOGIC ---
window.openHeroModal = (side, index) => {
    activeSlot = { side, index };
    const h = state[side].heroes[index];
    modalTemp = { s1: h.s1, s2: h.s2, s3: h.s3 };
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index, side);
    document.getElementById('heroModal').classList.replace('hidden', 'flex');
};

window.updateModalLevel = (k, v) => { modalTemp[k] = v; renderSkillsInModal(document.getElementById('hero-select').value, activeSlot.index, activeSlot.side); };

function renderSkillsInModal(name, index, side) {
    const container = document.getElementById('skill-inputs'); 
    container.innerHTML = '';
    if(name === "None") return;
    
    const h = HEROES[name];
    const isLead = (side === 'bear' || index < 3);
    const max = isLead ? h.skills.length : 1;
    
    for(let i=0; i<max; i++) {
        const s = h.skills[i];
        const div = document.createElement('div');
        div.className = "mb-4";
        div.innerHTML = `<div class="text-[9px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(name, 's'+(i+1), modalTemp['s'+(i+1)], false)}`;
        container.appendChild(div);
    }
}

window.saveHeroConfig = () => {
    const name = document.getElementById('hero-select').value;
    state[activeSlot.side].heroes[activeSlot.index] = { 
        name, ...modalTemp, 
        starIndex: roster[name]?.starIndex || 30, 
        widgetLv: roster[name]?.widget || 10 
    };
    window.updateGrids(); 
    document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

// FIXED: Now targets both DOM classes and direct IDs to prevent empty lists
window.updateGrids = () => {
    ['atk','def','bear'].forEach(side => {
        const containers = document.querySelectorAll(`.${side}-hero-grid, #${side}-hero-grid`);
        containers.forEach(container => {
            container.innerHTML = '';
            state[side].heroes.forEach((h, i) => {
                const div = document.createElement('div');
                const isLead = (side === 'bear' || i < 3);
                div.className = `hero-circle ${isLead ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
                
                if (h.name !== 'None') {
                    div.innerHTML = `<img src="./assets/${h.name.toLowerCase()}.png" class="absolute inset-0 w-full h-full object-cover z-10">`;
                } else {
                    div.innerHTML = `<span class="text-[10px]">${side === 'bear' ? ['I','C','A'][i] : (i+1)}</span>`;
                }
                div.onclick = () => window.openHeroModal(side, i);
                container.appendChild(div);
            });
        });
    });
};

// --- 5. ACCOUNT CALIBRATION ---
window.toggleAccountStats = () => {
    const isEnabled = document.getElementById('use-account-stats').checked;
    document.getElementById('account-stats-ui').classList.toggle('hidden', !isEnabled);
};

window.reverseEngineerAccount = () => {
    const reportType = document.getElementById('report-type').value;
    const reportHeroNames = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    const widgetCtx = reportType === 'rally' ? 'off' : (reportType === 'garrison' ? 'def' : 'none');

    const tBuffs = {
        att: 1 + (parseFloat(document.getElementById('temp-buff-att').value) / 100),
        def: 1 + (parseFloat(document.getElementById('temp-buff-def').value) / 100),
        leth: 1 + (parseFloat(document.getElementById('temp-buff-leth').value) / 100),
        hp: 1 + (parseFloat(document.getElementById('temp-buff-hp').value) / 100)
    };

    const reportVal = {};
    ['inf','cav','arc'].forEach(t => ['att','def','leth','hp'].forEach(s => {
        reportVal[`${t}_${s}`] = parseFloat(document.getElementById(`rep-${t}-${s}`).value) || 0;
    }));

    let wMults = { attack: 0, defense: 0, lethality: 0, health: 0 };
    if (widgetCtx !== 'none') {
        reportHeroNames.forEach(name => {
            if (name === "None" || !HEROES[name]) return;
            const d = HEROES[name], r = roster[name] || { widget: 10 };
            if (d.widget && d.widget.context === widgetCtx) {
                wMults[d.widget.stat] += (WIDGET_GROWTH[r.widget] || 0);
            }
        });
    }

    const results = {};
    ['inf','cav','arc'].forEach(t => {
        ['att', 'def', 'leth', 'hp'].forEach(s => {
            const statMap = { att: "attack", def: "defense", leth: "lethality", hp: "health" };
            const category = statMap[s];
            let val = reportVal[`${t}_${s}`] / ((1 + wMults[category]) * tBuffs[s]);
            
            reportHeroNames.forEach(name => {
                if (name === "None" || !HEROES[name]) return;
                const d = HEROES[name], r = roster[name] || { starIndex: 30, widget: 10 };
                if (d.type.toLowerCase().slice(0,3) === t) {
                    if (s === 'att' || s === 'def') {
                        val -= (GROWTH_TEMPLATES[d.template][r.starIndex] || 0);
                    } else if (s === 'leth' || s === 'hp') {
                        const widgetData = WIDGET_STATS[d.template];
                        if (widgetData) val -= (widgetData[r.widget] || 0);
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
    if (!div) return;
    div.classList.remove('hidden');
    div.innerHTML = '';
    div.className = "space-y-2 p-4 bg-slate-950/50 rounded-xl border border-slate-800 mt-4";

    const types = [
        { l: 'Infantry', k: 'inf', c: 'text-blue-400' },
        { l: 'Cavalry', k: 'cav', c: 'text-amber-400' },
        { l: 'Archers', k: 'arc', c: 'text-emerald-400' }
    ];

    types.forEach(t => {
        const row = document.createElement('div');
        row.className = "grid grid-cols-5 gap-2 items-center border-b border-slate-900/40 pb-1";
        let h = `<div class="text-[10px] font-black ${t.c} uppercase">${t.l}</div>`;
        ['att', 'def', 'leth', 'hp'].forEach(s => {
            const val = nakedStats[`${t.k}_${s}`] || 0;
            h += `<div class="text-center">
                <div class="text-[7px] text-slate-500 uppercase font-black">${s}</div>
                <div class="text-[10px] font-bold text-white">${val.toFixed(1)}%</div>
            </div>`;
        });
        row.innerHTML = h;
        div.appendChild(row);
    });
}

// --- 6. SIMULATION & OPTIMIZERS ---
function gatherSetup() {
    const getStats = (side) => { 
        const obj = {}; 
        document.querySelectorAll(`input[data-side="${side}"][data-stat]`).forEach(i => {
            obj[i.dataset.stat] = parseFloat(i.value) || 0;
        }); 
        return obj; 
    };

    const collect = (side) => {
        return Array.from(document.querySelectorAll(`#${side}-batch-container > div`)).map(el => ({
            inf_tier: parseInt(el.querySelector('.batch-tier-inf').value),
            inf_tg: parseInt(el.querySelector('.batch-tg-inf').value),
            inf: parseFloat(el.querySelector('.batch-inf').value) || 0,
            cav_tier: parseInt(el.querySelector('.batch-tier-cav').value),
            cav_tg: parseInt(el.querySelector('.batch-tg-cav').value),
            cav: parseFloat(el.querySelector('.batch-cav').value) || 0,
            arc_tier: parseInt(el.querySelector('.batch-tier-arc').value),
            arc_tg: parseInt(el.querySelector('.batch-tg-arc').value),
            arc: parseFloat(el.querySelector('.batch-arc').value) || 0
        }));
    };

    return { 
        atk: { batches: collect('atk'), stats: getStats('atk'), heroes: state.atk.heroes }, 
        def: { batches: collect('def'), stats: getStats('def'), heroes: state.def.heroes } 
    };
}

window.handleSimulation = async () => {
    const setup = gatherSetup(); 
    const mode = document.getElementById('sim-mode-select').value;
    
    let rFinal, rBest, rWorst;
    let winAtk = 0, winDef = 0;

    if (mode === 'monte-carlo') {
        let results = [];
        for (let i = 0; i < 100; i++) {
            results.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        }

        // Sort by Net Survivors (Margin) to find the 5th and 95th percentile
        results.sort((a, b) => (sumTroops(a.m_cur) - sumTroops(a.e_cur)) - (sumTroops(b.m_cur) - sumTroops(b.e_cur)));

        rWorst = results[4];    // 5th Worst Run
        rBest = results[95];    // 5th Best Run
        rFinal = results[50];   // Median Run

        results.forEach(r => {
            const m = sumTroops(r.m_cur), e = sumTroops(r.e_cur);
            if (m > e) winAtk++; else if (e > m) winDef++;
        });

        document.getElementById('result-waves').innerHTML = `
            <span class="text-blue-400 font-black uppercase">Stochastic Analysis (100 Runs)</span><br>
            Win Rate: ${winAtk}% Atk / ${winDef}% Def / ${100 - winAtk - winDef}% Draw<br>
            Median Duration: ${rFinal.wave} Phases`;
    } else {
        // Deterministic mode logic
        rFinal = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky'); 
        rWorst = runCombatSim(setup, 'unlucky', 'lucky');
        
        document.getElementById('result-waves').innerHTML = `
            <span class="text-emerald-500 font-black uppercase">Deterministic Analysis</span><br>
            Duration: ${rFinal.wave} Phases`;
    }

    // --- FIX: DEFINE VARIABLES FOR UI AND LUCK BAR ---
    const sAtk = Math.floor(sumTroops(rFinal.m_cur));
    const sDef = Math.floor(sumTroops(rFinal.e_cur));
    
    // UI Updates (Integers)
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = sAtk.toLocaleString();
    document.getElementById('res-def-total').innerText = sDef.toLocaleString();
    
    // Range Labels (Using the 5th and 95th Percentile results)
    document.getElementById('res-atk-range').innerText = `Range: ${Math.floor(sumTroops(rWorst.m_cur)).toLocaleString()} - ${Math.floor(sumTroops(rBest.m_cur)).toLocaleString()}`;
    document.getElementById('res-def-range').innerText = `Range: ${Math.floor(sumTroops(rBest.e_cur)).toLocaleString()} - ${Math.floor(sumTroops(rWorst.e_cur)).toLocaleString()}`;

    // Luck Bar Logic
    // We get the total starting troops of the first batch for a baseline scale
    const totalStartAtk = sumTroops(setup.atk.batches[0]);
    const totalStartDef = sumTroops(setup.def.batches[0]);
    const totalStart = totalStartAtk + totalStartDef;

    const score = (sAtk - sDef) / (totalStart || 1);
    const bar = document.getElementById('luck-bar-inner');
    if (bar) {
        bar.style.left = "50%"; 
        bar.style.width = Math.abs(score * 50) + "%";
        bar.style.transform = score < 0 ? "translateX(-100%)" : "none";
    }

    // Combat Detail Rendering
    const logHTML = (side, data) => `
        <div class="${side === 'atk' ? 'text-emerald-500' : 'text-red-500'} font-black border-b border-slate-800 mb-2 mt-4 uppercase text-[10px] pb-1">${side === 'atk' ? 'Attacker' : 'Defender'} Combat Buffs</div>
        <div class="text-slate-300 font-bold text-[9px] mb-2">[Army Efficiency] ${data.troopEff || 'None'}</div>
        ${data.skills.map(s => `
            <div class="flex justify-between border-b border-slate-900/50 py-0.5">
                <span class="text-slate-400">${s.name}</span> 
                <span class="${s.isPassive?'text-blue-400':'text-amber-500'} font-black">${s.val}</span>
            </div>
        `).join('')}
    `;
    
    const detailsBox = document.getElementById('battle-details');
    if (detailsBox) {
        detailsBox.innerHTML = logHTML('atk', rFinal.atk_logs) + logHTML('def', rFinal.def_logs);
    }
};

window.runOptimizer = async (mode) => {
    const isBear = (mode === 'bear');
    const plotId = isBear ? 'bear-plot' : 'ternary-plot';
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    
    resArea.innerText = "Analyzing...";
    await new Promise(r => setTimeout(r, 50));

    const setup = gatherSetup();
    let best = { form: [0, 0, 0], score: -Infinity, wins: 0 };
    let dataPoints = { a: [], b: [], c: [], z: [] };

    const myRole = optRole;
    const oppRole = myRole === 'atk' ? 'def' : 'atk';
    let myTotal = 0;
    setup[myRole].batches.forEach(b => myTotal += (b.inf + b.cav + b.arc));

    for (let i = 0; i <= 100; i += 2) {
        for (let j = 0; j <= 100 - i; j += 2) {
            const k = 100 - i - j;
            let score = 0;

            if (isBear) {
                score = calculateBearDamage(setup, [i, j, k]);
            } else {
                let testSetup = JSON.parse(JSON.stringify(setup));
                testSetup[myRole].batches = [{
                    inf: (i/100)*myTotal, cav: (j/100)*myTotal, arc: (k/100)*myTotal,
                    inf_tier: setup[myRole].batches[0].inf_tier, inf_tg: setup[myRole].batches[0].inf_tg,
                    cav_tier: setup[myRole].batches[0].cav_tier, cav_tg: setup[myRole].batches[0].cav_tg,
                    arc_tier: setup[myRole].batches[0].arc_tier, arc_tg: setup[myRole].batches[0].arc_tg
                }];

                if (mode === 'current') {
                    const res = runCombatSim(testSetup, 'average', 'average');
                    score = sumTroops(res.m_cur) - sumTroops(res.e_cur);
                } else if (mode === 'custom') {
                    const cI = parseFloat(document.getElementById('custom-inf').value)||0;
                    const cC = parseFloat(document.getElementById('custom-cav').value)||0;
                    const cA = parseFloat(document.getElementById('custom-arc').value)||0;
                    let oppT = 0; setup[oppRole].batches.forEach(b => oppT += (b.inf + b.cav + b.arc));
                    testSetup[oppRole].batches = [{ inf:(cI/100)*oppT, cav:(cC/100)*oppT, arc:(cA/100)*oppT, ...setup[oppRole].batches[0] }];
                    const res = runCombatSim(testSetup, 'average', 'average');
                    score = sumTroops(res.m_cur) - sumTroops(res.e_cur);
                }
            }

            if (score > best.score) best = { form: [i, j, k], score };
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(score);
        }
    }

    resArea.innerText = best.form.join(' / ');
    if (isBear) {
        scoreArea.innerHTML = `Max Dmg: <span class="text-emerald-400 font-bold">${Math.round(best.score).toLocaleString()}</span>`;
    } else {
        scoreArea.innerText = `Fitness: ${Math.round(best.score).toLocaleString()}`;
    }
    
    renderTernary(plotId, dataPoints, best, isBear);
};

// FIXED: Alcar S3 Part 2 (Global 25%) now correctly applies to Infantry
function calculateBearDamage(setup, formation) {
    const bearConfig = {
        inf: { tier: parseInt(document.getElementById('bear-inf-tier')?.value||10), tg: parseInt(document.getElementById('bear-inf-tg')?.value||3), att: parseFloat(document.getElementById('bear-inf-att')?.value)||0, leth: parseFloat(document.getElementById('bear-inf-leth')?.value)||0 },
        cav: { tier: parseInt(document.getElementById('bear-cav-tier')?.value||10), tg: parseInt(document.getElementById('bear-cav-tg')?.value||3), att: parseFloat(document.getElementById('bear-cav-att')?.value)||0, leth: parseFloat(document.getElementById('bear-cav-leth')?.value)||0 },
        arc: { tier: parseInt(document.getElementById('bear-arc-tier')?.value||10), tg: parseInt(document.getElementById('bear-arc-tg')?.value||3), att: parseFloat(document.getElementById('bear-arc-att')?.value)||0, leth: parseFloat(document.getElementById('bear-arc-leth')?.value)||0 }
    };

    let buckets = {
        inf: { 101: 0, 102: 0, 103: 0, 104: 0, 105: 0, 106: 0 },
        cav: { 101: 0, 102: 0, 103: 0, 104: 0, 105: 0, 106: 0 },
        arc: { 101: 0, 102: 0, 103: 0, 104: 0, 105: 0, 106: 0 }
    };

    state.bear.heroes.forEach(h => {
        if (h.name === "None" || !HEROES[h.name]) return;
        const d = HEROES[h.name], r = roster[h.name] || { s1: 5, s2: 5, s3: 5 };

        d.skills.forEach((s, si) => {
            const lvl = r[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            const uptime = s.interval ? (2 / 10) : s.getChance(x);
            const mFull = s.getMagnitude(x);

            s.ids.forEach((id, idx) => {
                if (id >= 200) return; 
                const rawM = Array.isArray(mFull) ? mFull[idx] : mFull;

                (s.units || ["inf", "cav", "arc"]).forEach(u => {
                    let mag = 0;
                    if (typeof rawM === 'object' && rawM !== null) {
                        mag = rawM[u] || 0;
                    } else {
                        mag = rawM;
                    }
                    
                    if (buckets[u][id] !== undefined) {
                        buckets[u][id] += (mag * uptime);
                    }
                });
            });
        });
    });

    let totalDamage = 0;
    ['inf', 'cav', 'arc'].forEach((u, i) => {
        const pct = formation[i] / 100;
        if (pct <= 0) return;

        const unitKey = (u === 'arc' ? 'archers' : (u === 'inf' ? 'infantry' : 'cavalry'));
        const stats = UNITS[unitKey][bearConfig[u].tier][bearConfig[u].tg];
        
        let skillMult = 1.0;
        [101, 102, 103, 104, 105, 106].forEach(id => {
            skillMult *= (1 + buckets[u][id]);
        });

        const tA = stats[0] * (1 + (bearConfig[u].att / 100)) * skillMult;
        const tL = stats[2] * (1 + (bearConfig[u].leth / 100));

        let abil = 1.0;
        if (u === 'arc') {
            abil = 1.1; 
            if (bearConfig[u].tier >= 7) abil += 0.1; 
            if (bearConfig[u].tg >= 5) abil += 0.15; 
            else if (bearConfig[u].tg >= 3) abil += 0.1; 
        } else if (u === 'cav') {
            if (bearConfig[u].tg >= 5) abil = 1.15; 
            else if (bearConfig[u].tg >= 3) abil = 1.1;
        }

        const count = pct * 5000; 
        const troopDmg = (Math.sqrt(count) * tA * tL * abil * 1.25) / 833.333;
        totalDamage += (troopDmg * 10);
    });

    return isNaN(totalDamage) ? 0 : totalDamage;
}

function renderTernary(id, data, best, isBear) {
    const traces = [
        { 
            type: 'scatterternary',
            a: data.a, b: data.b, c: data.c,
            mode: 'markers', name: 'Efficiency',
            marker: { color: data.z, colorscale: 'Viridis', size: 5, opacity: 0.8 },
            hoverinfo: 'none'
        },
        { 
            type: 'scatterternary',
            a: [best.form[0]], b: [best.form[1]], c: [best.form[2]],
            name: 'Optimal', mode: 'markers',
            marker: { size: 18, symbol: 'star', color: '#00f2ff', line: { width: 1.5, color: '#080a0f' } } 
        }
    ];

    const layout = {
        ternary: { 
            sum: 100,
            aaxis: { title: 'INF', titlefont: { size: 12, color: '#3b82f6' } },
            baxis: { title: 'CAV', titlefont: { size: 12, color: '#f59e0b' } },
            caxis: { title: 'ARC', titlefont: { size: 12, color: '#10b981' } },
            bgcolor: 'rgba(0,0,0,0)'
        },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 20, r: 20, t: 40, b: 20 }, showlegend: false
    };

    Plotly.newPlot(id, traces, layout, { displayModeBar: false, responsive: true });
}

// --- UPDATED SYSTEM VOLUME LOGIC ---
function getSystemVolume(leads, joiners, formation, ctx, isBear, scenarioLabel) {
    const rawStats = JSON.parse(localStorage.getItem('ks_naked_stats'));
    const isCalibrated = !!rawStats;
    const s = rawStats || { 
        inf_att: 1000, inf_hp: 500, inf_def: 1000, inf_leth: 500,
        cav_att: 1000, cav_hp: 500, cav_def: 1000, cav_leth: 500,
        arc_att: 1000, arc_hp: 500, arc_def: 1000, arc_leth: 500
    };

    let curS = {
        inf: { att: s.inf_att, leth: s.inf_leth, hp: s.inf_hp, def: s.inf_def },
        cav: { att: s.cav_att, leth: s.cav_leth, hp: s.cav_hp, def: s.cav_def },
        arc: { att: s.arc_att, leth: s.arc_leth, hp: s.arc_hp, def: s.arc_def }
    };

    const createB = () => ({ 101:0, 102:0, 103:0, 104:0, 105:0, 106:0, 201:0, 202:0, 203:0, 204:0, 205:0, 250:0 });
    let b = { inf: createB(), cav: createB(), arc: createB() };
    let wM = { attack: 1.0, defense: 1.0, lethality: 1.0, health: 1.0 };

    const processHero = (name, isLead) => {
        if (name === "None" || !HEROES[name]) return;
        const h = HEROES[name], r = roster[name] || { s1:5, s2:5, s3:5, widget:10, starIndex:30 };
        
        if (isLead) {
            const tk = h.type.toLowerCase().slice(0, 3);
            if (isCalibrated) {
                const growth = (GROWTH_TEMPLATES[h.template][r.starIndex] || 0);
                curS[tk].att += growth; curS[tk].def += growth;
                
                if (h.widget) {
                    const flats = WIDGET_STATS[h.template] || [];
                    const fVal = flats[r.widget] || 0;
                    if (h.widget.stat === "lethality") curS[tk].leth += fVal;
                    if (h.widget.stat === "health") curS[tk].hp += fVal;
                    if (h.widget.stat === "attack") curS[tk].att += fVal;
                    if (h.widget.stat === "defense") curS[tk].def += fVal;
                }
            }
            if (scenarioLabel.includes("Rally") || scenarioLabel.includes("Garrison") || scenarioLabel.includes("Bear")) {
                if (h.widget && h.widget.context === ctx) {
                    wM[h.widget.stat] += (WIDGET_GROWTH[r.widget] || 0);
                }
            }
        }

        h.skills.forEach((skill, si) => {
            if (!isLead && si > 0) return;
            const x = skill.values[(isLead ? (r[`s${si+1}`]||5) : 5) - 1];
            const dur = isBear ? 1 : (skill.duration || 1);
            let uptime = skill.interval ? Math.min(1.0, dur / skill.interval) : (skill.getChance(x));
            if (dur > 1 && !skill.interval) uptime = 1 - Math.pow(1 - uptime, dur);

            const mFull = skill.getMagnitude(x);
            skill.ids.forEach((id, idx) => {
                const rawM = Array.isArray(mFull) ? mFull[idx] : mFull;
                (skill.units || ["inf", "cav", "arc"]).forEach(u => {
                    let mag = (typeof rawM === 'object' && rawM !== null) ? (rawM[u] || 0) : rawM;
                    b[u][id] += (mag * uptime);
                });
            });
        });
    };

    leads.forEach(l => processHero(l, true));
    joiners.forEach(j => processHero(j, false));

    const f = [formation[0], formation[1], formation[2]];
    const getOff = (u, idx) => {
        const stats = curS[u];
        const mult = (1 + b[u][101]) * (1 + b[u][102]) * (1 + b[u][103]) * (1 + b[u][104]) * (1 + b[u][105]) * (1 + b[u][106]);
        const unitBaseAtk = u === 'inf' ? 472 : (u === 'cav' ? 1416 : 1888);
        return Math.sqrt(f[idx] * 1000000) * unitBaseAtk * (1 + stats.att/100) * wM.attack * (1 + stats.leth/100) * wM.lethality * mult;
    };
    
    const totalD = getOff('inf', 0) + getOff('cav', 1) + getOff('arc', 2);
    if (isBear) return totalD;

    const getSurv = (u, idx) => {
        const stats = curS[u];
        const unitBaseHP = u === 'inf' ? 1790 : (u === 'cav' ? 597 : 448);
        const dodgeMult = 1 / (1 - Math.min(0.9, b[u][250]));
        const mult = (1 + b[u][201]) * (1 + b[u][202]) * (1 + b[u][203]) * (1 + b[u][204]) * (1 + b[u][205]) * dodgeMult;
        return (f[idx] * 1000000) * unitBaseHP * (1 + stats.hp/100) * wM.health * (1 + stats.def/100) * wM.defense * mult;
    };

    return totalD * (getSurv('inf', 0) + getSurv('cav', 1) + getSurv('arc', 2));
}

window.calculateOptimalLineups = async () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked && n !== "None");
    if (unlocked.length < 3) return alert("Please unlock at least one hero of each type in the Roster.");

    const resArea = document.getElementById('optimizer-results');
    resArea.classList.remove('hidden');
    resArea.innerHTML = `<div class="col-span-full p-12 text-center text-blue-500 animate-pulse font-black uppercase tracking-widest">Calculating Scientific Peak...</div>`;

    const jPool = ["Saul", "Hilde", "Alcar", "Chenko", "Amane", "Howard", "Gordon", "Fahd", "Eric"];
    const pivots = [[50,20,30], [70,30,0], [60,20,20], [33,33,34], [50,0,50], [60,40,0], [10,10,80]];

    const byT = { 
        Inf: unlocked.filter(n => HEROES[n].type === "Inf"),
        Cav: unlocked.filter(n => HEROES[n].type === "Cav"),
        Arc: unlocked.filter(n => HEROES[n].type === "Arc")
    };
    ['Inf', 'Cav', 'Arc'].forEach(t => { if(byT[t].length === 0) byT[t] = ["None"]; });

    const scenarios = [
        { l: "Solo Attack", ctx: "off", bear: false, rally: false },
        { l: "Solo Defense", ctx: "def", bear: false, rally: false },
        { l: "Rally (Offense)", ctx: "off", bear: false, rally: true },
        { l: "Garrison (Defense)", ctx: "def", bear: false, rally: true },
        { l: "Bear Trap", ctx: "off", bear: true, rally: true }
    ];

    await new Promise(r => setTimeout(r, 50));
    resArea.innerHTML = '';

    for (const s of scenarios) {
        let baselinePeak = 0;
        pivots.forEach(p => {
            const v = getSystemVolume(["None","None","None"], [], p, s.ctx, s.bear, s.l);
            if (v > baselinePeak) baselinePeak = v;
        });

        let candidates = [];
         for (let i of byT.Inf) {
            for (let c of byT.Cav) {
                for (let a of byT.Arc) {
                    const leads = [i, c, a];
                    let curJ = [];

                    if (s.rally) {
                        for (let slot=0; slot<4; slot++) {
                            let bj = "None", bestSlotV = -1;
                            jPool.forEach(heroName => {
                                let peakWithCandidate = -1;
                                pivots.forEach(p => {
                                    const v = getSystemVolume(leads, [...curJ, heroName], p, s.ctx, s.bear, s.l);
                                    if (v > peakWithCandidate) peakWithCandidate = v;
                                });
                                if (peakWithCandidate > bestSlotV) {
                                    bestSlotV = peakWithCandidate;
                                    bj = heroName;
                                }
                            });
                            curJ.push(bj);
                        }
                    }

                    let finalPeakVolume = -1;
                    pivots.forEach(p => {
                        const v = getSystemVolume(leads, curJ, p, s.ctx, s.bear, s.l);
                        if (v > finalPeakVolume) finalPeakVolume = v;
                    });

                    candidates.push({ leads, joiners: curJ, score: finalPeakVolume });
                }
            }
        }

        candidates.sort((a,b) => b.score - a.score);
        const top3Final = candidates.slice(0, 3).map(team => {
            let sweepBestVol = -1;
            for (let fI = 0; fI <= 100; fI += 2) {
                for (let fC = 0; fC <= 100 - fI; fC += 2) {
                    const fA = 100 - fI - fC;
                    const v = getSystemVolume(team.leads, team.joiners, [fI, fC, fA], s.ctx, s.bear, s.l);
                    if (v > sweepBestVol) sweepBestVol = v;
                }
            }
            return { ...team, gain: sweepBestVol / (baselinePeak||1) };
        });

        renderScenarioResults(s.l, top3Final, resArea);
    }
};

function renderScenarioResults(title, top3, container) {
    const card = document.createElement('div');
    card.className = "glass-card p-6 border-l-4 border-blue-500 col-span-1 md:col-span-2 mb-6";
    card.innerHTML = `<div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">${title}</div>`;

    top3.forEach((team, rk) => {
        const joinerMap = {};
        team.joiners.forEach(j => { if(j !== "None") joinerMap[j] = (joinerMap[j] || 0) + 1; });
        const joinerText = Object.entries(joinerMap).map(([name, count]) => `${name}${count > 1 ? ' x' + count : ''}`).join(', ');

        card.innerHTML += `
        <div class="flex items-center justify-between py-4 ${rk < 2 ? 'border-b border-slate-800' : ''}">
            <div class="flex items-center gap-5">
                <span class="text-slate-600 font-black text-xs">#${rk+1}</span>
                <div class="flex -space-x-3">
                    ${team.leads.map(n => n !== "None" ? `<div class="w-12 h-12 rounded-full border-2 border-blue-500/30 bg-slate-950 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>` : '').join('')}
                </div>
                <div>
                    <div class="text-[10px] font-black text-white uppercase leading-tight">${team.leads.filter(n => n !== "None").join(' / ')}</div>
                    <div class="text-[8px] text-slate-500 font-bold uppercase truncate max-w-[250px]">${joinerText || 'Solo Configuration'}</div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-[8px] text-slate-600 font-black uppercase mb-1">Total Efficiency</div>
                <div class="text-xl font-black text-emerald-400">${team.gain.toFixed(3)}x</div>
            </div>
        </div>`;
    });
    container.appendChild(card);
}

document.getElementById('heroModal')?.addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });

document.addEventListener('DOMContentLoaded', window.init);
