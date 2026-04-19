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
            // FLEXBOX styling for perfect alignment
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.justifyContent = "space-between";
            row.style.height = "32px";
            row.style.padding = "0 30px";
            row.className = "stat-row-container";

            const key = `${u.toLowerCase().slice(0,3)}_${c.key}`;
            row.innerHTML = `
                <input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" 
                       style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:60px;">
                <div style="font-size:9px; font-weight:900; color:#64748b; text-transform:uppercase; flex-grow:1; text-align:center;">${u} ${c.label}</div>
                <input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" 
                       style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:60px; text-align:right;">
            `;
            // Set default value
            row.querySelectorAll('input').forEach(i => i.value = 1000);
            table.appendChild(row);
        });
    });
    
    window.addBatch('atk', true);
    window.addBatch('def', true);
    document.getElementById('hero-select').addEventListener('change', (e) => renderSkillsInModal(e.target.value, activeSlot.index));
    window.updateFormation('atk'); window.updateFormation('def'); 
    document.querySelectorAll('#stat-table input').forEach(i => window.updateStatColors(i));
    updateGrids();
}

window.updateFormation = (side) => {
    const inf = parseFloat(document.getElementById(`${side}-inf`).value) || 0;
    const cav = parseFloat(document.getElementById(`${side}-cav`).value) || 0;
    const arc = parseFloat(document.getElementById(`${side}-arc`).value) || 0;
    const total = inf + cav + arc;
    const bar = document.getElementById(`${side}-f-bar`);
    if (total === 0) return;
    if(bar) {
        bar.children[0].style.width = (inf/total*100)+'%';
        bar.children[1].style.width = (cav/total*100)+'%';
        bar.children[2].style.width = (arc/total*100)+'%';
    }
    document.getElementById(`${side}-inf-pct`).innerText = Math.round(inf/total*100)+'%';
    document.getElementById(`${side}-cav-pct`).innerText = Math.round(cav/total*100)+'%';
    document.getElementById(`${side}-arc-pct`).innerText = Math.round(arc/total*100)+'%';
};

window.updateStatColors = (el) => {
    const row = el.closest('div[style*="display: flex"]');
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

window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3";
    
    div.innerHTML = `
        <div class="flex justify-between items-center">
            <div class="flex gap-2">
                <select class="batch-tier bg-slate-900 text-[10px] border border-slate-700 rounded px-2 py-1 font-bold text-slate-400">
                    ${[11,10,9,8,7,6,5,4,3,2,1].map(t => `<option value="${t}" ${t===10?'selected':''}>T${t}</option>`).join('')}
                </select>
                <select class="batch-tg bg-slate-900 text-[10px] border border-slate-700 rounded px-2 py-1 font-bold text-slate-400">
                    ${[5,4,3,2,1,0].map(tg => `<option value="${tg}" ${tg===3?'selected':''}>TG${tg}</option>`).join('')}
                </select>
            </div>
            ${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 hover:text-red-400 text-xs font-bold">REMOVE</button>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-3">
            <input type="number" class="batch-inf input-dark !py-1 text-xs text-blue-400" value="500000" oninput="window.updateFormation('${side}')">
            <input type="number" class="batch-cav input-dark !py-1 text-xs text-amber-400" value="200000" oninput="window.updateFormation('${side}')">
            <input type="number" class="batch-arc input-dark !py-1 text-xs text-emerald-400" value="300000" oninput="window.updateFormation('${side}')">
        </div>
    `;
    container.appendChild(div);
    window.updateFormation(side);
};

function updateGrids() {
    ['atk', 'def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`);
        if (!container) return;
        container.innerHTML = '';
        state[side].heroes.forEach((h, i) => {
            const div = document.createElement('div');
            div.className = `hero-circle ${i < 3 ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
            
            if (h.name !== 'None') {
                const imgName = h.name.toLowerCase();
                // We wrap the letter in a div that is centered behind the image
                div.innerHTML = `
                    <span style="position: absolute; z-index: 1;">${h.name[0]}</span>
                    <img src="./assets/${imgName}.png" 
                         style="position: absolute; inset: 0; width: 100%; height: 100%; object-cover; z-index: 2;" 
                         onerror="this.style.opacity='0';">
                `;
            } else {
                div.innerText = (i + 1);
            }
            div.onclick = () => window.openHeroModal(side, i);
            container.appendChild(div);
        });
    });
}

window.handleSimulation = () => {
    const getStats = (s) => {
        const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj;
    };
    const setup = {
        atk: { troops: { inf: parseFloat(document.getElementById('atk-inf').value)||0, cav: parseFloat(document.getElementById('atk-cav').value)||0, arc: parseFloat(document.getElementById('atk-arc').value)||0 }, tier: parseInt(document.getElementById('atk-tier').value), tg: parseInt(document.getElementById('atk-tg').value), stats: getStats('atk'), heroes: state.atk.heroes },
        def: { troops: { inf: parseFloat(document.getElementById('def-inf').value)||0, cav: parseFloat(document.getElementById('def-cav').value)||0, arc: parseFloat(document.getElementById('def-arc').value)||0 }, tier: parseInt(document.getElementById('def-tier').value), tg: parseInt(document.getElementById('def-tg').value), stats: getStats('def'), heroes: state.def.heroes }
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
    const r = runCombatSim(setup);
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('result-waves').innerText = `Ended after ${r.wave} waves`;
    document.getElementById('res-atk-total').innerText = Math.round(r.m_cur.inf+r.m_cur.cav+r.m_cur.arc).toLocaleString();
    document.getElementById('res-def-total').innerText = Math.round(r.e_cur.inf+r.e_cur.cav+r.e_cur.arc).toLocaleString();
    document.getElementById('res-atk-details').innerHTML = `Infantry: ${Math.round(r.m_cur.inf).toLocaleString()}<br>Cavalry: ${Math.round(r.m_cur.cav).toLocaleString()}<br>Archer: ${Math.round(r.m_cur.arc).toLocaleString()}`;
    document.getElementById('res-def-details').innerHTML = `Infantry: ${Math.round(r.e_cur.inf).toLocaleString()}<br>Cavalry: ${Math.round(r.e_cur.cav).toLocaleString()}<br>Archer: ${Math.round(r.e_cur.arc).toLocaleString()}`;

    const logBox = document.getElementById('battle-details');
    logBox.innerHTML = `<div style="color:#10b981; margin-bottom:5px;">[ATTACKER BUFFS]</div>` + r.atk_mults.map(l => `<div>• ${l}</div>`).join('') + 
                       `<div style="color:#ef4444; margin-top:15px; margin-bottom:5px;">[DEFENDER BUFFS]</div>` + r.def_mults.map(l => `<div>• ${l}</div>`).join('');
    
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

window.toggleDetails = () => document.getElementById('battle-details').classList.toggle('hidden');
document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', init);
