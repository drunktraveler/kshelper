import { HEROES } from '../heroes.js';

// --- INITIAL STATE ---
let activeSlot = { side: null, index: null };
let state = {
    atk: { tier: 10, tg: 3, heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1 })) },
    def: { tier: 10, tg: 3, heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1 })) }
};

// --- MODAL LOGIC ---
window.openHeroModal = function(side, index) {
    activeSlot = { side, index };
    const heroData = state[side].heroes[index];
    
    // Update Modal UI
    document.getElementById('modalTitle').innerText = `${side === 'atk' ? 'Attacker' : 'Defender'} - Slot ${index + 1}`;
    document.getElementById('hero-select').value = heroData.name;
    
    renderSkillInputs(index < 3, heroData); // index 0,1,2 are Leaders
    
    document.getElementById('heroModal').classList.remove('hidden');
    document.getElementById('heroModal').classList.add('flex');
};

window.closeHeroModal = function() {
    document.getElementById('heroModal').classList.add('hidden');
    document.getElementById('heroModal').classList.remove('flex');
};

// Close on Click Outside or ESC
document.getElementById('heroModal').addEventListener('click', (e) => {
    if (e.target.id === 'heroModal') closeHeroModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHeroModal();
});

// --- DYNAMIC SKILL RENDERING ---
function renderSkillInputs(isLeader, currentData) {
    const container = document.getElementById('skill-inputs');
    container.innerHTML = ''; // Clear previous

    const skillCount = isLeader ? 3 : 1;
    for (let i = 1; i <= skillCount; i++) {
        const div = document.createElement('div');
        div.innerHTML = `
            <label class="text-[10px] font-bold text-slate-500 uppercase block mb-2">Skill ${i} Level</label>
            <div class="flex items-center gap-4">
                <input type="range" min="1" max="5" value="${currentData[`s${i}`]}" 
                       class="flex-grow accent-blue-500" id="skill-lv-${i}">
                <span class="text-blue-400 font-bold w-4" id="skill-val-${i}">${currentData[`s${i}`]}</span>
            </div>
        `;
        container.appendChild(div);
        
        // Live update the number next to slider
        const slider = div.querySelector('input');
        slider.oninput = (e) => document.getElementById(`skill-val-${i}`).innerText = e.target.value;
    }
}

// --- SAVE & SYNC ---
window.saveHeroConfig = function() {
    const { side, index } = activeSlot;
    const name = document.getElementById('hero-select').value;
    
    state[side].heroes[index] = {
        name: name,
        s1: parseInt(document.getElementById('skill-lv-1')?.value || 1),
        s2: parseInt(document.getElementById('skill-lv-2')?.value || 1),
        s3: parseInt(document.getElementById('skill-lv-3')?.value || 1)
    };
    
    updateHeroGridUI();
    closeHeroModal();
};

function updateHeroGridUI() {
    ['atk', 'def'].forEach(side => {
        const grid = document.getElementById(`${side}-hero-grid`);
        grid.innerHTML = '';
        state[side].heroes.forEach((hero, idx) => {
            const circle = document.createElement('div');
            circle.className = `hero-circle ${idx < 3 ? 'hero-leader' : ''} ${hero.name !== 'None' ? 'active' : ''}`;
            circle.onclick = () => openHeroModal(side, idx);
            circle.innerText = hero.name !== 'None' ? hero.name[0] : (idx + 1);
            grid.appendChild(circle);
        });
    });
}

// Initial Run
document.addEventListener('DOMContentLoaded', () => {
    // Populate Hero Dropdown
    const select = document.getElementById('hero-select');
    Object.keys(HEROES).forEach(h => {
        const opt = document.createElement('option');
        opt.value = h; opt.innerText = h;
        select.appendChild(opt);
    });
    updateHeroGridUI();
});
