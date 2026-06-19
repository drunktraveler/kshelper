import { HEROES } from './heroes.js';
import { runCombatSim, isAlive } from './engine.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';
import { WIDGET_STATS } from './widgets.js';
import { UNITS } from './units.js'; 

const sumTroops = (c) => (c.inf || 0) + (c.cav || 0) + (c.arc || 0);

let roster = JSON.parse(localStorage.getItem('ks_roster')) || {};
let nakedStats = JSON.parse(localStorage.getItem('ks_naked_stats')) || null;
let activeSlot = { side: null, index: null };
let modalTemp = { s1: 5, s2: 5, s3: 5 };
let optRole = 'atk'; 

let state = {
    atk: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5 })) },
    def: { heroes: Array(7).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5 })) },
    bear: { heroes: Array(3).fill(null).map(() => ({ name: "None", s1: 5, s2: 5, s3: 5 })) }
};

window.init = () => {
    Object.keys(HEROES).forEach(n => { if(!roster[n]) roster[n] = { unlocked: false, s1: 5, s2: 5, s3: 5, widget: 10, starIndex: 30 }; });
    const mainSel = document.getElementById('hero-select');
    if (mainSel) {
        mainSel.innerHTML = '<option value="None">None</option>';
        Object.keys(HEROES).sort().forEach(n => { mainSel.innerHTML += `<option value="${n}">${n}</option>`; });
        mainSel.onchange = (e) => renderSkillsInModal(e.target.value, activeSlot.index, activeSlot.side);
    }
    buildStatTable(); initFormationGrids(); 
    window.addBatch('atk', true); window.addBatch('def', true);
    window.updateGrids(); renderRosterUI(); 
    if(nakedStats) renderNakedStats();
    window.showTab('battle');
};

// --- STAT SCRAPER ---
function getLiveSetup(side, formationOverride = null) {
    const stats = {};
    ['inf', 'cav', 'arc'].forEach(u => {
        ['att', 'def', 'leth', 'hp'].forEach(s => {
            const el = document.querySelector(`input[data-side="${side}"][data-stat="${u}_${s}"]`);
            stats[`${u}_${s}`] = parseFloat(el?.value) || 0;
        });
    });
    const getVal = (u, type) => {
        const optEl = document.querySelector(`.opt-${side}-${u}-${type}`);
        const simEl = document.querySelector(`#${side}-batch-container .batch-${type}-${u}`);
        const raw = optEl?.value ?? simEl?.value;
        return (raw !== undefined && raw !== "") ? parseInt(raw) : (type === 'tier' ? 10 : 3);
    };
    let total = 0;
    const batchRows = document.querySelectorAll(`#${side}-batch-container > div`);
    const processed = [];
    batchRows.forEach(row => {
        const b = {
            inf: parseFloat(row.querySelector('.batch-inf').value) || 0,
            cav: parseFloat(row.querySelector('.batch-cav').value) || 0,
            arc: parseFloat(row.querySelector('.batch-arc').value) || 0,
            inf_tier: parseInt(row.querySelector('.batch-tier-inf').value),
            inf_tg: parseInt(row.querySelector('.batch-tg-inf').value),
            cav_tier: parseInt(row.querySelector('.batch-tier-cav').value),
            cav_tg: parseInt(row.querySelector('.batch-tg-cav').value),
            arc_tier: parseInt(row.querySelector('.batch-tier-arc').value),
            arc_tg: parseInt(row.querySelector('.batch-tg-arc').value)
        };
        total += (b.inf + b.cav + b.arc);
        processed.push(b);
    });
    if (formationOverride) {
        const col = {
            inf: (formationOverride[0]/100)*total, cav: (formationOverride[1]/100)*total, arc: (formationOverride[2]/100)*total,
            inf_tier: getVal('inf', 'tier'), inf_tg: getVal('inf', 'tg'),
            cav_tier: getVal('cav', 'tier'), cav_tg: getVal('cav', 'tg'),
            arc_tier: getVal('arc', 'tier'), arc_tg: getVal('arc', 'tg')
        };
        return { heroes: state[side].heroes, stats, batches: [col] };
    }
    return { heroes: state[side].heroes, stats, batches: processed };
}

