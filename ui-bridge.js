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
            // Strict alignment: grid-cols, items-center, and a fixed height to prevent "stepping"
            row.className = "grid grid-cols-[1fr_1.5fr_1fr] items-center h-10 px-6 hover:bg-white/5 transition rounded-lg";
            const key = `${u.toLowerCase().slice(0,3)}_${c.key}`;
            
            row.innerHTML = `
                <input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" 
                       class="bg-transparent text-sm font-bold outline-none text-emerald-400 p-0 m-0 border-none focus:ring-0 leading-none" value="1000">
                <div class="text-[9px] font-black text-slate-500 text-center uppercase whitespace-nowrap m-0 p-0 leading-none">${u} ${c.label}</div>
                <input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" 
                       class="bg-transparent text-sm font-bold outline-none text-red-400 text-right p-0 m-0 border-none focus:ring-0 leading-none" value="1000">
            `;
            table.appendChild(row);
        });
    });
    window.updateFormation('atk'); 
    window.updateFormation('def');
    document.querySelectorAll('.stat-row input').forEach(i => window.updateStatColors(i));
    updateGrids();
}

window.syncTroops = (side, master) => {
    const inf = document.getElementById(`${side}-inf`);
    const cav = document.getElementById(`${side}-cav`);
    const arc = document.getElementById(`${side}-arc`);
    const infP = document.getElementById(`${side}-inf-p`);
    const cavP = document.getElementById(`${side}-cav-p`);
    const arcP = document.getElementById(`${side}-arc-p`);

    if (master === 'count') {
        const total = parseFloat(inf.value || 0) + parseFloat(cav.value || 0) + parseFloat(arc.value || 0);
        if (total > 0) {
            infP.value = ((inf.value / total) * 100).toFixed(1);
            cavP.value = ((cav.value / total) * 100).toFixed(1);
            arcP.value = ((arc.value / total) * 100).toFixed(1);
        }
    } else {
        const total = parseFloat(inf.value || 0) + parseFloat(cav.value || 0) + parseFloat(arc.value || 0);
        const currentTotalP = parseFloat(infP.value || 0) + parseFloat(cavP.value || 0) + parseFloat(arcP.value || 0);
        // If percentages are changed, we keep the existing total army size
        inf.value = Math.round((parseFloat(infP.value || 0) / 100) * total);
        cav.value = Math.round((parseFloat(cavP.value || 0) / 100) * total);
        arc.value = Math.round((parseFloat(arcP.value || 0) / 100) * total);
    }
    window.updateFormation(side);
};

window.updateFormation = (side) => {
    const inf = parseFloat(document.getElementById(`${side}-inf`).value) || 0;
    const cav = parseFloat(document.getElementById(`${side}-cav`).value) || 0;
    const arc = parseFloat(document.getElementById(`${side}-arc`).value) || 0;
    const total = inf + cav + arc; if (total === 0) return;
    const bar = document.getElementById(`${side}-f-bar`);
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
    const vA = parseFloat(a.value) || 0, vD = parseFloat(d.value) || 0;
    
    // Logic: Higher Green, Lower Red, Equal Gray
    if (vA > vD) {
        a.style.color = '#10b981'; d.style.color = '#ef4444';
    } else if (vD > vA) {
        a.style.color = '#ef4444'; d.style.color = '#10b981';
    } else {
        a.style.color = '#94a3b8'; d.style.color = '#94a3b8';
    }
};

window.openHeroModal = (side, index) => {
    activeSlot = { side, index };
    const hData = state[side].heroes[index];
    const heroSelect = document.getElementById('hero-select');
    heroSelect.value = hData.name;
    
    const container = document.getElementById('skill-inputs');
    container.innerHTML = '';

    // If a hero is selected, show their specific skills
    if (hData.name !== "None") {
        const heroInfo = HEROES[hData.name];
        // Rules: Leader gets up to 3 skills, Joiner gets exactly 1.
        const maxSkillsAllowed = (index < 3) ? heroInfo.skills.length : 1;

        for (let i = 0; i < maxSkillsAllowed; i++) {
            const skill = heroInfo.skills[i];
            const div = document.createElement('div');
            div.innerHTML = `
                <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                    <span>${skill.name}</span><span id="lv-${i+1}-disp" class="text-blue-400">${hData['s'+(i+1)]}</span>
                </div>
                <input type="range" min="1" max="5" value="${hData['s'+(i+1)]}" class="w-full accent-blue-500" 
                       oninput="document.getElementById('lv-${i+1}-disp').innerText = this.value">
            `;
            container.appendChild(div);
        }
    }

    document.getElementById('heroModal').classList.remove('hidden');
    document.getElementById('heroModal').classList.add('flex');
};

// Re-render skills when hero dropdown changes in modal
document.getElementById('hero-select').onchange = (e) => {
    const tempState = { name: e.target.value, s1: 1, s2: 1, s3: 1 };
    renderSkillsForModal(activeSlot.index < 3, tempState);
};

