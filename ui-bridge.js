let activeSlot = { side: null, index: null };
let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 1, s2: 1, s3: 1 })) }
};

export function initBridge(HEROES) {
    // 1. Populate Hero Dropdown
    const select = document.getElementById('hero-select');
    select.innerHTML = '<option value="None">None</option>';
    Object.keys(HEROES).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.innerText = name;
        select.appendChild(opt);
    });

    // 2. Build Stat Table
    const table = document.getElementById('stat-table');
    const stats = ["Attack", "Defense", "Lethality", "Health"];
    const types = ["Infantry", "Cavalry", "Archer"];
    
    types.forEach(type => {
        stats.forEach(stat => {
            const row = document.createElement('div');
            row.className = "grid grid-cols-[1fr_1.5fr_1fr] items-center px-4 py-2 hover:bg-white/5 transition rounded-xl";
            row.innerHTML = `
                <input type="number" data-side="atk" class="bg-transparent text-center text-sm font-bold outline-none" value="1000">
                <div class="stat-label">${type} ${stat}</div>
                <input type="number" data-side="def" class="bg-transparent text-center text-sm font-bold outline-none" value="1000">
            `;
            table.appendChild(row);
        });
    });

    // 3. Modal Handlers
    window.openHeroModal = (side, index) => {
        activeSlot = { side, index };
        const data = state[side].heroes[index];
        document.getElementById('hero-select').value = data.name;
        renderSkills(index < 3, data);
        document.getElementById('heroModal').classList.remove('hidden');
        document.getElementById('heroModal').classList.add('flex');
    };

    window.closeHeroModal = () => {
        document.getElementById('heroModal').classList.add('hidden');
        document.getElementById('heroModal').classList.remove('flex');
    };

    // Click outside to close
    document.getElementById('heroModal').addEventListener('mousedown', (e) => {
        if (e.target.id === 'heroModal') window.closeHeroModal();
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.closeHeroModal();
    });

    updateGrids();
}

function renderSkills(isLeader, data) {
    const container = document.getElementById('skill-inputs');
    container.innerHTML = '';
    const count = isLeader ? 3 : 1;
    for (let i = 1; i <= count; i++) {
        const div = document.createElement('div');
        div.innerHTML = `
            <label class="text-[9px] font-bold text-slate-500 uppercase">Skill ${i} Lv: <span class="text-blue-400" id="lv-${i}-val">${data['s'+i]}</span></label>
            <input type="range" min="1" max="5" value="${data['s'+i]}" class="w-full accent-blue-500" 
                   oninput="document.getElementById('lv-${i}-val').innerText = this.value">
        `;
        container.appendChild(div);
    }
}

window.saveHeroConfig = () => {
    const { side, index } = activeSlot;
    const name = document.getElementById('hero-select').value;
    const inputs = document.getElementById('skill-inputs').querySelectorAll('input');
    
    state[side].heroes[index] = {
        name,
        s1: inputs[0] ? parseInt(inputs[0].value) : 1,
        s2: inputs[1] ? parseInt(inputs[1].value) : 1,
        s3: inputs[2] ? parseInt(inputs[2].value) : 1
    };
    updateGrids();
    window.closeHeroModal();
};

function updateGrids() {
    ['atk', 'def'].forEach(side => {
        const grid = document.getElementById(`${side}-hero-grid`);
        grid.innerHTML = '';
        state[side].heroes.forEach((h, i) => {
            const div = document.createElement('div');
            div.className = `hero-circle ${i < 3 ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
            div.innerText = h.name !== 'None' ? h.name[0] : (i + 1);
            div.onclick = () => window.openHeroModal(side, i);
            grid.appendChild(div);
        });
    });
}
