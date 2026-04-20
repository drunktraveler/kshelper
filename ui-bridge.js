import { HEROES } from './heroes.js';
import { runCombatSim } from './engine.js';

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0 })) }
};
let activeSlot = { side: null, index: null };

function init() {
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
            row.innerHTML = `
                <input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" 
                       style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000">
                <div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.label}</div>
                <input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" 
                       style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">
            `;
            table.appendChild(row);
        });
    });

    window.addBatch('atk', true); 
    window.addBatch('def', true);
    document.getElementById('hero-select').addEventListener('change', (e) => renderSkillsInModal(e.target.value, activeSlot.index));
    updateGrids();
}

window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 mb-2";
    div.innerHTML = `
        <div class="flex justify-between items-center">
            <div class="flex gap-2">
                <select class="batch-tier bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400">
                    ${[11,10,9,8,7,6,5,4,3,2,1].map(t => `<option value="${t}" ${t===10?'selected':''}>T${t}</option>`).join('')}
                </select>
                <select class="batch-tg bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400">
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
        bar.children[0].style.width = (i/total*100)+'%';
        bar.children[1].style.width = (c/total*100)+'%';
        bar.children[2].style.width = (a/total*100)+'%';
        document.getElementById(`${side}-inf-pct`).innerText = Math.round(i/total*100)+'%';
        document.getElementById(`${side}-cav-pct`).innerText = Math.round(c/total*100)+'%';
        document.getElementById(`${side}-arc-pct`).innerText = Math.round(a/total*100)+'%';
    }
};

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row');
    if (!row) return;
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
    let results;

    if (simMode === 'monte-carlo') {
        const runs = 100;
        let batchResults = [];
        for (let i = 0; i < runs; i++) {
            batchResults.push(runCombatSim(setup, 'stochastic'));
        }
        // Calculate Percentiles from 100 runs
        batchResults.sort((a, b) => (a.m_cur.inf + a.m_cur.cav + a.m_cur.arc) - (b.m_cur.inf + b.m_cur.cav + b.m_cur.arc));
        results = {
            average: batchResults[Math.floor(runs / 2)],
            lucky: batchResults[Math.floor(runs * 0.95)],
            unlucky: batchResults[Math.floor(runs * 0.05)]
        };
    } else {
        // Fast Statistical Mode
        const rAvg = runCombatSim(setup, 'average');
        results = {
            average: rAvg,
            lucky: runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave),
            unlucky: runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave)
        };
    }

    renderResults(results, setup);

    const screen = document.getElementById('result-screen');
    screen.classList.remove('hidden');

    const getScore = (r) => {
        const aSurv = (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / r.startAtk;
        const dSurv = (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / r.startDef;
        return dSurv - aSurv;
    };

    const sMin = getScore(rAtkCeil), sMax = getScore(rDefCeil);
    const luckBar = document.getElementById('luck-visual-bar');
    luckBar.style.left = ((Math.min(sMin, sMax) + 1) * 50) + "%";
    luckBar.style.width = Math.max(1.5, Math.abs(sMax - sMin) * 50) + "%";

    document.getElementById('result-waves').innerText = `Length: ${rAvg.wave} (Range: ${rAtkCeil.wave}-${rDefCeil.wave})`;
    
    document.getElementById('res-atk-total').innerHTML = `<span class="text-emerald-400">${Math.round(rAvg.m_cur.inf+rAvg.m_cur.cav+rAvg.m_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(rDefCeil.m_cur.inf+rDefCeil.m_cur.cav+rDefCeil.m_cur.arc).toLocaleString()} - ${Math.round(rAtkCeil.m_cur.inf+rAtkCeil.m_cur.cav+rAtkCeil.m_cur.arc).toLocaleString()}</div>`;
    document.getElementById('res-def-total').innerHTML = `<span>${Math.round(rAvg.e_cur.inf+rAvg.e_cur.cav+rAvg.e_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Range: ${Math.round(rAtkCeil.e_cur.inf+rAtkCeil.e_cur.cav+rAtkCeil.e_cur.arc).toLocaleString()} - ${Math.round(rDefCeil.e_cur.inf+rDefCeil.e_cur.cav+rDefCeil.e_cur.arc).toLocaleString()}</div>`;

    document.getElementById('res-atk-details').innerText = `Inf: ${Math.round(rAvg.m_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.m_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.m_cur.arc).toLocaleString()}`;
    document.getElementById('res-def-details').innerText = `Inf: ${Math.round(rAvg.e_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.e_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.e_cur.arc).toLocaleString()}`;

    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2">[ATTACKER BUFFS]</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + `<div class="text-red-500 font-black mb-2 mt-4">[DEFENDER BUFFS]</div>` + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    screen.scrollIntoView({ behavior: 'smooth' });
};

window.toggleDetails = () => {
    const box = document.getElementById('battle-details');
    const isHidden = box.classList.toggle('hidden');
    document.getElementById('toggle-details-btn').innerText = isHidden ? 'View Combat Modifiers +' : 'Hide Combat Modifiers -';
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', init);