// --- OPTIMIZER (5151 Simulations) ---
window.runOptimizer = async (mode) => {
    const isBear = mode === 'bear';
    const resArea = document.getElementById(isBear ? 'bear-opt-form' : 'opt-best-form');
    const scoreArea = document.getElementById(isBear ? 'bear-comparison' : 'opt-best-score');
    resArea.innerText = "Simulating...";
    setTimeout(() => {
        let dataPoints = { a: [], b: [], c: [], z: [] };
        let best = { form: [0, 0, 0], wins: -1, margin: -Infinity };
        const mySide = isBear ? 'atk' : optRole;
        const oppSide = mySide === 'atk' ? 'def' : 'atk';
        let oppSet = [];
        if (mode === 'current') oppSet.push(getLiveSetup(oppSide));
        else if (mode === 'meta') [[50,20,30], [10,10,80], [60,10,30], [33,33,34], [50,0,50], [60,40,0], [10,80,10]].forEach(f => oppSet.push(getLiveSetup(oppSide, f)));
        else if (mode === 'custom') {
            const f = [parseFloat(document.getElementById('custom-inf').value)||33, parseFloat(document.getElementById('custom-cav').value)||33, parseFloat(document.getElementById('custom-arc').value)||34];
            oppSet.push(getLiveSetup(oppSide, f));
        }

        for (let i = 0; i <= 100; i += 2) {
            for (let j = 0; j <= 100 - i; j += 2) {
                let k = 100 - i - j;
                const mySetup = getLiveSetup(mySide, [i, j, k]);
                let curWins = 0, totalMargin = 0;
                oppSet.forEach(oS => {
                    const simSetup = { atk: (mySide === 'atk' ? mySetup : oS), def: (mySide === 'def' ? mySetup : oS) };
                    const res = runCombatSim(simSetup, 'average', 'average', 1000, isBear, true);
                    if (isBear) totalMargin += res.totalDmg;
                    else {
                        const mS = sumTroops(mySide === 'atk' ? res.m_cur : res.e_cur);
                        const oS_surv = sumTroops(mySide === 'atk' ? res.e_cur : res.m_cur);
                        if (mS > oS_surv) curWins++;
                        totalMargin += (mS - oS_surv);
                    }
                });
                const finalScore = totalMargin / oppSet.length;
                if (isBear) {
                    if (finalScore > best.margin) best = { form: [i, j, k], margin: finalScore };
                    dataPoints.z.push(finalScore);
                } else {
                    if (curWins > best.wins || (curWins === best.wins && finalScore > best.margin)) best = { form:[i,j,k], wins:curWins, margin:finalScore };
                    dataPoints.z.push(curWins * 1000000 + finalScore);
                }
                dataPoints.a.push(i); dataPoints.b.push(j); dataPoints.c.push(k);
            }
        }
        renderTernary(isBear ? 'bear-plot' : 'ternary-plot', dataPoints, best, isBear);
        resArea.innerText = best.form.join(' / ');
        scoreArea.innerHTML = isBear ? `Total Dmg: ${Math.round(best.margin).toLocaleString()}` : `${mode==='meta'?'Wins: '+best.wins+'/7 | ':''}Net: ${Math.round(best.margin).toLocaleString()}`;
    }, 50);
};

// --- ACCOUNT CALIBRATION ---
window.toggleAccountStats = () => { document.getElementById('account-stats-ui').classList.toggle('hidden', !document.getElementById('use-account-stats').checked); };

