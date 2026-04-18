import { HEROES } from '../heroes.js';
import { runCombatSim } from './engine.js';
import { GROWTH_TEMPLATES } from '../data/constants.js';

let activeSlot = { side: null, index: null };
let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1 })) }
};

function calculateHeroStarBonus(heroName, star, substage) {
    const hero = HEROES[heroName];
    if (!hero || hero.name === "None") return 0;

    // 1. Get the template name (e.g., "SEASON_1")
    const templateKey = hero.template; 

    // 2. Get the actual array from constants.js
    const statsArray = GROWTH_TEMPLATES[templateKey]; 

    // 3. Calculate the index (0-30)
    const index = (star * 6) + substage; 

    // 4. Return the percentage value (e.g., 200.16)
    return statsArray[index];
}

// --- INITIALIZE UI ---
function init() {
    // 1. Hero Dropdown
    const sel = document.getElementById('hero-select');
    sel.innerHTML = '<option value="None">None</option>';
    Object.keys(HEROES).sort().forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.innerText = n;
        sel.appendChild(o);
    });

    // 2. Stat Table
    const table = document.getElementById('stat-table');
    const categories = ["Attack", "Defense", "Lethality", "Health"];
    const units = ["Infantry", "Cavalry", "Archer"];
    
    units.forEach(u => {
        categories.forEach(c => {
            const row = document.createElement('div');
            row.className = "stat-row";
            row.innerHTML = `
                <input type="number" class="bg-transparent text-sm font-bold outline-none text-emerald-400" value="1000">
                <div class="text-[10px] font-black uppercase text-slate-500 text-center">${u} ${c}</div>
                <input type="number" class="bg-transparent text-sm font-bold outline-none text-red-400 text-right" value="1000">
            `;
            table.appendChild(row);
        });
    });

    window.updateFormation('atk');
    window.updateFormation('def');
    updateGrids();
}

// --- GLOBAL ACCESSIBLE FUNCTIONS ---
window.updateFormation = (side) => {
    const inf = parseFloat(document.getElementById(`${side}-inf`).value) || 0;
    const cav = parseFloat(document.getElementById(`${side}-cav`).value) || 0;
    const arc = parseFloat(document.getElementById(`${side}-arc`).value) || 0;
    const total = inf + cav + arc;
    if (total === 0) return;

    const iP = (inf / total) * 100;
    const cP = (cav / total) * 100;
    const aP = (arc / total) * 100;

    const bar = document.getElementById(`${side}-f-bar`);
    bar.children[0].style.width = iP + '%';
    bar.children[1].style.width = cP + '%';
    bar.children[2].style.width = aP + '%';

    document.getElementById(`${side}-inf-pct`).innerText = Math.round(iP) + '%';
    document.getElementById(`${side}-cav-pct`).innerText = Math.round(cP) + '%';
    document.getElementById(`${side}-arc-pct`).innerText = Math.round(aP) + '%';
};

window.openHeroModal = (side, index) => {
    activeSlot = { side, index };
    const hData = state[side].heroes[index];
    document.getElementById('hero-select').value = hData.name;
    
    // Skill Inputs
    const container = document.getElementById('skill-inputs');
    container.innerHTML = '';
    const count = index < 3 ? 3 : 1;
    for (let i = 1; i <= count; i++) {
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                <span>Skill ${i} Level</span><span id="lv-${i}-disp" class="text-blue-400">${hData['s'+i]}</span>
            </div>
            <input type="range" min="1" max="5" value="${hData['s'+i]}" class="w-full accent-blue-500" 
                   oninput="document.getElementById('lv-${i}-disp').innerText = this.value">
        `;
        container.appendChild(div);
    }

    document.getElementById('heroModal').classList.remove('hidden');
    document.getElementById('heroModal').classList.add('flex');
};

window.closeHeroModal = () => {
    document.getElementById('heroModal').classList.add('hidden');
    document.getElementById('heroModal').classList.remove('flex');
};

window.saveHeroConfig = () => {
    const { side, index } = activeSlot;
    const sliders = document.getElementById('skill-inputs').querySelectorAll('input');
    state[side].heroes[index] = {
        name: document.getElementById('hero-select').value,
        s1: sliders[0] ? parseInt(sliders[0].value) : 1,
        s2: sliders[1] ? parseInt(sliders[1].value) : 1,
        s3: sliders[2] ? parseInt(sliders[2].value) : 1
    };
    updateGrids();
    window.closeHeroModal();
};

// --- INTERNAL HELPERS ---
function updateGrids() {
    ['atk', 'def'].forEach(side => {
        const container = document.getElementById(`${side}-hero-grid`);
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

// Close Modal logic
document.getElementById('heroModal').addEventListener('mousedown', (e) => {
    if (e.target.id === 'heroModal') window.closeHeroModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeHeroModal();
});

window.handleSimulation = function() {
    const setup = {
        settings: { atkWidgets: 3, defWidgets: 3 },
        atk: {
            troops: { 
                inf: parseFloat(document.getElementById('atk-inf').value),
                cav: parseFloat(document.getElementById('atk-cav').value),
                arc: parseFloat(document.getElementById('atk-arc').value)
            },
            tier: document.getElementById('atk-tier').value,
            tg: document.getElementById('atk-tg').value,
            stats: collectStats('atk'), // Helper to grab from your table
            heroes: state.atk.heroes
        },
        def: { /* mirrored ... */ }
    };

    const results = runCombatSim(setup);
    displayResults(results); // Create a popup or section to show survivors
}

// Start everything
document.addEventListener('DOMContentLoaded', init);
