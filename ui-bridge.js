import { HEROES } from './heroes.js';
import { runCombatSim } from './engine.js';

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1, star: 5, sub: 0 })) }
};
let activeSlot = { side: null, index: null };

function init() {
    // 1. Populate Dropdown
    const sel = document.getElementById('hero-select');
    sel.innerHTML = '<option value="None">None</option>';
    Object.keys(HEROES).sort().forEach(n => {
        const o = document.createElement('option'); o.value = n; o.innerText = n; sel.appendChild(o);
    });

    // 2. Generate Stat Rows
    const table = document.getElementById('stat-table');
    const categories = [{ label: "Attack", key: "att" }, { label: "Defense", key: "def" }, { label: "Lethality", key: "leth" }, { label: "Health", key: "hp" }];
    const units = ["Infantry", "Cavalry", "Archer"];
    
    units.forEach(u => {
        categories.forEach(c => {
            const row = document.createElement('div');
            row.className = "stat-row";
            const key = `${u.toLowerCase().slice(0,3)}_${c.key}`;
            row.innerHTML = `
                <input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" class="bg-transparent text-sm font-bold outline-none leading-none" value="1000">
                <div class="text-[9px] font-black text-slate-500 text-center uppercase leading-none px-2">${u} ${c.label}</div>
                <input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" class="bg-transparent text-sm font-bold outline-none text-right leading-none" value="1000">
            `;
            table.appendChild(row);
        });
    });

    // 3. Bind Change Event for Modal
    document.getElementById('hero-select').addEventListener('change', (e) => {
        renderSkillsInModal(e.target.value, activeSlot.index);
    });

    // 4. Final initialization
    window.updateFormation('atk');
    window.updateFormation('def');
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
    const row = el.closest('.stat-row'), a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    if (vA > vD) { a.style.color = '#10b981'; d.style.color = '#ef4444'; }
    else if (vD > vA) { a.style.color = '#ef4444'; d.style.color = '#10b981'; }
    else { a.style.color = '#64748b'; d.style.color = '#64748b'; }
};

window.openHeroModal = (side, index) => {
    activeSlot = { side, index };
    const h = state[side].heroes[index];
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index, h);
    document.getElementById('heroModal').classList.remove('hidden');
    document.getElementById('heroModal').classList.add('flex');
};

function renderSkillsInModal(heroName, slotIndex, currentData = null) {
    const container = document.getElementById('skill-inputs');
    container.innerHTML = '';
    if (heroName === "None") return;

    const heroInfo = HEROES[heroName];
    const maxSkills = (slotIndex < 3) ? heroInfo.skills.length : 1;

    for (let i = 0; i < maxSkills; i++) {
        const skill = heroInfo.skills[i];
        const lv = currentData ? currentData['s'+(i+1)] : 1;
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                <span>${skill.name}</span><span id="lv-${i+1}-disp" class="text-blue-400">${lv}</span>
            </div>
            <input type="range" min="1" max="5" value="${lv}" class="w-full accent-blue-500" 
                   oninput="document.getElementById('lv-${i+1}-disp').innerText = this.value">
        `;
        container.appendChild(div);
    }
}

window.closeHeroModal = () => document.getElementById('heroModal').classList.add('hidden');

window.saveHeroConfig = () => {
    const { side, index } = activeSlot;
    const sliders = document.querySelectorAll('#skill-inputs input');
    state[side].heroes[index] = {
        name: document.getElementById('hero-select').value,
        s1: parseInt(sliders[0]?.value || 1),
        s2: parseInt(sliders[1]?.value || 1),
        s3: parseInt(sliders[2]?.value || 1),
        star: 5, sub: 0
    };
    updateGrids(); window.closeHeroModal();
};

function updateGrids() {
    ['atk', 'def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`);
        if (!container) return;
        container.innerHTML = '';
        state[side].heroes.forEach((h, i) => {
            const div = document.createElement('div');
            div.className = `hero-circle ${i < 3 ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''} overflow-hidden`;
            if (h.name !== 'None') {
                div.innerHTML = `<img src="./assets/${h.name}.png" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextSibling.style.display='block'"><span style="display:none">${h.name[0]}</span>`;
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
    const r = runCombatSim(setup);
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('result-waves').innerText = `Ended after ${r.wave} waves`;
    document.getElementById('res-atk-total').innerText = Math.round(r.m_cur.inf+r.m_cur.cav+r.m_cur.arc).toLocaleString();
    document.getElementById('res-def-total').innerText = Math.round(r.e_cur.inf+r.e_cur.cav+r.e_cur.arc).toLocaleString();
    document.getElementById('res-atk-details').innerHTML = `Infantry: ${Math.round(r.m_cur.inf).toLocaleString()}<br>Cavalry: ${Math.round(r.m_cur.cav).toLocaleString()}<br>Archer: ${Math.round(r.m_cur.arc).toLocaleString()}`;
    document.getElementById('res-def-details').innerHTML = `Infantry: ${Math.round(r.e_cur.inf).toLocaleString()}<br>Cavalry: ${Math.round(r.e_cur.cav).toLocaleString()}<br>Archer: ${Math.round(r.e_cur.arc).toLocaleString()}`;
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') window.closeHeroModal(); });
document.addEventListener('DOMContentLoaded', init);