function renderSkillsForModal(isLeader, hData) {
    const container = document.getElementById('skill-inputs');
    container.innerHTML = '';
    if (hData.name === "None") return;

    const heroInfo = HEROES[hData.name];
    const count = isLeader ? heroInfo.skills.length : 1;

    for (let i = 0; i < count; i++) {
        const skill = heroInfo.skills[i];
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                <span>${skill.name}</span><span id="lv-${i+1}-disp" class="text-blue-400">1</span>
            </div>
            <input type="range" min="1" max="5" value="1" class="w-full accent-blue-500" 
                   oninput="document.getElementById('lv-${i+1}-disp').innerText = this.value">
        `;
        container.appendChild(div);
    }
}

window.closeHeroModal = () => { document.getElementById('heroModal').classList.remove('flex'); document.getElementById('heroModal').classList.add('hidden'); };

window.saveHeroConfig = () => {
    const { side, index } = activeSlot; const sliders = document.querySelectorAll('#skill-inputs input');
    state[side].heroes[index] = { name: document.getElementById('hero-select').value, s1: parseInt(sliders[0]?.value || 1), s2: parseInt(sliders[1]?.value || 1), s3: parseInt(sliders[2]?.value || 1), star: 5, sub: 0 };
    updateGrids(); window.closeHeroModal();
};

// --- ICON SUPPORT IN GRID ---
function updateGrids() {
    ['atk', 'def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`);
        container.innerHTML = '';
        state[side].heroes.forEach((h, i) => {
            const div = document.createElement('div');
            div.className = `hero-circle ${i < 3 ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''} overflow-hidden`;
            
            // Logic for Icons
            if (h.name !== 'None') {
                // We assume icons are named exactly like the hero, e.g., "Amadeus.png"
                div.innerHTML = `<img src="./assets/heroes/${h.name}.png" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextSibling.style.display='block'">
                                 <span style="display:none">${h.name[0]}</span>`;
            } else {
                div.innerText = (i + 1);
            }

            div.onclick = () => window.openHeroModal(side, i);
            container.appendChild(div);
        });
    });
}

function updateGrids() {
    ['atk', 'def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`); if(!container) return;
        container.innerHTML = '';
        state[side].heroes.forEach((h, i) => {
            const div = document.createElement('div');
            div.className = `hero-circle ${i < 3 ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
            div.innerText = h.name !== 'None' ? h.name[0] : (i + 1);
            div.onclick = () => window.openHeroModal(side, i);
            container.appendChild(div);
        });
    });
}

window.handleSimulation = () => {
    const getStats = (side) => {
        const stats = {}; document.querySelectorAll(`input[data-side="${side}"]`).forEach(i => stats[i.dataset.stat] = parseFloat(i.value) || 0); return stats;
    };
    const setup = {
        atk: { 
            troops: { inf: parseFloat(document.getElementById('atk-inf').value)||0, cav: parseFloat(document.getElementById('atk-cav').value)||0, arc: parseFloat(document.getElementById('atk-arc').value)||0 }, 
            tier: parseInt(document.getElementById('atk-tier').value), 
            tg: parseInt(document.getElementById('atk-tg').value), 
            stats: getStats('atk'), heroes: state.atk.heroes 
        },
        def: { 
            troops: { inf: parseFloat(document.getElementById('def-inf').value)||0, cav: parseFloat(document.getElementById('def-cav').value)||0, arc: parseFloat(document.getElementById('def-arc').value)||0 }, 
            tier: parseInt(document.getElementById('def-tier').value), 
            tg: parseInt(document.getElementById('def-tg').value), 
            stats: getStats('def'), heroes: state.def.heroes 
        }
    };
    const r = runCombatSim(setup);

    // Display result screen
    const screen = document.getElementById('result-screen');
    screen.classList.remove('hidden');
    
    document.getElementById('result-waves').innerText = `Simulation complete after ${r.wave} waves`;
    
    const atkTotal = Math.round(r.m_cur.inf + r.m_cur.cav + r.m_cur.arc);
    const defTotal = Math.round(r.e_cur.inf + r.e_cur.cav + r.e_cur.arc);
    
    document.getElementById('res-atk-total').innerText = atkTotal.toLocaleString();
    document.getElementById('res-def-total').innerText = defTotal.toLocaleString();
    
    document.getElementById('res-atk-details').innerHTML = `
        Infantry: ${Math.round(r.m_cur.inf).toLocaleString()}<br>
        Cavalry: ${Math.round(r.m_cur.cav).toLocaleString()}<br>
        Archer: ${Math.round(r.m_cur.arc).toLocaleString()}
    `;
    
    document.getElementById('res-def-details').innerHTML = `
        Infantry: ${Math.round(r.e_cur.inf).toLocaleString()}<br>
        Cavalry: ${Math.round(r.e_cur.cav).toLocaleString()}<br>
        Archer: ${Math.round(r.e_cur.arc).toLocaleString()}
    `;
    
    // Smooth scroll to result
    screen.scrollIntoView({ behavior: 'smooth' });
};

window.toggleDetails = () => {
    const d = document.getElementById('battle-details');
    d.classList.toggle('hidden');
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') window.closeHeroModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeHeroModal(); });
document.addEventListener('DOMContentLoaded', init);