window.reverseEngineerAccount = () => {
    const reportType = document.getElementById('report-type').value;
    const ctx = reportType === 'rally' ? 'off' : (reportType === 'garrison' ? 'def' : 'none');
    const leadNames = Array.from(document.querySelectorAll('.rep-hero')).map(sel => sel.value);
    const tBuffs = { att: 1+(parseFloat(document.getElementById('temp-buff-att').value)/100), def: 1+(parseFloat(document.getElementById('temp-buff-def').value)/100), leth: 1+(parseFloat(document.getElementById('temp-buff-leth').value)/100), hp: 1+(parseFloat(document.getElementById('temp-buff-hp').value)/100) };
    const results = {};
    ['inf','cav','arc'].forEach(t => ['att','def','leth','hp'].forEach(s => {
        let val = parseFloat(document.getElementById(`rep-${t}-${s}`).value) || 0;
        let wM = 0;
        leadNames.forEach(n => {
            const h = HEROES[n], r = roster[n]; if(!h || !r) return;
            if (ctx !== 'none' && h.widget && h.widget.context === ctx && h.widget.stat === (s==='att'?'attack':s==='def'?'defense':s==='leth'?'lethality':'health')) wM += WIDGET_GROWTH[r.widget];
        });
        val /= ((1 + wM) * tBuffs[s]);
        leadNames.forEach(n => {
            const h = HEROES[n], r = roster[n]; if(!h || !r || h.type.toLowerCase().slice(0,3) !== t) return;
            if (s === 'att' || s === 'def') val -= (GROWTH_TEMPLATES[h.template][r.starIndex] || 0);
            else if (h.widget && ((s==='leth' && h.widget.stat==='lethality') || (s==='hp' && h.widget.stat==='health'))) val -= (WIDGET_STATS[h.template][r.widget] || 0);
        });
        results[`${t}_${s}`] = Math.max(0, val);
    }));
    nakedStats = results; localStorage.setItem('ks_naked_stats', JSON.stringify(nakedStats)); renderNakedStats();
};

function renderNakedStats() {
    const div = document.getElementById('naked-stats-display'); div.classList.remove('hidden'); div.innerHTML = '';
    ['inf','cav','arc'].forEach(t => {
        let h = `<div class="text-[10px] font-bold uppercase">${t}</div>`;
        ['att','def','leth','hp'].forEach(s => h += `<div class="text-center"><div class="text-[7px] text-slate-500 uppercase">${s}</div><div class="text-[10px] text-white">${(nakedStats[`${t}_${s}`]||0).toFixed(1)}%</div></div>`);
        const r = document.createElement('div'); r.className="grid grid-cols-5 gap-2 border-b border-slate-800 pb-1"; r.innerHTML = h; div.appendChild(r);
    });
}

// --- BEST HEROES SEARCH ---
function getSystemVolume(leads, joiners, formation, ctx, isBear, scenario) {
    const s = nakedStats || { inf_att:1000, inf_hp:500, inf_def:1000, inf_leth:500, cav_att:1000, cav_hp:500, cav_def:1000, cav_leth:500, arc_att:1000, arc_hp:500, arc_def:1000, arc_leth:500 };
    let curS = { inf:{att:s.inf_att, leth:s.inf_leth, hp:s.inf_hp, def:s.inf_def}, cav:{att:s.cav_att, leth:s.cav_leth, hp:s.cav_hp, def:s.cav_def}, arc:{att:s.arc_att, leth:s.arc_leth, hp:s.arc_hp, def:s.arc_def} };
    let b = { inf:{101:0,102:1,103:1,104:1,105:1,106:1,201:0,202:1,203:1,204:1,205:1,250:0}, cav:{101:0,102:1,103:1,104:1,105:1,106:1,201:0,202:1,203:1,204:1,205:1,250:0}, arc:{101:0,102:1,103:1,104:1,105:1,106:1,201:0,202:1,203:1,204:1,205:1,250:0} };
    let wM = { attack:1, defense:1, lethality:1, health:1 };

    const proc = (name, isL) => {
        const h = HEROES[name], r = roster[name]; if(!h || !r) return;
        if(isL) {
            const tk = h.type.toLowerCase().slice(0,3);
            curS[tk].att += (GROWTH_TEMPLATES[h.template][r.starIndex]||0); curS[tk].def += (GROWTH_TEMPLATES[h.template][r.starIndex]||0);
            if(h.widget) {
                const f = WIDGET_STATS[h.template][r.widget]||0;
                if(h.widget.stat==='lethality') curS[tk].leth+=f; if(h.widget.stat==='health') curS[tk].hp+=f;
                if(scenario.includes("Rally") || scenario.includes("Garrison") || scenario.includes("Bear")) {
                    if(h.widget.context === ctx) wM[h.widget.stat] += WIDGET_GROWTH[r.widget];
                }
            }
        }
        h.skills.forEach((sk, si) => {
            if(!isL && si > 0) return;
            const x = sk.values[r['s'+(si+1)]-1];
            let up = sk.interval ? (sk.duration/sk.interval) : sk.getChance(x);
            if(isBear) up = sk.interval ? (1/sk.interval) : sk.getChance(x);
            const mF = sk.getMagnitude(x);
            (sk.units||["inf","cav","arc"]).forEach(u => sk.ids.forEach((id, idx) => {
                const m = Array.isArray(mF) ? mF[idx] : mF;
                let val = (typeof m === 'object' ? (m[u]||0) : m) * up;
                if(id===101 || id===201 || id===250) b[u][id] += val; else b[u][id] *= (1+val);
            }));
        });
    };
    leads.forEach(l => proc(l, true)); joiners.forEach(j => proc(j, false));
    const getOff = (u, i) => {
        const mult = (1+b[u][101])*b[u][102]*b[u][103]*b[u][104]*b[u][105]*b[u][106];
        const baseAtk = u==='inf'?472:u==='cav'?1416:1888;
        return Math.sqrt(formation[i]*1000000) * baseAtk * (1+curS[u].att/100) * wM.attack * (1+curS[u].leth/100) * wM.lethality * mult;
    };
    const off = getOff('inf',0)+getOff('cav',1)+getOff('arc',2);
    if(isBear) return off;
    const getSurv = (u, i) => {
        const mult = (1+b[u][201])*b[u][202]*b[u][203]*b[u][204]*b[u][205] * (1/(1-Math.min(0.9, b[u][250])));
        const baseHP = u==='inf'?1790:u==='cav'?597:448;
        return (formation[i]*1000000) * baseHP * (1+curS[u].hp/100) * wM.health * (1+curS[u].def/100) * wM.defense * mult;
    };
    return off * (getSurv('inf',0)+getSurv('cav',1)+getSurv('arc',2));
}

