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
                <input type="number" data-side="atk" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#10b981; font-size:14px; font-weight:800; width:70px;" value="1000">
                <div style="font-size:9px; font-weight:900; color:#64748b; text-align:center; text-transform:uppercase; flex-grow:1;">${u} ${c.label}</div>
                <input type="number" data-side="def" data-stat="${key}" oninput="window.updateStatColors(this)" style="background:transparent; border:none; outline:none; color:#ef4444; font-size:14px; font-weight:800; width:70px; text-align:right;" value="1000">
            `;
            table.appendChild(row);
        });
    });

    window.addBatch('atk', true); 
    window.addBatch('def', true);
    document.getElementById('hero-select').addEventListener('change', (e) => renderSkillsInModal(e.target.value, activeSlot.index));
    updateGrids();
}

window.showTab = (tab) => {
    const bTab = document.getElementById('battle-tab');
    const fTab = document.getElementById('optimizer-screen');
    const bBtn = document.getElementById('btn-tab-battle');
    const fBtn = document.getElementById('btn-tab-form');

    if (tab === 'battle') {
        bTab.classList.remove('hidden'); fTab.classList.add('hidden');
        bBtn.classList.add('bg-blue-600'); bBtn.classList.remove('text-slate-500');
        fBtn.classList.remove('bg-blue-600'); fBtn.classList.add('text-slate-500');
    } else {
        bTab.classList.add('hidden'); fTab.classList.remove('hidden');
        fBtn.classList.add('bg-blue-600'); fBtn.classList.remove('text-slate-500');
        bBtn.classList.remove('bg-blue-600'); bBtn.classList.add('text-slate-500');
    }
};

window.addBatch = (side, initial = false) => {
    const container = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3 relative mb-2";
    div.innerHTML = `
        <div class="flex justify-between items-center"><div class="flex gap-2">
                <select class="batch-tier bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
                    ${[11,10,9,8,7,6,5,4,3,2,1].map(t => `<option value="${t}" ${t===10?'selected':''}>T${t}</option>`).join('')}
                </select>
                <select class="batch-tg bg-slate-900 text-[10px] border border-slate-700 rounded px-1 font-bold text-slate-400 outline-none">
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
        bar.children[0].style.width = (i/total*100)+'%'; bar.children[1].style.width = (c/total*100)+'%'; bar.children[2].style.width = (a/total*100)+'%';
        document.getElementById(`${side}-inf-pct`).innerText = Math.round(i/total*100)+'%';
        document.getElementById(`${side}-cav-pct`).innerText = Math.round(c/total*100)+'%';
        document.getElementById(`${side}-arc-pct`).innerText = Math.round(a/total*100)+'%';
    }
};

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
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
    let rAvg, rLuck, rBad, modeLabel;

     if (simMode === 'monte-carlo') {
        modeLabel = "Deep Sim (100 Runs)";
        const runs = 100; let batch = [];
        for (let i = 0; i < runs; i++) batch.push(runCombatSim(setup, 'stochastic', 'stochastic'));
        
        batch.sort((a, b) => (a.m_cur.inf + a.m_cur.cav + a.m_cur.arc) - (b.m_cur.inf + b.m_cur.cav + b.m_cur.arc));
        
        // Winner-Takes-All Averaging
        const atkWins = batch.filter(r => (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) > (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc)).length;
        const winner = atkWins >= 50 ? 'atk' : 'def';

        rAvg = {
            m_cur: { 
                inf: winner === 'atk' ? batch.reduce((s, r) => s + r.m_cur.inf, 0) / runs : 0,
                cav: winner === 'atk' ? batch.reduce((s, r) => s + r.m_cur.cav, 0) / runs : 0,
                arc: winner === 'atk' ? batch.reduce((s, r) => s + r.m_cur.arc, 0) / runs : 0
            },
            e_cur: {
                inf: winner === 'def' ? batch.reduce((s, r) => s + r.e_cur.inf, 0) / runs : 0,
                cav: winner === 'def' ? batch.reduce((s, r) => s + r.e_cur.cav, 0) / runs : 0,
                arc: winner === 'def' ? batch.reduce((s, r) => s + r.e_cur.arc, 0) / runs : 0
            },
            wave: Math.round(batch.reduce((s, r) => s + r.wave, 0) / runs),
            atk_mults: batch[Math.floor(runs/2)].atk_mults,
            def_mults: batch[Math.floor(runs/2)].def_mults,
            startAtk: batch[0].startAtk, startDef: batch[0].startDef
        };
        rWorst = batch[0]; rBest = batch[runs-1];
    } else {
        modeLabel = "Quick Sim (Estimate)";
        rAvg = runCombatSim(setup, 'average', 'average');
        rBest = runCombatSim(setup, 'lucky', 'unlucky', rAvg.wave);
        rWorst = runCombatSim(setup, 'unlucky', 'lucky', rAvg.wave);
    }

    const screen = document.getElementById('result-screen');
    screen.classList.remove('hidden');

    const getScore = (r) => ( (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / r.startDef ) - ( (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / r.startAtk );
    const sMin = getScore(rLuck), sMax = getScore(rBad);
    const luckBar = document.getElementById('luck-visual-bar');
    luckBar.style.left = ((Math.min(sMin, sMax) + 1) * 50) + "%";
    luckBar.style.width = Math.max(1.5, Math.abs(sMax - sMin) * 50) + "%";

    document.getElementById('result-waves').innerText = `Mode: ${modeLabel} | Avg Length: ${rAvg.wave} waves`;
    document.getElementById('res-atk-total').innerHTML = `<span>${Math.round(rAvg.m_cur.inf+rAvg.m_cur.cav+rAvg.m_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Worst-Best: ${Math.round(rBad.m_cur.inf+rBad.m_cur.cav+rBad.m_cur.arc).toLocaleString()} - ${Math.round(rLuck.m_cur.inf+rLuck.m_cur.cav+rLuck.m_cur.arc).toLocaleString()}</div>`;
    document.getElementById('res-def-total').innerHTML = `<span>${Math.round(rAvg.e_cur.inf+rAvg.e_cur.cav+rAvg.e_cur.arc).toLocaleString()}</span><div class="text-[10px] text-slate-500 italic">Worst-Best: ${Math.round(rLuck.e_cur.inf+rLuck.e_cur.cav+rLuck.e_cur.arc).toLocaleString()} - ${Math.round(rBad.e_cur.inf+rBad.e_cur.cav+rBad.e_cur.arc).toLocaleString()}</div>`;

    document.getElementById('res-atk-details').innerText = `Inf: ${Math.round(rAvg.m_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.m_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.m_cur.arc).toLocaleString()}`;
    document.getElementById('res-def-details').innerText = `Inf: ${Math.round(rAvg.e_cur.inf).toLocaleString()} | Cav: ${Math.round(rAvg.e_cur.cav).toLocaleString()} | Arc: ${Math.round(rAvg.e_cur.arc).toLocaleString()}`;
    document.getElementById('battle-details').innerHTML = `<div class="text-emerald-500 font-black mb-2">[ATTACKER BUFFS]</div>` + rAvg.atk_mults.map(l => `<div>• ${l}</div>`).join('') + `<div class="text-red-500 font-black mb-2 mt-4">[DEFENDER BUFFS]</div>` + rAvg.def_mults.map(l => `<div>• ${l}</div>`).join('');
    document.getElementById('result-screen').scrollIntoView({ behavior: 'smooth' });
};

window.toggleDetails = () => {
    const isHidden = document.getElementById('battle-details').classList.toggle('hidden');
    document.getElementById('toggle-details-btn').innerText = isHidden ? 'View Combat Modifiers +' : 'Hide Combat Modifiers -';
};

window.runOptimizer = (type = 'current') => {
    const screen = document.getElementById('optimizer-screen');
    screen.classList.remove('hidden');
    
    // 1. Setup Environment
    const getStats = (s) => { const obj = {}; document.querySelectorAll(`input[data-side="${s}"]`).forEach(i => obj[i.dataset.stat] = parseFloat(i.value)||0); return obj; };
    const collectDef = () => Array.from(document.querySelectorAll(`#def-batch-container > div`)).map(el => ({ tier: 10, tg: 3, inf: parseFloat(el.querySelector('.batch-inf').value)||0, cav: parseFloat(el.querySelector('.batch-cav').value)||0, arc: parseFloat(el.querySelector('.batch-arc').value)||0 }));
    
    const currentDef = collectDef();
    const attackerTotal = setup.atk.batches.reduce((s, b) => s + b.inf + b.cav + b.arc, 0); // Use user's army size
    const atkStats = getStats('atk'); const defStats = getStats('def');

    let metaDefenders = [];
    if (type === 'meta') {
        for (let i=0; i<=100; i+=10) for (let j=0; j<=100-i; j+=10) metaDefenders.push({ inf: i/100, cav: j/100, arc: (100-i-j)/100 });
    } else {
        const total = currentDef.reduce((s, b) => s + b.inf + b.cav + b.arc, 0);
        metaDefenders.push({ inf: currentDef[0].inf/total, cav: currentDef[0].cav/total, arc: currentDef[0].arc/total });
    }

    let dataPoints = { a: [], b: [], c: [], z: [] };
    let best = { form: [0,0,0], winrate: -1, netSurv: -Infinity };

    // 2. The Search Loop (Min Inf = 20%)
    for (let i = 20; i <= 100; i += 1) { // 1% resolution
        for (let j = 0; j <= 100 - i; j += 1) {
            let k = 100 - i - j;
            let wins = 0; let totalNetSurv = 0;

            metaDefenders.forEach(def => {
                const s = {
                    atk: { batches: [{ tier: 10, tg: 3, inf: i*(attackerTotal/100), cav: j*(attackerTotal/100), arc: k*(attackerTotal/100) }], stats: atkStats, heroes: state.atk.heroes },
                    def: { batches: [{ tier: 10, tg: 3, inf: def.inf*attackerTotal, cav: def.cav*attackerTotal, arc: def.arc*attackerTotal }], stats: defStats, heroes: state.def.heroes }
                };
                const r = runCombatSim(s, 'average', 'average');
                const aSurv = (r.m_cur.inf + r.m_cur.cav + r.m_cur.arc) / attackerTotal;
                const dSurv = (r.e_cur.inf + r.e_cur.cav + r.e_cur.arc) / attackerTotal;
                if (aSurv > dSurv) wins++;
                totalNetSurv += (aSurv - dSurv);
            });

            const winrate = wins / metaDefenders.length;
            dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k); dataPoints.z.push(type === 'meta' ? winrate : totalNetSurv);

            // Decision Logic: Winrate first, then Total Survivors
            if (winrate > best.winrate || (winrate === best.winrate && totalNetSurv > best.netSurv)) {
                best = { winrate, netSurv: totalNetSurv, form: [i, j, k] };
            }
        }
    }

    // 3. Render
    Plotly.newPlot('ternary-plot', [{ type: 'scatterternary', mode: 'markers', a: dataPoints.a, b: dataPoints.b, c: dataPoints.c, marker: { size: 6, color: dataPoints.z, colorscale: 'Portland' } }], { ternary: { sum: 100, aaxis: {title: 'Inf'}, baxis: {title: 'Cav'}, caxis: {title: 'Arc'} }, paper_bgcolor: 'rgba(0,0,0,0)', font: {color: '#64748b'} });
    document.getElementById('opt-best-form').innerText = `${best.form[0]}% / ${best.form[1]}% / ${best.form[2]}%`;
    document.getElementById('opt-best-score').innerText = type === 'meta' ? `Winrate against all formations: ${(best.winrate * 100).toFixed(1)}%` : `Best result found at ${best.form[0]}% Infantry.`;
};

document.getElementById('heroModal').addEventListener('mousedown', (e) => { if (e.target.id === 'heroModal') document.getElementById('heroModal').classList.replace('flex', 'hidden'); });
document.addEventListener('DOMContentLoaded', init);