window.calculateOptimalLineups = async () => {
    const unlocked = Object.keys(roster).filter(n => roster[n].unlocked && n !== "None");
    const jPool = ["Saul", "Hilde", "Alcar", "Chenko", "Amane", "Howard", "Gordon", "Fahd", "Eric"];
    const pivots = [[50,20,30], [10,10,80], [60,0,40], [33,33,34], [50,0,50], [5,5,90]];
    const resArea = document.getElementById('optimizer-results'); resArea.classList.remove('hidden'); resArea.innerHTML = `<div class="col-span-full p-12 text-center text-blue-500 animate-pulse font-black uppercase">Scanning Scientific Peak...</div>`;
    const byT = { Inf: unlocked.filter(n => HEROES[n].type === "Inf"), Cav: unlocked.filter(n => HEROES[n].type === "Cav"), Arc: unlocked.filter(n => HEROES[n].type === "Arc") };
    ['Inf', 'Cav', 'Arc'].forEach(t => { if(byT[t].length === 0) byT[t] = ["None"]; });
    const scens = [{l:"Solo Attack", ctx:"off", bear:false}, {l:"Solo Defense", ctx:"def", bear:false}, {l:"Rally", ctx:"off", bear:false, rally:true}, {l:"Garrison", ctx:"def", bear:false, rally:true}, {l:"Bear Trap", ctx:"off", bear:true, rally:true}];
    await new Promise(r => setTimeout(r, 50)); resArea.innerHTML = '';
    for (const s of scens) {
        let bPeak = 0; pivots.forEach(p => { const v = getSystemVolume(["None","None","None"], [], p, s.ctx, s.bear, s.l); if(v > bPeak) bPeak = v; });
        let cands = [];
        for (let i of byT.Inf) for (let c of byT.Cav) for (let a of byT.Arc) {
            const leads = [i, c, a]; let curJ = [];
            if(s.rally) for(let slot=0; slot<4; slot++){
                let bj = "None", maxV = -1;
                jPool.forEach(hero => {
                    let pV = -1; pivots.forEach(p => { const v = getSystemVolume(leads, [...curJ, hero], p, s.ctx, s.bear, s.l); if(v > pV) pV = v; });
                    if(pV > maxV) { maxV = pV; bj = hero; }
                }); curJ.push(bj);
            }
            let cPeak = -1; pivots.forEach(p => { const v = getSystemVolume(leads, curJ, p, s.ctx, s.bear, s.l); if(v > cPeak) cPeak = v; });
            cands.push({ leads, joiners: curJ, score: cPeak });
        }
        cands.sort((a,b) => b.score - a.score);
        const top3 = cands.slice(0, 3).map(team => {
            let bestVol = -1; for(let fI=0; fI<=100; fI+=5) for(let fC=0; fC<=100-fI; fC+=5) {
                const v = getSystemVolume(team.leads, team.joiners, [fI, fC, 100-fI-fC], s.ctx, s.bear, s.l);
                if(v > bestVol) bestVol = v;
            } return { ...team, gain: bestVol / bPeak };
        });
        renderScenarioResults(s.l, top3, resArea);
    }
};

function renderScenarioResults(title, top3, container) {
    const card = document.createElement('div'); card.className = "glass-card p-6 border-l-4 border-blue-500 col-span-1 md:col-span-2 mb-6";
    card.innerHTML = `<div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-6">${title}</div>`;
    top3.forEach((team, rk) => {
        const jMap = {}; team.joiners.forEach(j => { if(j !== "None") jMap[j] = (jMap[j] || 0) + 1; });
        const jText = Object.entries(jMap).map(([n, c]) => `${n}${c > 1 ? ' x' + c : ''}`).join(', ');
        card.innerHTML += `<div class="flex items-center justify-between py-4 ${rk < 2 ? 'border-b border-slate-800' : ''}"><div class="flex items-center gap-5"><span class="text-slate-600 font-black text-xs">#${rk+1}</span><div class="flex -space-x-3">${team.leads.map(n => n !== "None" ? `<div class="w-12 h-12 rounded-full border-2 border-blue-500/30 bg-slate-950 overflow-hidden"><img src="./assets/${n.toLowerCase()}.png" class="w-full h-full object-cover"></div>` : '').join('')}</div><div><div class="text-[10px] font-black text-white uppercase">${team.leads.filter(n=>n!=="None").join(' / ')}</div><div class="text-[8px] text-slate-500 font-bold uppercase">${jText || 'Solo Setup'}</div></div></div><div class="text-right"><div class="text-[8px] text-slate-600 font-black uppercase mb-1">Gain</div><div class="text-xl font-black text-emerald-400">${team.gain.toFixed(3)}x</div></div></div>`;
    }); container.appendChild(card);
}

// --- SHARED UI LOGIC ---
window.updateSharedStat = (side, key, val, origin) => {
    const target = origin === 'sim' ? document.querySelector(`.opt-${side}-${key}`) : document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`);
    if (target && target.value !== val) target.value = val;
    if (origin === 'opt') window.updateStatColors(document.querySelector(`input[data-side="${side}"][data-stat="${key}"]`));
};

window.updateSharedTier = (side, unit, type, val, origin) => {
    const target = origin === 'sim' ? document.querySelector(`.opt-${side}-${unit}-${type}`) : document.querySelector(`#${side}-batch-container .batch-${type}-${unit}`);
    if (target && target.value !== val) target.value = val;
};

window.updateGrids = () => {
    ['atk','def','bear'].forEach(side => {
        document.querySelectorAll(`.${side}-hero-grid`).forEach(cont => {
            cont.innerHTML = '';
            state[side].heroes.forEach((h, i) => {
                const div = document.createElement('div');
                const isL = (side === 'bear' || i < 3);
                div.className = `hero-circle ${isL ? 'hero-leader' : ''} ${h.name !== 'None' ? 'active' : ''}`;
                div.innerHTML = h.name !== 'None' ? `<img src="./assets/${h.name.toLowerCase()}.png" class="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none">` : `<span class="pointer-events-none">${side==='bear'?['I','C','A'][i]:(i+1)}</span>`;
                div.onclick = () => window.openHeroModal(side, i);
                cont.appendChild(div);
            });
        });
    });
};

function buildStatTable() {
    const table = document.getElementById('stat-table');
    const units = ["inf", "cav", "arc"], cats = [{ l: "Attack", k: "att" }, { l: "Defense", k: "def" }, { l: "Lethality", k: "leth" }, { l: "Health", k: "hp" }];
    table.innerHTML = '';
    units.forEach(u => cats.forEach(c => {
        const k = `${u}_${c.k}`;
        const row = document.createElement('div'); row.className = "stat-row";
        row.innerHTML = `<input type="number" data-side="atk" data-stat="${k}" oninput="window.updateSharedStat('atk','${k}',this.value,'sim')" class="text-emerald-500 font-bold w-16 bg-transparent text-center" value="1000"><div class="text-[9px] font-black text-slate-500 flex-grow text-center uppercase">${u} ${c.l}</div><input type="number" data-side="def" data-stat="${k}" oninput="window.updateSharedStat('def','${k}',this.value,'sim')" class="text-red-500 font-bold w-16 bg-transparent text-center" value="1000">`;
        table.appendChild(row);
    }));
}

function initFormationGrids() {
    ['atk', 'def'].forEach(side => {
        const sg = document.getElementById(`opt-${side}-stats-grid`);
        const tg = document.getElementById(`opt-${side}-tiers`);
        if (!sg || !tg) return;
        sg.innerHTML = ''; tg.innerHTML = '';
        ['inf', 'cav', 'arc'].forEach(u => {
            ['att', 'def', 'leth', 'hp'].forEach(s => {
                const k = `${u}_${s}`;
                sg.innerHTML += `<div><label class="text-[7px] text-slate-500 font-black block">${u} ${s}</label><input type="number" value="1000" class="opt-${side}-${k} input-dark !py-1 !text-[10px]" oninput="window.updateSharedStat('${side}','${k}',this.value,'opt')"></div>`;
            });
            tg.innerHTML += `<div class="flex flex-col gap-1"><label class="text-[7px] text-slate-500 font-black">${u} T/TG</label><div class="flex gap-1"><select class="opt-${side}-${u}-tier bg-slate-900 text-[9px] border border-slate-700 rounded text-slate-300" onchange="window.updateSharedTier('${side}','${u}','tier',this.value,'opt')">${[11,10,9,8,7,6,5,4,3,2,1].map(v => `<option value="${v}" ${v==10?'selected':''}>T${v}</option>`).join('')}</select><select class="opt-${side}-${u}-tg bg-slate-900 text-[9px] border border-slate-700 rounded text-slate-300" onchange="window.updateSharedTier('${side}','${u}','tg',this.value,'opt')">${[5,4,3,2,1,0].map(v => `<option value="${v}" ${v==3?'selected':''}>TG${v}</option>`).join('')}</select></div></div>`;
        });
    });
}

window.setOptRole = (role) => {
    optRole = role;
    document.getElementById('opt-role-atk').className = role === 'atk' ? "px-3 py-1 text-[10px] font-bold rounded bg-blue-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
    document.getElementById('opt-role-def').className = role === 'def' ? "px-3 py-1 text-[10px] font-bold rounded bg-red-600 text-white" : "px-3 py-1 text-[10px] font-bold text-slate-500";
};

window.updateStatColors = (el) => {
    const row = el.closest('.stat-row'); if (!row) return;
    const a = row.querySelector('[data-side="atk"]'), d = row.querySelector('[data-side="def"]');
    const vA = parseFloat(a.value)||0, vD = parseFloat(d.value)||0;
    a.style.color = vA > vD ? '#10b981' : (vA < vD ? '#ef4444' : '#64748b');
    d.style.color = vD > vA ? '#10b981' : (vD < vA ? '#ef4444' : '#64748b');
};

window.updateFormation = (side) => {
    let i=0, c=0, a=0;
    document.querySelectorAll(`#${side}-batch-container > div`).forEach(row => {
        i += parseFloat(row.querySelector(`.batch-inf`).value) || 0;
        c += parseFloat(row.querySelector(`.batch-cav`).value) || 0;
        a += parseFloat(row.querySelector(`.batch-arc`).value) || 0;
    });
    const t = i+c+a || 1;
    document.querySelectorAll(`.${side}-f-bar`).forEach(bar => { bar.children[0].style.width=(i/t*100)+'%'; bar.children[1].style.width=(c/t*100)+'%'; bar.children[2].style.width=(a/t*100)+'%'; });
    document.querySelectorAll(`.${side}-inf-pct`).forEach(el => el.innerText = Math.round(i/t*100)+'%');
    document.querySelectorAll(`.${side}-cav-pct`).forEach(el => el.innerText = Math.round(c/t*100)+'%');
    document.querySelectorAll(`.${side}-arc-pct`).forEach(el => el.innerText = Math.round(a/t*100)+'%');
};

window.addBatch = (side, initial = false) => {
    const cont = document.getElementById(`${side}-batch-container`);
    const div = document.createElement('div');
    div.className = "p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-1 mb-2";
    const types = [{l:'Inf', k:'inf', c:'text-blue-400'}, {l:'Cav', k:'cav', c:'text-amber-400'}, {l:'Arc', k:'arc', c:'text-emerald-400'}];
    let html = `<div class="flex justify-between items-center"><span class="text-[8px] font-bold text-slate-600 uppercase">Batch</span>${!initial ? `<button onclick="this.parentElement.parentElement.remove(); window.updateFormation('${side}')" class="text-red-500 text-[8px]">DEL</button>`:''}</div>`;
    types.forEach(t => { html += `<div class="grid grid-cols-12 gap-1 items-center"><div class="col-span-3 text-[9px] font-bold ${t.c}">${t.l}</div><select class="batch-tier-${t.k} col-span-2 bg-slate-900 text-[9px] border border-slate-800 rounded" onchange="window.updateSharedTier('${side}','${t.k}','tier',this.value,'sim')"><option value="11">T11</option><option value="10" selected>T10</option><option value="9">T9</option></select><select class="batch-tg-${t.k} col-span-2 bg-slate-900 text-[9px] border border-slate-800 rounded" onchange="window.updateSharedTier('${side}','${t.k}','tg',this.value,'sim')"><option value="5">TG5</option><option value="3" selected>TG3</option><option value="0">TG0</option></select><input type="number" class="batch-${t.k} col-span-5 input-dark !text-right !py-0" value="${initial ? (t.k==='inf'?500000:250000) : 0}" oninput="window.updateFormation('${side}')"></div>`; });
    div.innerHTML = html; cont.appendChild(div); window.updateFormation(side);
};

window.showTab = (tab) => {
    const screens = { battle: 'battle-tab', formation: 'optimizer-screen', bear: 'bear-tab', roster: 'roster-tab' };
    const btns = { battle: 'btn-tab-battle', formation: 'btn-tab-form', bear: 'btn-tab-bear', roster: 'btn-tab-roster' };
    Object.keys(screens).forEach(k => {
        const el = document.getElementById(screens[k]); if (el) el.classList.toggle('hidden', k !== tab);
        const b = document.getElementById(btns[k]); if (b) b.className = (k === tab) ? "px-4 py-2 bg-blue-600 rounded-lg text-xs font-bold text-white shadow-lg" : "px-4 py-2 text-slate-500 hover:text-white text-xs font-bold";
    });
};

window.openHeroModal = (side, index) => {
    activeSlot = { side, index }; const h = state[side].heroes[index];
    modalTemp = { s1: h.s1, s2: h.s2, s3: h.s3 };
    document.getElementById('hero-select').value = h.name;
    renderSkillsInModal(h.name, index, side);
    document.getElementById('heroModal').classList.replace('hidden', 'flex');
};

function renderSkillsInModal(name, index, side) {
    const cont = document.getElementById('skill-inputs'); cont.innerHTML = '';
    if(name === "None") return;
    const h = HEROES[name]; const isL = (side === 'bear' || index < 3);
    const max = isL ? h.skills.length : 1;
    for(let i=0; i<max; i++) {
        cont.innerHTML += `<div class="mb-4"><div class="text-[9px] text-slate-500 font-black uppercase mb-1">${h.skills[i].name}</div>${renderLevelPicker(name, 's'+(i+1), modalTemp['s'+(i+1)], false)}</div>`;
    }
}

window.saveHeroConfig = () => {
    const name = document.getElementById('hero-select').value;
    state[activeSlot.side].heroes[activeSlot.index] = { name, ...modalTemp };
    window.updateGrids(); document.getElementById('heroModal').classList.replace('flex', 'hidden');
};

function renderLevelPicker(hero, key, current, isR) {
    let h = `<div class="flex gap-1">`;
    for(let i=1; i<=5; i++) {
        const act = isR ? `window.updateRoster('${hero}','${key}',${i})` : `window.updateModalLevel('${key}',${i})`;
        h += `<button onclick="event.stopPropagation(); ${act}" class="w-6 h-6 rounded text-[10px] font-bold ${current == i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}">${i}</button>`;
    }
    return h + `</div>`;
}

window.updateModalLevel = (k, v) => { modalTemp[k] = v; renderSkillsInModal(document.getElementById('hero-select').value, activeSlot.index, activeSlot.side); };
window.updateRoster = (n,k,v) => { roster[n][k]=parseInt(v); localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };

function renderRosterUI() {
    const grid = document.getElementById('roster-grid'); if(!grid) return; grid.innerHTML = '';
    Object.keys(HEROES).sort().forEach(n => {
        const h = HEROES[n], r = roster[n];
        const card = document.createElement('div');
        card.onclick = () => { roster[n].unlocked = !roster[n].unlocked; localStorage.setItem('ks_roster', JSON.stringify(roster)); renderRosterUI(); };
        card.className = `p-4 glass-card border-2 transition-all cursor-pointer ${r.unlocked ? 'border-blue-500' : 'opacity-40 border-transparent'}`;
        let sHtml = h.skills.map((s, i) => `<div class="mt-2" onclick="event.stopPropagation()"><div class="text-[8px] text-slate-500 font-black uppercase mb-1">${s.name}</div>${renderLevelPicker(n, 's'+(i+1), r['s'+(i+1)], true)}</div>`).join('');
        card.innerHTML = `<div class="flex items-center gap-3 mb-2"><img src="./assets/${n.toLowerCase()}.png" class="w-8 h-8 rounded-full"><b>${n}</b></div>`;
        if(r.unlocked) {
            card.innerHTML += `<div class="space-y-3"><div><span class="text-[8px] uppercase">Star Level</span>${renderStarSelector(n, r.starIndex)}</div>${sHtml}${h.widget ? `<div class="pt-2 border-t border-slate-800" onclick="event.stopPropagation()"><span class="text-[8px] text-amber-500 uppercase block mb-1">Widget Level</span>${renderWidgetPicker(n, r.widget)}</div>` : ''}</div>`;
        }
        grid.appendChild(card);
    });
}

function renderStarSelector(n, cur) {
    let h = `<select onclick="event.stopPropagation()" onchange="window.updateRoster('${n}','starIndex',this.value)" class="bg-slate-800 text-[10px] w-full mt-1">`;
    for(let i=0; i<=30; i++) h += `<option value="${i}" ${cur==i?'selected':''}>${Math.floor(i/6)}.${i%6}</option>`;
    return h + `</select>`;
}

function renderWidgetPicker(n, cur) {
    let h = `<div class="flex flex-wrap gap-1">`;
    for(let i=0; i<=10; i++) h += `<button onclick="event.stopPropagation(); window.updateRoster('${n}','widget',${i})" class="w-5 h-5 rounded text-[8px] ${cur==i?'bg-amber-600':'bg-slate-800'}">${i}</button>`;
    return h + `</div>`;
}

function renderTernary(id, data, best, isBear) {
    const traces = [{ type: 'scatterternary', a: data.a, b: data.b, c: data.c, mode: 'markers', marker: { color: data.z, colorscale: 'Viridis', size: 5, opacity: 0.8, showscale: false } }, { type: 'scatterternary', a: [best.form[0]], b: [best.form[1]], c: [best.form[2]], marker: { size: 18, symbol: 'star', color: '#00f2ff' } }];
    const layout = { ternary: { sum: 100, aaxis: { title: 'INF' }, baxis: { title: 'CAV' }, caxis: { title: 'ARC' } }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 20, r: 20, t: 40, b: 20 }, showlegend: false, font: { family: 'Inter, sans-serif' } };
    Plotly.newPlot(id, traces, layout, { displayModeBar: false, responsive: true });
}

window.handleSimulation = async () => {
    const setup = { atk: getLiveSetup('atk'), def: getLiveSetup('def') };
    const res = runCombatSim(setup, 'average', 'average');
    const sA = Math.round(sumTroops(res.m_cur)), sD = Math.round(sumTroops(res.e_cur));
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('res-atk-total').innerText = sA.toLocaleString();
    document.getElementById('res-def-total').innerText = sD.toLocaleString();
    const bar = document.getElementById('luck-bar-inner');
    const tot = sumTroops(setup.atk.batches[0]) + sumTroops(setup.def.batches[0]);
    const score = (sA - sD) / (tot || 1);
    bar.style.left = "50%"; bar.style.width = Math.abs(score * 50) + "%";
    bar.style.transform = score < 0 ? "translateX(-100%)" : "none";
};

document.addEventListener('DOMContentLoaded', window.init);
